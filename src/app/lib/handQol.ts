/**
 * handQol.ts - "qualidade de vida" pra mão do jogador (pedido do usuário:
 * "me de mais ideias, melhores" sobre a mão, seguido de "implemente tudo").
 *
 * Funções PURAS (mesmo espírito de handSelection.ts) que só CALCULAM o que
 * mostrar - PlayerZone.tsx/HandCardView.tsx cuidam de renderizar. Reunidas
 * aqui (em vez de inline em PlayerZone.tsx) pra cada uma poder ser testada
 * isoladamente sem precisar montar um componente inteiro.
 */
import type { Card } from './cardUtils';
import { getDisplayValue, getEffectiveCardValue, isPlainNumeralCard } from './cardUtils';
import { computeFusionResult, isUntransformedAce, type FusionResult } from './fusion';
import { towerEligibleValue } from './gameEngine';
import type { Phase } from './magicCards';

/**
 * Posição de ordenação de uma carta pra exibição agrupada na mão (ideia
 * "agrupamento automático por valor"): numerais 2-10 em ordem crescente,
 * depois Ás (cru OU transformado - mas um Ás TRANSFORMADO agrupa junto do
 * numeral que ele representa agora, não junto dos Áses crus - é isso que o
 * jogador vê e é o que importa pra achar duplicatas de Torre), depois as
 * magias J/Q/K, e o Monstro por último (não é nem numeral nem estratégia de
 * campo direta, fica fora do caminho).
 */
function sortRank(card: Card): number {
  if (card.isMonster) return 1000;
  if (card.value === 'J') return 900;
  if (card.value === 'Q') return 901;
  if (card.value === 'K') return 902;
  if (card.value === 'A' && card.transformedValue === undefined) return 800; // Ás cru - ainda não "é" nenhum número
  return getEffectiveCardValue(card); // numeral puro OU Ás já transformado, pelo valor que ele representa agora
}

/**
 * Reordena a mão pra exibição (modo "Automático" - ver `handSortMode` em
 * PlayerZone.tsx): cartas do mesmo valor ficam adjacentes, sem precisar que
 * o jogador procure manualmente. `sort` do array é estável em todo motor JS
 * moderno, então cartas de mesmo `sortRank` mantêm a ordem relativa original
 * (não "tremem" de posição sozinhas a cada render).
 */
export function sortHandForDisplay(hand: Card[]): Card[] {
  return [...hand].sort((a, b) => sortRank(a) - sortRank(b));
}

/** Rótulo de exibição do "grupo" de uma carta pro mini-resumo (ideia "mini-resumo no topo da mão"). */
function groupLabel(card: Card): string {
  if (card.isMonster) return '🃏';
  if (card.value === 'J' || card.value === 'Q' || card.value === 'K') return card.value;
  if (card.value === 'A' && card.transformedValue === undefined) return 'A';
  return getDisplayValue(card); // numeral puro ou Ás transformado - agrupa pelo valor que representa agora
}

export interface HandValueCount {
  key: string;
  label: string;
  count: number;
}

/**
 * Conta quantas cartas de cada "grupo" existem na mão, na mesma ordem de
 * `sortRank` (pra bater visualmente com a ordem automática da mão) - usado
 * tanto pelo mini-resumo permanente quanto pela prévia de saldo do descarte
 * (mesma função, chamada com a mão inteira ou só com o que sobraria).
 */
export function getHandValueCounts(hand: Card[]): HandValueCount[] {
  const counts = new Map<string, { label: string; rank: number; count: number }>();
  for (const card of hand) {
    const key = groupLabel(card);
    const existing = counts.get(key);
    if (existing) existing.count += 1;
    else counts.set(key, { label: key, rank: sortRank(card), count: 1 });
  }
  return [...counts.entries()]
    .map(([key, v]) => ({ key, label: v.label, count: v.count, rank: v.rank }))
    .sort((a, b) => a.rank - b.rank)
    .map(({ key, label, count }) => ({ key, label, count }));
}

