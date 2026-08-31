/**
 * numeralSpells.ts - Sistema de Magias Numerais
 *
 * Magias Numerais são habilidades especiais únicas de cada personagem,
 * ativadas ao reunir 3 cartas do mesmo número específico.
 *
 * MECÂNICA:
 * - Cada personagem tem um número específico: MAGO=9, BESTA=6, ANJO=3
 * - Requer 3 cartas iguais desse número (Ás transformado conta)
 * - Só pode ativar na fase de ESTRATÉGIA
 * - Campo deve estar vazio (sem cartas posicionadas)
 * - Apenas uma Magia Numeral pode estar ativa por vez
 * - Ao ativar: pula fase de combate, as 3 cartas são descartadas
 * - Efeito é aplicado no PRÓXIMO turno (exceto Anjo, que é permanente e imediato)
 *
 * EFEITOS POR PERSONAGEM:
 * - MAGO (9,9,9): Visão Arcana - revela cartas compradas pelo oponente no próximo turno
 * - BESTA (6,6,6): Fúria Sanguinária - IMEDIATAMENTE força o oponente a descartar toda a
 *   mão e comprar de volta acima de 6 cartas (efeito único, não é um efeito que dura o
 *   turno inteiro do oponente como os das outras Magias Numerais)
 * - ANJO (3,3,3): Benção Eterna - aumenta permanentemente compra de cartas e limite de mão
 *
 * EXTENSÃO: Para adicionar novo personagem, adicione entrada no NUMERAL_SPELLS
 */

import type { Card } from './cardUtils';
import { getSpotlightAdjustedValue, type SpotlightState } from './spotlight';

export type NumeralCharacter = 'mago' | 'besta' | 'anjo' | 'mosqueteiro' | 'coringa';

/** Estrutura mínima de um slot de campo, para não depender do componente React */
export interface FieldSlotLike {
  faceDownCard?: Card;
}

export type NumeralSpellType = {
  character: NumeralCharacter;
  requiredNumber: number;
  name: string;
  description: string;
};

/** Texto do requisito da Magia Numeral pra exibição (UI). */
export function formatNumeralRequirement(spell: NumeralSpellType): string {
  return String(spell.requiredNumber);
}

/**
 * Definição de todas as Magias Numerais do jogo.
 * IMPORTANTE: cada personagem tem apenas UMA Magia Numeral.
 *
 * EXTENSÃO: para novo personagem, adicione:
 * novoPersonagem: { character: 'novoPersonagem', requiredNumber: X, name: '...', description: '...' }
 */
export const NUMERAL_SPELLS: Record<NumeralCharacter, NumeralSpellType> = {
  mago: {
    character: 'mago',
    requiredNumber: 9,
    name: 'Visão Arcana',
    description: 'No próximo turno, todas as cartas do oponente estarão reveladas (inclui as cartas que comprar).',
  },
  besta: {
    character: 'besta',
    requiredNumber: 6,
    name: 'Fúria Sanguinária',
    description: 'Efeito imediato: o oponente descarta toda a mão que possui e compra de volta mais de 6 cartas.',
  },
  anjo: {
    character: 'anjo',
    requiredNumber: 3,
    name: 'Benção Eterna',
    description: 'Compre uma carta a mais na fase de compra permanentemente (acumulativo). Seu limite de mão também aumenta em 1.',
  },
  mosqueteiro: {
    character: 'mosqueteiro',
    requiredNumber: 9,
    name: 'Munição Infinita',
    description: 'No próximo turno, seu limite de mão aumenta em 1 para cada carta que suas magias (Valete/Rainha) descartaram nos últimos 3 turnos.',
  },
  coringa: {
    character: 'coringa',
    requiredNumber: 7,
    name: 'Mão de Ferro',
    description:
      'No próximo turno, suas cartas de magia (Valete/Rainha/Rei) podem ser transformadas (permanentemente, um botão surge em cada uma) em cartas de número 11, 12 e 13.',
  },
};

/** Retorna as informações da Magia Numeral de um personagem */
export function getNumeralSpellInfo(character: NumeralCharacter): NumeralSpellType {
  return NUMERAL_SPELLS[character];
}

/**
 * Cartas da mão que contam para a Magia Numeral de um personagem (considera
 * Ás transformado). FIX (pedido do usuário, Modo Spotlight, "tudo que usa o
 * valor da carta"): usa o valor já ajustado pelo Spotlight (spotlight.ts) -
 * uma carta cujo número foi spotlighted (positivo OU negativo) deixa de
 * contar pelo seu número IMPRESSO e passa a contar pelo valor ajustado (ex.:
 * um "9" positivo vira 27 e não conta mais pro trio de 9 do Mago; um "9"
 * negativo vira 1 e idem). `spotlight` é OBRIGATÓRIO de propósito (não
 * opcional) - um bug real já apareceu numa rodada completa de simulação
 * IA vs IA por causa de um `undefined` implícito aqui: a IA achava que
 * ainda tinha um trio válido (usando o valor cru) e propunha
 * ACTIVATE_NUMERAL_SPELL, que o motor (já correto, usando o Spotlight de
 * verdade) rejeitava em silêncio. Passe `null` explicitamente quando não
 * houver Spotlight nesta chamada (nunca deixe implícito).
 */
export function getMatchingNumeralCards(character: NumeralCharacter, hand: Card[], spotlight: SpotlightState | null): Card[] {
  const spell = NUMERAL_SPELLS[character];
  return hand.filter((card) => getSpotlightAdjustedValue(card, spotlight) === spell.requiredNumber);
}

/**
 * Verifica se o jogador pode ativar sua Magia Numeral.
 *
 * CONDIÇÕES:
 * 1. Nenhuma Magia Numeral já está ativa (hasActiveNumeralSpell === false)
 * 2. Campo do jogador está vazio (sem cartas posicionadas)
 * 3. Tem ao menos 3 cartas do número requerido na mão (aceita Ás transformado)
 *
 * NOTA: a verificação de fase (deve ser ESTRATÉGIA) é feita externamente.
 */
export function canActivateNumeralSpell(
  character: NumeralCharacter,
  hand: Card[],
  field: FieldSlotLike[],
  hasActiveNumeralSpell: boolean,
  spotlight: SpotlightState | null
): boolean {
  if (hasActiveNumeralSpell) return false;

  const hasCardsInField = field.some((slot) => slot.faceDownCard);
  if (hasCardsInField) return false;

  return getMatchingNumeralCards(character, hand, spotlight).length >= 3;
}
