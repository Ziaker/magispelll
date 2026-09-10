/**
 * cardEffectSummary.ts - Fonte única do que uma carta de campo "está fazendo"
 * agora - tipo (numeral/mágica/invocação/armadilha/token) e status ativos
 * (marcadores de combate, Spotlight, congelada, revelada...).
 *
 * Reaproveitado por dois consumidores que NUNCA devem calcular isso cada um
 * por conta própria: o tooltip de valor (PlayingCard.tsx) e a interface de
 * inspeção de carta (segurar 1,5s no campo). Toda a matemática de valor usa
 * as MESMAS funções que `slotCombatTotal` (gameEngine.ts) usa de verdade na
 * resolução de combate - `getSpotlightAdjustedValue`/`applyCombatModifierStatuses`,
 * nunca uma soma reimplementada aqui.
 */
import { ArrowDown, ArrowUp, Clock, Eye, Layers, Lock, Snowflake, type LucideIcon } from 'lucide-react';
import { getEffectiveCardValue, type Card } from './cardUtils';
import { applyCombatModifierStatuses, getCombatModifierStatuses, hasStatus } from './statusEffects';
import { getSpotlightAdjustedValue, getSpotlightEntry, type SpotlightState } from './spotlight';
import { characterOf, isBrotoSlot, isCoringaRawTrapCard, isTowerSlot, type FieldSlot, type GameState, type PlayerNumber } from './gameEngine';

export type CardTypeTag = 'trap' | 'magic' | 'summon' | 'numeralToken' | 'magicToken' | 'numeral';

export interface CardTypeInfo {
  tag: CardTypeTag;
  label: string;
}

/** Rótulo de exibição de cada tipo - `magicToken` fica reservado (nenhum personagem atual gera essa carta). */
const CARD_TYPE_LABELS: Record<CardTypeTag, string> = {
  trap: 'Armadilha',
  magic: 'Mágica',
  summon: 'Invocação',
  numeralToken: 'Token Numeral',
  magicToken: 'Token Mágico',
  numeral: 'Carta Numeral',
};

export type CardStatusPolarity = 'positive' | 'negative' | 'neutral';

export interface CardStatusSummary {
  id: string;
  icon: LucideIcon;
  label: string;
  description: string;
  polarity: CardStatusPolarity;
  /** `true` quando este status afeta o VALOR numérico da carta (entra no tooltip do item 1); `false` = só informativo (entra só na inspeção completa). */
  numeralRelated: boolean;
}

/**
 * Contexto mínimo pra `getCardValueBreakdown`/`getCardStatusSummaries` - só o
 * que essas duas funções realmente usam, sem exigir o `GameState` inteiro de
 * quem chama (ex.: PlayingCard.tsx, que não recebe `GameState` hoje).
 */
export interface CardValueContext {
  spotlight?: SpotlightState | null;
  /**
   * `false` só no caso de uma carta do OPONENTE ainda não revelada - suprime
   * qualquer informação que dependa do valor real dela (hoje, só Spotlight -
   * mesma disciplina de informação que `FieldSlotView.tsx` já aplica no
   * brilho de Spotlight: "só mostra depois de revealed === true"). Cartas de
   * campo só chegam ao corpo "de frente" de PlayingCard.tsx (`normalCardBody`
   * e as outras variantes de carta virada pra cima) depois de `FlipCard`
   * decidir mostrar essa face - ou seja, já reveladas - então esse caso só
   * importa de verdade pra quem for construir este contexto FORA desse
   * caminho (ex.: a futura interface de inspeção, que decide por conta
   * própria quando permitir o gesto numa carta do oponente).
   */
  isOwnOrRevealed: boolean;
  /**
   * O slot de campo que hospeda `card` agora - opcional (o tooltip de
   * PlayingCard.tsx não tem isso à mão hoje), mas necessário pra
   * `getCardStatusSummaries` detectar Torre/Broto (`isTowerSlot`/`isBrotoSlot`,
   * gameEngine.ts) - a interface de inspeção sempre passa.
   */
  slot?: FieldSlot;
}

/** Contexto completo - acrescenta o que só `getCardTypeInfo` precisa (a checagem de armadilha do Coringa depende de saber quem é o dono). */
export interface CardEffectContext extends CardValueContext {
  state: GameState;
  owner: PlayerNumber;
}

