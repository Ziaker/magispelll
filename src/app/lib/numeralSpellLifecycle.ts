/**
 * numeralSpellLifecycle.ts - ciclo de vida dos efeitos de Magia Numeral.
 *
 * Decide de forma pura quais efeitos continuam ativos numa transição de
 * fase. Logging e apresentação continuam responsabilidade do motor/UI.
 */
import type { CharacterId } from './characterRegistry';
import type { Phase, PlayerNumber } from './gameTypes';

export type ActiveNumeralSpells = Partial<
  Record<PlayerNumber, { character: CharacterId; expiresAtTurn: number }>
>;

export interface NumeralSpellExpirationResult {
  activeNumeralSpells: ActiveNumeralSpells;
  expiredPlayers: PlayerNumber[];
}

/**
 * Efeitos numerais só expiram ao entrar em Compra. Um efeito com
 * `expiresAtTurn = T` permanece durante todo T e some quando `newTurn > T`.
 */
export function expireNumeralSpells(
  activeNumeralSpells: ActiveNumeralSpells,
  context: { newTurn: number; newPhase: Phase }
): NumeralSpellExpirationResult {
  if (context.newPhase !== 'draw') {
    return { activeNumeralSpells, expiredPlayers: [] };
  }

  const next = { ...activeNumeralSpells };
  const expiredPlayers: PlayerNumber[] = [];

  for (const player of [1, 2] as const) {
    const entry = next[player];
    if (entry && context.newTurn > entry.expiresAtTurn) {
      delete next[player];
      expiredPlayers.push(player);
    }
  }

  return {
    activeNumeralSpells: expiredPlayers.length > 0 ? next : activeNumeralSpells,
    expiredPlayers,
  };
}
