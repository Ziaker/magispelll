/**
 * fieldLifecycle.ts - identidade de slots persistentes e limpeza de fim de turno.
 *
 * Torres e Brotos persistem entre turnos; os demais slots são limpos e suas
 * cartas seguem para o descarte. Este módulo concentra essa regra sem conhecer
 * fase, UI, IA ou a implementação do reducer.
 */
import type { Card } from './cardUtils';
import type { FieldSlot } from './gameEngine';
/** Verdadeiro quando este slot é uma torre do Modo Towers (tem reserva empilhada abaixo do topo). */
export function isTowerSlot(slot: FieldSlot): boolean {
  return Boolean(slot.towerReserve && slot.towerReserve.length > 0);
}

/**
 * Verdadeiro quando este slot tem um Broto do Druida ativo - ao contrário de
 * `isTowerSlot`, testa PRESENÇA (`!== undefined`), nunca o comprimento: um
 * Broto plantado sozinho (sem nenhum Valete extra empilhado) já é um Broto
 * de verdade, com `brotoReserve: []` (ver comentário completo em
 * FieldSlot.brotoReserve).
 */
export function isBrotoSlot(slot: FieldSlot): boolean {
  return slot.brotoReserve !== undefined;
}

export function keepPersistentFieldSlots(field: [FieldSlot, FieldSlot, FieldSlot]): [FieldSlot, FieldSlot, FieldSlot] {
  return field.map((slot) => (isTowerSlot(slot) || isBrotoSlot(slot) ? slot : { revealed: false, horizontalCards: [] })) as [
    FieldSlot,
    FieldSlot,
    FieldSlot
  ];
}

/** Contrapartida de `keepPersistentFieldSlots`: as cartas que ELE descarta (tudo que não está num slot de torre nem de Broto). */
export function nonPersistentFieldCards(field: [FieldSlot, FieldSlot, FieldSlot]): Card[] {
  return field
    .filter((slot) => !isTowerSlot(slot) && !isBrotoSlot(slot))
    .flatMap((slot) => [slot.faceDownCard, ...slot.horizontalCards])
    .filter((c): c is Card => Boolean(c));
}
