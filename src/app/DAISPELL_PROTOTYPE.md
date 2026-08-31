# DAISPELL - Protótipo de Alta Fidelidade

## Visão Geral

Daispell é um jogo de duelo mágico de estratégia para 2 jogadores (hotseat local). Este protótipo implementa todas as telas, componentes e fluxos de jogo especificados com um tema visual mágico/semi-medieval.

## Estrutura de Telas Implementadas

### 01_00_Splash
- Tela de entrada com título DAISPELL animado
- Botões: Iniciar e Regras
- Runas decorativas animadas com efeito de glow
- Partículas flutuantes de fundo

### 01_01_Home
- Menu principal com navegação para todas as seções
- Botões: Novo Jogo, Tutorial Interativo, Regras, Personagens, Configurações
- Bordas decorativas nos cantos
- Layout responsivo

### 02_00_NovoJogo_Config
- Configuração completa do jogo
- Modo: Hotseat (Local) / Online (em breve)
- Tipo de Baralho: Comum (52/54) / Temático (62)
- Limite de Mão: 7 ou 8 cartas
- Variantes: Cartas Monstro, Auto-efeitos, Auto-shuffle
- Validação e feedback visual

### 02_01_SelecaoPersonagem
- Seleção em 2 etapas (Jogador 1 → Jogador 2)
- 3 personagens: MAGO, BESTA, ANJO
- Cards com nome destacado e linha horizontal decorativa
- Descrição dos poderes (Rei, Rainha, Valete)
- Prevenção de duplicação de personagens

### 03_00_GameBoard_Hotseat
- Tabuleiro dividido verticalmente (Jogador 1 top, Jogador 2 bottom)
- Top bar com: Turno, Fase atual, Jogador ativo, Pause
- Para cada jogador:
  - Carta de personagem com ícone
  - Zona de mão (cartas em leque)
  - Campo com 3 slots + cartas horizontais
  - Contadores de pilha e descarte
  - Badges de efeitos ativos
  - Avisos contextuais
- Log de ações (últimas 10)
- Sistema de fases: Compra → Estratégia → Combate
- Modal de pausa

### 04_00_Tutorial_Interativo
- 8 passos educativos com navegação
- Cada passo contém:
  - Emoji visual temático
  - Título e conteúdo explicativo
  - Indicador de progresso
  - Botões Anterior/Próximo
- Passo 7 com exemplo prático de (9,9,9)
- Cards visuais com exemplos de jogo

### 05_00_Regras_Completas
- Seções completas: Introdução, Objetivo, Fases, Personagens, Magias Numéricas, Vitória, Variantes
- Barra de pesquisa funcional no topo
- Navegação por scroll com todas as regras visíveis
- Layout com cards organizados por seção
- Formatação clara e legível

### 06_00_Personagens (Lista)
- Grid com 3 cards de personagens
- Cada card mostra: ícone colorido, nome, descrição breve
- Botão "Ver Ficha Completa" em cada card
- Hover effects e transições suaves

### 06_01_MAGO_sheet, 06_02_BESTA_sheet, 06_03_ANJO_sheet
- Cabeçalho com nome em CAIXA ALTA (56px) + linha horizontal decorativa
- Seções:
  - Perfil rápido (2 linhas)
  - Magias (Rei, Rainha, Valete) com ícones e descrições detalhadas
  - Magia Numérica destacada
  - Estratégias (8 ideias numeradas)
- Botões: Voltar e Exportar PDF
- Scroll Area para conteúdo longo

### 07_00_Settings
- Configurações de Áudio: Efeitos sonoros, Música de fundo, Volume
- Configurações Visuais: Animações, Partículas, Velocidade
- Acessibilidade: Alto Contraste, Leitor de Tela
- Sliders e Switches funcionais
- Botões Cancelar/Salvar

## Sistema de Design

### Paleta de Cores
- Background principal: `#0F1113` (quase preto)
- Pergaminho/Cards: `#1E1A16` (escuro)
- Acento runas/destaque: `#C59E4F` (dourado envelhecido)
- Texto principal: `#EFE7D6`
- Texto secundário: `#BFB6A6`
- Erro: `#D45D4A`
- Sucesso: `#6CC47A`
- Linha separadora: `#8F6A30`

### Tipografia
- Display: **Playfair Display** (títulos, cabeçalhos)
- UI/Body: **Inter** (texto corrido, interface)
- H1: 56px (fichas de personagem)
- H2: 32px (seções)
- H3: 24px (subtítulos)
- Body: 16px (texto padrão)
- Small: 14px (labels, detalhes)

### Componentes Criados

