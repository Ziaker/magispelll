/**
 * invariants.ts - checagem de saúde do `GameState` (item 4 do plano de
 * melhoria do debug mode).
 *
 * `countAllCards` mudou de `scripts/sanity-test.ts` pra cá - já é testado e
 * já lida certo com cartas-token do Piromante (`isFireToken`, excluídas da
 * conservação de propósito - ver comentário completo abaixo) e com a reserva
 * de torre (incluída). É uma MUDANÇA DE LUGAR, não uma reescrita.
 *
 * `checkDuplicateCardIds` é novo - mais forte que só contar (um bug de troca
 * poderia conservar a contagem total mas duplicar um id específico numa
 * segunda zona, algo que `countAllCards` sozinho nunca pegaria).
 *
 * OMITIDO DE PROPÓSITO (não esquecido): uma checagem de "mão nunca excede
 * handLimit" - investigado e descartado. Existem pelo menos 2 janelas
 * LEGÍTIMAS de excesso: a Fúria Sanguinária da Besta força o oponente a
 * comprar até `Math.max(handLimit, 7)` cartas (gameEngine.ts:3819,
 * deliberadamente acima do limite normal como punição), e ações de compra
 * múltipla passam por um estado intermediário acima do limite antes do
 * descarte forçado de volta (comentário em gameEngine.ts:2417). Uma checagem
 * ingênua aqui teria o MESMO problema de falso-positivo em massa que já
 * apareceu (e foi corrigido) validando `actionSpace.ts` - sem catalogar
 * exaustivamente toda janela de exceção primeiro, o risco de um alarme
 * ruidoso e não-confiável é maior que o valor de ter a checagem.
 */
import { type GameState } from './gameEngine';
import { type Card } from './cardUtils';

/**
 * Piromante (personagem novo) - cartas-token (`isFireToken`, ver
 * cardUtils.ts) são sintéticas: nunca existiram no baralho original de 54
 * cartas (nascem do nada quando a Bola de Fogo reduz um slot sem obliterar)
 * e nunca vão pro descarte quando saem de campo - por design, ficam de FORA
 * da conservação total, senão qualquer lançamento que crie uma delas
 * pareceria "carta duplicada do nada" para este helper.
 */
function isReal(c: Card | undefined): c is Card {
  return c !== undefined && !c.isFireToken;
}

/** Toda carta "real" (não-token) presente no estado, achatada numa lista só - usada tanto por `countAllCards` quanto por `checkDuplicateCardIds`. */
function allRealCards(state: GameState): Card[] {
  const cards: Card[] = [];
  for (const key of ['player1', 'player2'] as const) {
    const p = state[key];
    cards.push(...p.hand.filter(isReal));
    for (const slot of p.field) {
      if (isReal(slot.faceDownCard)) cards.push(slot.faceDownCard);
      cards.push(...slot.horizontalCards.filter(isReal));
      cards.push(...(slot.towerReserve ?? []).filter(isReal));
    }
    if (isReal(p.monsterCard)) cards.push(p.monsterCard);
  }
  cards.push(...state.deck.filter(isReal));
  cards.push(...state.discardPile.filter(isReal));
  return cards;
}

/** Quantas cartas "reais" (não-token) existem no estado inteiro - deveria ser sempre igual ao tamanho do baralho gerado no início da partida (54 com Cartas Monstro, 52 sem, mais se Modo Towers/baralho Temático estiverem ligados). */
export function countAllCards(state: GameState): number {
  return allRealCards(state).length;
}

/** Ids de carta que aparecem MAIS DE UMA VEZ em qualquer zona do estado - mais forte que só contar, pega um bug de troca que conserva o total mas duplica uma carta específica. Vazio = saudável. */
export function checkDuplicateCardIds(state: GameState): string[] {
  const seen = new Map<string, number>();
  for (const card of allRealCards(state)) {
    seen.set(card.id, (seen.get(card.id) ?? 0) + 1);
  }
  return [...seen.entries()].filter(([, count]) => count > 1).map(([id]) => id);
}

/**
 * Checagem de saúde completa - lista de violações (vazio = saudável).
 * `expectedTotal` é opcional: quando fornecido (ex.: 54 pra um baralho Comum
 * com Cartas Monstro), reporta desvio de conservação; sem ele, só a
 * checagem de duplicados roda (não há um "total esperado" universal sem
 * saber a config da partida).
 */
export function checkInvariants(state: GameState, expectedTotal?: number): string[] {
  const violations: string[] = [];
  if (expectedTotal !== undefined) {
    const total = countAllCards(state);
    if (total !== expectedTotal) {
      violations.push(`Conservação de cartas quebrada: esperado ${expectedTotal}, encontrado ${total}`);
    }
  }
  const duplicates = checkDuplicateCardIds(state);
  if (duplicates.length > 0) {
    violations.push(`Carta(s) duplicada(s) em mais de uma zona: ${duplicates.join(', ')}`);
  }
  return violations;
}
