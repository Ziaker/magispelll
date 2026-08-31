/**
 * cardUtils.ts - Utilidades e Tipos de Cartas
 *
 * Define a estrutura de dados das cartas e funções auxiliares para manipulação do baralho.
 *
 * TIPOS DE CARTAS NO MAGISPELLL:
 * - Cartas Numerais (2-10): Usadas em combate e estratégia
 * - Ás (A): Pode ser transformado em qualquer número 2-10
 * - Magias (J, Q, K): Cartas especiais com efeitos únicos por personagem, ativadas
 *   diretamente da mão (não podem ser posicionadas no campo como carta comum)
 * - Monstro (JOKER): Coringas com efeito especial por personagem
 *
 * EXTENSÃO:
 * - Para adicionar novos tipos de carta, adicione propriedades ao tipo Card
 * - Para novos efeitos, adicione flags booleanas (ex: isMonster)
 */

/**
 * Estrutura de dados de uma carta no jogo
 *
 * PROPRIEDADES PRINCIPAIS:
 * @property id - Identificador único da carta (usado em listas React e para localizá-la no estado)
 * @property value - Valor da carta ('A', '2'-'10', 'J', 'Q', 'K', 'JOKER')
 * @property suit - Naipe da carta ('♠', '♥', '♦', '♣', '🃏')
 *
 * PROPRIEDADES DE ESTADO (OPCIONAIS):
 * @property revealed - Carta revelada por magia (não pode ser descartada na fase de compra)
 * @property transformedValue - Valor transformado do Ás (2-10)
 * @property isMonster - Identifica cartas Monstro (Coringas)
 * @property monsterUsed - Se o efeito do Monstro já foi usado NESTE TURNO (reseta a cada novo turno - ver gameEngine.ts, resolveMonsterCardAtTurnEnd)
 * @property monsterUseCount - Quantas vezes o efeito do Monstro já foi ativado NO TOTAL (soma entre turnos, nunca reseta) - a carta só se descarta de vez depois do 3º uso (ver MAX_MONSTER_USES em gameEngine.ts)
 * @property battled - Se a carta horizontal já batalhou neste turno
 * @property fused - Se esta carta nasceu da variante "Fusão" (soma de 2 cartas numerais - ver fusion.ts). Puramente informativo (palavra-chave visual, ver keywords.ts) - não muda nenhuma regra de combate/ativação.
 * @property fusionSources - Só presente em carta fundida (fused): as cartas ORIGINAIS (nunca fundidas) que foram consumidas para criá-la, já achatadas (uma fusão de uma carta já fundida guarda as folhas originais dela, não a carta intermediária) - usado para "desfazer" a fusão quando ela vai para o descarte (ver expandFusedCard) e manter a composição real do baralho, em vez de a carta fundida virar uma magia "fantasma" extra que nunca existiu no baralho original.
 * @property coringaTransformedToNumeral - Coringa (redesenho completo, pedido do usuário) - Magia Numeral "Mão de Ferro" (7,7,7): permanentemente `true` numa carta de magia (J/Q/K) que o jogador transformou em carta de número 11/12/13 apertando o botão liberado pela janela de 1 turno do efeito (ver `transformedValue`, reutilizado aqui: 11/12/13). Uma vez marcada, a carta LARGA de vez seu comportamento de armadilha (nunca mais dispara os efeitos de revelação na Estratégia/Combate descritos em cardUtils.ts/gameEngine.ts) e passa a se comportar como uma carta de campo comum, permanentemente - ver isCoringaRawTrapCard.
 * @property isFireToken - Piromante (personagem novo) - `true` numa carta-TOKEN criada quando a Bola de Fogo reduz (sem obliterar) o valor de um slot do oponente: uma carta sintética, `value: 'FIRE'`/`transformedValue` = valor restante depois da redução, que representa as brasas/cinzas do que sobrou. Diferente de QUALQUER outra carta do jogo, uma carta-token NUNCA existiu no baralho original de 54 cartas - ela é criada do nada no momento do lançamento e, se algum dia sair do campo (ex.: perde uma disputa de combate), simplesmente desaparece em vez de ir para a pilha de descarte (ver pushToDiscard/executeFireballLaunch em gameEngine.ts) - por isso nunca conta na conservação total de cartas do jogo.
 *
 * EXTENSÃO: Adicione novas propriedades para novos efeitos ou mecânicas
 */
