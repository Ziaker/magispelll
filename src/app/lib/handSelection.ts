/**
 * handSelection.ts - Decide o que um clique numa carta da mão deve fazer na
 * fase de Estratégia (Modo Towers).
 *
 * FIX (pedido do usuário: "era pra ser possível selecionar duas cartas
 * apenas clicando nelas, caso tenha mais do que uma carta igual a ela na
 * mão") - extraído de GameBoard.tsx pra virar uma função PURA e testável
 * isoladamente (ver scripts/sanity-test.ts) - essa lógica de "juntar ou
 * substituir a seleção" tem vários casos de borda sutis (reclicar pra
 * desmarcar, trocar de valor no meio, reforçar uma torre já formada com só 1
 * carta) fáceis de quebrar silenciosamente numa refatoração futura sem um
 * teste dedicado.
 *
 * Substitui o antigo Ctrl/Shift+clique (nunca óbvio pro jogador) por uma
 * inferência automática: um clique simples numa carta com outra igual na
 * mão (ou que reforça uma torre já formada neste turno) entra na seleção de
 * torre; senão, segue a seleção normal de carta única de sempre.
 */
import type { Card } from './cardUtils';
import { towerEligibleValue, isTowerSlot, type FieldSlot } from './gameEngine';
import { getEffectiveCardValue } from './cardUtils';

export interface HandSelectionState {
  selectedCardId: string | null;
  selectedForTower: Set<string>;
}

/**
 * @param hand - mão atual do jogador que clicou.
 * @param field - campo atual do MESMO jogador (pra checar reforço de torre).
 * @param towerSlotThisTurn - `PlayerState.towerSlotThisTurn` do mesmo jogador.
 * @param current - seleção atual (`selectedCardId`/`selectedForTower`).
 * @param clickedCardId - id da carta clicada agora.
 * @returns a NOVA seleção resultante - sempre com exatamente um dos dois
 *   campos "ativo" (o outro fica null/vazio), nunca os dois ao mesmo tempo.
 */
export function decideHandCardSelection(
  hand: Card[],
  field: [FieldSlot, FieldSlot, FieldSlot],
  towerSlotThisTurn: number | undefined,
  current: HandSelectionState,
  clickedCardId: string
): HandSelectionState {
  const card = hand.find((c) => c.id === clickedCardId);
  if (!card) return current;

  const value = towerEligibleValue(card);

  // Cartas não elegíveis pra torre (magia, Monstro) sempre seguem a seleção
  // normal de carta única - nunca entram em `selectedForTower`.
  if (value === null) {
    return {
      selectedCardId: current.selectedCardId === clickedCardId ? null : clickedCardId,
      selectedForTower: new Set(),
    };
  }

  // Reclicar em QUALQUER carta já selecionada (de qualquer um dos dois
  // jeitos) sempre desmarca só ela.
  if (current.selectedForTower.has(clickedCardId) || current.selectedCardId === clickedCardId) {
    const nextTower = new Set(current.selectedForTower);
    nextTower.delete(clickedCardId);
    return {
      selectedCardId: current.selectedCardId === clickedCardId ? null : current.selectedCardId,
      selectedForTower: nextTower,
    };
  }

  const currentGroup =
    current.selectedForTower.size > 0
      ? current.selectedForTower
      : current.selectedCardId
      ? new Set([current.selectedCardId])
      : new Set<string>();
  const currentValue = currentGroup.size > 0 ? towerEligibleValue(hand.find((c) => currentGroup.has(c.id)) as Card) : null;

  const myTower = towerSlotThisTurn !== undefined ? field[towerSlotThisTurn] : null;
  const canReinforceMyTower = Boolean(myTower && isTowerSlot(myTower) && getEffectiveCardValue(myTower.faceDownCard!) === value);
  const hasDuplicateInHand = hand.some((c) => c.id !== clickedCardId && towerEligibleValue(c) === value);

  const shouldJoinTowerGroup = currentValue === value || (currentGroup.size === 0 && (hasDuplicateInHand || canReinforceMyTower));

  if (shouldJoinTowerGroup) {
    return { selectedCardId: null, selectedForTower: new Set([...currentGroup, clickedCardId]) };
  }
  return { selectedCardId: clickedCardId, selectedForTower: new Set() };
}