#### Core Components
- `RuneParticles` - Efeito de partículas mágicas flutuantes
- `CharacterDivider` - Linha horizontal decorativa com diamante central
- `PlayingCard` - Cartas de jogo (virada, revelada, horizontal, slot)

#### Screen Components
- `Splash` - Tela inicial
- `Home` - Menu principal
- `GameConfig` - Configuração do jogo
- `CharacterSelection` - Seleção de personagens
- `GameBoard` - Tabuleiro principal de jogo
- `PlayerZone` - Zona de cada jogador no tabuleiro
- `Tutorial` - Tutorial passo a passo
- `Rules` - Regras completas com busca
- `CharactersList` - Lista de personagens
- `CharacterSheet` - Ficha detalhada de personagem
- `Settings` - Configurações do jogo

### Animações e Efeitos

#### CSS Animations
- `animate-float` - Movimento flutuante (3s, infinite)
- `animate-glow` - Efeito de brilho pulsante (2s, infinite)
- `animate-flip` - Virar carta (300ms, ease-out)

#### Classes Utilitárias
- `.parchment` - Textura de pergaminho com gradiente e ruído
- `.rune-glow` - Brilho dourado (box-shadow)
- `.font-display` - Fonte decorativa Playfair Display

## Fluxo de Navegação

```
Splash
  ├── Home
  │   ├── Config → Character Selection (P1) → Character Selection (P2) → Game Board
  │   ├── Tutorial Interativo
  │   ├── Regras
  │   ├── Personagens → Character Sheet (MAGO/BESTA/ANJO)
  │   └── Configurações
  └── Regras (atalho direto)
```

## Dados dos Personagens

### MAGO - Estratégias
1. Manipulação de Informação
2. Controle de Descartes
3. Gestão de Recursos
4. Enganação
5. Interrupção de Combos
6. Defesa Adaptativa
7. Controle de Campo
8. Forçar Jogadas

### BESTA - Estratégias
1. Aproveitamento do Descarte
2. Agressividade
3. Trocas Eficientes
4. Resistência
5. Pressão Constante
6. Jogo de Alto Risco
7. Combos de Ataque
8. Bloqueio de Estratégia

### ANJO - Estratégias
1. Vantagem Numérica
2. Manipulação do Campo do Oponente
3. A Longo Prazo
4. Surpresa Estratégica
5. Controle de Informação
6. Preparação para o Fim de Jogo
7. Desestabilização do Oponente
8. Dominância Tática

## Microcopy e Tooltips

Todos os tooltips, mensagens de erro, e textos de interface foram implementados conforme especificação:
- Tooltips de poderes de personagem
- Mensagens de validação
- Textos do tutorial (8 passos completos)
- Avisos de jogo ("Ao vencer, o oponente descarta 1 carta")

## Acessibilidade

- Contraste 4.5:1 implementado
- Navegação por teclado (Tab, Enter, Esc)
- Labels ARIA em componentes interativos
- Opções de alto contraste e suporte a leitor de tela em Settings

## Responsividade

- Layout adaptável desktop (1440px) e mobile (375px)
- Grid responsivo (1 coluna mobile, 2-3 colunas desktop)
- Botões e cards ajustáveis
- Scroll areas para conteúdo longo

## Tecnologias

- **React** com TypeScript
- **Tailwind CSS v4** com tokens customizados
- **shadcn/ui** components (Button, Card, Dialog, Switch, Slider, etc.)
- **Lucide React** para ícones
- **Google Fonts** (Playfair Display, Inter)

## Estado do Protótipo

✅ Todas as 10+ telas implementadas
✅ Navegação completa entre telas
✅ Componentes visuais de alta fidelidade
✅ Sistema de design completo
✅ Tema mágico/medieval aplicado
✅ Animações e microinterações
✅ Textos e microcopy completos
✅ Sistema de personagens completo (3 fichas)
✅ Tutorial interativo (8 passos)
✅ Regras completas com busca
✅ GameBoard hotseat funcional
✅ Configurações completas

## Próximos Passos Sugeridos

1. **Implementar lógica de jogo**: Adicionar regras de combate e resolução de turnos
2. **Persistência**: Salvar configurações e histórico de partidas
3. **Animações avançadas**: Usar Motion/Framer Motion para transições de carta
4. **Sons e música**: Adicionar trilha sonora e efeitos
5. **Modo online**: Implementar multiplayer com Supabase
6. **IA**: Adicionar oponente computador

## Observações

Este é um protótipo de alta fidelidade totalmente funcional como navegação e interface. A lógica completa do jogo (mecânicas de combate, gestão de baralho, resolução de magias) pode ser implementada nas próximas iterações.

Todos os elementos visuais seguem fielmente a especificação fornecida, incluindo a importante linha horizontal abaixo dos nomes dos personagens nas fichas.
