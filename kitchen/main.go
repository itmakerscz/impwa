package main

import (
	"bytes"
	"compress/flate"
	"encoding/base64"
	"io"
	"strings"
	"syscall/js"

	"github.com/skip2/go-qrcode"
)

// generateQR creates a QR code image as a data URI.
func generateQR(this js.Value, args []js.Value) interface{} {
	if len(args) == 0 {
		return js.ValueOf("")
	}
	dataString := args[0].String()

	// Using qrcode.Low (7% recovery) results in a less dense grid,
	// making complex WebRTC data easier to scan. 
	// Size 512 provides better pixel clarity for high-density SDP data.
	pngData, err := qrcode.Encode(dataString, qrcode.Low, 512)
	if err != nil {
		return js.ValueOf("Error generating QR: " + err.Error())
	}

	return js.ValueOf("data:image/png;base64," + base64.StdEncoding.EncodeToString(pngData))
}

// minimizeSDP filters, prunes, and compresses an SDP string for QR encoding.
func minimizeSDP(this js.Value, args []js.Value) interface{} {
	if len(args) < 2 {
		return js.ValueOf("")
	}
	sdp := args[0].String()
	sdpType := args[1].String() // "offer" or "answer"

	filtered := filterSDP(sdp)
	typeChar := "a"
	if sdpType == "offer" { typeChar = "o" }
	
	raw := typeChar + filtered
	compressed, err := compress(raw)
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

	return js.ValueOf(decompressed)
}

// filterSDP removes non-essential lines and prunes candidates to reduce SDP size.
func filterSDP(sdp string) string {
	lines := strings.Split(sdp, "\n")
	var filtered []string
	
	ignorePrefixes := []string{
		"a=extmap:", "a=rtcp:", "a=msid:", "a=ssrc:", 
		"a=group:", "a=fmtp:", "a=rtpmap:", "a=bundle-only",
	}

	hostCount, srflxCount := 0, 0
	
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" { continue }

		shouldIgnore := false
		for _, prefix := range ignorePrefixes {
			if strings.HasPrefix(line, prefix) {
				shouldIgnore = true
				break
			}
		}
		if shouldIgnore { continue }

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
		filtered = append(filtered, line)
	}
	return strings.Join(filtered, "\n")
}

// compress uses flate to compress the input string and returns a base64 string.
func compress(data string) (string, error) {
	var b bytes.Buffer
	w, _ := flate.NewWriter(&b, flate.BestCompression)
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
	<-c
}