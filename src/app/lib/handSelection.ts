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
 *   - Tocar o selo "🏰" (só aparece em cartas elegíveis pra torre, com o
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
 * Toque no selo "🏰" de uma carta elegível pra torre - alterna essa carta
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

/**
 * FIX (pedido do usuário, "opção 5": "através de drag & drop, da mesma forma
 * que faz uma fusão, arrastar uma carta encima de outra do mesmo número") -
 * terceira forma de entrar no grupo de torre, além de clicar o selo 🏰: soltar
 * uma carta da mão em cima de OUTRA carta da mão de mesmo valor efetivo. As
 * duas entram no grupo de uma vez (a arrastada E a que recebeu o drop) -
 * "como as cartas estarão agrupadas, é só arrastar este grupo encima da
 * outra carta" (confirmado com o usuário: o agrupamento fica só NA MÃO,
 * nunca posiciona nada no campo sozinho - jogar o grupo continua exigindo um
 * passo separado, por clique ou arrasto até um slot).
 *
 * Reaproveita a MESMA regra de `toggleTowerCardSelection` pra decidir se
 * junta ao grupo existente ou reinicia (chamando-a duas vezes em sequência -
 * uma pra cada carta do par - nunca uma cópia da regra de "mesmo valor").
 * Só a checagem de compatibilidade dos DOIS valores entre si (a `canDrop`
 * do lado do HandCardView.tsx já garante isso antes de chamar aqui, mas
 * nunca confiar só na UI) é refeita: se os valores não baterem, o drop não
 * faz nada (`current` inalterado) - a UI nunca deveria ter aceitado esse
 * drop em primeiro lugar.
 */
export function groupCardsForTowerViaDrag(hand: Card[], current: HandSelectionState, droppedCardId: string, targetCardId: string): HandSelectionState {
  if (droppedCardId === targetCardId) return current;
  const droppedCard = hand.find((c) => c.id === droppedCardId);
  const targetCard = hand.find((c) => c.id === targetCardId);
  if (!droppedCard || !targetCard) return current;
  const droppedValue = towerEligibleValue(droppedCard);
  const targetValue = towerEligibleValue(targetCard);
  if (droppedValue === null || targetValue === null || droppedValue !== targetValue) return current;

  const afterTarget = current.selectedForTower.has(targetCardId) ? current : toggleTowerCardSelection(hand, current, targetCardId);
  return afterTarget.selectedForTower.has(droppedCardId) ? afterTarget : toggleTowerCardSelection(hand, afterTarget, droppedCardId);
}

/**
 * FIX (pedido do usuário, achado jogando: "as cartas agrupadas devem estar
 * de fato agrupadas, visualmente, uma junta da outra no modo towers") -
 * antes, marcar 2+ cartas pro grupo de torre só mudava a cor do anel de
 * cada uma (`isSelectedForTower`, HandCardView.tsx) - elas continuavam
 * espalhadas pela mão, em qualquer ordem que já estivessem, sem nenhuma
 * pista visual de QUANTAS fazem parte do mesmo grupo ou QUAIS são. Esta
 * função só reordena a exibição (nunca `hand`/`customOrderIds` de verdade
 * por baixo - reverte sozinha assim que o grupo é desfeito/jogado) - todas
 * as cartas do grupo colapsam pra ficarem lado a lado, ancoradas na posição
 * de onde a PRIMEIRA delas já estava (evita o resto da mão "pular" mais do
 * que o necessário). Com `layout` do Framer Motion já ligado em cada carta
 * (HandCardView.tsx), a mudança de ordem anima sozinha - sem precisar de
 * nenhuma animação extra aqui.
 */
export function groupTowerCardsForDisplay(hand: Card[], selectedForTower: Set<string>): Card[] {
  if (selectedForTower.size < 2) return hand;
  const grouped: Card[] = [];
  const rest: Card[] = [];
  let anchorIndex = -1;
  for (const card of hand) {
    if (selectedForTower.has(card.id)) {
      if (anchorIndex === -1) anchorIndex = rest.length;
      grouped.push(card);
    } else {
      rest.push(card);
    }
  }
  if (grouped.length < 2) return hand;
  return [...rest.slice(0, anchorIndex), ...grouped, ...rest.slice(anchorIndex)];
}
