/**
 * coringaRules.ts - consultas e guards puros específicos do Coringa.
 *
 * Mantém a identidade das armadilhas compartilhada entre motor e apresentação.
 */
import type { Card } from './cardUtils';
import { getSpotlightAdjustedValue } from './spotlight';
import type { PlayerNumber } from './gameTypes';
import type { FieldSlot, GameState } from './gameStateTypes';
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

/**
 * Coringa (redesenho completo) - aplica o valor de combate especial de uma
 * carta-armadilha crua (nunca chamado pra cartas já transformadas em
 * numeral, nem pra cartas de outros personagens - ver isCoringaRawTrapCard):
 *   - Valete: fixo em 1 ("A carta horizontal vale 1 sob este efeito").
 *   - Monstro: fixo em 15 ("é tratado como uma carta de número 15").
 *   - Rainha: copia o valor de uma carta REVELADA do campo do oponente,
 *     escolhida pelo jogador no momento da revelação (`copyTargetId`) - sem
 *     alvo disponível ou escolhido, vale 1 (mesmo valor fixo do Valete,
 *     resposta do usuário confirmada).
 *   - Rei: nunca usa valor de combate de verdade (o resultado é forçado
 *     à parte - ver handleResolveCombat), devolvido sem alteração aqui.
 * Reaproveita `transformedValue` (mesmo campo do Transformar Ás) - todo o
 * resto do cálculo de combate já entende automaticamente, sem nenhuma
 * mudança extra.
 */
export function applyCoringaTrapCombatValue(
  state: GameState,
  owner: PlayerNumber,
  card: Card,
  opponentField: [FieldSlot, FieldSlot, FieldSlot],
  copyTargetId: string | undefined
): Card {
  if (!isCoringaRawTrapCard(state, owner, card)) return card;
  if (card.value === 'J') return { ...card, transformedValue: 1 };
  if (card.isMonster) return { ...card, transformedValue: 15 };
  if (card.value === 'Q') {
    const revealedOpponentCards = opponentField.flatMap((slot) => [
      ...(slot.faceDownCard?.revealed ? [slot.faceDownCard] : []),
      ...slot.horizontalCards.filter((c) => c.revealed),
    ]);
    const target = copyTargetId ? revealedOpponentCards.find((c) => c.id === copyTargetId) : undefined;
    const copiedValue = target ? getSpotlightAdjustedValue(target, state.spotlight) : 1;
    return { ...card, transformedValue: copiedValue };
  }
  return card;
}
