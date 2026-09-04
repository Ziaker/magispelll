/**
 * magicCards.ts - Sistema de Cartas Mágicas (J, Q, K)
 *
 * As Cartas Mágicas (Valete, Rainha, Rei) possuem efeitos únicos que variam
 * por personagem e fase do jogo. Diferente das cartas numerais e do Ás, uma
 * carta mágica NUNCA é posicionada no campo como carta comum - ela só sai da
 * mão do jogador através da ativação do seu efeito (é descartada em seguida).
 *
 * MECÂNICA:
 * - Cada personagem tem 3 magias diferentes (J, Q, K)
 * - Cada magia só pode ser ativada em uma fase específica
 * - Valete (J): Geralmente na fase de COMPRA
 * - Rainha (Q): Geralmente na fase de ESTRATÉGIA
 * - Rei (K): Geralmente na fase de COMBATE (exceto Anjo, que é ESTRATÉGIA)
 * - Ao usar, a carta é descartada e o efeito é aplicado imediatamente
 *
 * DESIGN DOS PERSONAGENS:
 * - MAGO: Informação e controle (revelar, substituir, destruir)
 * - BESTA: Agressão e recuperação (reciclar descarte, trocar, roubar)
 * - ANJO: Crescimento e suporte (comprar mais, revelar, empilhar)
 *
 * EXTENSÃO: Para adicionar novo personagem, adicione entrada em MAGIC_CARDS
 */

import type { CharacterId } from './gameEngine';

/** Tipos de Cartas Mágicas disponíveis (J = Valete, Q = Rainha, K = Rei) */
export type MagicCardType = 'J' | 'Q' | 'K';

/**
 * Personagens jogáveis. FIX (endurecimento, ver comentário completo em
 * characterThemes.ts): alias do `CharacterId` canônico (gameEngine.ts), não
 * mais uma union redeclarada - `import type` não cria ciclo de runtime
 * mesmo com gameEngine.ts importando `canActivateMagic` deste arquivo.
 */
export type Character = CharacterId;

/** Fases do turno. IMPORTANTE: a ordem é fixa: draw → strategy → combat */
export type Phase = 'draw' | 'strategy' | 'combat';

/** Estrutura de informações de uma Carta Mágica */
interface MagicCardInfo {
  name: string;
  phase: Phase;
  description: string;
}

/**
 * Definição de todas as Cartas Mágicas do jogo, organizada por Personagem → Tipo → Info.
 *
 * EXTENSÃO: Para novo personagem, copie a estrutura e ajuste os efeitos:
 * novoPersonagem: {
 *   J: { name: '...', phase: 'draw', description: '...' },
 *   Q: { name: '...', phase: 'strategy', description: '...' },
 *   K: { name: '...', phase: 'combat', description: '...' },
 * }
 */
