import init, { process_incoming_metrics, generate_outbound_metrics } from './pkg/wasm_webrtc_pwa.js';

// Register Service Worker for PWA compliance
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js');
}

let pc = new RTCPeerConnection({ iceServers: [] }); // Air-gapped/Local connection profiles
let dataChannel = null;
let html5QrcodeScanner = null;

const outputEl = document.getElementById('output');
const btnSend = document.getElementById('btn-send');
const qrCanvas = document.getElementById('qr-canvas');

// Base36 encoding/decoding for Uint8Array
const BASE36_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Encodes a Uint8Array into a Base36 string, prepending its original length.
 * This allows the QR code to use Alphanumeric mode, reducing visual density.
 * @param {Uint8Array} byteArray The binary data to encode.
 * @returns {string} The Base36 encoded string with length prefix.
 */
function encodeBinaryToBase36(byteArray) {
  // Prepend length to ensure reversibility and handle leading zeros.
  // Max length of Uint8Array is 2^32-1. A 4-char Base36 prefix supports lengths up to 36^4-1 (approx 1.6M).
  const lengthPrefix = byteArray.length.toString(36).toUpperCase().padStart(4, '0');

  if (byteArray.length === 0) {
    return lengthPrefix; // Return only the length prefix for empty arrays
  }

  let bigIntValue = BigInt(0);
  for (let i = 0; i < byteArray.length; i++) {
    bigIntValue = (bigIntValue << BigInt(8)) | BigInt(byteArray[i]);
  }

  let base36Value = '';
  if (bigIntValue === BigInt(0)) {
    base36Value = BASE36_CHARS[0];
  } else {
    while (bigIntValue > BigInt(0)) {
      base36Value = BASE36_CHARS[Number(bigIntValue % BigInt(36))] + base36Value;
      bigIntValue /= BigInt(36);
    }
  }
  return lengthPrefix + base36Value;
}

/**
 * Decodes a Base36 string (with a length prefix) back into a Uint8Array.
 * @param {string} base36Str The Base36 encoded string.
 * @returns {Uint8Array} The decoded binary data.
 */
function decodeBase36ToBinary(base36Str) {
  if (base36Str.length < 4) throw new Error('Invalid Base36 string format: missing length prefix.');

  // Extract length prefix and original length
  const lengthPrefix = base36Str.substring(0, 4);
  const originalLength = parseInt(lengthPrefix, 36);

  const dataPart = base36Str.substring(4);

  if (originalLength === 0) return new Uint8Array(0);

  let bigIntValue = BigInt(0);
  for (let i = 0; i < dataPart.length; i++) {
    const char = dataPart[i];
    const digit = BASE36_CHARS.indexOf(char);
    if (digit === -1) throw new Error('Invalid Base36 character encountered during decoding.');
    bigIntValue = bigIntValue * BigInt(36) + BigInt(digit);
  }

  const bytes = [];
  while (bigIntValue > BigInt(0)) {
    bytes.unshift(Number(bigIntValue % BigInt(256)));
    bigIntValue /= BigInt(256);
  }

  // Pad with leading zeros if necessary to match originalLength
  while (bytes.length < originalLength) {
    bytes.unshift(0);
  }
  return new Uint8Array(bytes);
}

// Data Compression Utilities
async function compressSdp(text) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const buffer = await new Response(stream).arrayBuffer();
  return encodeBinaryToBase36(new Uint8Array(buffer));
}

async function decompressSdp(base64Str) {
  const bytes = decodeBase36ToBinary(base64Str);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).text();
}

// Initialize WebAssembly
async function startWasm() {
  await init();
  log("WebAssembly Engine Initialized.");
}
startWasm();

function log(msg) { outputEl.textContent = msg; }

// --- WebRTC Channel Event Management ---
function wireDataChannelEvents(channel) {
  dataChannel = channel;
  dataChannel.onopen = () => {
    log("🔗 P2P Data Pipe Safely Established!");
    btnSend.disabled = false;
    if(html5QrcodeScanner) html5QrcodeScanner.clear();
    qrCanvas.style.display = 'none';
  };
  
  dataChannel.onmessage = (e) => {
    const rawNetworkJson = JSON.parse(e.data);
    // Boundary Swap: Convert Raw JS Object into Rust Engine Logic
    const rustResult = process_incoming_metrics(rawNetworkJson);
    log(`[From Remote Device via Rust]:\n${JSON.stringify(rustResult, null, 2)}`);
  };
}

// --- Device A Setup (Initiator) ---
document.getElementById('btn-initiate').addEventListener('click', async () => {
  log("Gathering local connection paths...");
  dataChannel = pc.createDataChannel("rustDataPipe");
  wireDataChannelEvents(dataChannel);

  pc.onicecandidate = async (e) => {
    if (e.candidate === null) { // ICE gathering finalized
      const compressedOffer = await compressSdp(JSON.stringify(pc.localDescription.toJSON()));
      qrCanvas.style.display = 'block';
      new QRious({ element: qrCanvas, value: compressedOffer, size: 280 });
      log("Scan this code on Device B.\nWaiting for return Answer code...");
    }
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
});

// --- QR Camera Scanning Operations (Device A & B Interface) ---
document.getElementById('btn-scan').addEventListener('click', () => {
  const readerDiv = document.getElementById('reader');
  readerDiv.style.display = 'block';

  html5QrcodeScanner = new Html5Qrcode("reader");
  html5QrcodeScanner.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: 250 },
    async (decodedText) => {
      try {
        const rawJsonSdp = await decompressSdp(decodedText);
        const sdpObj = JSON.parse(rawJsonSdp);

        if (sdpObj.type === "offer") {
          // Process incoming connection invite (Device B Role)
          log("Offer detected. Generating return Answer...");
          pc.ondatachannel = (event) => wireDataChannelEvents(event.channel);
          await pc.setRemoteDescription(sdpObj);
          
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          pc.onicecandidate = async (e) => {
            if (e.candidate === null) {
              const compressedAnswer = await compressSdp(JSON.stringify(pc.localDescription.toJSON()));
              html5QrcodeScanner.stop();
              readerDiv.style.display = 'none';
              qrCanvas.style.display = 'block';
              new QRious({ element: qrCanvas, value: compressedAnswer, size: 280 });
              log("Show this Answer code back to Device A.");
            }
          };
        } else if (sdpObj.type === "answer") {
          // Finalize handshake sequence (Device A Role)
          log("Answer verified. Connecting pipelines...");
          await pc.setRemoteDescription(sdpObj);
          html5QrcodeScanner.stop();
          readerDiv.style.display = 'none';
        }
      } catch (err) {
        log("Invalid or corrupt data code scanned.");
      }
    }
  ).catch(() => log("Camera hardware accessibility blocked."));
});

// --- Run Runtime Exchanges ---
btnSend.addEventListener('click', () => {
  const outboundPayload = generate_outbound_metrics(navigator.userAgent.slice(0, 15));
  dataChannel.send(JSON.stringify(outboundPayload));
  log(`Sent metrics via Rust structure boundary: ${JSON.stringify(outboundPayload)}`);
});