/**
 * aiScoring.ts - IA 2.0 (item 3 do roadmap arquitetural de overhaul):
 * "gerar ações legais → simular no reducer real → pontuar o resultado →
 * escolher a melhor", em vez da árvore de heurísticas decideX gigante em
 * aiPlayer.ts.
 *
 * ESCOPO DESTA LEVA: só a função de pontuação (`scoreGameState`) e a decisão
 * baseada nela (`decideActionByScore`), validadas via simulação IA vs IA
 * (ver scripts/ai-score-vs-heuristic.ts) - NENHUMA partida de verdade usa
 * isto ainda (decideAiAction/GameBoard.tsx continuam 100% na árvore
 * heurística). Fora de escopo: ligar isto a uma partida ao vivo, dificuldade
 * (ruído/profundidade de busca, ver ideia original no roadmap), fase de
 * Reações, e apostar em qualquer coisa mais sofisticada que 1 nível de
 * profundidade (a pontuação avalia o estado IMEDIATAMENTE após a ação, nunca
 * simula o que o oponente faria depois).
 *
 * DISCIPLINA DE INFORMAÇÃO OCULTA (a armadilha mais fácil de cair nesta
 * abordagem, e a mesma regra do cabeçalho de aiPlayer.ts): `nextState` de
 * `enumerateAcceptedActions` é o GameState VERDADEIRO após a ação -
 * `gameReducer` não tem noção nenhuma de "visão de jogador". Pontuar esse
 * estado ingenuamente vazaria a mão/campo oculto do oponente pra decisão -
 * uma IA que "sabe" o que o oponente tem escondido. `scoreGameState` só lê o
 * lado do jogador-alvo (`forPlayer`) por completo; o lado do OPONENTE só
 * entra via `trueSlotValue(..., {opponentView: true})` (filtra horizontais
 * não reveladas) e `buildUnseenCombatValuePool` (estimativa estatística a
 * partir da composição teórica do baralho, nunca o valor real de uma carta
 * não revelada) - as MESMAS funções que a árvore heurística já usa pra isso,
 * reaproveitadas em vez de reimplementadas (risco real de reintroduzir o
 * mesmo bug que aiPlayer.ts já teve e corrigiu mais de uma vez).
 */
import { playerKeyOf, opponentKeyOf, opponentOf, characterOf } from './gameSelectors';
import type { GameState } from './gameStateTypes';
import type { PlayerNumber } from './gameTypes';
import { type AiDecision, combatValue, trueSlotValue, cardPriority, buildUnseenCombatValuePool, livesDelta } from './aiPlayer';
import { enumerateAcceptedActions } from './actionSpace';

/**
 * Pesos relativos - só a ORDEM entre candidatas importa pra
 * `decideActionByScore` (a escala em si é arbitrária), mas refletem o que
 * mais decide uma partida: vidas dominam de propósito (1 vida vale muito
 * mais que qualquer vantagem de campo/mão isolada), campo de combate vem
 * depois (o que decide DISPUTAS de verdade), mão por último (potencial
 * futuro, valor ainda não realizado).
 */
const WEIGHTS = { lives: 1000, field: 10, hand: 3 };

function average(values: number[], fallback: number): number {
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : fallback;
}

/**
 * Pontuação de UM GameState do ponto de vista de `forPlayer` - quanto maior,
 * melhor pra `forPlayer`. Fim de jogo é um caso à parte (+-Infinity): uma
 * candidata letal sempre vence qualquer vantagem parcial, e perder sempre
 * perde pra qualquer outra alternativa não-letal disponível.
 */
export function scoreGameState(state: GameState, forPlayer: PlayerNumber): number {
  if (state.gameOver) {
    return state.gameOver.winner === forPlayer ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  }

  const me = state[playerKeyOf(forPlayer)];
  const opponent = state[opponentKeyOf(forPlayer)];
  const myCharacter = characterOf(state, forPlayer);
  const oppCharacter = characterOf(state, opponentOf(forPlayer));
  const spotlight = state.spotlight;

  const livesScore = livesDelta(state, forPlayer) * WEIGHTS.lives;

  const myFieldValue = me.field.reduce((sum, _slot, i) => sum + trueSlotValue(me, i, myCharacter, spotlight, {}), 0);
  const oppFieldValue = opponent.field.reduce(
    (sum, _slot, i) => sum + trueSlotValue(opponent, i, oppCharacter, spotlight, { opponentView: true, opponentField: me.field }),
    0
  );
  const fieldScore = (myFieldValue - oppFieldValue) * WEIGHTS.field;

  const myHandValue = me.hand.reduce((sum, c) => sum + cardPriority(c, myCharacter, spotlight), 0);
  const avgUnseenValue = average(buildUnseenCombatValuePool(state, forPlayer), 5);
  const oppHandValue = opponent.hand.reduce((sum, c) => sum + (c.revealed ? combatValue(c, spotlight) : avgUnseenValue), 0);
  const handScore = (myHandValue - oppHandValue) * WEIGHTS.hand;

  return livesScore + fieldScore + handScore;
}

