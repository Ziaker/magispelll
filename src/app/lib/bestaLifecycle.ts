/**
 * bestaLifecycle.ts - efeitos contínuos de ciclo de vida da Besta.
 *
 * Mantém pós-processamentos globais do personagem fora do reducer principal.
 */
import { getEffectiveCardValue, isPlainNumeralCard } from './cardUtils';
import { pushToDiscard } from './deckLifecycle';
import { appendLog } from './gameLog';
import { playerKeyOf } from './gameSelectors';
import type { GameState } from './gameStateTypes';
import type { PlayerNumber } from './gameTypes';
import { hasStatus } from './statusEffects';
// ============================================================================
// Reducer principal
// ============================================================================

/**
 * Besta - Fúria Sanguinária (pedido do usuário: o efeito "força pelo resto do
 * turno o descarte de toda carta maior que 6", não só no instante da
 * ativação). Roda depois de TODA ação (ver gameReducer logo abaixo) em vez de
 * ser espalhado por cada ponto que dá cartas a um jogador (compra da fase de
 * Compra, Benção Divina, Recuperação Selvagem, devolução de campo pra mão,
 * Magia Numeral do oponente...) - um único ponto de estrangulamento é a
 * mesma estratégia já usada pelo guard de `numeralSpellPending` no topo do
 * reducer, e não tem como uma fonte nova de cartas "esquecer" de respeitar a
 * regra.
 *
 * "Carta maior que 6" = carta numeral pura de valor efetivo > 6 (7, 8, 9,
 * 10). Ás e magias (J/Q/K) ficam de fora de propósito: o mesmo critério
 * (`isPlainNumeralCard`) que a Combustão do Piromante usa pro seu "menor que
 * 5", pra não transformar o efeito num "descarte toda a mão".
 */
export function applyBestaBloodRageSweep(state: GameState): GameState {
  let next = state;
  for (const player of [1, 2] as PlayerNumber[]) {
    const key = playerKeyOf(player);
    const playerState = next[key];
    if (!hasStatus(playerState, 'bloodRage')) continue;
    const burned = playerState.hand.filter((c) => isPlainNumeralCard(c) && getEffectiveCardValue(c) > 6);
    if (burned.length === 0) continue;
    const kept = playerState.hand.filter((c) => !burned.includes(c));
    const { deck, discardPile, reshuffled } = pushToDiscard(next, burned);
    let log = next.log;
    if (reshuffled) log = appendLog(next, log, 'system', `O baralho esgotou - a pilha de descarte foi reembaralhada de volta`, { trigger: 'deck-reshuffled' });
    log = appendLog(
      next,
      log,
      'numeral-spell',
      `Fúria Sanguinária: Jogador ${player} não pode segurar cartas acima de 6 - ${burned.length} carta(s) queimada(s) na mão`,
      { player, burnedCardIds: burned.map((c) => c.id) }
    );
    next = {
      ...next,
      deck,
      discardPile,
      [key]: { ...playerState, hand: kept },
      log,
    };
  }
  return next;
}
