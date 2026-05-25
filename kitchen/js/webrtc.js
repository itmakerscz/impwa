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
     * Focuses on keeping only Data Channel and connection info.
     */
    async _minimizeSDP(description) {
        const sdp = description.sdp;
        const minimized = sdp.split('\n')
            .filter(line => {
                // Filter out media/extension lines we don't need for DataChannels
                return !line.startsWith('a=extmap') &&
                       !line.startsWith('a=rtcp') &&
                       !line.startsWith('a=msid') &&
                       !line.startsWith('a=ssrc') &&
                       !line.startsWith('a=group') &&
                       !line.startsWith('a=fmtp') &&
                       !line.startsWith('a=rtpmap');
            })
            .join('\n');
        
        const json = JSON.stringify({
            t: description.type === 'offer' ? 'o' : 'a',
            s: minimized
        });
        return await this._compress(json);
    }

    /**
     * Reconstructs a full RTCSessionDescription from the minimized version.
     */
    async _restoreSDP(compressedString) {
        const json = await this._decompress(compressedString);
        const data = JSON.parse(json);
        return {
            type: data.t === 'o' ? 'offer' : 'answer',
            sdp: data.s
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
            // Fallback: resolve after 4 seconds to ensure we have at least some candidates
            setTimeout(() => {
                peer.removeEventListener('icegatheringstatechange', check);
                this.log("ICE gathering timeout (proceeding with available candidates)");
                resolve();
            }, 4000);
        });
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
        return await this._minimizeSDP(peer.localDescription);
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
    async handleOfferAndCreateAnswer(offerString) {
        this.log("Handling offer from kitchen...");
        const peer = new RTCPeerConnection(this.config);
        this._setupPeerListeners(peer, "HubLink");
        this.hub.peer = peer;

        peer.ondatachannel = (e) => {
            this.log("Received data channel from hub");
            this.hub.channel = this._setupChannel(e.channel, "HubLink");
            this.hub.channel.onmessage = (ev) => this.onMessage(JSON.parse(ev.data));
        };

        const offer = await this._restoreSDP(offerString);
        
        // Analyze the incoming offer's network info
        const remoteInfo = this._extractConnectivityInfo(offer.sdp);
        this.log(`Kitchen reported local IPs: ${remoteInfo.ips.join(', ')}`);

        await peer.setRemoteDescription(offer);
        
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        
        this.log("Waiting for ICE candidates...");
        await this._waitForICE(peer);
        this.log("Answer ready for scanning.");
        return await this._minimizeSDP(peer.localDescription);
    }

    sendToKitchen(payload) {
        if (this.hub.channel && this.hub.channel.readyState === 'open') {
            this.hub.channel.send(JSON.stringify(payload));
        } else {
            console.warn("Connection to kitchen not open.");
        }
    }
}