export const MAGIC_CARDS: Record<Character, Record<MagicCardType, MagicCardInfo>> = {
  mago: {
    J: {
      name: 'Valete - Revelação Forçada',
      phase: 'strategy',
      description: 'Escolha uma carta não-revelada da mão do oponente e a revele. Se todas já estão reveladas, descarte uma ao invés.',
    },
    Q: {
      name: 'Rainha - Substituição Arcana',
      phase: 'strategy',
      description: 'Substitua uma carta no campo (seu ou do oponente se revelada) por uma carta numeral (2-10) da mão (sua ou do oponente, também se revelada). Ela ficará revelada. A carta removida do campo volta para a mão de quem a possuía.',
    },
    K: {
      name: 'Rei - Destruição de Reforço',
      phase: 'combat',
      description: 'Envie uma carta horizontal (que ainda não batalhou) do campo do oponente para o descarte.',
    },
  },

  besta: {
    J: {
      name: 'Valete - Recuperação Selvagem',
      phase: 'draw',
      description: 'Pegue até 2 cartas da pilha de descarte ao invés de comprar do baralho (respeitando seu limite de mão). Elas ficam reveladas.',
    },
    Q: {
      name: 'Rainha - Troca Predatória',
      phase: 'strategy',
      description: 'Troque uma carta do seu campo (virada ou revelada), ou uma carta já revelada do campo do oponente, por uma carta do descarte. A carta trocada vai para o descarte; a nova fica revelada.',
    },
    K: {
      name: 'Rei - Roubo Brutal',
      phase: 'combat',
      description: 'Troque uma carta do seu campo (ainda não revelada) por uma do oponente (também ainda não revelada). Ambas mantêm-se face down.',
    },
  },

  anjo: {
    J: {
      name: 'Valete - Benção Divina',
      phase: 'draw',
      description: 'Compre um Ás. Busca um Ás no baralho (reembaralhando o descarte de volta se nenhum estiver disponível no momento) e coloca ele direto na sua mão.',
    },
    Q: {
      name: 'Rainha - Visão Celestial',
      phase: 'strategy',
      description: 'Revele uma carta do campo do oponente ou da sua mão. A carta revelada não pode ser descartada.',
    },
    K: {
      name: 'Rei - Reforço Angelical',
      phase: 'strategy',
      description: 'Permite adicionar uma carta horizontal extra no seu campo até o fim do turno (efeito cumulativo - ativar de novo com outro Rei permite mais uma).',
    },
  },

  mosqueteiro: {
    J: {
      name: 'Valete - Tiro de Cobertura',
      phase: 'strategy',
      description: 'Descarte 1 carta da mão (sua, ou do oponente às cegas por posição se "Recarga Rápida" estiver ativa) para poder posicionar uma carta horizontal extra no seu campo neste turno.',
    },
    Q: {
      name: 'Rainha - Rajada Reveladora',
      phase: 'strategy',
      description: 'Descarte até 3 cartas da mão (suas, ou do oponente às cegas por posição se "Recarga Rápida" estiver ativa) e revele essa mesma quantidade de cartas ocultas do oponente (mão ou campo, escolhidas às cegas por posição).',
    },
    K: {
      name: 'Rei - Tiro Certeiro',
      phase: 'combat',
      description: 'Uma carta sua no campo (revelada ou não) recebe +1 de valor para cada carta que suas magias descartaram neste turno e no anterior.',
    },
  },

  // Coringa (redesenho completo, pedido do usuário): diferente de todos os
  // outros personagens, estas 3 cartas nunca são "ativadas" - elas são
  // POSICIONADAS diretamente no campo, como armadilhas escondidas entre suas
  // cartas normais, e reagem sozinhas quando reveladas (ver
  // isCoringaRawTrapCard/resolveCoringaFieldTraps/handleResolveCombat,
  // gameEngine.ts). `phase` aqui vira só a fase em que cada uma pode ser
  // POSICIONADA (sempre Estratégia, igual a qualquer carta de campo comum),
  // não mais "quando pode ser ativada".
  coringa: {
    J: {
      name: 'Valete - Isca de Fumaça',
      phase: 'strategy',
      description:
        'Pode ser posicionado como carta HORIZONTAL sobre uma carta sua (vale 1 enquanto estiver assim). Se for revelado pelo OPONENTE ainda na Estratégia, se dissipa em fumaça (descartado) e você compra 1 carta. Revelado normalmente no Combate, luta valendo 1.',
    },
    Q: {
      name: 'Rainha - Disfarce Duplo',
      phase: 'strategy',
      description:
        'Pode ser posicionado como carta PRINCIPAL normal. Se for revelada pelo OPONENTE ainda na Estratégia, volta oculta pra sua mão (que é embaralhada). Revelada no Combate, você escolhe uma carta já revelada do campo do oponente - ela copia o valor dessa carta nesta disputa.',
    },
    K: {
      name: 'Rei - Explosão de Fumaça',
      phase: 'strategy',
      description:
        'Pode ser posicionado como carta PRINCIPAL normal. Se for revelado pelo OPONENTE ainda na Estratégia, explode em fumaça e nuvens (descartado) e você compra um Ás. Revelado no Combate, explode: a disputa vira empate e a carta do oponente volta pra mão dele (no Modo Towers, só o topo da torre dele é removido).',
    },
  },

  // Piromante (personagem novo, "momento game design" - mecânica própria: a
  // Bola de Fogo, um combustível visível no campo do próprio jogador, ver
  // PlayerState.fireballValue/FIREBALL_CAP em gameEngine.ts). As 3 magias
  // (J/Q/K) SEMPRE oferecem uma escolha na hora de ativar: o efeito próprio
  // listado abaixo (que ALIMENTA a Bola de Fogo) OU LANÇAR a Bola de Fogo já
  // acumulada contra um slot do oponente (reduz o valor total dali pelo
  // valor da Bola de Fogo; se a Bola for maior ou igual, oblitera o slot
  // inteiro; se for menor, o slot vira uma única carta-token com o valor
  // restante - ver executeFireballLaunch em gameEngine.ts). Essa escolha é
  // do jogador a cada ativação (ver `selectedFireballLaunch` no diálogo de
  // magia, GameBoard.tsx), nunca automática.
  piromante: {
    J: {
      name: 'Valete - Combustão',
      phase: 'draw',
      description:
        'Todas as suas cartas de valor menor que 5 (2, 3 ou 4) na mão se juntam e viram combustível: a SOMA delas é adicionada à sua Bola de Fogo (até o teto) e essas cartas são descartadas. OU: lance a Bola de Fogo já acumulada contra um slot do oponente.',
    },
    Q: {
      name: 'Rainha - Roubo Flamejante',
      phase: 'draw',
      description:
        'Escolha uma carta revelada do oponente (na mão ou no campo, valor de 2 a 10) - ela é queimada (vai pro descarte) e seu valor é adicionado à sua Bola de Fogo (até o teto). OU: lance a Bola de Fogo já acumulada contra um slot do oponente.',
    },
    K: {
      name: 'Rei - Queima do Reforço',
      phase: 'combat',
      description:
        'Queime uma carta horizontal do campo do oponente (vai pro descarte) - seu valor é adicionado à sua Bola de Fogo (até o teto). OU: lance a Bola de Fogo já acumulada contra um slot do oponente.',
    },
  },

  // Druida (personagem novo, "crescimento e simbiose") - mecânica própria: o
  // Broto, uma carta que cresce a cada troca de turno e é compartilhada por
  // Simbiose/Urtiga (reduzem o Broto pela metade para criar um marcador de
  // combate) - ver FieldSlot.brotoReserve/isBrotoSlot em gameEngine.ts. O
  // Valete NUNCA "ativa" como as outras magias - é posicionado no campo
  // (plantado/empilhado, ver handlePlayCard), por isso `canActivateMagic`
  // sempre recusa ativá-lo como magia (mesmo padrão do Coringa, mas só pro
  // Valete - Rainha/Rei do Druida são magias de verdade).
  druida: {
    J: {
      name: 'Valete - Broto',
      phase: 'strategy',
      description:
        'Posicione no campo virado para cima, valendo 1. A cada troca de fase, seu valor cresce. Outro Valete pode ser plantado em cima do mesmo Broto para empilhar (aumenta o valor e a taxa de crescimento). Não recebe cartas horizontais e só é removido se PERDER uma disputa de combate (ou por efeito) - vencer ou empatar mantém o Broto em campo, e ele nunca é descartado só por passar o turno.',
    },
    Q: {
      name: 'Rainha - Simbiose',
      phase: 'strategy',
      description:
        'Reduza o Broto pela metade para adicionar um marcador de combate (vale a metade reduzida) numa carta sua no campo. OU: aumente o Broto em 2. Também pode ser POSICIONADA no campo em vez de ativada, plantando ou empilhando o Broto exatamente como um Valete.',
    },
    K: {
      name: 'Rei - Urtiga',
      phase: 'combat',
      description:
        'Reduza o Broto pela metade para adicionar um marcador de combate NEGATIVO numa carta do oponente (vale a metade reduzida). OU: aumente o Broto em 2. Também pode ser POSICIONADO no campo em vez de ativado, plantando ou empilhando o Broto exatamente como um Valete.',
    },
  },
};

