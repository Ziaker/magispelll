/**
 * towerRules.ts - regras puras do Modo Towers.
 *
 * Não resolve combate nem muta estado; apenas deriva metadados do campo atual.
 */
import { getEffectiveCardValue, type Card } from './cardUtils';
import { isTowerSlot, isBrotoSlot } from './fieldLifecycle';
import { playerKeyOf } from './gameSelectors';
import { hasStatus } from './statusEffects';
import type { PlayerNumber } from './gameTypes';
import type { FieldSlot, GameState } from './gameStateTypes';
/**
 * Modo Towers - "torre solitária" (pedido do usuário, ver comentário
 * completo de `combatLoneTower` em GameState): identifica se EXATAMENTE UM
 * dos dois jogadores tem uma torre, E ela é o ÚNICO conteúdo do campo dele
 * (os outros 2 slots totalmente vazios - sem carta principal nem
 * horizontal), E o oponente não tem NENHUMA torre em nenhum slot. Chamado
 * uma única vez, na entrada da fase de Combate (ver advancePhaseState) -
 * nunca recalculado depois, porque a própria torre encolhe a cada disputa.
 */
export function computeLoneTowerForCombat(state: GameState): { towerOwner: PlayerNumber; slotIndex: number } | null {
  const findLoneTower = (field: [FieldSlot, FieldSlot, FieldSlot]): number | null => {
    const towerIndex = field.findIndex((slot) => isTowerSlot(slot));
    if (towerIndex === -1) return null;
    const othersEmpty = field.every((slot, i) => i === towerIndex || (!slot.faceDownCard && slot.horizontalCards.length === 0));
    return othersEmpty ? towerIndex : null;
  };
  const p1HasAnyTower = state.player1.field.some((slot) => isTowerSlot(slot));
  const p2HasAnyTower = state.player2.field.some((slot) => isTowerSlot(slot));
  if (p1HasAnyTower && !p2HasAnyTower) {
    const slotIndex = findLoneTower(state.player1.field);
    return slotIndex !== null ? { towerOwner: 1, slotIndex } : null;
  }
  if (p2HasAnyTower && !p1HasAnyTower) {
    const slotIndex = findLoneTower(state.player2.field);
    return slotIndex !== null ? { towerOwner: 2, slotIndex } : null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Modo Towers
// ---------------------------------------------------------------------------

/**
 * Valor efetivo "elegível pra torre" de uma carta: numeral pura (2-10) ou
 * Ás JÁ transformado - NUNCA magia (J/Q/K), Monstro, ou - FIX (pedido do
 * usuário: "o Ás está podendo ser posicionado como carta no campo/
 * horizontal, corrija isso, não permita, em TODOS modos de jogo") - um Ás
 * CRU (mesma exclusão de isFieldEligible, cardUtils.ts - Torres também é só
 * mais um jeito de ocupar um slot de combate normal do campo, sujeito à
 * mesma regra). Reaproveita `getEffectiveCardValue` (já resolve Ás
 * transformado) - `null` quando a carta não é elegível de jeito nenhum.
 */
export function towerEligibleValue(card: Card): number | null {
  if (card.value === 'J' || card.value === 'Q' || card.value === 'K' || card.isMonster) return null;
  if (card.value === 'A' && card.transformedValue === undefined) return null;
  return getEffectiveCardValue(card);
}

/**
 * Verifica se `player` pode formar/reforçar uma torre em `slotIndex` com as
 * cartas `cardIds` da própria mão - espelha exatamente a mesma checagem de
 * handleFormOrReinforceTower (nunca confiar só na UI), usada também por
 * FieldSlotView.tsx/GameBoard.tsx pra mostrar o botão "Towers" só quando faz
 * sentido, e por aiPlayer.ts pra decidir a mesma coisa pela IA.
 *
 * Regras (pedido do usuário, "recapitulando o Towers"; FIX posterior: "volto
 * atrás [na regra de 1 por turno], permita que os jogadores coloquem até 3
 * torres no campo"):
 * - Só na fase de Estratégia, com o Modo Towers ligado nesta partida.
 * - Todas as cartas selecionadas precisam existir na mão do jogador, ser
 *   elegíveis (numeral 2-10 ou Ás) e ter o MESMO valor efetivo entre si.
 * - CRIAR uma torre nova (o slot ainda NÃO é uma torre agora, `isTowerSlot`
 *   falso): precisa de 2+ cartas selecionadas, e o slot precisa estar vazio
 *   OU já ter uma carta comum (não torre) de valor igual (ela é absorvida) -
 *   sem nenhuma carta horizontal já ali. Qualquer slot ainda livre serve -
 *   sem limite de 1 por turno, até os 3 slots do campo podem virar torre.
 * - REFORÇAR uma torre já existente (o slot JÁ é uma torre, `isTowerSlot`
 *   verdadeiro - checado direto no campo, nunca cacheado num contador "por
 *   turno": uma torre que sobreviveu de um turno anterior sem nunca ter
 *   sido tocada de novo continua reforçável normalmente, mesmo padrão de
 *   qualquer torre formada neste turno): basta 1+ carta selecionada, valor
 *   igual ao topo atual da torre.
 */
export function canFormOrReinforceTower(state: GameState, player: PlayerNumber, slotIndex: number, cardIds: string[]): boolean {
  if (state.phase !== 'strategy' || !state.gameConfig.towersMode) return false;
  if (cardIds.length === 0) return false;

  const playerState = state[playerKeyOf(player)];
  const slot = playerState.field[slotIndex];
  const selected = cardIds.map((id) => playerState.hand.find((c) => c.id === id)).filter((c): c is Card => Boolean(c));
  if (selected.length !== cardIds.length) return false; // algum id não existe na mão - nunca confiar só na UI
  // FIX (bug real achado por auditoria - mesma classe de "carta congelada
  // entra em campo por um caminho que não é handlePlayCard", que já tem a
  // guarda): formar/reforçar uma Torre é uma ação DIFERENTE de PLAY_CARD
  // (FORM_OR_REINFORCE_TOWER), com sua própria validação aqui - sem esta
  // checagem, uma carta congelada na mão (que handlePlayCard já bloqueia
  // corretamente) podia ser empilhada numa Torre de qualquer jeito.
  if (selected.some((c) => hasStatus(c, 'frozen'))) return false;

  const values = selected.map(towerEligibleValue);
  if (values.some((v) => v === null)) return false;
  const targetValue = values[0];
  if (!values.every((v) => v === targetValue)) return false;

  // FIX (checagem extensa por bugs - achado investigando o pedido "reforçar
  // por drag uma torre que sobrou de um turno anterior"): "já é minha
  // torre" costumava exigir o slot numa lista `towerSlotsThisTurn` zerada a
  // cada virada de turno - uma torre sobrevivente que ainda não tinha sido
  // TOCADA de novo neste turno (nunca reforçada, só sobrevivendo ao
  // combate) ficava fora dessa lista, e `isTowerSlot(slot)` sozinho não
  // bastava pra reconhecer "reforçável" no branch de baixo (que
  // explicitamente exige `!isTowerSlot` pra "absorver carta avulsa") - um
  // beco sem saída. `isTowerSlot(slot)` (lido direto do campo, nunca de um
  // contador à parte) já é a única checagem que faz sentido aqui: é uma
  // torre agora, ou não é.
  if (isTowerSlot(slot)) {
    return getEffectiveCardValue(slot.faceDownCard!) === targetValue;
  }

  // Não é uma torre agora - CRIAR uma torre nova aqui (pedido do usuário:
  // "permita que os jogadores coloquem até 3 torres no campo") - qualquer
  // slot ainda livre (ou com carta avulsa absorvível) pode virar torre, sem
  // limite de 1 por turno (o campo só tem 3 slots de qualquer forma).
  if (cardIds.length < 2) return false;
  if (slot.horizontalCards.length > 0) return false;
  if (!slot.faceDownCard) return true; // slot vazio
  // Slot com carta comum (não torre) de valor igual - absorvível.
  // FIX (Druida, personagem novo, achado numa auditoria depois do usuário
  // relatar "a IA do druída mal joga direito"): sem excluir `isBrotoSlot`
  // aqui, um Broto cujo valor atual (transformedValue) coincidisse com o
  // valor das cartas numerais sendo jogadas seria "absorvido" numa torre -
  // `handleFormOrReinforceTower` preserva `brotoReserve` no spread do slot
  // (só sobrescreve `faceDownCard`/`towerReserve`), deixando as cartas
  // empilhadas do Broto (se houver) permanentemente presas ali, invisíveis
  // pro jogo (nunca descartáveis, nunca jogáveis de novo) - e o slot
  // resultante seria as DUAS coisas ao mesmo tempo (`isTowerSlot` E
  // `isBrotoSlot`), uma combinação que nenhum código deste projeto (erosão
  // de combate, crescimento por turno, sweep de sobrevivência) espera ver.
  return !isTowerSlot(slot) && !isBrotoSlot(slot) && getEffectiveCardValue(slot.faceDownCard) === targetValue;
}
