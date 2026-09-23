/**
 * fieldStateOps.ts - operações puras de transformação estrutural do campo.
 *
 * Centraliza updates de slot, retorno de pilhas para a mão e resolução estrutural
 * do destino de um slot após combate, sem conhecer reducer, UI ou IA.
 */
import { hideCard, shuffle, type Card } from './cardUtils';
import type { FieldSlot } from './gameStateTypes';
/**
 * Modo Towers - resolve UM slot no fim de um combate/disputa (fonte única
 * usada pelos dois caminhos de handleFinalizeCombat: disputa fechada e
 * combate normal).
 *
 * FIX (pedido do usuário: "as torres estão se descartando após a primeira
 * disputa, isso SÓ DEVE ACONTECER caso esteja disputando contra uma outra
 * torre, caso não, apenas descarta a carta de cima da torre"): uma torre
 * agora ERODE (perde só a carta do topo, a que acabou de batalhar) e
 * permanece no campo com o resto da reserva, promovendo a próxima carta a
 * novo topo - vencendo, perdendo ou empatando, e mesmo quando a disputa
 * fecha. Ela só vai INTEIRA pro descarte em dois casos: quando batalhou
 * contra OUTRA torre, ou quando já estava na última carta (reserva vazia -
 * "caso ainda tenha mais que um componente", pedido do usuário).
 *
 * Antes isso dependia de `combatLoneTower`, calculado uma única vez na
 * entrada da fase de Combate e só quando a torre era o ÚNICO conteúdo do
 * campo do dono E o oponente não tinha nenhuma torre - condições estreitas
 * demais, que na prática faziam a torre inteira ir pro descarte logo na
 * primeira disputa. `combatLoneTower` continua existindo, mas só alimenta a
 * cutscene de transição de fase (PhaseTransition.tsx) - não decide mais
 * nenhuma regra de descarte.
 */
/**
 * Campo com os slots PERSISTENTES (torre do Modo Towers OU Broto do Druida)
 * preservados e todo o resto esvaziado - usado nos dois pontos onde o campo
 * era limpo por completo entre turnos (handleToggleReady no fim do Combate e
 * advancePhaseState na virada pra Compra). Uma torre só some batalhando
 * contra outra torre, ou erodindo até a última carta; um Broto só some sendo
 * combatido ou removido por efeito (ver resolveCombatSlot pros dois casos -
 * nenhum dos dois nunca "expira" sozinho por passar o turno). Sempre use
 * junto com `nonPersistentFieldCards` (mesmo critério) para montar a lista
 * de descarte - senão uma carta ficaria em campo E no descarte.
 *
 * FIX (Druida, personagem novo): antes só conhecia torres (`keepTowerSlots`)
 * - generalizado pra também preservar Broto, já que os dois modos podem
 * estar ligados ao mesmo tempo (um jogador com Torre num slot e Broto em
 * outro, ao mesmo tempo) e cada um precisa sobreviver independente do outro.
 */
/**
 * FIX (overhaul de Status Effects, Fase 4): substitui os 3 estilos de
 * mutação de slot que coexistiam no arquivo (`newField[i] = {...slot, X}`,
 * objeto literal cru, ou spread do array já mutado no mesmo escopo, com
 * risco de bug de ordem) - um único ponto de escrita, sempre a partir do
 * slot ORIGINAL (nunca do array já mutado). `patch` aceita um objeto direto
 * ou uma função (quando o patch depende do slot atual).
 */
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

/**
 * FIX (overhaul de Status Effects, Fase 4): substitui as variações de
 * "devolver carta(s) de um slot pra mão" que existiam espalhadas pelo
 * arquivo, cada uma decidindo sozinha (com nomes de variável diferentes) o
 * que volta junto - reforços horizontais, reserva de Torre/Broto, se
 * embaralha a mão depois. Preserva `revealed` como estava por padrão (o
 * comportamento já estabelecido na maioria dos handlers: uma carta que já
 * era conhecida do oponente continua "conhecida" mesmo saindo do campo) -
 * `opts.hide` liga o caso oposto e deliberado (armadilha do Coringa
 * revelada por um efeito do oponente: volta OCULTA de propósito, pra
 * confundir qual carta da mão é aquela).
 */
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
