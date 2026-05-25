package main

import (
	"encoding/base64"
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
	// easier to scan. Size 256 is optimal for mobile browsers.
	pngData, err := qrcode.Encode(dataString, qrcode.Low, 256)
	if err != nil {
		return js.ValueOf("Error generating QR: " + err.Error())
	}

	base64Encoded := base64.StdEncoding.EncodeToString(pngData)
	dataURI := "data:image/png;base64," + base64Encoded

	return js.ValueOf(dataURI)
}

func main() {
	c := make(chan struct{})
	js.Global().Set("generateGolangQRCode", js.FuncOf(generateQR))
	<-c
}