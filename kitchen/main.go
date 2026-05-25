package main

import (
	"bytes"
	"compress/flate"
	"encoding/base64"
	"io"
	"strconv"
	"strings"
	"sync"
	"syscall/js"

	"github.com/skip2/go-qrcode"
)

// Simple thread-safe peer registry for browser-based signaling routing.
var peers sync.Map

// sdpTokens defines a mapping of verbose SDP keywords to compact tokens.
// Using a tilde (~) as a prefix ensures we don't collide with standard SDP characters.
var sdpTokens = []struct{ full, short string }{
	{"a=candidate:", "~c"},
	{"typ host", "~h"},
	{"typ srflx", "~s"},
	{"generation", "~g"},
	{"network-id", "~n"},
	{"network-cost", "~o"},
	{"ice-ufrag:", "~u"},
	{"ice-pwd:", "~p"},
	{"a=setup:", "~t"},
	{"a=mid:", "~m"},
	{"a=sctp-port:", "~x"},
	{"a=fingerprint:sha-256 ", "~f"},
	{"c=IN IP4 ", "~i"},
}

var (
	tokenReplacer *strings.Replacer
	tokenRestorer *strings.Replacer
	initOnce      sync.Once
)

func getReplacers() (*strings.Replacer, *strings.Replacer) {
	initOnce.Do(func() {
		var toShort, toFull []string
		for _, t := range sdpTokens {
			toShort = append(toShort, t.full, t.short)
			toFull = append(toFull, t.short, t.full)
		}
		tokenReplacer = strings.NewReplacer(toShort...)
		tokenRestorer = strings.NewReplacer(toFull...)
	})
	return tokenReplacer, tokenRestorer
}

// registerPeer maps a station name to a JavaScript callback for incoming signals.
func registerPeer(this js.Value, args []js.Value) interface{} {
	if len(args) < 2 {
		return js.ValueOf(false)
	}
	peerID := args[0].String()
	callback := args[1] // JS function to handle incoming signals

	peers.Store(peerID, callback)
	return js.ValueOf(true)
}

// sendSignal routes a signal payload to a registered peer's callback.
func sendSignal(this js.Value, args []js.Value) interface{} {
	if len(args) < 3 {
		return js.ValueOf(false)
	}
	targetID := args[0].String()
	senderID := args[1].String()
	signalData := args[2].String()

	if callback, ok := peers.Load(targetID); ok {
		callback.(js.Value).Invoke(senderID, signalData)
		return js.ValueOf(true)
	}
	return js.ValueOf(false)
}

// generateQR creates a QR code image as a data URI.
func generateQR(this js.Value, args []js.Value) interface{} {
	if len(args) == 0 {
		return js.ValueOf("")
	}
	dataString := args[0].String()

	// Generate QR using the low-level API to avoid image/png dependency
	q, err := qrcode.New(dataString, qrcode.Low)
	if err != nil {
		return js.ValueOf("Error generating QR: " + err.Error())
	}

	// Manually construct a lightweight SVG to keep binary size small
	bitmap := q.Bitmap()
	size := len(bitmap)
	size2 := size * 2
	size2Str := strconv.Itoa(size2)

	var sb strings.Builder
	// Standard SVG header - Scaled by 2 to avoid decimals in path data
	sb.WriteString("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ")
	sb.WriteString(size2Str)
	sb.WriteString(" ")
	sb.WriteString(size2Str)
	sb.WriteString("' shape-rendering='crispEdges'>")
	
	// Background
	sb.WriteString("<rect width='100%' height='100%' fill='#fff'/>")
	
	// QR Modules as combined horizontal spans to reduce string length
	sb.Grow(size * 10) // Pre-allocate buffer to prevent frequent resizing
	sb.WriteString("<path stroke='#000' stroke-width='2' d='")
	for y, row := range bitmap {
		// Center the 2px stroke on the row (y*2 + 1)
		yCoord := strconv.Itoa(y*2 + 1)
		for x := 0; x < size; {
			if row[x] {
				start := x
				for x < size && row[x] {
					x++
				}
				// Doubled coordinates and length to maintain integer values
				sb.WriteString("M")
				sb.WriteString(strconv.Itoa(start * 2))
				sb.WriteString(" ")
				sb.WriteString(yCoord)
				sb.WriteString("h")
				sb.WriteString(strconv.Itoa((x - start) * 2))
			} else {
				x++
			}
		}
	}
	sb.WriteString("'/></svg>")

	// Efficiently encode to base64 without intermediate string copies
	var b64Buf bytes.Buffer
	b64Buf.WriteString("data:image/svg+xml;base64,")
	encoder := base64.NewEncoder(base64.StdEncoding, &b64Buf)
	encoder.Write([]byte(sb.String()))
	encoder.Close()

	return js.ValueOf(b64Buf.String())
}

