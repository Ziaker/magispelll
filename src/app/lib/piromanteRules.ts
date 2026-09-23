/**
 * piromanteRules.ts - consultas e limites puros específicos do Piromante.
 *
 * Mantém parâmetros da Bola de Fogo compartilhados entre motor, UI e IA.
 */
import type { GameConfig } from './gameConfig';
/** Piromante - teto da Bola de Fogo (30 no Modo Towers, 20 normalmente - pedido do usuário). */
export function getFireballCap(gameConfig: GameConfig): number {
  return gameConfig.towersMode ? 30 : 20;
}
