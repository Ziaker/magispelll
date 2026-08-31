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
//
// FIX (bug "quando eu seguro a carta, a posição dela não é a mesma do
// mouse" - causa raiz real, confirmada por vídeo + overlay de debug): o
// processo nunca declarava suporte a DPI awareness. Com uma escala de tela
// do Windows não-padrão (110%, confirmado pelo usuário em Configurações ->
// Sistema -> Tela), o Windows detecta o processo como "DPI-unaware" e
// VIRTUALIZA a janela inteira - renderiza em 96 DPI e depois estica a
// imagem via bitmap pra preencher a tela real. Isso desalinha a posição do
// cursor do SO (que o WebView2/Chromium recebe crua) da posição em que o
// conteúdo é DESENHADO na tela (já esticada pelo Windows) - o mouse "anda
// mais rápido" que a carta que ele está arrastando, na proporção exata do
// devicePixelRatio (confirmado: 1.104166... = 106/96, batendo com os 110%
// configurados). SetProcessDpiAwarenessContext com
// PER_MONITOR_AWARE_V2 declara o processo como DPI-aware ANTES de qualquer
// janela ser criada (por isso é a primeira chamada em main(), antes até do
// webview.NewWithOptions) - o Windows para de virtualizar/esticar e passa a
// reportar a escala real pro Chromium, que então desenha e recebe eventos
// de mouse na MESMA escala. Precisa ser feito aqui, no processo nativo -
// nenhum CSS/JS dentro da página consegue desfazer a virtualização em nível
// de SO.
var (
	user32                        = syscall.NewLazyDLL("user32.dll")
	procShowWindow                = user32.NewProc("ShowWindow")
	procSetProcessDpiAwarenessCtx = user32.NewProc("SetProcessDpiAwarenessContext")
)

const swMaximize = 3

// DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2, definido no Win32 como um
// ponteiro-sentinela especial de valor -4 (ver winuser.h) - expresso aqui
// como o inteiro sem sinal equivalente (^uintptr(3) inverte todos os bits
// de 3, produzindo o mesmo padrão de bits que -4 em complemento de dois,
// já que uintptr não tem construtor direto pra literais negativos).
var dpiAwarenessContextPerMonitorAwareV2 = ^uintptr(3)

const initialZoomCSS = `document.documentElement.style.zoom = '80%';`

//go:embed all:dist
var distFS embed.FS

func main() {
	_, _, _ = procSetProcessDpiAwarenessCtx.Call(dpiAwarenessContextPerMonitorAwareV2)

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
