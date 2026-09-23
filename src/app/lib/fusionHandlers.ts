/**
 * fusionHandlers.ts - transição de estado da variante Fusão.
 *
 * Elegibilidade e cálculo continuam em fusion.ts; este módulo apenas
 * aplica a fusão aceita à mão/contador/log sem depender do reducer.
 */
import type { Card } from './cardUtils';
import { canFuseCards, computeFusionResult } from './fusion';
import { appendLog } from './gameLog';
import { playerKeyOf } from './gameSelectors';
import type { GameState } from './gameStateTypes';
import type { PlayerNumber } from './gameTypes';
/**
 * FIX (pedido do usuário: variante "Fusão") - junta 2 cartas numerais puras
 * da mão em 1 carta nova valendo a soma das duas (ver computeFusionResult em
 * fusion.ts para a tabela completa de valores). O id da carta nova é
 * determinístico (`fused-<id1>-<id2>`) - as duas cartas de origem deixam de
 * existir como candidatas a qualquer coisa assim que são consumidas aqui,
 * então esse par de ids nunca se repete na mesma partida, garantindo
 * unicidade sem precisar de um contador global à parte.
 */
export function handleFuseCards(state: GameState, player: PlayerNumber, cardId1: string, cardId2: string): GameState {
  if (!state.gameConfig.fusion) return state;
  const playerKey = playerKeyOf(player);
  const playerState = state[playerKey];
  const card1 = playerState.hand.find((c) => c.id === cardId1);
  const card2 = playerState.hand.find((c) => c.id === cardId2);

  if (
    !canFuseCards(
      state.phase,
      state.gameConfig.fusion,
      playerState.fusesThisTurn,
      state.gameConfig.fusionLimit,
      state.gameConfig.monsterCards,
      card1,
      card2
    )
  ) {
    return state;
  }

  const result = computeFusionResult(card1!, card2!);
  // FIX (pedido do usuário: "quando uma carta fusionada é descartada... vai
  // pro discarte as duas... (ou mais caso tenha havido múltiplas fusões)")
  // - guarda as cartas ORIGINAIS (nunca fundidas) que compõem esta carta,
  // já achatadas: se card1/card2 já forem, elas mesmas, resultado de uma
  // fusão anterior, usa as folhas originais delas (fusionSources), nunca a
  // carta intermediária - assim uma refusão em cadeia sempre aponta direto
  // para as cartas físicas reais do baralho (ver expandSyntheticCard em
  // cardUtils.ts, usado no descarte).
  const fusionSources = [
    ...(card1!.fusionSources && card1!.fusionSources.length > 0 ? card1!.fusionSources : [card1!]),
    ...(card2!.fusionSources && card2!.fusionSources.length > 0 ? card2!.fusionSources : [card2!]),
  ];
  // FIX (pedido do usuário: "permita o jogador de fusionar 2 ÁS para obter
  // um monstro") - o resultado especial de 2 Áses é uma carta Monstro de
  // verdade (mesmos campos usados na criação do baralho - ver
  // createInitialDeck em cardUtils.ts), não uma carta numérica/de magia
  // normal.
  const fusedCard: Card = result.isMonster
    ? {
        id: `fused-${cardId1}-${cardId2}`,
        value: 'JOKER',
        suit: '🃏',
        isMonster: true,
        monsterUsed: false,
        revealed: true,
        fused: true,
        fusionSources,
        synthetic: { onDiscard: 'decompose', sourceCards: fusionSources },
      }
    : {
        id: `fused-${cardId1}-${cardId2}`,
        value: result.value,
        suit: card1!.suit,
        revealed: true,
        fused: true,
        fusionSources,
        synthetic: { onDiscard: 'decompose', sourceCards: fusionSources },
      };

  const consumedIds = new Set([cardId1, cardId2]);
  const newHand = [...playerState.hand.filter((c) => !consumedIds.has(c.id)), fusedCard];

  const resultLabel = result.isMonster
    ? 'Carta Monstro'
    : result.isMagic || result.value === 'A'
    ? fusedCard.value
    : `${fusedCard.value}${fusedCard.suit}`;
  const log = appendLog(
    state,
    state.log,
    'fusion',
    `Jogador ${player} fundiu ${card1!.value}${card1!.suit} + ${card2!.value}${card2!.suit} (${result.sum}) em ${resultLabel}`,
    { player }
  );

  return {
    ...state,
    log,
    [playerKey]: {
      ...playerState,
      hand: newHand,
      fusesThisTurn: playerState.fusesThisTurn + 1,
    },
  };
}
