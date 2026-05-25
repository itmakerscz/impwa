export class WebRTCManager {
    constructor(onMessageCallback, logger = console.log, onStatusChange = null) {
        this.onMessage = onMessageCallback;
        this.onStatusChange = onStatusChange;
        this.log = (msg) => logger(`[WebRTC] ${msg}`);
        this.spokes = { 
            GRILL: { peer: null, channel: null, pollAbort: null, heartbeat: null }, 
            PUB: { peer: null, channel: null, pollAbort: null, heartbeat: null } 
        };
        this.hub = { peer: null, channel: null, heartbeat: null };
        this.config = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' }
            ]
        };
        this.signalingServer = null; // No server needed for Serverless mode

        // Register this instance in the Wasm peer registry
        if (window.registerPeer) {
            window.registerPeer('LOCAL_PEER', (from, signal) => {
                this.log(`Received signal from ${from} via Wasm bus`);
                // Logic to route internal signals (e.g., from a Service Worker)
            });
        }
    }

    /**
     * Uses Go/Wasm to minimize and compress the SDP.
     */
    async _minimizeSDP(description) {
        if (!window.wasmMinimizeSDP) return description.sdp;
        return window.wasmMinimizeSDP(description.sdp, description.type);
    }

    /**
     * Uses Go/Wasm to restore the SDP.
     */
    async _restoreSDP(compressedString) {
        if (!window.wasmRestoreSDP) return JSON.parse(compressedString);
        const raw = window.wasmRestoreSDP(compressedString);
        const typeChar = raw[0];
        const sdp = raw.slice(1);

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
        const res = await fetch(`${this.signalingServer}${topic}`, {
            method: 'POST',
            body: JSON.stringify(data)
        });
        if (!res.ok) {
            throw new Error(`Signaling Post failed with status ${res.status}`);
        }
        this.log(`Signaling: Posted answer to ${topic}`);
    }

    /**
     * Extracts local IP addresses from an SDP string to check for local network presence.
     */
    _extractConnectivityInfo(sdp) {
        const lines = sdp.split('\n');
        const info = {
            ips: [],
            hasHost: false,
            hasRelay: false,
            hasSrflx: false
        };

        lines.forEach(line => {
            if (line.startsWith('a=candidate')) {
                const parts = line.split(' ');
                const ip = parts[4];
                const type = parts[7]; // 'host', 'srflx', or 'relay'
                
                if (type === 'host' && !info.ips.includes(ip)) info.ips.push(ip);
                if (type === 'host') info.hasHost = true;
                if (type === 'srflx') info.hasSrflx = true;
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
                if (this.spokes[name] && this.spokes[name].pollAbort) this.spokes[name].pollAbort.abort();
                this._stopHeartbeat(name);

                if (this.hub.peer === peer) this.hub = { peer: null, channel: null, heartbeat: null };
                for (const station in this.spokes) {
                    if (this.spokes[station].peer === peer) {
                        this.spokes[station] = { peer: null, channel: null, pollAbort: null, heartbeat: null };
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
    }

    _startWatchdog(peer, name, timeoutMs = 30000) {
        if (peer._connTimer) clearTimeout(peer._connTimer);
        
        peer._connTimer = setTimeout(() => {
            if (peer.connectionState !== 'connected') {
                this.log(`Timeout: ${name} failed to connect in ${timeoutMs/1000}s. Cleaning up...`);
                peer.close();
                if (this.hub.peer === peer) this.hub = { peer: null, channel: null };
                for (const station in this.spokes) {
                    if (this.spokes[station].peer === peer) {
                        this.spokes[station] = { peer: null, channel: null };
                    }
                }
                if (this.onStatusChange) this.onStatusChange(name, 'failed');
            }
        }, timeoutMs);
    }

    /**
     * Diagnoses the NAT type by comparing candidates from multiple STUN servers.
     * Symmetric NATs return different public ports for the same local port.
     */
    async detectNATType() {
        return new Promise((resolve) => {
            const pc = new RTCPeerConnection(this.config);
            const srflxCandidates = [];
            
            const timer = setTimeout(() => {
                cleanup();
                resolve("NAT Check Timeout (STUN unreachable)");
            }, 6000);

            const cleanup = () => {
                clearTimeout(timer);
                pc.close();
            };

            pc.onicecandidate = (e) => {
                if (e.candidate && e.candidate.type === 'srflx') {
                    srflxCandidates.push({
                        port: e.candidate.port,
                        relatedPort: e.candidate.relatedPort
                    });
                } else if (!e.candidate) {
                    cleanup();
                    if (srflxCandidates.length === 0) return resolve("NAT Type: Local Only (No STUN candidates)");
                    
                    // Group public ports by the local port they originated from
                    const portsByLocalPort = {};
                    srflxCandidates.forEach(c => {
                        if (!portsByLocalPort[c.relatedPort]) portsByLocalPort[c.relatedPort] = new Set();
                        portsByLocalPort[c.relatedPort].add(c.port);
                    });

                    for (const localPort in portsByLocalPort) {
                        if (portsByLocalPort[localPort].size > 1) {
                            return resolve("Symmetric NAT (STUN will fail)");
                        }
                    }
                    resolve("Cone NAT (STUN should work)");
                }
            };

            pc.createDataChannel('nat-test');
            pc.createOffer().then(o => pc.setLocalDescription(o));
        });
    }

    _startHeartbeat(name, channel) {
        this._stopHeartbeat(name);
        const target = name === 'Kitchen' ? this.hub : this.spokes[name];
        
        target.heartbeat = setInterval(() => {
            if (channel.readyState === 'open') {
                // Check buffer to prevent congestion
                if (channel.bufferedAmount > 1024 * 1024) {
                    this.log(`Warning: ${name} channel buffer congested (${channel.bufferedAmount} bytes)`);
                    return;
                }
                channel.send(JSON.stringify({ type: 'HEARTBEAT', ts: Date.now() }));
            } else {
                this._stopHeartbeat(name);
            }
        }, 5000); // 5 second heartbeat
    }

    _stopHeartbeat(name) {
        const target = name === 'Kitchen' ? this.hub : this.spokes[name];
        if (target && target.heartbeat) {
            clearInterval(target.heartbeat);
            target.heartbeat = null;
        }
    }

    _setupChannel(channel, name) {
        channel.onopen = () => {
            this.log(`Channel ${name} is OPEN`);
            this._startHeartbeat(name, channel);
        };
        channel.onclose = () => {
            this.log(`Channel ${name} is CLOSED`);
            this._stopHeartbeat(name);
        };
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
        } 
        if (!info.hasSrflx && !info.hasRelay) {
            this.log("Notice: No public (STUN/TURN) candidates. Connection across different networks will fail.");
        }

        this.log("Offer ready for scanning.");
        const minimized = await this._minimizeSDP(peer.localDescription);
        
        // The QR now only contains the minimized SDP
        return minimized;
    }

    async _pollForAnswer(stationName, topic) {
        const spoke = this.spokes[stationName];
        
        // Cancel any existing poll for this station to prevent duplicate loops
        if (spoke.pollAbort) spoke.pollAbort.abort();
        spoke.pollAbort = new AbortController();
        const signal = spoke.pollAbort.signal;

        this.log(`Starting answer poll for ${stationName} on topic ${topic}...`);
        
        const startTime = Date.now();
        const maxDuration = 120000; // 2 minute maximum wait for a scan

        while (!signal.aborted) {
            const peer = spoke.peer;
            // Exit if peer is gone or already connected
            if (!peer || ['connected', 'failed', 'closed'].includes(peer.connectionState)) break;

            if (Date.now() - startTime > maxDuration) {
                this.log(`Polling timeout for ${stationName}. QR scan likely failed.`);
                if (this.onStatusChange) this.onStatusChange(stationName, 'failed');
                break;
            }

            try {
                const res = await fetch(`${this.signalingServer}${topic}/json?poll=1`, { signal });
                
                if (res.status === 429) {
                    this.log("Rate limited by signaling server. Backing off 10 seconds...");
                    await new Promise(resolve => setTimeout(resolve, 10000));
                    continue;
                }

                if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
                const messages = await res.json();
                
                if (messages && Array.isArray(messages) && messages.length > 0) {
                    const lastMsgText = messages[messages.length - 1].message;
                    try {
                        const lastMsg = JSON.parse(lastMsgText);
                        if (lastMsg.answer) {
                            await this.hubAcceptAnswer(stationName, lastMsg.answer);
                            break; // Success!
                        }
                    } catch (e) {
                        this.log("Malformed signaling message, skipping...");
                    }
                }
            } catch (err) {
                if (err.name === 'AbortError') break;
                this.log(`Signaling poll error: ${err.message}`);
                // On network error, wait slightly longer before retrying
                await new Promise(resolve => setTimeout(resolve, 3000));
                continue;
            }

            // Standard interval wait before next poll attempt
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
        this.log(`Polling loop ended for ${stationName}`);
    }

    async hubAcceptAnswer(stationName, answerString) {
        const answer = await this._restoreSDP(answerString);
        await this.spokes[stationName].peer.setRemoteDescription(answer);
        this.log(`Remote description set for ${stationName}. Connecting...`);
        this._startWatchdog(this.spokes[stationName].peer, stationName);
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
        this._setupPeerListeners(peer, "Kitchen");
        this.hub.peer = peer;

        peer.ondatachannel = (e) => {
            this.log("Received data channel from kitchen");
            this.hub.channel = this._setupChannel(e.channel, "Kitchen");
            this.hub.channel.onmessage = (ev) => this.onMessage(JSON.parse(ev.data));
        };

        const offer = await this._restoreSDP(qrPayload);
        await peer.setRemoteDescription(offer);
        
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        await this._waitForICE(peer);

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