/**
 * gameLimits.ts - limites efetivos derivados da configuração da partida.
 *
 * Centraliza ajustes de variante usados igualmente por motor, UI e IA.
 */
import type { GameConfig } from './gameConfig';
// ---------------------------------------------------------------------------
// Compra e descarte
// ---------------------------------------------------------------------------

/**
 * FIX (checagem extensa por bugs - divergência real encontrada): "compram 1
 * carta a mais" no Modo Towers precisa valer nos TRÊS lugares que calculam
 * quantas compras ainda restam no turno (o próprio motor aqui, a decisão de
 * compra da IA em aiPlayer.ts, e o rótulo/limite do botão "Comprar" em
 * PlayerZone.tsx) - antes só o motor somava o bônus; a IA e a UI humana
 * calculavam `drawLimit` sem o `+1` de Towers, então a IA nunca comprava a
 * carta extra a que tinha direito (perdendo valor de graça, sem nenhum erro
 * visível) e o botão/rótulo "Comprar" do jogador humano também ficava 1
 * carta aquém do que o motor de fato permitiria. Só tem efeito prático
 * quando o limite de compra por turno está ligado (sem ele, a compra já é
 * livre até a mão encher, então +1 aqui seria um no-op).
 */
export function getEffectiveDrawLimit(gameConfig: Pick<GameConfig, 'drawLimit' | 'towersMode'>): number {
  return gameConfig.drawLimit + (gameConfig.towersMode ? 1 : 0);
}

/**
 * FIX (checagem extensa por bugs - mesma divergência real do
 * getEffectiveDrawLimit acima, achada ao auditar este handler em seguida):
 * "podem descartar 1 carta a mais" no Modo Towers também precisava valer nos
 * TRÊS lugares (motor, decisão de descarte da IA em aiPlayer.ts, e o
 * botão/rótulo de descarte em PlayerZone.tsx) - só o motor somava o bônus, a
 * IA e a UI humana usavam `discardLimit` cru.
 */
export function getEffectiveDiscardLimit(gameConfig: Pick<GameConfig, 'discardLimit' | 'towersMode'>): number {
  return gameConfig.discardLimit + (gameConfig.towersMode ? 1 : 0);
}
