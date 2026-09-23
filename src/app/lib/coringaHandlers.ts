/**
 * coringaHandlers.ts - transições de estado específicas do Coringa.
 *
 * Começa pela transformação de Mão de Ferro; regras puras de armadilha
 * continuam em coringaRules.ts.
 */
import { appendLog } from './gameLog';
import { characterOf, playerKeyOf } from './gameSelectors';
import { hasStatus } from './statusEffects';
import type { GameState } from './gameStateTypes';
import type { PlayerNumber } from './gameTypes';
/**
 * Coringa (redesenho completo, pedido do usuário) - Magia Numeral "Mão de
 * Ferro" (7,7,7): enquanto `coringaTransformWindowUntilTurn` estiver ativo,
 * transforma PERMANENTEMENTE uma carta de magia (J/Q/K) ainda na MÃO em
 * carta de número 11 (Valete), 12 (Rainha) ou 13 (Rei) - reaproveita
 * `transformedValue` (mesmo campo do Transformar Ás), então TODO o resto do
 * motor (valor de combate, exibição) já entende a carta automaticamente,
 * sem nenhuma mudança extra. `coringaTransformedToNumeral: true` marca a
 * transformação como definitiva - a carta LARGA de vez seu comportamento de
 * armadilha (nunca mais dispara os efeitos de revelação na Estratégia/
 * Combate - ver isCoringaRawTrapCard) mesmo depois que a janela fechar.
 */
export function handleTransformCoringaMagicCard(state: GameState, player: PlayerNumber, cardId: string): GameState {
  if (characterOf(state, player) !== 'coringa') return state;
  const playerKey = playerKeyOf(player);
  const playerState = state[playerKey];
  if (!hasStatus(playerState, 'transformWindow')) return state;

  const card = playerState.hand.find((c) => c.id === cardId);
  if (!card || card.coringaTransformedToNumeral) return state;
  const targetValue = card.value === 'J' ? 11 : card.value === 'Q' ? 12 : card.value === 'K' ? 13 : null;
  if (targetValue === null) return state;

  const newHand = playerState.hand.map((c) =>
    c.id === cardId ? { ...c, transformedValue: targetValue, coringaTransformedToNumeral: true } : c
  );
  // FIX (mesma classe de bug do Glacial - auditoria encontrou o mesmo
  // vazamento aqui): a carta continua oculta na mão depois do disfarce, só
  // muda de J/Q/K pra numeral por baixo - o texto do log não pode entregar
  // nem a identidade original nem o número disfarçado enquanto ela não
  // estiver revelada.
  const log = appendLog(
    state,
    state.log,
    'magic',
    card.revealed
      ? `Jogador ${player} transformou ${card.value}${card.suit} em uma carta de número ${targetValue}`
      : `Jogador ${player} disfarçou uma carta oculta como uma carta de número`,
    { player, cardValue: card.value, cardSuit: card.suit }
  );

  return {
    ...state,
    log,
    [playerKey]: { ...playerState, hand: newHand },
  };
}
