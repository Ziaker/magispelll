/**
 * drawPhaseHandlers.ts - transições de estado próprias da fase de Compra.
 *
 * Handlers continuam puros: recebem GameState + payload e devolvem GameState.
 */
import { applyStatus, hasStatus } from './statusEffects';
import { drawCards } from './cardUtils';
import { ensureDeckHasCards, pushToDiscard } from './deckLifecycle';
import { getEffectiveDiscardLimit, getEffectiveDrawLimit } from './gameLimits';
import { appendLog } from './gameLog';
import { opponentOf, playerKeyOf } from './gameSelectors';
import type { PlayerNumber } from './gameTypes';
import type { GameState } from './gameStateTypes';
export function handleDrawCards(state: GameState, player: PlayerNumber, count: number): GameState {
  if (state.phase !== 'draw') return state;
  const playerKey = playerKeyOf(player);
  const playerState = state[playerKey];
  if (playerState.hand.length >= playerState.handLimit) return state;

  // FIX (pedido do usuário: "opção no pré-jogo de limite de compra de
  // cartas... funcionando de forma similar a de descarte") - quando
  // habilitado, a compra normal (esta função) nunca pode ultrapassar
  // `gameConfig.drawLimit` cartas somadas NESTE turno, além do limite de mão
  // já existente. Nunca afeta cartas ganhas por efeito de magia (esses
  // caminhos não passam por aqui - ver handleExecuteMagic/
  // handleActivateSimpleMagic).
  const effectiveDrawLimit = getEffectiveDrawLimit(state.gameConfig);
  const drawLimitRemaining = state.gameConfig.drawLimitEnabled
    ? Math.max(0, effectiveDrawLimit - playerState.drawsThisTurn)
    : Infinity;
  if (drawLimitRemaining <= 0) {
    return { ...state, log: appendLog(state, state.log, 'warning', `Limite de ${effectiveDrawLimit} compra(s) por turno atingido!`) };
  }

  const { deck: ensuredDeck, discardPile: ensuredDiscard, reshuffled } = ensureDeckHasCards(state);

  let log = state.log;
  if (reshuffled) {
    log = appendLog(state, log, 'system', `O baralho esgotou - a pilha de descarte foi reembaralhada de volta`);
  }

  const maxCanDraw = playerState.handLimit - playerState.hand.length;
  const actualCount = Math.min(count, maxCanDraw, ensuredDeck.length, drawLimitRemaining);
  if (actualCount <= 0) {
    return { ...state, deck: ensuredDeck, discardPile: ensuredDiscard, log };
  }

  let { drawn, remaining } = drawCards(ensuredDeck, actualCount);

  // Efeito da Magia Numeral do Mago: revela cartas compradas pelo oponente.
  // FIX (item 12 da 5ª rodada): checa o slot do OPONENTE especificamente no
  // mapa por jogador (ver comentário de `activeNumeralSpells` em GameState) -
  // antes, com um único slot global, isso já funcionava por acaso quando só
  // um dos dois jogadores era Mago, mas quebrava (efeito de um jogador
  // cancelando o do outro) no caso Mago vs Mago.
  if (state.activeNumeralSpells[opponentOf(player)]?.character === 'mago') {
    drawn = drawn.map((c) => ({ ...c, revealed: true }));
    log = appendLog(state, log, 'numeral-spell', `Cartas de Jogador ${player} foram reveladas pela Magia Numeral`, { player });
  }

  // Glacial (personagem novo) - Criogênese (Magia Numeral): enquanto o
  // StatusEffect 'freezeUpcomingMagicDraws' estiver ativo neste jogador
  // (ver handleFinalizeNumeralSpell), toda carta de magia (J/Q/K) comprada
  // agora nasce já congelada.
  if (hasStatus(playerState, 'freezeUpcomingMagicDraws')) {
    const anyMagicDrawn = drawn.some((c) => c.value === 'J' || c.value === 'Q' || c.value === 'K');
    drawn = drawn.map((c) =>
      c.value === 'J' || c.value === 'Q' || c.value === 'K'
        ? applyStatus(c, { kind: 'frozen', source: 'glacial', label: 'Criogênese', duration: { type: 'permanent' } })
        : c
    );
    if (anyMagicDrawn) {
      log = appendLog(state, log, 'numeral-spell', `Uma carta de magia comprada por Jogador ${player} nasceu congelada pela Criogênese`, { player });
    }
  }

  // FIX (item 16): a Fúria Sanguinária da Besta deixou de ser um filtro que
  // agia por cima de cada compra normal (o efeito antigo só descartava as
  // cartas >6 recém-compradas, algo fraco e raramente perceptível) e virou um
  // efeito único e imediato aplicado no momento em que a magia numeral é
  // ativada (ver handleFinalizeNumeralSpell): o oponente descarta a mão
  // inteira e compra de volta mais de 6 cartas de uma vez. Por isso não há
  // mais nenhum tratamento especial da Besta aqui em handleDrawCards.
  log = appendLog(state, log, 'draw', `Jogador ${player} comprou ${actualCount} carta(s)`, { player });

  return {
    ...state,
    deck: remaining,
    discardPile: ensuredDiscard,
    log,
    [playerKey]: {
      ...playerState,
      hand: [...playerState.hand, ...drawn],
      drawsThisTurn: playerState.drawsThisTurn + actualCount,
    },
  };
}

export function handleDiscardCards(state: GameState, player: PlayerNumber, cardIds: string[]): GameState {
  if (state.phase !== 'draw') return state;
  // FIX (pedido do usuário: "opção do pré-jogo para decidir o limite de
  // cartas que podem serem descartadas por turno... com o mínimo sendo 4
  // como no jogo normal") - `gameConfig.discardLimit` no lugar do antigo "4"
  // fixo (o próprio config já garante mínimo 4 - ver MIN_DISCARD_LIMIT em
  // gameConfig.ts e o clamp no seletor em GameConfig.tsx).
  const discardLimit = getEffectiveDiscardLimit(state.gameConfig);
  if (cardIds.length === 0 || cardIds.length > discardLimit) return state;

  const playerKey = playerKeyOf(player);
  const playerState = state[playerKey];

  if (playerState.discardsThisTurn + cardIds.length > discardLimit) {
    return { ...state, log: appendLog(state, state.log, 'warning', `Limite de ${discardLimit} descartes por turno atingido!`) };
  }

  // Cartas reveladas nunca podem ser descartadas, mesmo que o chamador tente.
  const idsSet = new Set(cardIds);
  const discardable = playerState.hand.filter((c) => idsSet.has(c.id) && !c.revealed);
  if (discardable.length === 0) return state;

  const discardableIds = new Set(discardable.map((c) => c.id));
  const newHand = playerState.hand.filter((c) => !discardableIds.has(c.id));

  const { deck, discardPile } = pushToDiscard(state, discardable);
  const log = appendLog(state, state.log, 'discard', `Jogador ${player} descartou ${discardable.length} carta(s)`, { player });

  return {
    ...state,
    deck,
    discardPile,
    log,
    [playerKey]: {
      ...playerState,
      hand: newHand,
      discardsThisTurn: playerState.discardsThisTurn + discardable.length,
    },
  };
}
