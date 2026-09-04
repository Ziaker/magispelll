/**
 * monsterCards.ts - Sistema de Cartas Monstro (Coringas)
 *
 * Cartas Monstro são os Coringas do baralho, com efeitos especiais únicos
 * que variam por personagem.
 *
 * MECÂNICA (redesenhada - ver FIX itens 4 e 7 da 3ª rodada de correções):
 * - Existem 2 Monstros no baralho (2 Coringas), quando habilitados na configuração
 * - Cada jogador tem uma ZONA PRÓPRIA e separada para seu Monstro (ao lado do
 *   Slot 3, fora dos 3 slots de combate normais) - decisão confirmada com o
 *   usuário entre as arquiteturas possíveis para corrigir o item 7.
 * - O Monstro NUNCA entra em disputa de combate sozinho (não compete por um
 *   dos 3 slots, nunca tem valor de combate próprio) - ele só fica na zona
 *   para ativar sua habilidade, que agora exige escolher um dos 3 slots de
 *   combate do próprio jogador como alvo.
 * - Cada personagem tem um efeito diferente ao ativar o Monstro
 * - Efeito pode ser usado UMA VEZ POR TURNO (a flag monsterUsed é resetada a
 *   cada novo turno - ver gameEngine.ts, resolveMonsterCardAtTurnEnd).
 * - FIX (pedido do usuário): a carta Monstro NÃO se descarta depois do 1º uso
 *   - ela fica na zona própria entre turnos e só se descarta de vez depois
 *   do 3º uso NO TOTAL (ver MAX_MONSTER_USES/monsterUseCount em gameEngine.ts).
 *
 * DESIGN DOS EFEITOS:
 * - MAGO: Flexibilidade - copia valor de carta revelada para uma carta já no próprio campo
 * - BESTA: Poder - dobra o valor de uma carta escolhida do próprio campo (principal ou horizontal)
 * - ANJO: Proteção - imunidade a magias do oponente em um slot escolhido
 *
 * EXTENSÃO: Para adicionar novo personagem, adicione entrada em MONSTER_EFFECTS
 */

import type { CharacterId } from './gameEngine';

/** FIX (endurecimento, ver comentário completo em characterThemes.ts): alias do `CharacterId` canônico. */
export type MonsterCharacter = CharacterId;

interface MonsterEffect {
  name: string;
  description: string;
  detailedDescription: string;
}

/**
 * Definição de todos os efeitos de Monstro do jogo.
 *
 * MECÂNICAS ESPECIAIS (todas exigem escolher um slot de combate ALVO ao
 * ativar - ver ACTIVATE_MONSTER_EFFECT_SIMPLE / EXECUTE_MAGO_MONSTER_EFFECT
 * em gameEngine.ts):
 * - Mago: pode copiar carta do OPONENTE se estiver revelada, aplicando o
 *   valor copiado em uma carta numeral já posicionada no PRÓPRIO campo
 * - Besta: escolhe uma carta específica do próprio campo (a principal do
 *   slot OU uma horizontal) para dobrar o valor dela - não é mais restrito
 *   a "slot com horizontal" (FIX pedido do usuário)
 * - Anjo: precisa ser ativado (não é mais passivo) escolhendo o slot a proteger
 *
 * EXTENSÃO: para novo personagem, adicione:
 * novoPersonagem: { name: '...', description: '...', detailedDescription: '...' }
 */
export const MONSTER_EFFECTS: Record<MonsterCharacter, MonsterEffect> = {
  mago: {
    name: 'Ilusão Arcana',
    description: 'Copia o valor de uma carta revelada para uma carta já no seu campo',
    detailedDescription: 'Copia o valor de qualquer carta revelada (sua ou do oponente) para uma carta numeral já posicionada no seu campo.',
  },
  besta: {
    name: 'Fúria Selvagem',
    description: 'Dobra o valor de uma carta escolhida do seu campo',
    detailedDescription: 'Escolhe uma carta do seu campo (a principal de um slot ou uma horizontal) e dobra o valor dela durante o combate.',
  },
  anjo: {
    name: 'Proteção Divina',
    description: 'Protege um slot escolhido do seu campo contra magias do oponente',
    detailedDescription: 'Escolhe um slot do seu campo e o protege contra magias do oponente (Valete, Rainha ou Rei) até o fim do turno. Pode ser ativada mais de uma vez no mesmo turno, cada vez protegendo um slot diferente, enquanto durar a carga da carta.',
  },
  mosqueteiro: {
    name: 'Recarga Rápida',
    description: 'Seu próximo efeito de descarte neste turno descarta cartas da mão do oponente',
    detailedDescription: 'Ativa direto (sem escolher slot). O próximo Valete ou Rainha que você ativar neste turno descarta cartas da mão do OPONENTE (escolhidas às cegas por posição) em vez da sua própria mão.',
  },
  // Coringa (redesenho completo, pedido do usuário): "ao invés de ser
  // posicionado, é tratado como uma carta de número 15" - a carta Monstro
  // dele NUNCA usa a Zona Monstro (ver handlePlaceMonsterCard,
  // gameEngine.ts) - vai pro campo normal (principal OU horizontal) como
  // uma carta numeral comum, só que valendo 15 fixo. Se for revelada pelo
  // OPONENTE ainda na Estratégia, volta oculta pra mão (que é embaralhada) -
  // mesma reação da Rainha armadilha (ver isCoringaRawTrapCard/
  // resolveCoringaFieldTraps, gameEngine.ts).
  coringa: {
    name: 'Carta Coringa',
    description: 'Tratada como uma carta de número 15 - posicione normalmente no campo',
    detailedDescription: 'Não usa a Zona Monstro - é posicionada no campo (principal ou horizontal) como uma carta numeral comum, valendo 15 fixo no combate. Se for revelada pelo oponente ainda na Estratégia, volta oculta pra sua mão, que é embaralhada.',
  },
  // Piromante (personagem novo) - efeito mais simples dos 6: soma um valor
  // fixo direto na Bola de Fogo, sem exigir nenhum alvo (ativa direto, igual
  // à Recarga Rápida do Mosqueteiro - a Proteção Divina do Anjo, diferente
  // dessas duas, pede a escolha de um slot).
  piromante: {
    name: 'Brasa',
    description: 'Adiciona 5 à sua Bola de Fogo',
    detailedDescription: 'Ativa direto (sem escolher alvo) e adiciona 5 à sua Bola de Fogo, até o teto atual.',
  },
  // Druida (personagem novo) - mesmo padrão do Coringa acima: NUNCA usa a
  // Zona Monstro (ver handlePlaceMonsterCard, gameEngine.ts) - vai pro campo
  // normal como uma carta numeral comum, valendo o valor ATUAL do Broto no
  // instante em que é jogada (travado, não sincroniza depois). Só pode ser
  // jogada com um Broto ativo em algum slot do próprio campo.
  druida: {
    name: 'Broto Espelhado',
    description: 'Tratada como uma carta numeral valendo o mesmo valor que o Broto',
    detailedDescription:
      'Não usa a Zona Monstro - é posicionada no campo como uma carta numeral comum, valendo o mesmo valor do Broto no instante em que é jogada (travado - não muda se o Broto continuar crescendo depois). Só pode ser jogada com um Broto ativo em algum slot do seu campo.',
  },
};

/** Retorna as informações do efeito de Monstro de um personagem */
export function getMonsterEffect(character: MonsterCharacter): MonsterEffect {
  return MONSTER_EFFECTS[character];
}
