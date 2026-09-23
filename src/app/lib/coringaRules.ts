/**
 * coringaRules.ts - consultas e guards puros específicos do Coringa.
 *
 * Mantém a identidade das armadilhas compartilhada entre motor e apresentação.
 */
import type { Card } from './cardUtils';
import type { PlayerNumber } from './gameTypes';
import type { GameState } from './gameStateTypes';
import { characterOf } from './gameSelectors';
// ---------------------------------------------------------------------------
// Coringa (redesenho completo, pedido do usuário) - "cartas armadilha"
//
// Diferente de todos os outros personagens, o Valete/Rainha/Rei do Coringa
// nunca são "ativados" - são POSICIONADOS no campo (Valete só como
// horizontal, Rainha/Rei só como principal - ver handlePlayCard/
// handleSwapFieldCard) e reagem sozinhos quando revelados:
//   - Estratégia (por um efeito do OPONENTE): cada carta tem sua própria
//     reação - ver applyCoringaTrapReaction/resolveCoringaFieldTraps.
//   - Combate (a carta é selecionada e revelada normalmente): ver
//     handleResolveCombat (Rainha copia valor / Rei força empate e devolve
//     a carta do oponente).
// A carta Monstro dele também entra aqui, tratada como um "15" fixo -
// nunca usa a Zona Monstro (ver handlePlaceMonsterCard).
//
// A Magia Numeral "Mão de Ferro" (7,7,7) permite transformar uma dessas
// cartas (ainda na mão) numa carta de número 11/12/13 de verdade,
// PERMANENTEMENTE (`coringaTransformedToNumeral: true`) - a partir daí ela
// larga esse comportamento de armadilha por completo, mesmo já em campo.
// ---------------------------------------------------------------------------

/** Verdadeiro se `card` ainda é uma "armadilha" crua do Coringa (J/Q/K ou Monstro, nunca transformada em numeral pela Magia Numeral). */
export function isCoringaRawTrapCard(state: GameState, owner: PlayerNumber, card: Card): boolean {
  if (characterOf(state, owner) !== 'coringa') return false;
  if (card.coringaTransformedToNumeral) return false;
  return card.value === 'J' || card.value === 'Q' || card.value === 'K' || Boolean(card.isMonster);
}
