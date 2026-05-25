export class WebRTCManager {
    constructor(onMessageCallback) {
        this.onMessage = onMessageCallback;
        this.spokes = { GRILL: { peer: null, channel: null }, PUB: { peer: null, channel: null } };
        this.hub = { peer: null, channel: null };
    }

    // --- KITCHEN HUB ---
    async createOfferForStation(stationName) {
        const peer = new RTCPeerConnection();
        this.spokes[stationName].peer = peer;
        const channel = peer.createDataChannel(`${stationName}-channel`);
        this.spokes[stationName].channel = channel;
        
        channel.onmessage = (e) => this.onMessage(JSON.parse(e.data));
        
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        return JSON.stringify(peer.localDescription);
    }

    async hubAcceptAnswer(stationName, answerString) {
        const answer = JSON.parse(answerString);
        await this.spokes[stationName].peer.setRemoteDescription(answer);
    }

    sendToStation(stationName, payload) {
        const channel = this.spokes[stationName]?.channel;
        if (channel && channel.readyState === 'open') channel.send(JSON.stringify(payload));
    }

    // --- STATIONS (SPOKES) ---
    async handleOfferAndCreateAnswer(offerString) {
        const peer = new RTCPeerConnection();
        this.hub.peer = peer;

        peer.ondatachannel = (e) => {
            this.hub.channel = e.channel;
            this.hub.channel.onmessage = (ev) => this.onMessage(JSON.parse(ev.data));
        };

        const offer = JSON.parse(offerString);
        await peer.setRemoteDescription(offer);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        return JSON.stringify(peer.localDescription);
    }

    sendToKitchen(payload) {
        if (this.hub.channel && this.hub.channel.readyState === 'open') {
            this.hub.channel.send(JSON.stringify(payload));
        } else {
            console.warn("Connection to kitchen not open.");
        }
    }
}