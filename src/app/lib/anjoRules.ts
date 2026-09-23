/**
 * anjoRules.ts - consultas e guards puros específicos do Anjo.
 *
 * Mantém a Proteção Divina fora do reducer e compartilhada por motor, UI e IA.
 */
import type { PlayerNumber } from './gameTypes';
import type { GameState } from './gameStateTypes';
import { characterOf, playerKeyOf } from './gameSelectors';
/**
 * Um slot está protegido (Proteção Divina do Anjo) quando seu dono é o Anjo E
 * este slot específico está em `monsterProtectedSlots` (ver PlayerState).
 * Slots protegidos não podem ser alvo de magias (J/Q/K) do oponente.
 *
 * FIX (pedido do usuário: "o monstro do anjo agora só protege 1 slot
 * selecionado do campo ao invés dos 3, mas pode ser ativado múltiplas vezes
 * no mesmo turno ao invés de 1 vez só") - volta a proteger só o(s) slot(s)
 * ESCOLHIDO(S) ao ativar em vez do campo inteiro de uma vez (reversão de um
 * FIX anterior que tinha feito o oposto) - agora com a ativação liberada pra
 * repetir no mesmo turno, cada uma pode escolher um slot diferente (ver
 * handleActivateMonsterEffectSimple).
 *
 * FIX (itens 4 e 7 da 3ª rodada, histórico): antes checava
 * `slot.faceDownCard.isMonster` - válido só na arquitetura antiga, onde o
 * Monstro ocupava fisicamente um dos 3 slots de combate.
 */
export function isSlotProtected(state: GameState, ownerPlayer: PlayerNumber, slotIndex: number): boolean {
  if (characterOf(state, ownerPlayer) !== 'anjo') return false;
  const playerState = state[playerKeyOf(ownerPlayer)];
  return playerState.monsterProtectedSlots.includes(slotIndex);
}
