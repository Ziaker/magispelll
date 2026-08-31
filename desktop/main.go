// Empacota o build estático do jogo (dist/) dentro do próprio executável e
// abre uma janela de aplicativo nativa (WebView2) - sem console, sem depender
// do navegador do usuário nem de Node/npm/internet para jogar.
package main

import (
	"embed"
	"io/fs"
	"log"
	"net"
	"net/http"
	"strconv"
	"syscall"

	webview "github.com/jchv/go-webview2"
)

// FIX (pedido do usuário: "toda vez que abro o jogo tenho que dar zoom out 2
// vezes e deixar ele em janela cheia... corrija isso para que não precise
// fazer sempre") - a biblioteca go-webview2 não expõe nem "abrir maximizado"
// nem "definir o zoom" através da sua interface pública (WebView/
// WebViewOptions/WindowOptions só cobrem título, tamanho fixo e centralização
// - ver webview.go/common.go do módulo). As duas coisas são resolvidas por
// fora dela:
//  1. Maximizar: `w.Window()` já expõe o HWND nativo da janela (documentado
//     como tal na interface WebView) - chamamos ShowWindow(hwnd,
//     SW_MAXIMIZE) diretamente via syscall (user32.dll), o mesmo Win32 puro
//     que a própria biblioteca usa internamente (ver internal/w32).
//  2. Zoom: sem acesso ao ICoreWebView2Controller.ZoomFactor nativo através
//     desta biblioteca, aplicamos o EQUIVALENTE visual via CSS - a
//     propriedade `zoom` (suportada nativamente pelo motor Chromium por trás
//     do WebView2, o mesmo motor do Edge) reduz a página inteira exatamente
//     como o Ctrl+- do navegador reduziria. 80% corresponde a duas reduções
//     de zoom a partir de 100% na escala padrão do Chromium (100 -> 90 ->
//  80. - a mesma conta que o usuário já fazia manualmente toda vez.
//     Injetado via `Init()` (roda na criação do documento, antes de
//     qualquer conteúdo ser pintado) para nunca aparecer um "pulo" visual do
//     tamanho normal para o reduzido.
var (
	user32         = syscall.NewLazyDLL("user32.dll")
	procShowWindow = user32.NewProc("ShowWindow")
)

const swMaximize = 3

const initialZoomCSS = `document.documentElement.style.zoom = '80%';`

//go:embed all:dist
var distFS embed.FS

func main() {
	site, err := fs.Sub(distFS, "dist")
	if err != nil {
		log.Fatal(err)
	}

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		log.Fatal(err)
	}
	port := listener.Addr().(*net.TCPAddr).Port
	url := "http://127.0.0.1:" + strconv.Itoa(port)

	go func() {
		server := &http.Server{Handler: http.FileServer(http.FS(site))}
		_ = server.Serve(listener)
	}()

	w := webview.NewWithOptions(webview.WebViewOptions{
		Debug:     false,
		AutoFocus: true,
		WindowOptions: webview.WindowOptions{
			Title:  "Magispelll",
			Width:  1280,
			Height: 800,
			Center: true,
		},
	})
	if w == nil {
		log.Fatal("não foi possível iniciar o WebView2 - verifique se o Microsoft Edge WebView2 Runtime está instalado")
	}
	defer w.Destroy()

	_, _, _ = procShowWindow.Call(uintptr(w.Window()), uintptr(swMaximize))
	w.Init(initialZoomCSS)

	w.Navigate(url)
	w.Run()
}