/**
 * Ideia "torre disponível proativo": verdadeiro assim que existirem 2+
 * cartas elegíveis pra Torre (numeral 2-10 ou Ás) do MESMO valor na mão -
 * mesma regra de elegibilidade de canFormOrReinforceTower/handSelection.ts,
 * só que olhando a mão inteira de uma vez em vez de uma seleção específica.
 */
export function hasTowerComboAvailable(hand: Card[]): boolean {
  const counts = new Map<number, number>();
  for (const card of hand) {
    const value = towerEligibleValue(card);
    if (value === null) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.values()].some((n) => n >= 2);
}

export interface FusionPartnerPreview {
  /** Rótulo curto pra mostrar no badge flutuante da carta parceira, ex.: "→ Q", "→ 9", "→ Monstro". */
  label: string;
  /** Cor de destaque conforme o quão bom é o resultado - dourado (magia) e azul (Ás) chamam mais atenção que um numeral comum. */
  color: string;
}

function previewToBadge(result: FusionResult): FusionPartnerPreview {
  if (result.isMonster) return { label: '→ 🃏', color: '#C59E4F' };
  if (result.isMagic) return { label: `→ ${result.value}`, color: '#C59E4F' };
  if (result.value === 'A') return { label: '→ A', color: '#7AA7C4' };
  return { label: `→ ${result.value}`, color: '#6CC47A' };
}

/**
 * Ideia "linha de fusão ao passar o mouse": pra cada OUTRA carta da mão que
 * fundiria com `hoveredCardId` agora, calcula o resultado (mesma regra real
 * de canFuseCards/computeFusionResult em fusion.ts - nunca reinventa a
 * elegibilidade) e devolve um mapa id -> prévia, pra PlayerZone.tsx destacar
 * cada parceira com o resultado específico daquele par (não só "pode
 * fundir", já que QUALQUER par de numerais pode - o que realmente varia, e
 * importa pra decisão, é o resultado de cada combinação).
 */
export function getFusionPartnerPreviews(
  hand: Card[],
  hoveredCardId: string,
  fusionEnabled: boolean,
  phase: Phase,
  monsterCardsEnabled: boolean
): Map<string, FusionPartnerPreview> {
  const result = new Map<string, FusionPartnerPreview>();
  if (!fusionEnabled || phase !== 'draw') return result;
  const hovered = hand.find((c) => c.id === hoveredCardId);
  if (!hovered) return result;

  const hoveredIsAce = isUntransformedAce(hovered);
  const hoveredIsPlainNumeral = isPlainNumeralCard(hovered);
  if (!hoveredIsAce && !hoveredIsPlainNumeral) return result;

  for (const other of hand) {
    if (other.id === hoveredCardId) continue;
    const otherIsAce = isUntransformedAce(other);
    const otherIsPlainNumeral = isPlainNumeralCard(other);
    const eligible = hoveredIsAce ? otherIsAce && monsterCardsEnabled : otherIsPlainNumeral;
    if (!eligible) continue;
    result.set(other.id, previewToBadge(computeFusionResult(hovered, other)));
  }
  return result;
}

/**
 * Ideia "contagem de risco no baralho": quantas cópias do que esta carta
 * representa AGORA (valor de exibição - um Ás transformado em 9 conta como
 * "9", não como "A") ainda estão no baralho pra comprar. Só o baralho em si
 * (não o descarte, que só volta com reembaralhamento - ver
 * reshuffleDiscardIntoDeck em cardUtils.ts) - é a contagem do que
 * REALMENTE pode sair na próxima compra.
 */
export function countRemainingInDeck(deck: Card[], card: Card): number {
  if (card.isMonster) return deck.filter((c) => c.isMonster).length;
  const label = getDisplayValue(card);
  return deck.filter((c) => !c.isMonster && c.value === label).length;
}