/** Retorna as informações de uma Carta Mágica específica */
export function getMagicCardInfo(character: Character, cardValue: MagicCardType): MagicCardInfo {
  return MAGIC_CARDS[character][cardValue];
}

/**
 * Dados adicionais do estado do jogo necessários para validar se uma magia pode
 * ser ativada agora. Todos são calculados a partir do GameState no momento da
 * checagem (ver gameEngine.ts) - tanto para habilitar/desabilitar botões na
 * interface quanto para validar de novo, de forma independente, no momento em
 * que a ação é efetivamente executada (nunca confiar apenas na UI).
 */
export interface MagicActivationContext {
  discardPileLength?: number;
  /**
   * FIX (pedido do usuário): quantas cartas numerais "puras" (2-10, sem
   * contar o Ás) existem na pilha de descarte agora - usado só para a Besta
   * J (Recuperação Selvagem), que só pode pegar esse tipo de carta de volta
   * (nunca magias, Monstro, ou Ás). Antes essa checagem usava
   * `discardPileLength` (contagem de QUALQUER carta), então o botão ficava
   * habilitado mesmo quando o descarte só tinha cartas que na prática não
   * podiam ser recuperadas.
   */
  eligibleDiscardForBestaJ?: number;
  hasCardsInOwnField?: boolean;
  hasCardsInField?: boolean;
  hasRevealedCardsInOpponentField?: boolean;
  /**
   * FIX (auditoria completa do Mago - bug real encontrado): diferente de
   * `hasRevealedCardsInOpponentField` (que ignora Proteção Divina),
   * necessário pro gate da Substituição Arcana (Rainha) do Mago - ela só
   * pode mirar um slot do oponente que esteja REVELADO *e* não protegido
   * (ver handleExecuteMagic em gameEngine.ts). Sem isso, o botão da Rainha
   * podia aparecer habilitado (via `hasCardsInField`, que não distingue
   * campo próprio vazio de campo do oponente ainda oculto) numa partida sem
   * nenhum alvo de verdade - nem o próprio campo (vazio) nem o do oponente
   * (oculto ou protegido).
   */
  hasRevealedUnprotectedCardInOpponentField?: boolean;
  hasUnbattledHorizontalCardsInOpponentField?: boolean;
  /**
   * Anjo (Rainha - Visão Celestial): valores de magia (J/Q/K) pra quem TODA
   * carta da mão daquele valor está `magicLocked` (ver Card em cardUtils.ts)
   * agora - nenhuma carta alternativa não-trancada sobra pra ativar. Guarda
   * genérica em `canActivateMagic` (vale pra qualquer personagem, já que
   * qualquer um pode ser alvo da Rainha do Anjo), evitando que a IA proponha
   * repetidamente uma ativação que `handleExecuteMagic` sempre rejeita
   * (mesma classe de bug "ação silenciosamente recusada em loop" já corrigida
   * várias vezes neste arquivo).
   */
  lockedMagicValues?: MagicCardType[];
  handSize?: number;
  handLimit?: number;
  hasNumeralCardsInHand?: boolean;
  /**
   * FIX (pedido do usuário): a Substituição Arcana do Mago (Q) agora também
   * aceita uma carta numeral já revelada da mão do OPONENTE como a carta
   * usada na troca (antes só aceitava cartas da própria mão - ver
   * handleExecuteMagic em gameEngine.ts). Sem este campo, a magia continuava
   * bloqueada (botão desabilitado) sempre que o jogador não tivesse nenhuma
   * carta numeral própria na mão, mesmo quando o oponente tinha uma revelada
   * disponível para usar.
   */
  hasRevealedNumeralCardsInOpponentHand?: boolean;
  hasUnrevealedCardInOwnField?: boolean;
  hasUnrevealedCardInOpponentField?: boolean;
  /**
   * FIX (pedido do usuário: "mude o efeito da valete do anjo para 'compre um
   * Ás'") - true quando existe pelo menos um Ás ainda alcançável (no baralho
   * ou na pilha de descarte, que é reembaralhada de volta se precisar) -
   * usado pelo gate da Benção Divina (Valete) do Anjo, que agora busca um Ás
   * específico em vez de comprar cartas aleatórias. Um Ás já em alguma mão,
   * campo ou zona de Monstro não conta (não está mais disponível pra buscar).
   */
  hasAceAvailableToDraw?: boolean;
  /**
   * Mosqueteiro (personagem novo, foco em descarte) - Valete/Rainha
   * descartam carta(s) extra(s) além da própria magia. Normalmente da MÃO
   * PRÓPRIA (`hasOwnHandCardBeyondSelf`), mas quando o Monstro (Recarga
   * Rápida) redireciona o próximo descarte, a fonte passa a ser a mão do
   * OPONENTE (`hasOpponentHandCards`) - ver mosqueteiroRedirectNextDiscard
   * em gameEngine.ts.
   */
  mosqueteiroRedirectActive?: boolean;
  hasOwnHandCardBeyondSelf?: boolean;
  hasOpponentHandCards?: boolean;
  /** Rainha do Mosqueteiro: precisa de ao menos 1 carta ainda oculta do oponente (mão ou campo) pra revelar. */
  hasRevealableOpponentCards?: boolean;
  /**
   * Piromante (personagem novo) - as 3 magias (J/Q/K) sempre têm DUAS formas
   * de ativar (efeito próprio de alimentar a Bola de Fogo, OU lançá-la já
   * acumulada) - o botão fica habilitado se QUALQUER uma das duas for
   * possível agora; qual delas o jogador realmente escolhe é decidido no
   * diálogo de ativação (GameBoard.tsx), não aqui.
   */
  hasFireFuelInHand?: boolean;
  hasRevealedBurnableOpponentCard?: boolean;
  hasUnbattledHorizontalCardsInOpponentFieldForBurn?: boolean;
  /** Bola de Fogo > 0 E existe pelo menos 1 slot do oponente com alguma carta pra mirar. */
  canLaunchFireball?: boolean;
  /**
   * Druida (personagem novo) - Simbiose (Rainha) e Urtiga (Rei) só podem
   * ativar com um Broto plantado em algum slot do próprio campo - a opção
   * "aumentar o Broto em 2" já é válida sozinha assim que ele existe, sem
   * precisar de nenhum alvo escolhido ainda (a escolha entre as 2 opções
   * acontece no diálogo de ativação, não aqui - mesmo padrão do Piromante).
   */
  hasActiveBroto?: boolean;
}

