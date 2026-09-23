/**
 * fieldQueries.ts - consultas puras e genéricas sobre o campo.
 *
 * Não conhece personagens, fases globais, reducer, IA ou UI.
 */
import type { Card } from './cardUtils';
import { hasStatus } from './statusEffects';
import type { FieldSlot } from './gameStateTypes';
export function fieldCards(field: [FieldSlot, FieldSlot, FieldSlot]): Card[] {
  // FIX (Modo Towers, pedido do usuário): a reserva da torre (cartas
  // empilhadas ABAIXO do topo, ver FieldSlot.towerReserve) agora entra em
  // TODO lugar que já varria o campo inteiro pra descartar/mover cartas -
  // esta é a ÚNICA função usada por todos esses lugares (fim de combate,
  // limpeza do campo do oponente pela Magia Numeral, etc.), então uma
  // mudança aqui já basta para todos eles tratarem a torre inteira, não só o
  // topo visível. Druida: `brotoReserve` entra no mesmo lugar, mesmo motivo.
  return field
    .flatMap((slot) => [slot.faceDownCard, ...(slot.towerReserve ?? []), ...(slot.brotoReserve ?? []), ...slot.horizontalCards])
    .filter((c): c is Card => Boolean(c));
}

/**
 * Verdadeiro quando este slot JÁ FOI uma torre em algum momento (mesmo que
 * agora só reste a carta do topo sozinha, `isTowerSlot` falso) - pedido do
 * usuário: "precisa que faça uma checagem que vê se ela ERA uma torre ou É
 * uma carta singular" (drag & drop pra reforçar uma torre que virou avulsa,
 * sem confundir com uma carta comum que nunca teve nada a ver com Torres).
 *
 * Convenção de `FieldSlot.towerReserve` (3 estados, não 2):
 * `undefined` = nunca foi torre; `[]` (array vazio, NUNCA `undefined`) = FOI
 * torre e erodiu até sobrar só o topo; `.length > 0` = torre ativa agora
 * (`isTowerSlot`). `resolveCombatSlot`/`resolveSlotToHand` preservam esse
 * `[]` de propósito (em vez de voltar pra `undefined`) exatamente pra esta
 * função conseguir distinguir os dois primeiros casos depois - qualquer
 * caminho que de fato ESVAZIA o slot pra valer (RETURN_CARD_TO_HAND,
 * SWAP_FIELD_CARD, descarte no fim de combate) constrói um FieldSlot do
 * zero sem a chave `towerReserve` nenhuma, voltando a `undefined` como
 * sempre - nunca precisa "limpar" este sinal manualmente.
 */
export function wasEverTowerSlot(slot: FieldSlot): boolean {
  return slot.towerReserve !== undefined;
}

/**
 * Índices de slots do campo com carta(s) horizontal(is) e NENHUMA delas já
 * batalhada (alvo válido de Mago K).
 *
 * FIX (softlock real encontrado - IA travava sozinha, relatado como "trava na
 * fase de estratégia/combate no modo Espectador"): esta função dizia "alvo
 * válido" bastando UMA carta não batalhada no slot (`.some`), mas
 * handleExecuteMagic (guarda real do motor, logo abaixo) rejeita a magia
 * inteira se QUALQUER carta do slot já tiver batalhado (`.some(c =>
 * c.battled)` → rejeita) - ou seja, um slot com pilha MISTA (1 carta já
 * batalhada + 1 ainda não, perfeitamente possível depois da 1ª disputa de um
 * turno com 2 rodadas) contava como alvo aqui mas era sempre silenciosamente
 * rejeitado pelo motor de verdade. A IA propunha essa mesma ação rejeitada
 * repetidamente (mesma família de bug já documentada e corrigida em outros
 * pontos deste arquivo), e como o estado nunca mudava, o efeito de decisão da
 * IA em GameBoard.tsx nunca tinha motivo pra rodar de novo - jogo travado de
 * vez. Também usada para destacar o alvo válido pro jogador HUMANO clicar
 * (GameBoard.tsx) e pela checagem de elegibilidade da magia
 * (`hasUnbattledHorizontalCardsInOpponentField` abaixo) - o mesmo mismatch
 * deixava um humano clicar num alvo que seria recusado em silêncio. Agora
 * exige que TODAS as cartas horizontais do slot estejam não batalhadas,
 * batendo exatamente com a regra real do motor.
 */
export function getUnbattledHorizontalSlots(field: [FieldSlot, FieldSlot, FieldSlot]): number[] {
  return field.reduce<number[]>((acc, slot, i) => {
    if (slot.horizontalCards.length > 0 && slot.horizontalCards.every((c) => !c.battled)) acc.push(i);
    return acc;
  }, []);
}

/**
 * Índices de slots atingíveis por Mago K (Destruição de Reforço): mesmo
 * critério de `getUnbattledHorizontalSlots` (pilha de horizontais inteira
 * não batalhada) OU um StatusEffect `kind: 'combatModifier'` ainda ativo
 * sobre uma carta AINDA NÃO batalhada do slot (principal ou horizontal) -
 * FIX (pedido do usuário: "permita que o mago possa destruir marcadores em
 * sua magia do rei").
 */
export function getDestroyableReinforcementSlots(field: [FieldSlot, FieldSlot, FieldSlot]): number[] {
  return field.reduce<number[]>((acc, slot, i) => {
    const hasUnbattledHorizontal = slot.horizontalCards.length > 0 && slot.horizontalCards.every((c) => !c.battled);
    const unbattledCards: Card[] = [];
    if (slot.faceDownCard && !slot.faceDownCard.battled) unbattledCards.push(slot.faceDownCard);
    slot.horizontalCards.filter((c) => !c.battled).forEach((c) => unbattledCards.push(c));
    const hasDestroyableModifier = unbattledCards.some((c) => hasStatus(c, 'combatModifier'));
    if (hasUnbattledHorizontal || hasDestroyableModifier) acc.push(i);
    return acc;
  }, []);
}

/** Índices de slots com carta virada ainda não revelada (alvo válido de Besta K - "antes de virar"). */
export function getUnrevealedFieldSlots(field: [FieldSlot, FieldSlot, FieldSlot]): number[] {
  return field.reduce<number[]>((acc, slot, i) => {
    if (slot.faceDownCard && !slot.revealed) acc.push(i);
    return acc;
  }, []);
}

/** Índices de qualquer slot com carta virada (revelada ou não). */
export function getFilledFieldSlots(field: [FieldSlot, FieldSlot, FieldSlot]): number[] {
  return field.reduce<number[]>((acc, slot, i) => {
    if (slot.faceDownCard) acc.push(i);
    return acc;
  }, []);
}
