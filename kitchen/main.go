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

	pngData, err := qrcode.Encode(dataString, qrcode.Medium, 256)
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