/**
 * Verifica se uma Carta Mágica pode ser ativada no momento.
 *
 * VALIDAÇÕES:
 * 1. Fase atual corresponde à fase da magia
 * 2. Condições específicas da magia são atendidas (targets válidos existem)
 *
 * @returns true se pode ativar, false caso contrário
 *
 * EXTENSÃO: Para adicionar novas condições, adicione propriedade em
 * MagicActivationContext e um novo `if` específico para a magia.
 */
export function canActivateMagic(
  phase: Phase,
  character: Character,
  cardValue: MagicCardType,
  ctx: MagicActivationContext = {}
): boolean {
  // FIX (pedido do usuário: "a rainha do anjo impede a ativação de um efeito
  // caso a carta revelada por ela seja mágica até o fim do turno") - guarda
  // de topo, ANTES de qualquer branch de fase/personagem: se toda carta
  // deste valor na mão está trancada, a magia não pode ser ativada agora,
  // não importa o personagem.
  if (ctx.lockedMagicValues?.includes(cardValue)) return false;
  const info = getMagicCardInfo(character, cardValue);
  // Piromante (pedido do usuário: "os segundos efeitos de todas magias do
  // piromante (de lançar a bola de fogo) só podem ser ativados na fase de
  // combate"): o LANÇAMENTO é sempre uma jogada de Combate, nas 3 magias.
  // Como o efeito PRÓPRIO de cada uma vive em fases diferentes (J na Compra,
  // Q na Estratégia, K no Combate), cada carta ganha aqui uma janela extra no
  // Combate exclusivamente pra lançar - sem isso, "lançar" seria uma opção
  // impossível para J e Q, que nem chegam a ser ativáveis nessa fase. O
  // efeito próprio continua restrito à fase da própria carta (guardado em
  // handleExecuteMagic), e o lançamento em si é bloqueado fora do Combate
  // por executeFireballLaunch - `ctx.canLaunchFireball` já embute a fase.
  if (character === 'piromante' && phase === 'combat' && (ctx.canLaunchFireball ?? false)) return true;
  if (info.phase !== phase) return false;

  // Besta J (Recuperação Selvagem): precisa de ao menos 2 cartas NUMERAIS
  // (2-10, sem Ás) no descarte (o efeito pega até 2) e de espaço livre na mão
  // para receber pelo menos 1.
  // FIX: a checagem original usava "handSize <= 7" fixo, o que não impedia a
  // mão de ultrapassar handLimit quando ele é diferente de 8 (ex.: Anjo com
  // bônus permanente). Agora comparamos contra o handLimit real do jogador.
  // FIX (pedido do usuário): antes contava QUALQUER carta do descarte
  // (`discardPileLength`), incluindo magias, Monstro e Ás - que na prática
  // não podem ser recuperados por esta magia (ver handleExecuteMagic em
  // gameEngine.ts). Agora conta só as elegíveis de verdade.
  // FIX (pedido do usuário: "certas vezes não dá pra utilizar uma carta
  // valete da besta mesmo com espaço na mão") - `handSize` aqui é o tamanho
  // da mão ANTES de ativar, ou seja, ainda CONTANDO o próprio Valete que
  // está prestes a ser jogado. Mas handleExecuteMagic (gameEngine.ts) remove
  // o Valete da mão ANTES de calcular quantas cartas cabem de volta
  // (`handWithoutMagic`) - então, mesmo com a mão cheia (ex.: 8/8, contando o
  // próprio Valete), sempre sobra pelo menos 1 vaga de verdade assim que ele
  // é jogado. A checagem antiga (`handLimit - handSize >= 1`) não descontava
  // essa vaga que o próprio Valete abre, bloqueando o botão bem nesse caso
  // (mão cheia, mas o Valete é uma das cartas contadas) - exatamente quando
  // o jogador olha a mão e "parece" não ter espaço, mas na prática teria
  // assim que a magia fosse ativada. `- 1` no handSize corrige a conta para
  // bater com o que o motor realmente faz.
  if (character === 'besta' && cardValue === 'J') {
    const handLimit = ctx.handLimit ?? 8;
    const handSizeAfterPlayingJ = Math.max(0, (ctx.handSize ?? 0) - 1);
    return (ctx.eligibleDiscardForBestaJ ?? 0) >= 2 && handLimit - handSizeAfterPlayingJ >= 1;
  }

  // Anjo J (Benção Divina): FIX (pedido do usuário: "mude o efeito da valete
  // do anjo para 'compre um Ás'") - precisa de espaço na mão (mesmo cálculo
  // "- 1" da Besta J acima, já que o próprio Valete abre 1 vaga ao ser
  // jogado) E de um Ás ainda alcançável no baralho ou descarte.
  if (character === 'anjo' && cardValue === 'J') {
    const handLimit = ctx.handLimit ?? 8;
    const handSizeAfterPlayingJ = Math.max(0, (ctx.handSize ?? 0) - 1);
    return (ctx.hasAceAvailableToDraw ?? false) && handLimit - handSizeAfterPlayingJ >= 1;
  }

  // Anjo Q (Visão Celestial): precisa ter alvos válidos no próprio campo ou na mão
  // (a UI também permite revelar carta da mão do oponente, então isso é permissivo)
  if (character === 'anjo' && cardValue === 'Q') {
    return true;
  }

  // Besta Q (Troca Predatória): precisa de carta no descarte e um ALVO DE
  // VERDADE no campo - o próprio (qualquer slot preenchido) OU um slot do
  // oponente que esteja revelado e desprotegido (mesma regra e mesmos campos
  // de contexto já usados pela Substituição Arcana do Mago acima).
  // FIX (auditoria completa da Besta - bug real encontrado): antes usava
  // `hasCardsInField` (true se QUALQUER um dos dois campos tiver qualquer
  // carta, sem checar revelado/protegido) - exatamente a mesma brecha já
  // corrigida pra Mago Q, nunca replicada aqui.
  if (character === 'besta' && cardValue === 'Q') {
    return (ctx.discardPileLength ?? 0) >= 1 && ((ctx.hasCardsInOwnField ?? false) || (ctx.hasRevealedUnprotectedCardInOpponentField ?? false));
  }

  // Mago Q (Substituição Arcana): precisa de carta numeral disponível para
  // usar na troca (própria mão OU, agora, uma já revelada na mão do
  // oponente - ver FIX no campo `hasRevealedNumeralCardsInOpponentHand`
  // acima) e um ALVO DE VERDADE no campo - o próprio (qualquer slot
  // preenchido) OU um slot do oponente que esteja revelado e desprotegido
  // (handleExecuteMagic em gameEngine.ts nunca aceita um slot do oponente
  // ainda oculto ou protegido).
  // FIX (auditoria completa do Mago - bug real encontrado): antes usava
  // `hasCardsInField` (true se QUALQUER um dos dois campos tiver qualquer
  // carta, sem checar revelado/protegido) - o botão podia aparecer
  // habilitado com o campo próprio vazio e o do oponente ainda oculto, um
  // estado sem nenhum alvo legal de verdade.
  if (character === 'mago' && cardValue === 'Q') {
    return (
      ((ctx.hasNumeralCardsInHand ?? false) || (ctx.hasRevealedNumeralCardsInOpponentHand ?? false)) &&
      ((ctx.hasCardsInOwnField ?? false) || (ctx.hasRevealedUnprotectedCardInOpponentField ?? false))
    );
  }

  // Mago K (Destruição de Reforço): precisa de horizontal do oponente que
  // ainda não batalhou E não esteja protegido por Proteção Divina do Anjo
  // (handleExecuteMagic em gameEngine.ts rejeita um slot protegido - ver FIX
  // abaixo, mesma auditoria que corrigiu o gate da Rainha do Mago acima).
  // `hasUnbattledHorizontalCardsInOpponentField` já é filtrado por proteção
  // em getMagicActivationContext (gameEngine.ts) - único consumidor deste
  // campo, então refinar sua definição ali não afeta nenhum outro personagem.
  if (character === 'mago' && cardValue === 'K') {
    return ctx.hasUnbattledHorizontalCardsInOpponentField ?? false;
  }

  // Besta K (Roubo Brutal): precisa de carta ainda não revelada em ambos os
  // campos E o alvo do oponente não pode estar protegido (handleExecuteMagic
  // em gameEngine.ts rejeita um slot protegido - ver FIX abaixo).
  // FIX (auditoria completa da Besta - bug real encontrado): `hasUnrevealedCardInOpponentField`
  // (refinado logo abaixo em getMagicActivationContext, gameEngine.ts - único
  // consumidor deste campo) não filtrava proteção, mesma brecha já corrigida
  // pra Mago K.
  if (character === 'besta' && cardValue === 'K') {
    return (ctx.hasUnrevealedCardInOwnField ?? false) && (ctx.hasUnrevealedCardInOpponentField ?? false);
  }

  // Mosqueteiro J (Tiro de Cobertura): precisa de uma carta pra descartar
  // além da própria magia - da mão PRÓPRIA normalmente, ou da mão do
  // OPONENTE se a Recarga Rápida (Monstro) estiver ativa.
  if (character === 'mosqueteiro' && cardValue === 'J') {
    return ctx.mosqueteiroRedirectActive ? (ctx.hasOpponentHandCards ?? false) : (ctx.hasOwnHandCardBeyondSelf ?? false);
  }

  // Mosqueteiro Q (Rajada Reveladora): mesma fonte de descarte de J acima,
  // e precisa de ao menos 1 carta ainda oculta do oponente (mão ou campo)
  // pra revelar.
  if (character === 'mosqueteiro' && cardValue === 'Q') {
    const hasDiscardSource = ctx.mosqueteiroRedirectActive ? (ctx.hasOpponentHandCards ?? false) : (ctx.hasOwnHandCardBeyondSelf ?? false);
    return hasDiscardSource && (ctx.hasRevealableOpponentCards ?? false);
  }

  // Mosqueteiro K (Tiro Certeiro): precisa de uma carta no PRÓPRIO campo pra reforçar.
  if (character === 'mosqueteiro' && cardValue === 'K') {
    return ctx.hasCardsInOwnField ?? false;
  }

  // Coringa (redesenho completo, "armadilhas"): J/Q/K nunca ativam efeito
  // "na mão" - são posicionadas no campo (ver isCoringaTrapCard em
  // gameEngine.ts). O único caso em que uma delas ainda conta como magia de
  // verdade é depois de transformada pela Mão de Ferro (Magia Numeral
  // 7,7,7) - aí ela já nem passa mais no filtro de "é uma carta de magia"
  // (ver `isMagic`/`coringaTransformedToNumeral`, PlayerZone.tsx).
  //
  // FIX (bug real encontrado validando actionSpace.ts, o enumerador de
  // espaço de ações do debug mode): o comentário acima sempre disse "nunca
  // chega a esta função na prática, interceptada antes em PlayerZone.tsx" -
  // mas nada AQUI garantia isso; sem nenhum `if` pro Coringa, a execução
  // caía direto no `return true` genérico do final (linha "Sem condições
  // especiais além da fase"), já que MAGIC_CARDS.coringa existe (só pra
  // texto descritivo da Ficha de Personagem) e sua `phase` bate com a fase
  // atual como qualquer outro personagem. `checkActionDivergence`
  // (actionSpace.ts) despachou EXECUTE_MAGIC pra uma carta do Coringa direto
  // contra o motor (contornando a UI de propósito, é o que o modo exaustivo
  // faz) e confirmou: `canActivateMagic` dizia "sim, pode ativar" pra uma
  // carta que `handleExecuteMagic` não tem NENHUM branch pra tratar (nenhum
  // `if (character === 'coringa' && ...)` existe lá, só nos outros 4+1
  // personagens) - ou seja, a única coisa que impedia isso de virar uma
  // ativação "aceita pelo motor" que não faz NADA era a UI nunca oferecer
  // esse caminho pro Coringa. Exatamente a classe de bug (confiar só na UI,
  // nunca validar de novo no motor) que este projeto já corrigiu várias
  // vezes pra outros personagens - agora corrigida aqui também, com um
  // guard de verdade em vez de só um comentário.
  if (character === 'coringa') return false;

  // Piromante J (Combustão): tem cartas <5 na mão pra virar combustível, OU
  // já tem Bola de Fogo suficiente pra lançar contra algum alvo.
  if (character === 'piromante' && cardValue === 'J') {
    return (ctx.hasFireFuelInHand ?? false) || (ctx.canLaunchFireball ?? false);
  }

  // Piromante Q (Roubo Flamejante): tem carta revelada do oponente pra
  // queimar, OU pode lançar a Bola de Fogo já acumulada.
  if (character === 'piromante' && cardValue === 'Q') {
    return (ctx.hasRevealedBurnableOpponentCard ?? false) || (ctx.canLaunchFireball ?? false);
  }

  // Piromante K (Queima do Reforço): tem carta horizontal do oponente pra
  // queimar, OU pode lançar a Bola de Fogo já acumulada.
  if (character === 'piromante' && cardValue === 'K') {
    return (ctx.hasUnbattledHorizontalCardsInOpponentFieldForBurn ?? false) || (ctx.canLaunchFireball ?? false);
  }

  // Druida (personagem novo) - o Valete (Broto) nunca ativa como magia, é
  // posicionado no campo (ver handlePlayCard em gameEngine.ts) - mesmo
  // espírito da recusa do Coringa acima, mas só pro Valete (Rainha/Rei são
  // magias de verdade, tratadas abaixo).
  if (character === 'druida' && cardValue === 'J') return false;

  // Druida Q (Simbiose) e K (Urtiga): as duas exigem um Broto ativo em algum
  // slot do próprio campo - a opção "aumentar em 2" já é válida sozinha
  // assim que ele existe (a escolha entre as 2 opções acontece no diálogo de
  // ativação, não aqui).
  if (character === 'druida' && (cardValue === 'Q' || cardValue === 'K')) {
    return ctx.hasActiveBroto ?? false;
  }

  // Sem condições especiais além da fase (Mago J, Anjo K)
  return true;
}