export type Card = {
  id: string;
  value: string;
  suit: string;
  revealed?: boolean;
  transformedValue?: number;
  isMonster?: boolean;
  monsterUsed?: boolean;
  monsterUseCount?: number;
  battled?: boolean;
  fused?: boolean;
  fusionSources?: Card[];
  coringaTransformedToNumeral?: boolean;
  isFireToken?: boolean;
};

/** Naipes do baralho francês padrão */
const SUITS = ['♠', '♥', '♦', '♣'];

/** Valores das cartas em ordem crescente (A = Ás, J = Valete, Q = Rainha, K = Rei) */
const VALUES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

/**
 * Embaralha um array usando o algoritmo Fisher-Yates (não modifica o original).
 * Centralizado aqui para que qualquer reembaralhamento (baralho inicial, reciclagem
 * do descarte) use exatamente o mesmo algoritmo com distribuição uniforme.
 */
export function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Gera um baralho completo e embaralhado.
 *
 * ESTRUTURA DO BARALHO:
 * - 52 cartas padrão (4 naipes × 13 valores)
 * - 2 Monstros (Coringas) opcionais
 * - Total: 54 cartas (com Monstros) ou 52 cartas (sem Monstros)
 *
 * FIX (pedido do usuário: "implemente o baralho de 62 cartas") - o baralho
 * Temático (`thematic: true`) soma 8 cartas extras ao baralho de 54 (52 +
 * os 2 Monstros "base"): 2 Valetes, 2 Rainhas e 2 Reis a mais (sempre
 * presentes, não dependem de `includeMonsters`), e mais até 4 Monstros a
 * mais quando `includeMonsters` está ligado.
 *
 * FIX (pedido do usuário: "a opção de desligar a carta monstro não funciona,
 * a carta ainda surge no modo sem ela") - uma versão anterior mantinha 2
 * Monstros "fixos" no baralho Temático mesmo com `includeMonsters`
 * desligado (só os outros 2 viravam Ases), então desligar a opção nunca
 * removia TODOS os Coringas do jogo, contradizendo a promessa do próprio
 * switch. Agora, com `includeMonsters` desligado, TODOS os 4 Monstros
 * possíveis do baralho Temático (não só 2) viram Ases extras - a opção
 * passa a significar "zero Coringas em jogo, ponto final", igual ao
 * baralho Comum, mantendo o total em 62 cartas de qualquer forma.
 *
 * @param includeMonsters - Se o baralho inclui cartas Monstro (2 no Comum, 4 no Temático) - desligado, zero Coringas entram no baralho (viram Ases extras no Temático, pra manter o total em 62).
 * @param thematic - Se deve gerar o baralho Temático (62 cartas) em vez do baralho Comum (52/54 cartas)
 * @param towersMode - Modo Towers (pedido do usuário): soma +20 numerais (2-10) e +2 Áses extras ao baralho, independente do tipo (Comum ou Temático) - mais matéria-prima pra formar torres sem esgotar o baralho rápido demais.
 * @returns Array de cartas embaralhadas, cada uma com id único
 */
export function generateDeck(includeMonsters: boolean = true, thematic: boolean = false, towersMode: boolean = false): Card[] {
  const deck: Card[] = [];
  let id = 0;

  for (const suit of SUITS) {
    for (const value of VALUES) {
      deck.push({ id: `card-${id++}`, value, suit });
    }
  }

  if (thematic) {
    const extraSuits = SUITS.slice(0, 2); // 2 naipes bastam pra 2 cópias extras de cada valor
    for (const suit of extraSuits) {
      for (const value of ['J', 'Q', 'K']) {
        deck.push({ id: `card-${id++}`, value, suit });
      }
    }
    // FIX: os 4 Monstros do baralho Temático agora dependem TODOS de
    // `includeMonsters` - desligado, os 4 viram Ases extras (nunca só 2),
    // pra a opção realmente significar "sem Coringas nesta partida".
    if (includeMonsters) {
      deck.push({ id: `card-${id++}`, value: 'JOKER', suit: '🃏', isMonster: true, monsterUsed: false });
      deck.push({ id: `card-${id++}`, value: 'JOKER', suit: '🃏', isMonster: true, monsterUsed: false });
      deck.push({ id: `card-${id++}`, value: 'JOKER', suit: '🃏', isMonster: true, monsterUsed: false });
      deck.push({ id: `card-${id++}`, value: 'JOKER', suit: '🃏', isMonster: true, monsterUsed: false });
    } else {
      deck.push({ id: `card-${id++}`, value: 'A', suit: extraSuits[0] });
      deck.push({ id: `card-${id++}`, value: 'A', suit: extraSuits[1] });
      deck.push({ id: `card-${id++}`, value: 'A', suit: extraSuits[0] });
      deck.push({ id: `card-${id++}`, value: 'A', suit: extraSuits[1] });
    }
    if (towersMode) id = addTowersExtraCards(deck, id);
    return shuffle(deck);
  }

  if (includeMonsters) {
    deck.push({ id: `card-${id++}`, value: 'JOKER', suit: '🃏', isMonster: true, monsterUsed: false });
    deck.push({ id: `card-${id++}`, value: 'JOKER', suit: '🃏', isMonster: true, monsterUsed: false });
  }

  if (towersMode) id = addTowersExtraCards(deck, id);
  return shuffle(deck);
}

/**
 * Modo Towers (pedido do usuário): soma +20 numerais (2-10) e +2 Áses extras
 * DIRETO no array `deck` passado (mutação intencional - só usado logo antes
 * do embaralhamento final em generateDeck, nunca em cima de um baralho já em
 * jogo). Distribuição das 20 cartas: um ciclo round-robin pelos 9 valores
 * numerais (2 a 10) - com 20 não dividindo perfeitamente por 9, os 2
 * primeiros valores do ciclo (2 e 3) acabam com 1 cópia extra a mais que o
 * resto (3 no total de extras, contra 2 dos demais) - uma escolha arbitrária
 * sem significado especial, só para fechar a conta em exatamente 20.
 * @returns o próximo `id` livre, pra quem chamar continuar de onde parou.
 */
function addTowersExtraCards(deck: Card[], startId: number): number {
  const numeralValues = ['2', '3', '4', '5', '6', '7', '8', '9', '10'];
  let id = startId;
  for (let i = 0; i < 20; i++) {
    deck.push({ id: `card-${id++}`, value: numeralValues[i % numeralValues.length], suit: SUITS[i % SUITS.length] });
  }
  for (let i = 0; i < 2; i++) {
    deck.push({ id: `card-${id++}`, value: 'A', suit: SUITS[i % SUITS.length] });
  }
  return id;
}

/**
 * Compra cartas do topo do baralho. Não modifica o array original (imutável).
 *
 * @param deck - Baralho atual
 * @param count - Quantidade de cartas a comprar
 * @returns Objeto com cartas compradas e baralho restante
 */
export function drawCards(deck: Card[], count: number): { drawn: Card[]; remaining: Card[] } {
  const safeCount = Math.max(0, Math.min(count, deck.length));
  return { drawn: deck.slice(0, safeCount), remaining: deck.slice(safeCount) };
}

/**
 * Converte o valor "de face" da carta para o número usado em combate.
 * IMPORTANTE: não considera transformedValue - use getEffectiveCardValue para isso.
 *
 * VALORES: Ás=14, Rei=13, Rainha=12, Valete=11, 2-10=valor nominal, Monstro=0.
 */
export function getCardNumericValue(value: string): number {
  if (value === 'A') return 14;
  if (value === 'K') return 13;
  if (value === 'Q') return 12;
  if (value === 'J') return 11;
  if (value === 'JOKER') return 0;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Valor "efetivo" de uma carta para qualquer cálculo de jogo (combate, magias,
 * magia numeral): usa transformedValue quando presente (Ás transformado),
 * senão cai para o valor de face padrão.
 *
 * Centralizar essa regra aqui evita o bug de código anterior em que alguns
 * pontos do jogo comparavam apenas getCardNumericValue() e ignoravam um Ás
 * já transformado (por exemplo, ao decidir se uma carta da mão conta como
 * "carta numeral" para a magia Substituição Arcana do Mago).
 */
export function getEffectiveCardValue(card: Card): number {
  if (card.transformedValue !== undefined && card.transformedValue !== null) {
    return card.transformedValue;
  }
  return getCardNumericValue(card.value);
}

/**
 * Valor "de exibição" de uma carta: mostra o transformedValue quando
 * presente (ex.: um Ás transformado em 7 mostra "7", uma carta numeral
 * reforçada pela Ilusão Arcana do Mago mostra o valor copiado), senão
 * mostra o `value` de face padrão ("A", "5", "K"...).
 *
 * FIX (pedido do usuário): várias telas mostravam sempre `card.value` cru
 * (ex.: "A") mesmo para uma carta já transformada e revelada, ignorando
 * `transformedValue` - diferente de `getEffectiveCardValue`, que SEMPRE
 * retorna um número (inclusive 14 para um Ás NÃO transformado), este
 * helper preserva a apresentação original quando não há transformação.
 * Centralizado aqui para todos os pontos da interface (PlayingCard,
 * BattleField, diálogos de seleção) usarem a mesma regra.
 */
export function getDisplayValue(card: Card): string {
  if (card.transformedValue !== undefined && card.transformedValue !== null) {
    return card.transformedValue.toString();
  }
  return card.value;
}

/** Mesma ideia de getDisplayValue, para o naipe - sempre o naipe verdadeiro da carta (sem nenhuma ilusão hoje em dia). */
export function getDisplaySuit(card: Card): string {
  return card.suit;
}

/** Verdadeiro se o valor efetivo da carta está entre 2 e 10 (considera Ás transformado). */
export function isNumeralCard(card: Card): boolean {
  const value = getEffectiveCardValue(card);
  return value >= 2 && value <= 10;
}

/**
 * Uma carta numeral "pura" (2 a 10) - DIFERENTE de isNumeralCard, que conta
 * um Ás transformado (valor efetivo 2-10 via transformedValue) como se fosse
 * numeral. Aqui um Ás NUNCA conta, transformado ou não (`value` continua
 * sendo 'A'). Usado onde a regra explicitamente exclui o Ás - ex.: o que a
 * Recuperação Selvagem da Besta pode pegar de volta da pilha de descarte
 * (FIX pedido do usuário: só números 2-10, "Ás não incluído").
 */
export function isPlainNumeralCard(card: Card): boolean {
  return card.value !== 'A' && isNumeralCard(card);
}

/**
 * Verdadeiro se `card` é do tipo elegível para ocupar um slot de combate
 * normal do campo (Ás ainda não transformado, OU 2-10 já numeral/Ás
 * transformado) - nunca J/Q/K (só ativam magia) nem Monstro (só vai pra
 * zona própria). Extraída aqui (checagem extensa por bugs, sweep de
 * consolidação de regras duplicadas) - antes só existia como uma cópia local
 * em aiPlayer.ts (`isFieldEligible`), enquanto handlePlayCard/
 * handleSwapFieldCard em gameEngine.ts reimplementavam a MESMA regra na
 * forma inversa (excluindo J/Q/K e Monstro em vez de listar quem é aceito) -
 * hoje equivalentes por coincidência (os únicos tipos de carta são A/2-10/
 * J/Q/K/Coringa), mas duas fontes de verdade independentes para a mesma
 * regra, exatamente a classe de risco que motivou consolidar as outras
 * (isValidAceTransformTarget, canFuseCards, etc.) - a auditoria também achou
 * um bug real de divergência concreta: handleSwapFieldCard tinha o check de
 * J/Q/K mas ESQUECIA o de Monstro (handlePlayCard tinha os dois), então
 * trocar a carta de um slot por um Coringa da mão era aceito silenciosamente
 * pelo motor, colocando o Monstro direto num slot de combate normal - o
 * exato bug que o item 4 original já tinha corrigido para PLAY_CARD, mas que
 * reapareceu neste caminho irmão.
 */
export function isFieldEligible(card: Card): boolean {
  return (card.value === 'A' && card.transformedValue === undefined) || isNumeralCard(card);
}

/**
 * Verdadeiro se `card` pode servir de REFERÊNCIA (valor a copiar) para
 * transformar um Ás - a mesma regra que handleTransformAce (gameEngine.ts)
 * usa pra aceitar/rejeitar `targetCardId`, extraída aqui pra ser a ÚNICA
 * fonte da verdade (checagem extensa por bugs, pedido do usuário: "consolide
 * as regras duplicadas... um único lugar"). Antes desta extração, o motor
 * tinha sua própria checagem inline e aiPlayer.ts (decideAceTransform)
 * filtrava candidatos com uma lógica PRÓPRIA e mais frouxa (só excluía Ás
 * cru, nunca J/Q/K/Monstro) - por acidente nunca divergia na prática (nenhum
 * valor efetivo de J/Q/K/Monstro bate com os números exigidos pelas Magias
 * Numerais atuais: 3, 6 ou 9), mas era uma coincidência do conjunto atual de
 * números, não uma garantia estrutural - a próxima Magia Numeral ou
 * personagem novo com um número exigido de 11, 12 ou 13 quebraria isso em
 * silêncio. Um Ás CRU (sem `transformedValue`) nunca serve de referência
 * (não tem valor nenhum definido pra copiar); um Ás JÁ transformado serve
 * normalmente (na prática já "é" um número comum).
 */
export function isValidAceTransformTarget(card: Card): boolean {
  if (card.value === 'A' && card.transformedValue === undefined) return false;
  if (card.value === 'J' || card.value === 'Q' || card.value === 'K') return false;
  if (card.isMonster) return false;
  return true;
}

/**
 * Reseta os campos "transitórios" de uma carta que saiu de jogo (foi para o
 * descarte). Uma carta é um objeto reutilizado - a mesma carta física pode
 * voltar para o baralho (reembaralhamento) ou para uma mão (Recuperação
 * Selvagem / Troca Predatória da Besta) mais adiante na partida, então nada
 * específico de "como ela foi usada da última vez" deve sobreviver:
 *
 * - transformedValue: um Ás transformado volta a ser um Ás "puro"
 * - revealed: uma carta revelada por magia não deveria continuar bloqueada
 *   contra descarte para sempre depois de voltar ao baralho e ser comprada de novo
 * - monsterUsed: senão um Coringa usado por um jogador ficaria
 *   permanentemente travado mesmo depois de ser descartado e ir parar na mão
 *   do outro jogador (via Besta) ou ser comprado de novo
 * - battled: idem - uma carta horizontal não deveria nascer "já batalhada"
 *   na próxima vez que for jogada
 * - fused: idem - a carta resultante de uma Fusão não deveria continuar
 *   marcada como "fruto de fusão" para sempre depois de voltar ao baralho e
 *   ser comprada de novo (ela nem é mais literalmente a mesma combinação -
 *   pode até ser separada em 2 cartas diferentes num reembaralhamento)
 *
 * `id`, `value`, `suit` e `isMonster` são identidade permanente da carta e
 * nunca são alterados aqui.
 */
export function resetCardForDiscard(card: Card): Card {
  // Coringa (redesenho completo) - `coringaTransformedToNumeral` também é
  // estado TEMPORÁRIO de uma carta em jogo (igual `transformedValue` acima,
  // aliás sempre junto dele - ver comentário completo do campo em Card) -
  // uma vez descartada, a carta volta a ser uma magia comum, pronta pra
  // circular de novo (inclusive na mão do OUTRO jogador, que pode nem ser
  // Coringa) sem carregar transformação nenhuma.
  const { transformedValue, revealed, monsterUsed, battled, fused, fusionSources, coringaTransformedToNumeral, ...rest } = card;
  return {
    ...rest,
    ...(card.isMonster ? { monsterUsed: false } : {}),
  } as Card;
}

export function resetCardsForDiscard(cards: Card[]): Card[] {
  return cards.map(resetCardForDiscard);
}

/**
 * Decompõe uma carta fundida (fused) nas cartas ORIGINAIS (nunca fundidas)
 * que a compuseram (ver fusionSources em Card) - uma carta comum devolve só
 * a si mesma. Usado sempre que uma carta vai para o descarte (ver
 * pushToDiscard em gameEngine.ts): sem isso, cada fusão bem-sucedida criaria
 * uma carta nova "do nada" que passa a circular no baralho pra sempre (2
 * numerais viram, por exemplo, 1 magia extra que nunca existiu na composição
 * original), inflando a proporção de magias/Áses no baralho a cada fusão. Ao
 * invés disso, ao ser descartada, a carta fundida "desfaz" a fusão e devolve
 * as 2 (ou mais, se a carta já tivesse sido refundida antes) cartas físicas
 * originais para o descarte, mantendo a composição do baralho sempre correta.
 */
export function expandFusedCard(card: Card): Card[] {
  if (card.fused && card.fusionSources && card.fusionSources.length > 0) {
    return card.fusionSources;
  }
  return [card];
}

export function expandFusedCards(cards: Card[]): Card[] {
  return cards.flatMap(expandFusedCard);
}

/**
 * Reembaralha a pilha de descarte de volta para o baralho.
 *
 * Usado em dois cenários (ver gameEngine.ts):
 * 1. Fallback de segurança: o baralho esgotou e alguém precisa comprar -
 *    todo o descarte volta, sempre, independente de configuração, para o
 *    jogo nunca travar sem cartas para comprar.
 * 2. "Shuffle automático" (opcional, configurável em GameConfig): quando o
 *    descarte atinge 20+ cartas, metade delas (aleatoriamente) volta para o
 *    baralho, reduzindo a chance de o baralho esgotar mais adiante.
 *
 * Cartas são sempre resetadas (resetCardsForDiscard) antes de voltar ao baralho -
 * na prática isso já é garantido no momento em que entram no descarte, mas
 * resetar de novo aqui é barato e blinda contra qualquer chamador futuro que
 * esqueça de resetar antes de empurrar para discardPile.
 */
export function reshuffleDiscardIntoDeck(
  deck: Card[],
  discardPile: Card[],
  mode: 'all' | 'half'
): { deck: Card[]; discardPile: Card[] } {
  if (discardPile.length === 0) return { deck, discardPile };

  const shuffledDiscard = shuffle(resetCardsForDiscard(discardPile));
  const takeCount = mode === 'all' ? shuffledDiscard.length : Math.floor(shuffledDiscard.length / 2);

  const returning = shuffledDiscard.slice(0, takeCount);
  const staying = shuffledDiscard.slice(takeCount);

  return {
    deck: shuffle([...deck, ...returning]),
    discardPile: staying,
  };
}
