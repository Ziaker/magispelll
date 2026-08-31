# Sistema de Fases e Combate - Atualizações Daispell

## ✅ Implementações Completas

### 1. 🎴 **Fase de Compra Redesenhada**

#### Regras Implementadas:
- **Ocorre no início de cada turno**
- Jogadores podem **manter ou descartar** cartas da rodada anterior
- **Limite de 8 cartas** na mão
- **Descarte**: até 4 cartas por vez
- **Compra**: automática após descarte, até completar 8 cartas
- **Cartas mágicas**: J, Q, K podem ser descartadas (máx 2 por fase) para comprar

#### Interface:
- **Botão "Descartar"**:
  - Aparece apenas na fase de compra
  - Mostra contador de cartas selecionadas (0-4)
  - Desabilitado se nenhuma carta selecionada ou mais de 4
  - Ao clicar: descarta e compra automaticamente
  
- **Botão "Comprar"**:
  - Aparece apenas na fase de compra
  - Compra cartas até completar 8
  - Desabilitado quando mão já tem 8 cartas

- **Seleção de cartas**:
  - Clique em cartas para marcar para descarte
  - Visual: anel vermelho + opacidade reduzida + scale menor
  - Contador mostra quantas cartas selecionadas

#### Regras de Negócio:
```typescript
- Máximo 4 cartas descartadas por vez
- Compra automática após descarte
- Limite de mão: 8 cartas
- Sistema rastreia cartas mágicas descartadas por jogador
```

---

### 2. 📊 **Log com Cores dos Personagens**

#### Antes:
```
Jogador 1 posicionou carta virada no slot 1
```

#### Agora:
```html
<span style="color: #4A90E2; font-weight: 600;">Jogador 1</span> posicionou 
<span style="color: #C59E4F; font-weight: 600;">A♠</span> virada no slot 1
```

