# Magispelll

Um jogo de cartas estratégico 1x1, para 2 jogadores (ou contra a IA), onde armar o campo de batalha certo importa tanto quanto saber a hora de usar a magia certa.

**🎮 Jogue agora no navegador:** **[ziaker.github.io/magispelll](https://ziaker.github.io/magispelll/)** (v0.8888888.29)

Também disponível como aplicativo de desktop para Windows (veja [Baixar](#baixar-para-windows) abaixo).

## Sobre o jogo

Cada jogador escolhe um personagem com um baralho e um estilo de jogo próprios. Cartas numerais formam o campo de batalha; as cartas de figura (Valete, Rainha, Rei) viram magias exclusivas do personagem; e cada um tem também uma Carta Monstro e uma Magia Numeral únicas. Vence quem reduzir as vidas do oponente a zero através de combates de campo.

### Personagens

| Personagem | Estilo |
|---|---|
| **Mago** | Informação e controle — revela cartas do oponente e troca recursos estrategicamente |
| **Besta** | Agressão e recuperação — recicla o descarte e pressiona o oponente sem parar |
| **Anjo** | Crescimento e suporte — acumula vantagens permanentes e protege seus recursos |
| **Mosqueteiro** | Descarte e precisão — troca cartas por reforço de campo e informação |
| **Palhaço** | Armadilhas e sabotagem — planta cartas viradas para baixo que explodem quando o oponente menos espera |
| **Piromante** | Combustão e dano em área — acumula uma Bola de Fogo queimando cartas como combustível e a lança contra o campo do oponente |
| **Druida** | Crescimento e simbiose — planta um Broto que cresce sozinho a cada turno e pode ser sacrificado pela metade para marcar cartas em combate |
| **Glacial** | Congelamento e controle — congela cartas de magia (suas ou do oponente) para travar sua ativação, e o Criogolem cresce em valor conforme mais cartas ficam congeladas em jogo |

### Modos e variantes

- **Hotseat** (2 jogadores no mesmo dispositivo), **Contra a IA**, ou **Modo Espectador** (IA vs IA)
- Variantes configuráveis: **Cartas Monstro**, **Fusão**, **Towers**, **Spotlight**, **Reações**
- Baralho comum (52/54 cartas) ou temático (62 cartas)

## Baixar para Windows

Não há um executável pré-compilado distribuído automaticamente — gere o seu com `npm run build:exe` (veja abaixo). O resultado é um `Magispelll.exe` standalone (sem instalação, sem depender de Node/npm/internet para jogar).

## Desenvolvimento

```bash
npm install
npm run dev          # servidor de desenvolvimento (Vite)
npm run typecheck    # checagem de tipos
npm test             # suíte de testes de sanidade do motor de regras
npm run fuzz         # harness de fuzzing (busca bugs de conservação/invariantes por simulação)
npm run simulate     # estatísticas de comportamento da IA (confrontos personagem x personagem)
npm run build        # build de produção (site estático)
npm run build:exe    # empacota o executável de Windows (requer Go instalado - https://go.dev)
```

Publicar no GitHub Pages é automático: todo push na branch `master` aciona o workflow em [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml).

### Stack

React + TypeScript + Vite + Tailwind CSS, com [Radix UI](https://www.radix-ui.com/)/[shadcn/ui](https://ui.shadcn.com/) para os componentes de interface e [Framer Motion](https://motion.dev/) para as animações. O executável de desktop empacota o build estático num binário único via Go + [go-webview2](https://github.com/jchv/go-webview2) (WebView2 nativo do Windows, sem Electron).

## Créditos

- Componentes de interface: [shadcn/ui](https://ui.shadcn.com/) (MIT)
- Efeitos sonoros: [Kenney](https://kenney.nl) e diversos autores do [OpenGameArt.org](https://opengameart.org) (Creative Commons CC0 1.0), além de trechos do [Mixkit](https://mixkit.co/free-sound-effects/) (Mixkit Sound Effects Free License) — fonte de cada arquivo em [`src/assets/sfx/LICENSE.txt`](src/assets/sfx/LICENSE.txt)