/**
 * Tipo estrutural da carta AGORA (armadilha > mágica > invocação > token
 * numeral > numeral) - um selo só, prioridade nessa ordem quando mais de uma
 * condição bate (ex.: a carta Monstro do Coringa É J/Q/K-like mas, posicionada
 * como armadilha, a armadilha é o fato mais relevante agora).
 */
export function getCardTypeInfo(card: Card, ctx: CardEffectContext): CardTypeInfo {
  if (isCoringaRawTrapCard(ctx.state, ctx.owner, card)) return { tag: 'trap', label: CARD_TYPE_LABELS.trap };
  if (card.value === 'J' || card.value === 'Q' || card.value === 'K') return { tag: 'magic', label: CARD_TYPE_LABELS.magic };
  if (card.isMonster) return { tag: 'summon', label: CARD_TYPE_LABELS.summon };
  if (card.isFireToken) return { tag: 'numeralToken', label: CARD_TYPE_LABELS.numeralToken };
  return { tag: 'numeral', label: CARD_TYPE_LABELS.numeral };
}

/** Cada status ativo vira UMA entrada - a interface de inspeção mostra uma caixa por entrada, o tooltip filtra só as `numeralRelated`. */
export function getCardStatusSummaries(card: Card, ctx: CardValueContext): CardStatusSummary[] {
  const summaries: CardStatusSummary[] = [];

  if (hasStatus(card, 'frozen')) {
    const source = card.statusEffects?.find((e) => e.kind === 'frozen')?.source;
    summaries.push({
      id: 'frozen',
      icon: Snowflake,
      label: 'Congelada',
      description: `${source ? `${source.toUpperCase()}: ` : ''}não pode ativar magias enquanto estiver congelada.`,
      polarity: 'negative',
      numeralRelated: false,
    });
  }

  if (hasStatus(card, 'magicLocked')) {
    summaries.push({
      id: 'magicLocked',
      icon: Lock,
      label: 'Trancada',
      description: 'Visão Celestial do Anjo impede a ativação desta magia até a próxima fase de Compra.',
      polarity: 'negative',
      numeralRelated: false,
    });
  }

  if (card.revealed) {
    summaries.push({
      id: 'revealed',
      icon: Eye,
      label: 'Revelada',
      description: 'O oponente já pode ver o valor desta carta.',
      polarity: 'neutral',
      numeralRelated: false,
    });
  }

  if (ctx.isOwnOrRevealed) {
    const entry = getSpotlightEntry(card, ctx.spotlight);
    if (entry) {
      const isPositive = entry.polarity === 'positive';
      summaries.push({
        id: 'spotlight',
        icon: isPositive ? ArrowUp : ArrowDown,
        label: 'Spotlight',
        description: isPositive ? 'Número em destaque: vale ×3 neste turno.' : 'Número em destaque: fixado em 1 neste turno.',
        polarity: isPositive ? 'positive' : 'negative',
        numeralRelated: true,
      });
    }
  }

  // Pedido do usuário: "mostre o turno em que a carta foi posicionada" -
  // `card.placedOnTurn` é carimbado em TODO ponto de gameEngine.ts que faz
  // uma carta nascer num slot (ver comentário completo em cardUtils.ts).
  // `undefined` só em cenário sintético de teste - omite a caixa em vez de
  // mostrar um turno inventado.
  if (card.placedOnTurn !== undefined) {
    summaries.push({
      id: 'placedOnTurn',
      icon: Clock,
      label: 'Posicionada',
      description: `Entrou no campo no turno ${card.placedOnTurn}.`,
      polarity: 'neutral',
      numeralRelated: false,
    });
  }

  // Pedido do usuário: "mostre se é uma pilha de cartas (torre ou magia com
  // efeito de pilha)" - Torre (Modo Towers) e Broto (Druida) são as duas
  // mecânicas de pilha existentes hoje - `isTowerSlot`/`isBrotoSlot`
  // (gameEngine.ts) já são a fonte de verdade usada pelo resto do jogo pra
  // detectar as duas, sem duplicar a regra aqui.
  if (ctx.slot) {
    if (isTowerSlot(ctx.slot)) {
      const size = (ctx.slot.towerReserve?.length ?? 0) + 1;
      summaries.push({
        id: 'stack',
        icon: Layers,
        label: 'Pilha: Torre',
        description: `Torre com ${size} carta${size === 1 ? '' : 's'} empilhada${size === 1 ? '' : 's'} - o valor de combate soma todas.`,
        polarity: 'neutral',
        numeralRelated: false,
      });
    } else if (isBrotoSlot(ctx.slot)) {
      const size = (ctx.slot.brotoReserve?.length ?? 0) + 1;
      summaries.push({
        id: 'stack',
        icon: Layers,
        label: 'Pilha: Broto',
        description: `Broto do Druida com ${size} carta${size === 1 ? '' : 's'} - cresce a cada troca de turno.`,
        polarity: 'neutral',
        numeralRelated: false,
      });
    }
  }

  getCombatModifierStatuses(card).forEach((status) => {
    const magnitude = status.magnitude ?? 0;
    const isMultiply = status.mode === 'multiply';
    const isPositive = isMultiply ? magnitude > 1 : magnitude > 0;
    const signed = isMultiply ? `×${magnitude}` : `${magnitude > 0 ? '+' : ''}${magnitude}`;
    summaries.push({
      id: `combatModifier-${status.source}-${status.mode}`,
      icon: isPositive ? ArrowUp : ArrowDown,
      label: `${isPositive ? 'Buff' : 'Debuff'}: ${status.label}`,
      description: `${signed} no valor de combate.`,
      polarity: isPositive ? 'positive' : 'negative',
      numeralRelated: true,
    });
  });

  return summaries;
}

