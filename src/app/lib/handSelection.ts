/**
 * handSelection.ts - Decide o que um toque numa carta da mão deve fazer na
 * fase de Estratégia.
 *
 * FIX (overhaul completo do Modo Towers, pedido do usuário: "a atual [forma
 * de formar torre] é completamente anti-intuitiva... procure uma solução
 * que seja também capaz de ser realizada para o mobile") - a versão
 * anterior tentava ADIVINHAR, num único toque na carta, se a intenção era
 * posicionar normalmente ou juntar numa torre (com base em "existe outra
 * carta igual na mão?" ou "já existe uma torre formada neste turno?") - uma
 * regra completamente invisível pro jogador, que quebrava justamente o caso
 * mais comum (querer jogar uma carta normal que por acaso tem uma duplicata
 * na mão - aí o toque simplesmente não fazia o que se esperava, e só
 * arrastar funcionava). Agora as duas ações têm controles FÍSICOS separados
 * na interface (ver PlayerZone.tsx):
 *   - Tocar o CORPO da carta sempre faz seleção normal de carta única
 *     (`decideHandCardSelection` abaixo) - o mesmo comportamento simples e
 *     previsível de sempre, sem nenhuma exceção pra Towers.
 *   - Tocar o selo "🗼" (só aparece em cartas elegíveis pra torre, com o
 *     Modo Towers ligado) alterna essa carta dentro/fora do grupo de torre
 *     (`toggleTowerCardSelection` abaixo) - uma ação explícita e sempre
 *     visível (o próprio selo acende quando marcado), nunca inferida.
 * As duas seleções continuam mutuamente exclusivas (nunca as duas ativas ao
 * mesmo tempo, mesmo invariante de sempre) - cada uma só muda através do
 * controle dedicado a ela, nunca como efeito colateral do outro.
 */
import type { Card } from './cardUtils';
import { towerEligibleValue } from './gameEngine';

export interface HandSelectionState {
  selectedCardId: string | null;
  selectedForTower: Set<string>;
}

/**
 * Toque no CORPO da carta - sempre seleção normal de carta única (nunca
 * agrupa em torre; ver comentário do arquivo). Reclicar na já selecionada
 * desmarca. Qualquer seleção de torre em andamento é limpa (as duas
 * seleções são mutuamente exclusivas).
 */
export function decideHandCardSelection(current: HandSelectionState, clickedCardId: string): HandSelectionState {
  return {
    selectedCardId: current.selectedCardId === clickedCardId ? null : clickedCardId,
    selectedForTower: new Set(),
  };
}

/**
 * Toque no selo "🗼" de uma carta elegível pra torre - alterna essa carta
 * dentro/fora do grupo (`selectedForTower`), sempre explícito (nunca
 * inferido a partir do conteúdo da mão).
 *
 * @param hand - mão atual do jogador que tocou.
 * @param current - seleção atual (`selectedCardId`/`selectedForTower`).
 * @param clickedCardId - id da carta cujo selo foi tocado.
 * @returns a NOVA seleção - `selectedCardId` sempre `null` (mutuamente
 *   exclusiva com a seleção de torre). Cartas de valor não elegível pra
 *   torre (magia, Monstro) devolvem `current` sem nenhuma mudança - o selo
 *   nunca aparece nelas de qualquer forma (ver PlayerZone.tsx), então isto é
 *   só uma proteção defensiva.
 */
export function toggleTowerCardSelection(hand: Card[], current: HandSelectionState, clickedCardId: string): HandSelectionState {
  const card = hand.find((c) => c.id === clickedCardId);
  if (!card) return current;
  const value = towerEligibleValue(card);
  if (value === null) return current;

  // Já marcada - o toque desmarca só ela, mantendo o resto do grupo intacto.
  if (current.selectedForTower.has(clickedCardId)) {
    const next = new Set(current.selectedForTower);
    next.delete(clickedCardId);
    return { selectedCardId: null, selectedForTower: next };
  }

  const currentGroup = current.selectedForTower;
  const currentValue = currentGroup.size > 0 ? towerEligibleValue(hand.find((c) => currentGroup.has(c.id))!) : null;

  // Grupo vazio, ou mesmo valor do que já está marcado - entra no grupo.
  // Valor diferente - reinicia o grupo só com esta carta (nunca mistura
  // valores diferentes; o motor rejeitaria a torre de qualquer forma, e
  // manter as duas seleções "presas" numa combinação impossível de
  // confirmar seria mais confuso que simplesmente recomeçar).
  if (currentGroup.size === 0 || currentValue === value) {
    return { selectedCardId: null, selectedForTower: new Set([...currentGroup, clickedCardId]) };
  }
  return { selectedCardId: null, selectedForTower: new Set([clickedCardId]) };
}
