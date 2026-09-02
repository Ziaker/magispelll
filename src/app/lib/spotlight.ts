/**
 * spotlight.ts - Modo Spotlight
 *
 * No início de CADA turno (as duas fases de Compra, ver advancePhaseState em
 * gameEngine.ts), `gameConfig.spotlightCount` (1-3) números de 2 a 10 são
 * sorteados, sem repetir entre si. Cada um recebe uma polaridade:
 * - Positiva: o valor da carta vale 3x mais em TUDO que usa esse valor
 *   (combate, Magia Numeral, Torres) - ver getSpotlightAdjustedValue.
 * - Negativa: o valor da carta é fixado em 1 (efetivamente inútil).
 *
 * Com as duas polaridades habilitadas (`spotlightPositive` e
 * `spotlightNegative`) ao mesmo tempo, cada número sorteado recebe sua
 * própria moeda ao ar - independente dos outros, pode dar qualquer mistura.
 *
 * Módulo isolado (mesmo padrão de numeralSpells.ts/fusion.ts/magicCards.ts) -
 * nenhum outro sistema do jogo precisa saber que Spotlight existe além de
 * chamar getSpotlightAdjustedValue no lugar de getEffectiveCardValue onde o
 * valor da carta importa de verdade para a regra sendo resolvida.
 */
import { random } from './rng';

import { getEffectiveCardValue, type Card } from './cardUtils';
import type { GameConfig } from './gameConfig';

export type SpotlightPolarity = 'positive' | 'negative';

export interface SpotlightNumber {
  value: number;
  polarity: SpotlightPolarity;
}

export interface SpotlightState {
  numbers: SpotlightNumber[];
}

const MIN_VALUE = 2;
const MAX_VALUE = 10;

/**
 * Sorteia o Spotlight de um novo turno a partir da configuração da partida -
 * `null` quando o modo está desligado (nenhum efeito, `getSpotlightAdjustedValue`
 * já trata `null` como "sem Spotlight ativo"). Nunca sorteia o mesmo número
 * duas vezes no mesmo turno (`spotlightCount` é sempre <= 9, o total de
 * valores possíveis, então sempre há números suficientes para não repetir).
 */
export function rollSpotlight(config: GameConfig): SpotlightState | null {
  if (!config.spotlightMode) return null;
  if (!config.spotlightPositive && !config.spotlightNegative) return null;

  const pool: number[] = [];
  for (let v = MIN_VALUE; v <= MAX_VALUE; v++) pool.push(v);

  const count = Math.min(Math.max(1, config.spotlightCount), pool.length);
  const numbers: SpotlightNumber[] = [];
  for (let i = 0; i < count; i++) {
    const pickIndex = Math.floor(random() * pool.length);
    const [value] = pool.splice(pickIndex, 1);
    numbers.push({ value, polarity: rollPolarity(config) });
  }

  return { numbers };
}

function rollPolarity(config: GameConfig): SpotlightPolarity {
  if (config.spotlightPositive && !config.spotlightNegative) return 'positive';
  if (!config.spotlightPositive && config.spotlightNegative) return 'negative';
  // Ambas ligadas - moeda ao ar independente por número (ver cabeçalho do arquivo).
  return random() < 0.5 ? 'positive' : 'negative';
}

/** A entrada de Spotlight ativa para o valor efetivo de `card` agora, ou `null` se nenhuma bate. */
export function getSpotlightEntry(card: Card, spotlight: SpotlightState | null | undefined): SpotlightNumber | null {
  if (!spotlight) return null;
  const base = getEffectiveCardValue(card);
  return spotlight.numbers.find((n) => n.value === base) ?? null;
}

/**
 * O valor de `card` já considerando o Spotlight ativo - fonte única usada em
 * TUDO que precisa do valor "de verdade" da carta nesta partida (combate,
 * Magia Numeral, Torres): positivo multiplica por 3, negativo fixa em 1, sem
 * Spotlight aplicável devolve o valor efetivo normal (getEffectiveCardValue).
 */
export function getSpotlightAdjustedValue(card: Card, spotlight: SpotlightState | null | undefined): number {
  const base = getEffectiveCardValue(card);
  const entry = getSpotlightEntry(card, spotlight);
  if (!entry) return base;
  return entry.polarity === 'positive' ? base * 3 : 1;
}
