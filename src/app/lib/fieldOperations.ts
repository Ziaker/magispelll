/**
 * fieldOperations.ts - operações estruturais puras sobre slots de campo.
 *
 * Este módulo não conhece GameState, fases, reducer, UI ou IA. Ele só
 * transforma FieldSlot/arrays de campo e preserva as invariantes de
 * retorno para a mão e erosão/colapso de pilhas de Torre/Broto.
 */
import { hideCard, shuffle, type Card } from './cardUtils';
import type { FieldSlot } from './gameStateTypes';

/** Atualiza um slot sempre a partir do valor original daquele índice. */
export function updateFieldSlot(
  field: [FieldSlot, FieldSlot, FieldSlot],
  index: number,
  patch: Partial<FieldSlot> | ((slot: FieldSlot) => Partial<FieldSlot>)
): [FieldSlot, FieldSlot, FieldSlot] {
  const newField = [...field] as [FieldSlot, FieldSlot, FieldSlot];
  const resolved = typeof patch === 'function' ? patch(field[index]) : patch;
  newField[index] = { ...newField[index], ...resolved };
  return newField;
}

/** Devolve o conteúdo de um slot para a mão e limpa o slot por completo. */
export function returnSlotToHand(
  hand: Card[],
  slot: FieldSlot,
  opts: { shuffle?: boolean; includeReserves?: boolean; hide?: boolean } = {}
): { hand: Card[]; clearedSlot: FieldSlot } {
  const { includeReserves = true } = opts;
  const rawCardsBack = [
    ...(slot.faceDownCard ? [slot.faceDownCard] : []),
    ...(includeReserves ? slot.towerReserve ?? [] : []),
    ...(includeReserves ? slot.brotoReserve ?? [] : []),
    ...slot.horizontalCards,
  ];
  const cardsBack = opts.hide ? rawCardsBack.map(hideCard) : rawCardsBack;
  const newHand = opts.shuffle ? shuffle([...hand, ...cardsBack]) : [...hand, ...cardsBack];
  return {
    hand: newHand,
    clearedSlot: { faceDownCard: undefined, horizontalCards: [], towerReserve: undefined, brotoReserve: undefined, revealed: false },
  };
}

/**
 * Resolve estruturalmente um slot após combate: colapsa a pilha inteira
 * ou erode apenas o topo de uma Torre, promovendo a próxima carta.
 */
export function resolveCombatSlot(slot: FieldSlot, erodeOnly: boolean): { newSlot: FieldSlot; discarded: Card[] } {
  const reserve = slot.towerReserve ?? [];
  if (!erodeOnly || reserve.length === 0) {
    // Druida: um Broto nunca "eroda" (erodeOnly nunca é true pra ele - ver
    // isTowerSlot, que não reconhece brotoReserve) - qualquer combate perdido
    // colapsa a pilha INTEIRA de uma vez, cai sempre neste branch. A reserva
    // do Broto entra aqui pro descarte junto com o topo, senão as cartas
    // empilhadas ficariam órfãs (nem em campo, nem no descarte).
    const discarded = [slot.faceDownCard, ...reserve, ...(slot.brotoReserve ?? []), ...slot.horizontalCards].filter((c): c is Card => Boolean(c));
    return { newSlot: { revealed: false, horizontalCards: [] }, discarded };
  }
  const newTop = reserve[reserve.length - 1];
  const newReserve = reserve.slice(0, -1);
  const discarded = [slot.faceDownCard, ...slot.horizontalCards].filter((c): c is Card => Boolean(c));
  return {
    // FIX (pedido do usuário: "precisa de uma checagem que vê se ela ERA uma
    // torre ou É uma carta singular") - `towerReserve: newReserve` direto
    // (nunca convertido pra `undefined` quando esvazia) - o `[]` resultante
    // preserva o sinal "isto já foi uma torre" pra wasEverTowerSlot acima
    // conseguir distinguir depois de uma carta comum que nunca foi torre.
    newSlot: { faceDownCard: newTop, towerReserve: newReserve, revealed: true, horizontalCards: [] },
    discarded,
  };
}
