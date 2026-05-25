package main

import (
	"bytes"
	"compress/flate"
	"encoding/base64"
	"strings"
	"syscall/js"

	"github.com/skip2/go-qrcode"
)

func generateQR(this js.Value, args []js.Value) interface{} {
	if len(args) == 0 {
		return js.ValueOf("")
	}
	dataString := args[0].String()

	// Using qrcode.Low (7% recovery) instead of Medium (15%) 
	// results in a less dense grid, making complex WebRTC data 
	// easier to scan. Size 512 provides better pixel clarity for dense data.
	pngData, err := qrcode.Encode(dataString, qrcode.Low, 512)
	if err != nil {
		return js.ValueOf("Error generating QR: " + err.Error())
	}

	base64Encoded := base64.StdEncoding.EncodeToString(pngData)
	dataURI := "data:image/png;base64," + base64Encoded

	return js.ValueOf(dataURI)
}

func minimizeSDP(this js.Value, args []js.Value) interface{} {
	if len(args) < 1 {
		return js.ValueOf("")
	}
	sdp := args[0].String()
	sdpType := args[1].String() // "offer" or "answer"

	// 1. Filter lines
	lines := strings.Split(sdp, "\n")
	var filtered []string
	ignore := []string{"a=extmap:", "a=rtcp:", "a=msid:", "a=ssrc:", "a=group:", "a=fmtp:", "a=rtpmap:", "a=bundle-only"}

	hostCount, srflxCount := 0, 0
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		skip := false
		for _, prefix := range ignore {
			if strings.HasPrefix(line, prefix) {
				skip = true
				break
			}
		}
		if skip {
			continue
		}

		// Candidate Pruning
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

	// 2. Compress
	typeChar := "a"
	if sdpType == "offer" {
		typeChar = "o"
	}
	raw := typeChar + strings.Join(filtered, "\n")

	var b bytes.Buffer
	w, _ := flate.NewWriter(&b, flate.BestCompression)
	w.Write([]byte(raw))
	w.Close()

	return js.ValueOf("C" + base64.StdEncoding.EncodeToString(b.Bytes()))
}

func restoreSDP(this js.Value, args []js.Value) interface{} {
	if len(args) < 1 {
		return js.ValueOf("")
	}
	payload := args[0].String()
	if !strings.HasPrefix(payload, "C") {
		return js.ValueOf("")
	}

	data, _ := base64.StdEncoding.DecodeString(payload[1:])
	r := flate.NewReader(bytes.NewReader(data))
	var out bytes.Buffer
	io.Copy(&out, r)
	r.Close()

	return js.ValueOf(out.String())
}

func main() {
	c := make(chan struct{})
	js.Global().Set("generateGolangQRCode", js.FuncOf(generateQR))
	js.Global().Set("wasmMinimizeSDP", js.FuncOf(minimizeSDP))
	js.Global().Set("wasmRestoreSDP", js.FuncOf(restoreSDP))
	<-c
}