// minimizeSDP filters, prunes, and compresses an SDP string for QR encoding.
func minimizeSDP(this js.Value, args []js.Value) interface{} {
	if len(args) < 2 {
		return js.ValueOf("")
	}
	sdp := args[0].String()
	sdpType := args[1].String() // "offer" or "answer"

	// 1. Prune and filter the SDP lines
	rawSDP := filterSDP(sdp)

	// 2. Use Replacer for single-pass tokenization
	rep, _ := getReplacers()
	data := rep.Replace(rawSDP)

	typeChar := "a"
	if sdpType == "offer" { typeChar = "o" }
	
	raw := typeChar + data
	compressed, err := compress(raw) // Uses DefaultCompression to balance RAM/CPU
	if err != nil {
		return js.ValueOf("")
	}

	return js.ValueOf("C" + compressed)
}

// restoreSDP decompresses and restores a minimized SDP string.
func restoreSDP(this js.Value, args []js.Value) interface{} {
	if len(args) < 1 {
		return js.ValueOf("")
	}
	payload := args[0].String()
	if !strings.HasPrefix(payload, "C") {
		return js.ValueOf("")
	}

	decompressed, err := decompress(payload[1:])
	if err != nil {
		return js.ValueOf("")
	}

	// 3. Expand tokens back to full SDP keywords
	_, res := getReplacers()
	return js.ValueOf(res.Replace(decompressed))
}

// filterSDP removes non-essential lines and prunes candidates to reduce SDP size.
func filterSDP(sdp string) string {
	var sb strings.Builder
	sb.Grow(len(sdp) / 2) // Pre-allocate to reduce growth cycles

	ignorePrefixes := []string{
		"a=extmap:", "a=rtcp:", "a=msid:", "a=ssrc:", 
		"a=group:", "a=fmtp:", "a=rtpmap:", "a=bundle-only",
	}

	hostCount, srflxCount := 0, 0

	// Process line by line without allocating an entire slice of strings
	start := 0
	for start < len(sdp) {
		end := strings.Index(sdp[start:], "\n")
		if end == -1 {
			end = len(sdp)
		} else {
			end += start
		}

		line := strings.TrimSpace(sdp[start:end])
		start = end + 1

		if line == "" { continue }

		if hasAnyPrefix(line, ignorePrefixes) {
			continue
		}

		// Candidate Pruning: Keep only essential candidates for size efficiency.
		if strings.HasPrefix(line, "a=candidate:") {
			if strings.Contains(line, "typ host") && hostCount < 1 {
				hostCount++
			} else if strings.Contains(line, "typ srflx") && srflxCount < 1 {
				srflxCount++
			} else {
				continue
			}
		}

		if sb.Len() > 0 {
			sb.WriteByte('\n')
		}
		sb.WriteString(line)
	}
	return sb.String()
}

// Helper to check prefixes efficiently
func hasAnyPrefix(s string, prefixes []string) bool {
	for _, p := range prefixes {
		if strings.HasPrefix(s, p) {
			return true
		}
	}
	return false
}

// compress uses flate to compress the input string and returns a base64 string.
func compress(data string) (string, error) {
	var b bytes.Buffer
	w, _ := flate.NewWriter(&b, flate.DefaultCompression)
	if _, err := w.Write([]byte(data)); err != nil {
		return "", err
	}
	w.Close()
	return base64.StdEncoding.EncodeToString(b.Bytes()), nil
}

// decompress decodes base64 and decompresses the data using flate.
func decompress(encoded string) (string, error) {
	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return "", err
	}

	r := flate.NewReader(bytes.NewReader(data))
	defer r.Close()
	
	var out bytes.Buffer
	if _, err := io.Copy(&out, r); err != nil {
		return "", err
	}
	return out.String(), nil
}

func main() {
	c := make(chan struct{})
	js.Global().Set("generateGolangQRCode", js.FuncOf(generateQR))
	js.Global().Set("wasmMinimizeSDP", js.FuncOf(minimizeSDP))
	js.Global().Set("wasmRestoreSDP", js.FuncOf(restoreSDP))
	js.Global().Set("registerPeer", js.FuncOf(registerPeer))
	js.Global().Set("sendSignal", js.FuncOf(sendSignal))
	<-c
}