#### Implementação:
- Nomes dos jogadores coloridos com cor do personagem (azul/vermelho/amarelo)
- Valores de cartas em dourado (#C59E4F)
- Renderização via `dangerouslySetInnerHTML`
- Peso de fonte 600 para destaque

---

### 3. ⚔️ **Correção no Cálculo de Combate**

#### Problema:
Cartas horizontais não eram somadas ao valor total

#### Solução:
```typescript
const p1BaseValue = getCardNumericValue(slot.faceDownCard.value);
const p1HorizontalValue = slot.horizontalCard 
  ? getCardNumericValue(slot.horizontalCard.value) 
  : 0;
const p1TotalValue = p1BaseValue + p1HorizontalValue;
```

#### Exemplo:
- Carta base: 5
- Carta horizontal: 3
- **Total: 8** ✓

---

### 4. 🎬 **Pop-up de Transição de Fase**

#### Características:
- **Grande e chamativo** (400x300px aprox)
- **Animações**:
  - Fade in/out
  - Scale spring animation
  - Rotate Y 3D effect
  - Ícone giratório contínuo
- **Duração**: 2 segundos
- **Fundo**: overlay escuro semi-transparente
- **Cores temáticas**:
  - Compra: Verde (#6CC47A)
  - Estratégia: Dourado (#C59E4F)
  - Combate: Vermelho (#D45D4A)

#### Conteúdo:
```
┌─────────────────────────┐
│    [Ícone Giratório]    │
│                         │
│   FASE DE [NOME]        │
│   [Descrição]           │
│                         │
│    ✦  ✦  ✦  ✦          │
└─────────────────────────┘
```

---

### 5. 🏆 **Sistema de Vitória e Vidas**

#### Estrutura:
```typescript
interface PlayerState {
  lives: number;           // 3 vidas iniciais
  combatWins: number;      // Contador de vitórias em combate (0-2)
  // ...
}
```

#### Lógica:
1. **Vencer combate** → +1 combatWin
2. **2 combatWins** → Vence DISPUTA
3. **Vencer disputa** → Oponente perde 1 vida
4. **Contador reset** após disputa vencida

#### Marcador de Vidas:
- **3 corações** ao lado do nome do personagem
- Corações preenchidos = vidas restantes
- Corações vazios (opacidade 20%) = vidas perdidas
- Cores do personagem

#### Exibição:
```
MAGO ❤️❤️❤️
Jogador 1 • Vitórias: 1/2
```

---

### 6. 🎯 **Pop-ups de Resultado de Combate**

#### Pop-up de Vitória:
- **Fundo**: overlay escuro
- **Animação**:
  - Scale + slide from top
  - Raios de luz rotativos
  - Troféu pulsante
  - Partículas douradas flutuantes
- **Conteúdo**:
  - Troféu animado
  - "Vencedor do Combate"
  - Nome do personagem (cor temática)
  - "Jogador X"
  - Placar (ex: "14 vs 12")
- **Duração**: 2.5 segundos
- **Cores**: tema do personagem vencedor

#### Pop-up de Empate:
- **Visual neutro** (cinza #BFB6A6)
- **Ícone**: espadas cruzadas
- **Texto**: "EMPATE!"
- **Placar**: valores iguais
- **Duração**: 2.5 segundos

---

### 7. 📍 **Painel de Pontuação (Coluna Direita)**

```
┌─────────────────────┐
│   Pontuação         │
├─────────────────────┤
│ MAGO                │
│ ❤️❤️❤️              │
│ Vitórias: 1/2       │
├─────────────────────┤
│ BESTA               │
│ ❤️❤️🖤              │
│ Vitórias: 0/2       │
└─────────────────────┘
```

---

## 🎮 Fluxo Completo de Jogo

### Turno 1 - Jogador 1

#### 1. Fase de Compra
- Pop-up: "FASE DE COMPRA"
- Jogador 1 vê suas 8 cartas
- Opções:
  - Selecionar até 4 cartas → Clicar "Descartar"
  - Clicar "Comprar" para preencher mão
- Marcar "Pronto"

#### 2. Fase de Estratégia  
- Pop-up: "FASE DE ESTRATÉGIA"
- Ambos jogadores:
  - Selecionam cartas
  - Escolhem slots
  - Decidem: virada ou horizontal
- Marcam "Pronto"

#### 3. Fase de Combate
- Pop-up: "FASE DE COMBATE"
- Jogador 1 seleciona slot
- Jogador 2 seleciona slot
- Cartas revelam (com horizontal somado)
- Pop-up de resultado:
  - "MAGO VENCEU!" ou
  - "EMPATE!"
- Log atualizado
- Contador de vitórias +1
- Se 2 vitórias → Disputa vencida → Oponente -1 vida

### Turno 2 - Jogador 2
- Repete ciclo...

---

## 📊 Estados do Jogo

```typescript
GameState {
  turn: 1,
  phase: 'draw' | 'strategy' | 'combat',
  currentPlayer: 1 | 2,
  
  player1: {
    hand: Card[],
    field: [FieldSlot, FieldSlot, FieldSlot],
    lives: 3,                    // ✨ NOVO
    combatWins: 0,               // ✨ NOVO
    magicCardsDiscarded: 0,      // ✨ NOVO
    readyForNextPhase: boolean,
    deckSize: number,
    discardSize: number,
  },
  
  player2: { ... },
}
```

---

## 🎨 Componentes Criados

### `PhaseTransition.tsx`
- Pop-up animado de transição de fase
- Ícones dinâmicos por fase
- Cores temáticas
- Animações 3D

### `CombatResult.tsx`
- Pop-up de vitória com raios e partículas
- Pop-up de empate
- Recebe personagens e valores
- Animações complexas

---

## 🐛 Correções de Bugs

### ✅ Cartas horizontais agora somam corretamente
**Antes**: Apenas carta base era contada  
**Agora**: Base + Horizontal = Total

### ✅ Log com formatação HTML
**Antes**: Texto plano  
**Agora**: Cores dos personagens e cartas

### ✅ Sistema de descarte funcional
**Antes**: Não existia  
**Agora**: Completo com validações

---

## 📝 Regras Finais

### Fase de Compra
- ✅ Descartar até 4 cartas
- ✅ Comprar até ter 8
- ✅ Máximo 8 cartas na mão
- ✅ Rastrear cartas mágicas descartadas

### Fase de Estratégia
- ✅ Ambos jogadores jogam livremente
- ✅ Tooltip mostra cartas viradas
- ✅ Cartas horizontais somam

### Fase de Combate
- ✅ Jogador do turno escolhe primeiro
- ✅ Oponente escolhe depois
- ✅ Cartas revelam simultaneamente
- ✅ Cálculo: base + horizontal
- ✅ 2 vitórias = 1 disputa
- ✅ 1 disputa = -1 vida oponente

### Vitória
- ⏳ Implementar: Jogador com 0 vidas perde o jogo
- ⏳ Implementar: Tela de vitória final

---

## 🔮 Próximos Passos Sugeridos

1. **Tela de Fim de Jogo**
   - Detectar quando jogador chega a 0 vidas
   - Pop-up de vitória final
   - Estatísticas da partida
   - Opções: Jogar novamente / Voltar ao menu

2. **Animações de Cartas**
   - Flip ao revelar
   - Movimento da mão para o campo
   - Brilho em cartas mágicas

3. **Sistema de Magias**
   - J, Q, K ativam habilidades
   - Combos numéricos (9,9,9 / 6,6,6 / 3,3,3)
   - Efeitos especiais por personagem

4. **Sons e Música**
   - Música de fundo por fase
   - SFX de carta sendo jogada
   - SFX de vitória/derrota
   - SFX de revelação

5. **Tutorial Interativo**
   - Explicar fase de compra
   - Explicar descarte
   - Explicar sistema de vidas

---

## 🧪 Como Testar

### Teste de Fase de Compra
1. Inicie jogo
2. Na fase de compra:
   - Clique em 2-3 cartas (anel vermelho aparece)
   - Clique "Descartar"
   - Verifique que novas cartas foram compradas
   - Verifique contador de descarte

### Teste de Combate
1. Avance para fase de estratégia
2. Posicione cartas (uma com horizontal)
3. Avance para fase de combate
4. Selecione slots
5. Verifique:
   - Pop-up de resultado
   - Cálculo correto (base + horizontal)
   - Contador de vitórias
   - Log colorido

### Teste de Sistema de Vidas
1. Force vitórias consecutivas
2. Após 2 vitórias:
   - Verifique mensagem de disputa
   - Verifique oponente perde 1 vida
   - Verifique corações no header
   - Verifique contador reset

### Teste de Transição
1. Clique "Pronto" em ambos jogadores
2. Verifique:
   - Pop-up grande e chamativo
   - Animação fluida
   - Cores corretas por fase
   - Desaparece após 2s

---

## 💡 Observações Técnicas

- Usado `motion/react` para animações
- `dangerouslySetInnerHTML` para log formatado
- Set<string> para controle de seleção múltipla
- Timeouts para sequência de animações
- Validações em botões (disabled states)
- Cores inline via styles para temas dinâmicos
