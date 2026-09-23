/**
 * aceHandlers.ts - transições de estado da transformação do Ás.
 *
 * A elegibilidade do alvo continua centralizada em cardUtils;
 * este módulo apenas aplica a transformação aceita ao estado.
 */
import { getDisplayValue, getEffectiveCardValue, isValidAceTransformTarget } from './cardUtils';
import { appendLog } from './gameLog';
import { playerKeyOf } from './gameSelectors';
import type { FieldSlot, GameState } from './gameStateTypes';
import type { PlayerNumber } from './gameTypes';
export function handleTransformAce(state: GameState, player: PlayerNumber, aceCardId: string, targetCardId: string): GameState {
  if (state.phase !== 'strategy') return state;
  if (aceCardId === targetCardId) return state;
  const playerKey = playerKeyOf(player);
  const playerState = state[playerKey];
  const ace = playerState.hand.find((c) => c.id === aceCardId);
  // FIX (pedido do usuário: "remova a possibilidade de re-transformar Ás...
  // depois que transforma uma vez, não é pra poder re-transformar em outra
  // carta") - reverte um pedido ANTERIOR que removia esta trava de propósito
  // (permitindo re-transformar quantas vezes o jogador quisesse). Agora, de
  // novo, um Ás que já tem `transformedValue` definido nunca pode ser
  // transformado de novo - a transformação é definitiva assim que
  // acontece, pelo resto da partida (a UI também já bloqueia isso - ver
  // PlayingCard.tsx/HandCardView.tsx -, mas nunca confiar só nela).
  if (!ace || ace.value !== 'A' || ace.transformedValue !== undefined) return state;

  // FIX (item 19): o alvo da transformação agora pode ser tanto uma carta na
  // mão quanto uma carta já posicionada (faceDownCard) no próprio campo -
  // antes só cartas na mão eram aceitas, mesmo que o Ás já estivesse em
  // campo (o que tornava a transformação de um Ás já posicionado impossível
  // na prática, já que a mão pode não ter mais nenhuma carta apropriada).
  const targetInHand = playerState.hand.find((c) => c.id === targetCardId);
  const targetSlotIndex = playerState.field.findIndex((s) => s.faceDownCard?.id === targetCardId);
  const targetCard = targetInHand ?? (targetSlotIndex !== -1 ? playerState.field[targetSlotIndex].faceDownCard : undefined);
  if (!targetCard) return state;
  // FIX (mesmo pedido acima): um Ás JÁ transformado agora é um alvo/referência
  // válido (na prática já "é" um número normal - só falta copiar o valor
  // dele) - só um Ás CRU continua inválido como alvo (não tem valor nenhum
  // definido pra copiar). Antes `targetCard.value === 'A'` rejeitava os dois
  // casos por igual, o que também travava a IA: com 2+ Áses na mão e nenhuma
  // carta numeral "de verdade", depois de transformar o 1º Ás ela não tinha
  // mais nenhum alvo válido pra transformar o 2º (que ficava cru, lutando
  // sempre como 14).
  // FIX (checagem extensa por bugs - consolidação de regra duplicada):
  // extraído para `isValidAceTransformTarget` (cardUtils.ts) - a MESMA função
  // que aiPlayer.ts agora usa pra filtrar candidatos, em vez de cada lado ter
  // sua própria cópia da regra (ver o comentário completo lá).
  if (!isValidAceTransformTarget(targetCard)) return state;

  const targetValue = getEffectiveCardValue(targetCard);
  const newHand = playerState.hand.map((c) => {
    if (c.id === aceCardId) return { ...c, transformedValue: targetValue, revealed: true };
    if (c.id === targetCardId) return { ...c, revealed: true };
    return c;
  });

  let newField = playerState.field;
  if (targetSlotIndex !== -1 && !targetInHand) {
    newField = playerState.field.map((s, i) =>
      i === targetSlotIndex && s.faceDownCard ? { ...s, faceDownCard: { ...s.faceDownCard, revealed: true }, revealed: true } : s
    ) as [FieldSlot, FieldSlot, FieldSlot];
  }

  // FIX (mesmo pedido acima): `getDisplayValue` em vez de `targetCard.value`
  // cru - se o alvo for, ele mesmo, um Ás já transformado (ex.: em "9"), o
  // log mostra "9♦" (o que a carta realmente representa agora), não "A♦"
  // (o que confundiria, já que ela não luta mais como um Ás cru).
  const log = appendLog(state, state.log, 'ace', `Jogador ${player} transformou Ás em ${targetValue} (${getDisplayValue(targetCard)}${targetCard.suit})`, { player, cardValue: 'A' });

  return { ...state, log, [playerKey]: { ...playerState, hand: newHand, field: newField } };
}
