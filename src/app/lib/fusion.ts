/**
 * fusion.ts - Sistema de Fusão de Cartas (variante opcional, pedido do usuário)
 *
 * MECÂNICA:
 * - Só disponível quando `gameConfig.fusion` está habilitado (tela de
 *   Configuração, junto da opção "Cartas Monstro" - ver GameConfig.tsx).
 * - Só na fase de COMPRA, até `gameConfig.fusionLimit` vezes por turno
 *   (padrão 1, ajustável de 1 a 4 na tela de Configuração - ver
 *   `fusesThisTurn` em PlayerState, gameEngine.ts).
 * - Junta 2 cartas NUMERAIS PURAS (2-10; nunca Ás, Valete/Rainha/Rei ou
 *   Coringa - nenhuma dessas "soma" de forma natural) da mão em 1 carta
 *   nova, valendo a SOMA das duas:
 *     - Soma 4-10: vira uma carta numeral normal desse valor.
 *     - Soma 11/12/13: vira um Valete/Rainha/Rei de verdade - mesma ordem
 *       que o próprio motor já usa internamente pros valores das cartas
 *       (2..10, J=11, Q=12, K=13, Ás=14 quando não transformado) - e, como
 *       nenhuma carta de magia carrega o personagem nela mesma (o efeito é
 *       sempre resolvido pelo personagem de QUEM a tem na mão no momento de
 *       ativar - ver characterOf/handleActivateMagicClick), essa carta
 *       criada já funciona como uma magia real e completa do personagem de
 *       quem fundiu, sem precisar de nenhum código de ativação novo.
 *     - Soma acima de 13: vira um Ás (não transformado - pode ser
 *       transformado depois normalmente, como qualquer outro Ás).
 * - CASO ESPECIAL (pedido do usuário: "na fusão, permita o jogador de
 *   fusionar 2 ÁS para obter um monstro"): fundir 2 Áses AINDA NÃO
 *   transformados entre si (nunca um Ás + outra carta) produz uma carta
 *   Monstro (Coringa) de verdade, em vez de seguir a soma normal - só
 *   disponível quando `gameConfig.monsterCards` está habilitado na partida;
 *   com Cartas Monstro desligadas, 2 Áses simplesmente não podem ser
 *   fundidos entre si (nenhum resultado por soma normal faz sentido pra 2
 *   Áses - `canFuseCards` bloqueia esse par por completo nesse caso, não cai
 *   de volta pra soma comum). Um Ás JÁ transformado (`transformedValue`
 *   definido) não conta pra esse caso especial - mas também NÃO participa da
 *   fusão por soma normal: `isPlainNumeralCard` (cardUtils.ts) exclui
 *   qualquer Ás pelo `value` de face ('A'), transformado ou não - decisão
 *   original da própria variante Fusão (pedido do usuário, na 1ª versão:
 *   "só numerais puras 2-10"). Um Ás transformado nunca é elegível pra
 *   nenhum dos dois caminhos de fusão.
 * - A carta resultante nasce revelada (`revealed: true`) e marcada como
 *   fruto de fusão (`fused: true` - ver a palavra-chave "Fusão" no sistema
 *   de palavras-chave, keywords.ts).
 */
import { getEffectiveCardValue, isPlainNumeralCard, type Card } from './cardUtils';
import type { Phase } from './magicCards';

export interface FusionResult {
  /** Valor final da carta resultante ('2'..'10', 'J', 'Q', 'K', 'A' ou 'JOKER'). */
  value: string;
  /** Soma bruta das duas cartas (só para exibição, ex.: "5 + 8 = 13"). */
  sum: number;
  /** Verdadeiro quando o resultado é uma carta de magia (J/Q/K) - útil pra UI destacar esse caso. */
  isMagic: boolean;
  /** Verdadeiro quando o resultado é uma carta Monstro (fusão de 2 Áses não transformados - ver comentário do módulo). */
  isMonster: boolean;
}

/**
 * Verdadeiro para um Ás "cru" (nunca transformado) - o único caso elegível
 * pra virar Monstro ao fundir com outro igual. Exportado porque a UI
 * (PlayerZone.tsx) também precisa saber se um Ás na mão pode ser arrastado
 * pra uma fusão de Monstro, não só o motor.
 */
export function isUntransformedAce(card: Card): boolean {
  return card.value === 'A' && card.transformedValue === undefined;
}

/**
 * Calcula o resultado de fundir 2 cartas - função PURA, não valida se a
 * fusão é permitida agora (ver canFuseCards para isso). Sempre soma o valor
 * EFETIVO de cada carta (getEffectiveCardValue) - irrelevante aqui já que só
 * cartas numerais puras (ou o par especial de 2 Áses) chegam a esta função,
 * mas mantém a mesma fonte de valor usada no resto do motor.
 */
export function computeFusionResult(card1: Card, card2: Card): FusionResult {
  if (isUntransformedAce(card1) && isUntransformedAce(card2)) {
    const sum = getEffectiveCardValue(card1) + getEffectiveCardValue(card2);
    return { value: 'JOKER', sum, isMagic: false, isMonster: true };
  }
  const sum = getEffectiveCardValue(card1) + getEffectiveCardValue(card2);
  if (sum > 13) return { value: 'A', sum, isMagic: false, isMonster: false };
  if (sum === 13) return { value: 'K', sum, isMagic: true, isMonster: false };
  if (sum === 12) return { value: 'Q', sum, isMagic: true, isMonster: false };
  if (sum === 11) return { value: 'J', sum, isMagic: true, isMonster: false };
  return { value: String(sum), sum, isMagic: false, isMonster: false };
}

/**
 * Verdadeiro se as 2 cartas podem ser fundidas agora - checa a variante estar
 * habilitada, a fase, o limite de fusões por turno (`fusionLimit`, 1-4 -
 * pedido do usuário: "implemente a possibilidade de limite de fusões"), e a
 * elegibilidade das próprias cartas: numerais puras (2 cartas diferentes),
 * OU o par especial de 2 Áses ainda não transformados (só quando
 * `monsterCardsEnabled` - ver comentário do módulo).
 */
export function canFuseCards(
  phase: Phase,
  fusionEnabled: boolean,
  fusesThisTurn: number,
  fusionLimit: number,
  monsterCardsEnabled: boolean,
  card1: Card | undefined,
  card2: Card | undefined
): boolean {
  if (!fusionEnabled) return false;
  if (phase !== 'draw') return false;
  if (fusesThisTurn >= fusionLimit) return false;
  if (!card1 || !card2) return false;
  if (card1.id === card2.id) return false;

  if (isUntransformedAce(card1) && isUntransformedAce(card2)) {
    return monsterCardsEnabled;
  }
  return isPlainNumeralCard(card1) && isPlainNumeralCard(card2);
}
