# Magispelll - Documentação Detalhada do Código

**NOME DO JOGO:** Magispelll (com 3 L's)  
Cada "L" representa um personagem jogável: MAGO, BESTA, ANJO.  
Se novos personagens forem adicionados, adicione mais L's ao nome.

## Visão Geral da Arquitetura

### Estrutura de Pastas
```
/
├── App.tsx                    # Componente raiz, gerencia navegação
├── components/                # Componentes React
│   ├── GameBoard.tsx         # ⭐核心: Lógica principal do jogo
│   ├── PlayerZone.tsx        # Zona de um jogador (mão, campo, ações)
│   ├── BattleField.tsx       # Campo de batalha central
│   ├── PlayingCard.tsx       # Renderização de uma carta
│   └── ui/                   # Componentes Shadcn
├── lib/                      # Lógica de negócio
│   ├── cardUtils.ts          # Utilidades de cartas e baralho
│   ├── magicCards.ts         # Sistema de Magias (J, Q, K)
│   ├── numeralSpells.ts      # Sistema de Magias Numerais (3x mesmo número)
│   ├── monsterCards.ts       # Sistema de Cartas Monstro (Coringas)
│   └── characterThemes.ts    # Cores e temas visuais
└── styles/
    └── globals.css           # Estilos globais e variáveis CSS
```

---

## Fluxo de Dados

### Estado Global (GameBoard.tsx)
```typescript
GameState {
  turn: number              // Turno atual
  phase: Phase              // 'draw' | 'strategy' | 'combat'
  firstToFlip: 1 | 2       // Quem vira primeiro no combate
  player1: PlayerState      // Estado do Jogador 1
  player2: PlayerState      // Estado do Jogador 2
  deck: Card[]              // Baralho restante
  discardPile: Card[]       // Descarte compartilhado
  activeNumeralSpell?: {...} // Magia Numeral ativa
}

PlayerState {
  hand: Card[]              // Mão do jogador
  field: [FieldSlot, FieldSlot, FieldSlot] // 3 slots
  lives: number             // Vidas (padrão 3)
  handLimit: number         // Limite de mão (padrão 8)
  permanentDrawBonus: number // Bônus de compra permanente (Anjo)
  canStackHorizontal: boolean // Pode empilhar horizontal (Anjo K)
}

FieldSlot {
  faceDownCard?: Card       // Carta principal
  horizontalCard?: Card     // Carta horizontal empilhada
  revealed: boolean         // Se foi revelada
}
```

### Fluxo de Um Turno

```
FASE DE COMPRA (draw)
├── Jogadores podem descartar até 4 cartas
├── Jogadores compram 1 carta (+ bônus se houver)
├── Efeitos de Magias Numerais são aplicados aqui:
│   ├── MAGO: Revela cartas compradas do oponente
│   └── BESTA: Força descarte de cartas > 6
└── Ambos prontos → avança para ESTRATÉGIA

FASE DE ESTRATÉGIA (strategy)
├── Jogadores posicionam cartas nos 3 slots
├── Podem usar Magias (J, Q, K) de ESTRATÉGIA
├── Podem ativar Magia Numeral (3x mesmo número)
│   └── Se ativar: PULA combate, vai direto para próximo turno
├── Podem transformar Ás em número 2-10
└── Ambos prontos → avança para COMBATE

FASE DE COMBATE (combat)
├── Jogadores podem usar Magias (K) de COMBATE
├── firstToFlip seleciona uma carta do campo
├── Outro jogador seleciona uma carta
├── Cartas são reveladas
├── Maior valor ganha (empate = sem vencedor)
├── Perdedor perde 1 vida
├── Se alguém chegar a 0 vidas → FIM DE JOGO
└── Ambos prontos → avança para COMPRA (novo turno)
```

---

## Sistemas Principais

### 1. Sistema de Cartas

#### Tipos de Cartas
```typescript
// Cartas Numerais (2-10)
value: '2' | '3' | ... | '10'
// Usadas em combate e estratégia

// Ás (A)
value: 'A'
transformedValue?: 2-10  // Pode ser transformado
// Valor de combate base: 14 (maior)

// Magias (J, Q, K)
value: 'J' | 'Q' | 'K'
// Efeitos especiais por personagem e fase

// Monstro (Coringa)
value: 'JOKER'
isMonster: true
// Efeitos especiais por personagem
```

#### Propriedades Especiais
```typescript
revealed: boolean         // Revelada por magia (não pode descartar)
transformedValue: number  // Ás transformado
battled: boolean          // Carta horizontal já batalhou
monsterUsed: boolean      // Efeito de Monstro já usado
```

### 2. Sistema de Magias (J, Q, K)

Cada personagem tem 3 magias únicas:

```
MAGO (Controle e Informação)
├── J (Compra): Revelação Forçada
│   └── Revela carta da mão do oponente
├── Q (Estratégia): Substituição Arcana
│   └── Substitui carta no campo por numeral da mão
└── K (Combate): Destruição de Reforço
    └── Destrói carta horizontal do oponente

BESTA (Agressão e Reciclagem)
├── J (Compra): Recuperação Selvagem
│   └── Pega até 2 cartas do descarte
├── Q (Estratégia): Troca Predatória
│   └── Troca carta do campo por carta do descarte
└── K (Combate): Roubo Brutal
    └── Rouba carta do campo do oponente

ANJO (Crescimento e Suporte)
├── J (Compra): Benção Divina
│   └── Compre um Ás (busca no baralho/descarte, direto pra mão)
├── Q (Estratégia): Visão Celestial
│   └── Revela carta (protege de descarte)
└── K (Estratégia): Reforço Angelical
    └── Permite empilhar horizontal extra
```

### 3. Sistema de Magias Numerais

Ativada com 3 cartas do mesmo número:

```
MAGO (9, 9, 9)
└── Visão Arcana
    └── No PRÓXIMO turno: revela todas as cartas do oponente

BESTA (6, 6, 6)
└── Fúria Sanguinária
    └── No PRÓXIMO turno: oponente descarta cartas > 6 que comprar

ANJO (3, 3, 3)
└── Benção Eterna
    └── PERMANENTE: +1 compra e +1 limite de mão (acumulativo)
```

**Mecânica:**
1. Só pode ativar na fase de ESTRATÉGIA
2. Campo deve estar vazio (sem cartas posicionadas)
3. Apenas UMA Magia Numeral ativa por vez
4. Ao ativar:
   - 3 cartas são posicionadas no campo (reveladas)
   - PULA a fase de combate
   - Cartas são descartadas
   - Avança direto para próximo turno
   - Efeito é aplicado no próximo turno (exceto Anjo)

### 4. Sistema de Cartas Monstro (Coringas)

2 Monstros no baralho, efeitos por personagem:

```
MAGO: Ilusão Arcana
└── Copia valor de qualquer carta revelada (1x por turno)

BESTA: Fúria Selvagem
└── Dobra valor da carta horizontal no mesmo slot

ANJO: Proteção Divina
└── Slot fica imune a magias do oponente
```

### 5. Sistema de Combate

```typescript
// 1. Seleção de Cartas
firstToFlip seleciona slot (0-2)
→ outro jogador seleciona slot
→ cartas reveladas

// 2. Cálculo de Valor
Para cada carta:
  - Se é Ás transformado: usar transformedValue
  - Se não: usar getCardNumericValue(value)
  - Se tem horizontal: somar valor da horizontal
  - Se Monstro Besta + horizontal: dobrar horizontal

// 3. Comparação
Se valor1 > valor2: Jogador 1 vence
Se valor2 > valor1: Jogador 2 vence
Se valor1 == valor2: Empate (ninguém perde vida)

// 4. Consequências
Perdedor: -1 vida
Se vidas <= 0: FIM DE JOGO
```

---

## Funções Críticas do GameBoard

### handleDrawCards
```typescript
// PROPÓSITO: Comprar cartas do baralho
// QUANDO: Fase de compra, botão "Comprar"
// EFEITOS:
// - Aplica Magia Numeral do Mago (revela cartas)
// - Aplica Magia Numeral da Besta (descarta cartas > 6)
// - Respeita limite de mão (handLimit)
// - Adiciona bônus permanente (Anjo 3,3,3)
```

### handleActivateNumeralSpell
```typescript
// PROPÓSITO: Ativar Magia Numeral (3x mesmo número)
// QUANDO: Fase de estratégia, botão específico
// VALIDAÇÕES:
// - Fase === 'strategy'
// - Campo vazio (sem cartas posicionadas)
// - Tem 3 cartas do número correto
// - Não há Magia Numeral ativa
// FLUXO:
// 1. Posiciona 3 cartas no campo (reveladas)
// 2. Remove cartas do oponente do campo
// 3. Mostra popup animado (3 segundos)
// 4. Descarta as 3 cartas
// 5. Ativa efeito para próximo turno
// 6. PULA fase de combate
// 7. Avança direto para fase de compra
```

### advancePhase
```typescript
// PROPÓSITO: Avançar de fase
// QUANDO: Ambos jogadores prontos (readyForNextPhase)
// TRANSIÇÕES:
// draw → strategy: Muda fase
// strategy → combat: Muda fase
// combat → draw: Muda fase + novo turno
//   ├── Alterna firstToFlip (1→2, 2→1)
//   ├── Incrementa turn quando firstToFlip volta a 1
//   ├── Reseta campos
//   ├── Reseta limites e flags
//   └── Decrementa contador de Magia Numeral
```

### resolveCombat (dentro de handleCombatReveal)
```typescript
// PROPÓSITO: Resolver combate entre duas cartas
// CÁLCULO:
// 1. Pega cartas dos slots selecionados
// 2. Calcula valor total (principal + horizontal)
// 3. Compara valores
// 4. Determina vencedor
// 5. Perdedor perde 1 vida
// 6. Atualiza estatísticas
// 7. Verifica fim de jogo
```

---

## Pontos de Extensão

### Adicionar Novo Personagem

**Passo 1: Definir Cores**
```typescript
// /lib/characterThemes.ts
export const characterThemes = {
  // ... existentes
  novoPersonagem: {
    name: 'NOVO',
    primary: '#RRGGBB',
    // ... outras cores
  }
}
```

**Passo 2: Definir Magias (J, Q, K)**
```typescript
// /lib/magicCards.ts
export const MAGIC_CARDS = {
  // ... existentes
  novoPersonagem: {
    J: { name: '...', phase: 'draw', description: '...' },
    Q: { name: '...', phase: 'strategy', description: '...' },
    K: { name: '...', phase: 'combat', description: '...' },
  }
}

// Adicionar validações em canActivateMagic se necessário
```

**Passo 3: Definir Magia Numeral**
```typescript
// /lib/numeralSpells.ts
export const NUMERAL_SPELLS = {
  // ... existentes
  novoPersonagem: {
    character: 'novoPersonagem',
    requiredNumber: X, // escolher número livre (1,2,4,5,7,8,10)
    name: 'Nome da Magia',
    description: 'Descrição do efeito',
  }
}

// Implementar lógica do efeito em GameBoard.tsx:
// - handleDrawCards (se afetar compra)
// - advancePhase (se afetar fase)
// - handlePlayCard (se afetar posicionamento)
```

**Passo 4: Definir Efeito de Monstro**
```typescript
// /lib/monsterCards.ts
export const MONSTER_EFFECTS = {
  // ... existentes
  novoPersonagem: {
    name: 'Nome do Efeito',
    description: 'Descrição curta',
    detailedDescription: 'Explicação completa',
  }
}

// Implementar lógica em:
// - handleActivateMonsterEffect (GameBoard.tsx)
// - resolveCombat se afetar combate
```

**Passo 5: Atualizar Tipos**
```typescript
// Em TODOS os arquivos que usam:
type Character = 'mago' | 'besta' | 'anjo' | 'novoPersonagem';
```

**Passo 6: Adicionar Assets**
- Criar componente em CharacterSelection.tsx
- Adicionar em CharactersList.tsx
- Criar CharacterSheet específico
- Adicionar ícone em PlayerZone.tsx

### Adicionar Nova Fase

```typescript
// 1. Atualizar tipo Phase
type Phase = 'draw' | 'strategy' | 'combat' | 'novaFase';

// 2. Adicionar em advancePhase
if (prev.phase === 'faseAnterior') {
  newPhase = 'novaFase';
  // lógica de transição
}

// 3. Adicionar nome em phaseNames
const phaseNames = {
  // ... existentes
  novaFase: 'Nova Fase',
};

// 4. Atualizar PlayerZone para mostrar ações da nova fase
```

### Adicionar Nova Mecânica

**Exemplo: Cartas Permanentes**

```typescript
// 1. Adicionar ao tipo Card
export type Card = {
  // ... existentes
  isPermanent?: boolean;
  permanentEffect?: string;
}

// 2. Adicionar ao PlayerState
interface PlayerState {
  // ... existentes
  permanentCards: Card[];
}

// 3. Implementar lógica
const handlePlayPermanent = (card: Card) => {
  // validações
  // adicionar a permanentCards
  // aplicar efeito
}

// 4. Renderizar em PlayerZone ou BattleField
```

---

## Boas Práticas do Código

### Estado Imutável
```typescript
// ❌ ERRADO: Mutação direta
gameState.player1.hand.push(newCard);

// ✅ CORRETO: Novo objeto
setGameState(prev => ({
  ...prev,
  player1: {
    ...prev.player1,
    hand: [...prev.player1.hand, newCard]
  }
}));
```

### Validações
```typescript
// Sempre validar antes de modificar estado
if (!canDoAction) {
  addToLog('⚠️ Ação inválida');
  return; // Não modifica estado
}

setGameState(prev => {
  // modificação
});
```

### Log de Ações
```typescript
// Toda ação importante deve ser registrada
addToLog(`Jogador ${playerNumber} fez ação`, playerNumber);

// Usar cores para categorias:
// - Verde (#7FFF00): Turnos e fases
// - Dourado (#C59E4F): Cartas e valores
// - Cores de personagem: Ações do jogador
```

### Performance
```typescript
// Evitar cálculos desnecessários em render
// Use useMemo para valores derivados
const canActivate = useMemo(() => 
  canActivateMagic(phase, character, 'J', data),
  [phase, character, data]
);
```

---

## Troubleshooting Comum

### Magia Numeral não funciona
1. Verificar se está na fase de estratégia
2. Verificar se campo está vazio
3. Verificar se tem exatamente 3 cartas do número correto
4. Verificar se não há Magia Numeral já ativa

### Combate não resolve
1. Verificar se ambos selecionaram cartas
2. Verificar se cartas existem nos slots
3. Verificar cálculo de valores (Ás transformado, horizontais)
4. Verificar se efeitos de Monstro estão sendo aplicados

### Cartas não podem ser descartadas
1. Verificar se carta tem `revealed: true`
2. Cartas reveladas não podem ser descartadas (regra do jogo)

### Turno não avança
1. Verificar se ambos jogadores estão prontos
2. Verificar se fase de combate terminou
3. Verificar se Magia Numeral não está interferindo

---

## Glossário

- **Carta Virada**: faceDownCard - carta principal do slot
- **Carta Horizontal**: horizontalCard - carta empilhada como reforço
- **Carta Revelada**: revealed: true - não pode ser descartada
- **Magia**: Cartas J, Q, K com efeitos especiais
- **Magia Numeral**: 3 cartas do mesmo número específico
- **Monstro**: Coringa com efeito especial
- **Slot**: Um dos 3 espaços no campo de cada jogador
- **firstToFlip**: Jogador que seleciona carta primeiro no combate
- **Fase**: Etapa do turno (Compra, Estratégia, Combate)
- **Turno**: Rodada completa (3 fases)

---

*Documentação criada em 21/10/2025*
*Para dúvidas ou sugestões de melhoria, consulte o código-fonte comentado*