export interface CardValueAdjustment {
  label: string;
  text: string;
}

export interface CardValueBreakdown {
  /** Valor de face (ou já transformado - getEffectiveCardValue), sem nenhum ajuste. */
  base: number;
  /** Cada linha do tooltip, na MESMA ordem em que `slotCombatTotal` (gameEngine.ts) realmente aplica: Spotlight primeiro, depois cada marcador de combate. */
  adjustments: CardValueAdjustment[];
  /** Valor final de combate - idêntico ao que handleResolveCombat calcula de verdade. */
  total: number;
  polarity: 'higher' | 'lower' | 'equal';
}

/**
 * Conta detalhada do valor de uma carta - reaproveita `getSpotlightAdjustedValue`
 * e `applyCombatModifierStatuses` (as MESMAS funções que `slotCombatTotal`
 * usa na resolução de combate de verdade) em vez de reimplementar a soma.
 */
export function getCardValueBreakdown(card: Card, ctx: CardValueContext): CardValueBreakdown {
  const base = getEffectiveCardValue(card);
  const showSpotlight = ctx.isOwnOrRevealed;
  const spotlightAdjusted = showSpotlight ? getSpotlightAdjustedValue(card, ctx.spotlight) : base;

  const adjustments: CardValueAdjustment[] = [];
  if (showSpotlight) {
    const entry = getSpotlightEntry(card, ctx.spotlight);
    if (entry) adjustments.push({ label: 'Spotlight', text: entry.polarity === 'positive' ? '×3' : '→ 1' });
  }
  getCombatModifierStatuses(card).forEach((status) => {
    const magnitude = status.magnitude ?? 0;
    adjustments.push({
      label: status.label,
      text: status.mode === 'multiply' ? `×${magnitude}` : `${magnitude > 0 ? '+' : ''}${magnitude}`,
    });
  });

  const total = applyCombatModifierStatuses(spotlightAdjusted, card);
  return { base, adjustments, total, polarity: total > base ? 'higher' : total < base ? 'lower' : 'equal' };
}

/** Atalho pros consumidores que querem tipo + status de uma vez (a interface de inspeção, item 3). */
export function getCardEffectSummary(card: Card, ctx: CardEffectContext) {
  return { type: getCardTypeInfo(card, ctx), statuses: getCardStatusSummaries(card, ctx) };
}

/** `characterOf` reexportado por conveniência - evita todo consumidor deste módulo ter que importar de gameEngine.ts só por causa disso. */
export { characterOf };
