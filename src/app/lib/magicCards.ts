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

/** Tipos de Cartas Mágicas disponíveis (J = Valete, Q = Rainha, K = Rei) */
export type MagicCardType = 'J' | 'Q' | 'K';

/** Personagens jogáveis. EXTENSÃO: adicione novos personagens aqui */
export type Character = 'mago' | 'besta' | 'anjo' | 'mosqueteiro' | 'coringa';

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
      phase: 'draw',
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
  const info = getMagicCardInfo(character, cardValue);
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
  // gameEngine.ts) e nunca chegam a esta função na prática (interceptadas
  // antes, em PlayerZone.tsx). O único caso em que uma delas ainda conta
  // como magia de verdade é depois de transformada pela Mão de Ferro (Magia
  // Numeral 7,7,7) - aí ela já nem passa mais no filtro de "é uma carta de
  // magia" (ver `isMagic`/`coringaTransformedToNumeral`, PlayerZone.tsx).

  // Sem condições especiais além da fase (Mago J, Anjo K)
  return true;
}
