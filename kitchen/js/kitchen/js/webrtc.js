export class WebRTCManager {
    constructor(onMessageCallback, logger = console.log, onStatusChange = null) {
        this.onMessage = onMessageCallback;
        this.onStatusChange = onStatusChange;
        this.log = (msg) => logger(`[WebRTC] ${msg}`);
        this.spokes = { GRILL: { peer: null, channel: null }, PUB: { peer: null, channel: null } };
        this.hub = { peer: null, channel: null };
        this.config = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                {
                    // Free TURN server provided by Open Relay Project
                    urls: "turn:openrelay.metered.ca:443",
                    username: "openrelayproject",
                    credential: "openrelayproject",
                }
            ]
        };
        this.signalingServer = "https://ntfy.sh/";
    }

    async _compress(str) {
        if (typeof CompressionStream === 'undefined') {
            this.log("CompressionStream not supported, using Base64 fallback.");
            // 'U' prefix for Uncompressed
            return 'U' + btoa(unescape(encodeURIComponent(str)));
        }
        try {
            const stream = new Blob([str]).stream().pipeThrough(new CompressionStream('deflate'));
            const buffer = await new Response(stream).arrayBuffer();
            let binary = "";
            const bytes = new Uint8Array(buffer);
            for (let i = 0; i < bytes.byteLength; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            // 'C' prefix for Compressed
            return 'C' + btoa(binary);
        } catch (err) {
            this.log("Compression failed, falling back.");
            return 'U' + btoa(unescape(encodeURIComponent(str)));
        }
    }

    async _decompress(base64) {
        const prefix = base64[0];
        const payload = base64.slice(1);

        if (prefix === 'U') {
            return decodeURIComponent(escape(atob(payload)));
        }

        if (prefix === 'C' && typeof DecompressionStream !== 'undefined') {
            const binary = atob(payload);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
            return await new Response(stream).text();
        }

        // If no prefix or unsupported compression, try raw decode as last resort
        return decodeURIComponent(escape(atob(base64)));
    }

    /**
     * Strips non-essential lines from SDP to make QR codes smaller.
     */
    async _minimizeSDP(description) {
        let sdp = description.sdp;

        // 1. Aggressive line filtering: Remove non-essential media attributes
        const filteredLines = sdp.split('\n')
            .map(line => line.trim())
            .filter(line => {
                if (!line) return false;
                const ignorePrefixes = [
                    'a=extmap:', 'a=rtcp:', 'a=rtcp-fb:', 'a=msid:', 'a=ssrc:', 
                    'a=group:', 'a=fmtp:', 'a=rtpmap:', 'a=msid-semantic:', 
                    'a=ice-options:', 'a=bundle-only'
                ];
                return !ignorePrefixes.some(prefix => line.startsWith(prefix));
            });

        // 2. Candidate Pruning: Keep only 1 host (LAN) and 1 relay (TURN) candidate.
        // This is the single most effective way to shrink SDP for QR codes.
        let hostCount = 0;
        let relayCount = 0;
        const finalLines = filteredLines.filter(line => {
            if (line.startsWith('a=candidate:')) {
                if (line.includes('typ host') && hostCount < 1) { hostCount++; return true; }
                if (line.includes('typ relay') && relayCount < 1) { relayCount++; return true; }
                return false; 
            }
            return true;
        });

        const minimizedSdp = finalLines.join('\n');
        const typeChar = description.type === 'offer' ? 'o' : 'a';
        
        // 3. Use a flat format [type][sdp] instead of JSON to save structural bytes
        return await this._compress(typeChar + minimizedSdp);
    }

    /**
     * Reconstructs a full RTCSessionDescription from the minimized version.
     */
    async _restoreSDP(compressedString) {
        const decoded = await this._decompress(compressedString);
        const typeChar = decoded[0];
        const sdp = decoded.slice(1);

        return {
            type: typeChar === 'o' ? 'offer' : 'answer',
            sdp: sdp
        };
    }

    _waitForICE(peer) {
        return new Promise((resolve) => {
            if (peer.iceGatheringState === 'complete') {
                this.log("ICE gathering already complete");
                return resolve();
            }
            const check = () => {
                this.log(`ICE Gathering State: ${peer.iceGatheringState}`);
                if (peer.iceGatheringState === 'complete') {
                    peer.removeEventListener('icegatheringstatechange', check);
                    resolve();
                }
            };
            peer.addEventListener('icegatheringstatechange', check);
            // Fallback: resolve after 6 seconds to ensure we have at least some candidates
            setTimeout(() => {
                peer.removeEventListener('icegatheringstatechange', check);
                this.log("ICE gathering timeout (proceeding with available candidates)");
                resolve();
            }, 6000);
        });
    }

    async _signalPost(topic, data) {
        try {
            await fetch(`${this.signalingServer}${topic}`, {
                method: 'POST',
                body: JSON.stringify(data)
            });
            this.log(`Signaling: Posted answer to ${topic}`);
        } catch (err) {
            this.log(`Signaling Error: ${err.message}`);
        }
    }

    /**
     * Extracts local IP addresses from an SDP string to check for local network presence.
     */
    _extractConnectivityInfo(sdp) {
        const lines = sdp.split('\n');
        const info = {
            ips: [],
            hasHost: false,
            hasRelay: false
        };

        lines.forEach(line => {
            if (line.startsWith('a=candidate')) {
                const parts = line.split(' ');
                const ip = parts[4];
                const type = parts[7]; // 'host', 'srflx', or 'relay'
                
                if (type === 'host' && !info.ips.includes(ip)) info.ips.push(ip);
                if (type === 'host') info.hasHost = true;
                if (type === 'relay') info.hasRelay = true;
            }
        });
        return info;
    }

    _setupPeerListeners(peer, name) {
        peer.onconnectionstatechange = () => {
            this.log(`${name} Connection State: ${peer.connectionState}`);
            if (this.onStatusChange) {
                this.onStatusChange(name, peer.connectionState);
            }
            
            if (['failed', 'disconnected', 'closed'].includes(peer.connectionState)) {
                this.log(`${name} connection lost. Cleaning up...`);
                // Clear references so a new connection can be established
                if (this.hub.peer === peer) this.hub = { peer: null, channel: null };
                for (const station in this.spokes) {
                    if (this.spokes[station].peer === peer) {
                        this.spokes[station] = { peer: null, channel: null };
                    }
                }
            }

            if (peer.connectionState === 'connected') {
                // Cancel the watchdog if we connect successfully
                if (peer._connTimer) clearTimeout(peer._connTimer);
                this.log(`${name} handshake successful!`);
            }
        };
        peer.oniceconnectionstatechange = () => this.log(`${name} ICE State: ${peer.iceConnectionState}`);

        // Connection Watchdog: If not connected within 20s, allow retry by cleaning up.
        peer._connTimer = setTimeout(() => {
            if (peer.connectionState !== 'connected') {
                this.log(`Timeout: ${name} failed to connect in 20s. Cleaning up...`);
                peer.close();
                // Reset internal state references so the app doesn't try to use a dead peer
                if (this.hub.peer === peer) this.hub = { peer: null, channel: null };
                for (const station in this.spokes) {
                    if (this.spokes[station].peer === peer) {
                        this.spokes[station] = { peer: null, channel: null };
                    }
                }
            }
        }, 20000);
    }

    _setupChannel(channel, name) {
        channel.onopen = () => this.log(`Channel ${name} is OPEN`);
        channel.onclose = () => this.log(`Channel ${name} is CLOSED`);
        channel.onerror = (err) => this.log(`Channel ${name} ERROR: ${err.message}`);
        return channel;
    }

    // --- KITCHEN HUB ---
    async createOfferForStation(stationName) {
        this.log(`Creating offer for ${stationName}...`);
        const signalingTopic = `rest-sync-${crypto.randomUUID().slice(0, 8)}`;
        const peer = new RTCPeerConnection(this.config);
        this._setupPeerListeners(peer, stationName);
        
        this.spokes[stationName].peer = peer;
        const channel = peer.createDataChannel(`${stationName}-channel`);
        this.spokes[stationName].channel = this._setupChannel(channel, stationName);

        channel.onmessage = (e) => this.onMessage(JSON.parse(e.data));
        
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        
        this.log("Waiting for ICE candidates...");
        await this._waitForICE(peer);
        
        const info = this._extractConnectivityInfo(peer.localDescription.sdp);
        this.log(`Local Network IPs found: ${info.ips.join(', ') || 'None'}`);
        
        if (!info.hasHost) {
            this.log("Warning: No local (host) candidates found. LAN connection may fail.");
        } else if (!info.hasRelay) {
            this.log("Notice: No Relay (TURN) candidates. This requires a direct local path.");
        }

        this.log("Offer ready for scanning.");
        const minimized = await this._minimizeSDP(peer.localDescription);
        
        // Start polling for the answer immediately
        this._pollForAnswer(stationName, signalingTopic);

        // The QR now contains both the SDP and the signaling topic
        return JSON.stringify({ s: minimized, t: signalingTopic });
    }

    async _pollForAnswer(stationName, topic) {
        this.log(`Polling for answer on topic: ${topic}...`);
        try {
            const res = await fetch(`${this.signalingServer}${topic}/json?poll=1`);
            const messages = await res.json();
            
            if (messages && Array.isArray(messages) && messages.length > 0) {
                const lastMsgText = messages[messages.length - 1].message;
                try {
                    const lastMsg = JSON.parse(lastMsgText);
                    if (lastMsg.answer) {
                        await this.hubAcceptAnswer(stationName, lastMsg.answer);
                        return; // Successfully linked
                    }
                } catch (e) {
                    this.log("Malformed answer received, continuing poll...");
                }
            }

            // Keep polling as long as the peer exists and isn't connected or failed
            const peer = this.spokes[stationName].peer;
            if (peer && !['connected', 'failed', 'closed'].includes(peer.connectionState)) {
                setTimeout(() => this._pollForAnswer(stationName, topic), 2000);
            }
        } catch (err) { 
            this.log(`Poll failed: ${err.message}. Retrying...`);
            setTimeout(() => this._pollForAnswer(stationName, topic), 3000);
        }
    }

    async hubAcceptAnswer(stationName, answerString) {
        const answer = await this._restoreSDP(answerString);
        await this.spokes[stationName].peer.setRemoteDescription(answer);
        this.log(`Remote description set for ${stationName}. Connecting...`);
    }

    sendToStation(stationName, payload) {
        const channel = this.spokes[stationName]?.channel;
        if (channel && channel.readyState === 'open') channel.send(JSON.stringify(payload));
    }

    // --- STATIONS (SPOKES) ---
    async handleOfferAndCreateAnswer(qrPayload) {
        this.log("Handling offer from kitchen...");
        const data = JSON.parse(qrPayload);
        const peer = new RTCPeerConnection(this.config);
        this._setupPeerListeners(peer, "HubLink");
        this.hub.peer = peer;
        
        peer.ondatachannel = (e) => {
            this.log("Received data channel from hub");
            this.hub.channel = this._setupChannel(e.channel, "HubLink");
            this.hub.channel.onmessage = (ev) => this.onMessage(JSON.parse(ev.data));
        };

        const offer = await this._restoreSDP(data.s);
        
        // Analyze the incoming offer's network info
        const remoteInfo = this._extractConnectivityInfo(offer.sdp);
        this.log(`Kitchen reported local IPs: ${remoteInfo.ips.join(', ')}`);

        await peer.setRemoteDescription(offer);
        
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        
        this.log("Waiting for ICE candidates...");
        await this._waitForICE(peer);
        
        const answerMinimized = await this._minimizeSDP(peer.localDescription);
        
        // Automatically send the answer back via signaling relay
        let sent = false;
        for (let i = 0; i < 3; i++) {
            try {
                await this._signalPost(data.t, { answer: answerMinimized });
                this.log("Answer sent back to kitchen automatically.");
                sent = true;
                break;
            } catch (e) {
                this.log(`Signaling attempt ${i+1} failed, retrying...`);
                await new Promise(r => setTimeout(r, 1000));
            }
        }
        if (!sent) this.log("Critical: Could not send answer back to hub.");
    }

    sendToKitchen(payload) {
        if (this.hub.channel && this.hub.channel.readyState === 'open') {
            this.hub.channel.send(JSON.stringify(payload));
        } else {
            console.warn("Connection to kitchen not open.");
        }
    }
}