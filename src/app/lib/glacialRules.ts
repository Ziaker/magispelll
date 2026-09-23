/**
 * glacialRules.ts - consultas e guards puros específicos do Glacial.
 *
 * Não conhece reducer, UI ou IA; deriva regras apenas do estado/cartas recebidos.
 */
import type { Card } from './cardUtils';
import type { CharacterId } from './characterRegistry';
import { fieldCards } from './fieldQueries';
import type { GameState } from './gameStateTypes';
import { hasStatus } from './statusEffects';
/**
 * Glacial - valor atual do Criogolem (8 + 1 por carta congelada em jogo,
 * mão e campo dos DOIS jogadores) - usado tanto para travar o valor no
 * instante em que o Criogolem é posicionado (handlePlaceMonsterCard) quanto
 * pelo contador ao vivo da Zona Monstro (MonsterZone.tsx, pedido do
 * usuário: "um floco de neve com 8 + X").
 */
export function getGlacialGolemValue(state: GameState): number {
  const frozenCount =
    state.player1.hand.filter((c) => hasStatus(c, 'frozen')).length +
    state.player2.hand.filter((c) => hasStatus(c, 'frozen')).length +
    fieldCards(state.player1.field).filter((c) => hasStatus(c, 'frozen')).length +
    fieldCards(state.player2.field).filter((c) => hasStatus(c, 'frozen')).length;
  return 8 + frozenCount;
}

// ---------------------------------------------------------------------------
// Posicionar / recolher cartas do campo
// ---------------------------------------------------------------------------

// FIX (pedido do usuário, mudança de regra: "permita que o jogador oponente
// ao Glacial consiga jogar suas cartas congeladas, porém tendo a noção dos
// malefícios dela estar congelada") - o motor NÃO bloqueia mais posicionar
// (PLAY_CARD) uma carta congelada, não importa o dono - só a ATIVAÇÃO de
// MAGIA congelada continua proibida pra quem não é o Glacial (função irmã
// isFrozenMagicActivationBlocked, único guard de verdade agora). "Noção dos
// malefícios": o floco de gelo grande (PlayingCard.tsx, renderFrozenOverlay)
// e o tooltip da palavra-chave 'frozen' (CardKeywords.tsx) já aparecem em
// QUALQUER contexto de renderização da carta, incluindo na mão - jogar uma
// congelada deixa claro visualmente que seu valor está preso e não pode ser
// aumentado por buffs de outro jogador (ver applyTimedCombatModifier,
// statusEffects.ts).
//
// A função continua existindo (sempre `false` agora) porque a IA
// (aiPlayer.ts) ainda a usa como heurística de planejamento - "vale a pena
// tentar jogar/reativar esta carta agora" -, não como regra do motor.
export function isFrozenPlayBlocked(_character: CharacterId, _card: Card): boolean {
  return false;
}

// FIX (mesmo motivo de isFrozenPlayBlocked acima, achado ao vivo depois -
// softlock real: a IA repetia pra sempre um EXECUTE_MAGIC numa carta
// congelada de outro personagem que não podia mesmo ativar): regra irmã da
// de cima, mas pra ATIVAÇÃO de magia (handleExecuteMagic abaixo), não pra
// jogar a carta pro campo - por isso NÃO exige `source: 'glacial'` como a
// outra: a gimmick passiva do Glacial libera a ativação de uma magia
// PRÓPRIA congelada "por qualquer meio" (mesmo se foi ELE quem congelou a
// própria carta de propósito, pra reativar 2x - ver
// resolveGlacialCardConsumption), então aqui o único requisito é o
// personagem em si ser o Glacial.
export function isFrozenMagicActivationBlocked(character: CharacterId, card: Card): boolean {
  return hasStatus(card, 'frozen') && character !== 'glacial';
}