/**
 * "gera ações legais → simula no reducer → pontua → escolhe" - o núcleo da
 * IA 2.0. `enumerateAcceptedActions` já devolve `nextState` PRONTO (o
 * reducer já rodou pra montar a lista de candidatas aceitas), então pontuar
 * cada uma não roda o reducer de novo.
 *
 * Distinção ready/wait (mesmo contrato de `AiDecision` que aiPlayer.ts já
 * define, ver o comentário completo lá): sem candidata alguma, `wait` quando
 * o jogador já selecionou seu slot de combate nesta rodada e está esperando
 * o oponente selecionar o dele (nunca marcar "Pronto" aqui - encerraria o
 * combate cedo, descartando cartas que ainda não lutaram); `ready` em
 * qualquer outro caso sem candidata.
 */
export function decideActionByScore(state: GameState, player: PlayerNumber): AiDecision {
  // BUG REAL ENCONTRADO validando isto por simulação (mesma disciplina que
  // aiPlayer.ts já documenta ter enfrentado antes): `TOGGLE_READY` é uma
  // ação ACEITA como qualquer outra (o jogo permite desmarcar "Pronto" livre-
  // mente antes da fase avançar de vez) e `scoreGameState` não tem NENHUMA
  // opinião sobre `readyForNextPhase` (não é vida/campo/mão) - as duas
  // pontuações empatam sempre. Deixado no pool de candidatas, isso fazia a
  // IA alternar Pronto ligado/desligado pra sempre (300 passos, 0 progresso
  // real, só TOGGLE_READY) - nunca ficava "presa" tecnicamente (cada
  // alternância É aceita pelo reducer), só nunca convergia. `simulateSteps`
  // já trata a decisão `'ready'` como MÃO ÚNICA (só liga, nunca desliga de
  // volta - guard `!readyForNextPhase` lá) - a correção é nunca propor
  // TOGGLE_READY como uma ação pontuável, sempre passar pelo caminho
  // ready/wait abaixo em vez disso.
  const candidates = enumerateAcceptedActions(state, player).filter((c) => c.action.type !== 'TOGGLE_READY');
  if (candidates.length > 0) {
    const scored = candidates.map((c) => ({ action: c.action, score: scoreGameState(c.nextState, player) }));
    const best = scored.reduce((top, item) => (item.score > top.score ? item : top));
    // BUG REAL ENCONTRADO validando isto (mesma sessão do TOGGLE_READY acima):
    // sem comparar contra o placar de NÃO agir, um par de ações reversíveis
    // (ex.: jogar uma carta no campo e devolvê-la pra mão) podia alternar pra
    // sempre sempre que "a menos pior das opções disponíveis" for desfazer a
    // própria jogada anterior - a IA era obrigada a escolher ALGUMA ação a
    // cada decisão, mesmo quando toda alternativa real piora ou empata com o
    // estado atual. Só age se `best` bate/supera o placar de ficar parada -
    // senão cai pro ready/wait abaixo, exatamente como a árvore heurística já
    // faz ("não tenho mais nada produtivo a fazer").
    // BUG REAL ENCONTRADO validando isto: na fase de Combate a única decisão
    // real é selecionar um slot - a pontuação enxerga só 1 passo à frente
    // (ver cabeçalho do arquivo), e SELECT_COMBAT_SLOT sozinha nunca muda
    // vida/campo/mão (o ganho de verdade só existe depois de RESOLVE_COMBAT,
    // que só acontece quando os DOIS lados já escolheram) - o piso de
    // "precisa melhorar o placar atual" pra qualquer outra fase REJEITAVA
    // toda seleção de combate por empatar com não fazer nada, e a partida
    // nunca avançava (ver o TOGGLE_READY acima, mesma causa raiz: não dá pra
    // tratar "não fazer nada" como sempre seguro). Na Estratégia/Compra,
    // "não fazer nada" (ready) É uma alternativa genuína, então o piso
    // continua valendo lá.
    if (state.phase === 'combat' || best.score > scoreGameState(state, player)) {
      return { type: 'action', action: best.action };
    }
  }

  if (state.phase === 'combat' && state.combatSelection[playerKeyOf(player)] !== undefined) {
    return { type: 'wait' };
  }
  return { type: 'ready' };
}
