/**
 * gameTypes.ts - tipos fundamentais do fluxo de uma partida.
 *
 * Mantidos fora de gameEngine.ts para que módulos que só precisam nomear
 * fase/jogador não dependam conceitualmente do reducer inteiro. O motor
 * continua reexportando estes tipos por compatibilidade histórica.
 */
export type Phase = 'draw' | 'strategy' | 'combat';
export type PlayerNumber = 1 | 2;
export type PlayerKey = 'player1' | 'player2';
