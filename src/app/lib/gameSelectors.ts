/**
 * gameSelectors.ts - seletores básicos e puros de identidade de jogador.
 *
 * São helpers de domínio usados por motor, UI, IA e ferramentas. Mantê-los
 * fora do reducer evita usar gameEngine.ts como ponto obrigatório para
 * operações que não dependem da implementação dos handlers.
 */
import type { GameState } from './gameStateTypes';
import type { PlayerKey, PlayerNumber } from './gameTypes';
import type { CharacterId } from './characterRegistry';

export function playerKeyOf(player: PlayerNumber): PlayerKey {
  return player === 1 ? 'player1' : 'player2';
}

export function opponentKeyOf(player: PlayerNumber): PlayerKey {
  return player === 1 ? 'player2' : 'player1';
}

export function opponentOf(player: PlayerNumber): PlayerNumber {
  return player === 1 ? 2 : 1;
}

export function characterOf(state: GameState, player: PlayerNumber): CharacterId {
  return player === 1 ? state.player1Character : state.player2Character;
}
