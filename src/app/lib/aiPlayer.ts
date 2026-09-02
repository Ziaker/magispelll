/**
 * aiPlayer.ts - Cérebro do modo "Contra a IA"
 *
 * Este arquivo NÃO contém nenhuma regra de jogo nova - ele apenas decide QUAL
 * ação a IA tomaria a seguir, reaproveitando exatamente as mesmas validações
 * (canActivateMagic, canActivateNumeralSpell, isSlotProtected, etc.) que o
 * motor de regras (gameEngine.ts) usa para validar jogadas humanas. Isso
 * garante duas coisas:
 *
 * 1. A IA NUNCA "trapaceia" mecanicamente - toda ação que ela propõe passa
 *    pelo mesmo reducer puro e pelas mesmas checagens que uma ação vinda da
 *    interface. Se uma ação não for legal, o reducer simplesmente a ignora
 *    (como já faz para qualquer clique inválido de um jogador humano).
 * 2. A IA NUNCA lê informação que um jogador real não teria: ela decide com
 *    base apenas na própria mão/campo (sempre visível a si mesma, como a de
 *    qualquer jogador), no campo do oponente respeitando faceDownCard/revealed
 *    (nunca olha o valor de uma carta virada do oponente que ainda não foi
 *    revelada) e na pilha de descarte (pública, visível a ambos os lados).
 *
 * COMO É USADA: GameBoard.tsx chama decideAiAction(gameState, aiPlayer) a
 * cada mudança de estado, sempre que for a vez da IA agir. O resultado é uma
 * de três coisas:
 *   - { type: 'action', action }  -> despache esta ação (com um pequeno
 *     atraso "pensando...", ver GameBoard.tsx) e chame de novo depois.
 *   - { type: 'ready' }           -> a IA não tem mais nada produtivo a fazer
 *     nesta fase; marque-a como "Pronto" (se ainda não estiver).
 *   - { type: 'wait' }            -> a IA tem cartas em campo esperando para
 *     lutar, mas não é a vez dela escolher agora (fase de combate); não faça
 *     nada e MUITO IMPORTANTE: não marque como "Pronto" aqui, ou o combate
 *     seria encerrado cedo demais e as cartas da IA descartadas sem lutar.
 *
 * DIFICULDADE: existe um único nível ("normal-difícil"), sem seletor de
 * dificuldade - o objetivo é uma IA competente que joga de forma consistente
 * e sem desperdiçar recursos, não um solver perfeito. Ver o README de cada
 * função abaixo para o raciocínio por trás de cada decisão.
 */

import { random } from './rng';
import {
  characterOf,
  getFilledFieldSlots,
  getMagicActivationContext,
  getUnbattledHorizontalSlots,
  getUnrevealedFieldSlots,
  isSlotProtected,
  MAX_MONSTER_USES,
  opponentKeyOf,
  opponentOf,
  playerKeyOf,
  canActivateMonsterEffect,
  canFormOrReinforceTower,
  canSelectCombatSlot,
  getEffectiveDiscardLimit,
  getEffectiveDrawLimit,
  towerEligibleValue,
  isTowerSlot,
  getFireballCap,
  type CharacterId,
  type GameAction,
  type GameState,
  type PlayerNumber,
  type PlayerState,
  type FieldSlot,
} from './gameEngine';
import { getEffectiveCardValue, isFieldEligible, isNumeralCard, isPlainNumeralCard, isValidAceTransformTarget, type Card } from './cardUtils';
import { canActivateMagic } from './magicCards';
import { canActivateNumeralSpell, getMatchingNumeralCards, getNumeralSpellInfo } from './numeralSpells';
import { computeFusionResult } from './fusion';
import { getSpotlightAdjustedValue, type SpotlightState } from './spotlight';

export type AiDecision =
  | { type: 'action'; action: GameAction; thinkTimeMs?: number }
  | { type: 'ready' }
  | { type: 'wait' };

/**
 * Valor médio aproximado de uma carta elegível para campo (2..10) - usado
 * tanto para decidir se vale a pena arriscar uma troca às cegas (decideBestaK)
 * quanto como valor de PLANEJAMENTO para um Ás ainda não transformado (ver
 * combatValue logo abaixo).
 *
 * FIX (Fase D, pedido do usuário): antes esta média considerava um Ás como
 * 14 (por isso valia 7) - mas um Ás ainda não transformado não tem nenhum
 * poder de combate próprio: sua única capacidade real é se transformar em
 * outra carta numeral (copiando o valor dela, 2 a 10). A IA não deve mais
 * planejar como se um Ás "cru" fosse garantidamente a carta mais forte do
 * jogo - por isso ele agora entra nessa média como uma carta numeral comum
 * (6, a média real de 2..10), não como 14.
 */
const AVERAGE_FIELD_CARD_VALUE = 6;

/**
 * Valor de combate "de planejamento" de uma carta (considera Ás/Coringa
 * transformados normalmente via getEffectiveCardValue).
 *
 * FIX (Fase D): um Ás AINDA NÃO transformado deixa de valer 14 aqui. Essa
 * pontuação de 14 continua sendo a regra REAL usada por handleResolveCombat
 * em gameEngine.ts (não foi tocada - é regra central do jogo, vale tanto
 * para jogador humano quanto IA) para quando uma carta dessas realmente
 * entra em combate sem ter sido transformada. Mas a IA não deve mais usar
 * esse valor como premissa de PLANEJAMENTO (qual carta guardar, qual jogar
 * em campo, qual vale mais para trocar) - já que a única capacidade real do
 * Ás é se transformar em outra carta numeral. Ver trueSlotValue mais abaixo
 * para o valor REAL (não descontado) de um slot já em campo, usado quando o
 * que importa é saber se uma disputa de combate específica será mesmo
 * vencida.
 */
// FIX (pedido do usuário, Modo Spotlight: "IA deve considerar o Spotlight
// nas decisões") - `spotlight` é OBRIGATÓRIO (não opcional) de propósito:
// já existia uma chamada como referência de função crua (`.map(combatValue)`)
// que silenciosamente receberia o índice do array no lugar do Spotlight se
// o parâmetro fosse opcional - obrigatório força um erro de compilação em
// QUALQUER chamada que esqueça de passar o Spotlight de verdade, em vez de
// um bug silencioso.
/**
 * Coringa - valor que a Rainha armadilha REALMENTE teria se fosse revelada em
 * combate agora: ela copia o valor de uma carta REVELADA do campo do
 * oponente, e vale 1 quando não há nenhuma (mesma regra de
 * applyCoringaTrapCombatValue em gameEngine.ts).
 *
 * FIX (pedido do usuário: "a IA do coringa fica usando a rainha primeiro ao
 * invés de por segundo ou por último, a lógica da jogada é pra ser baseada na
 * existência já presente de uma carta revelada no campo do oponente") - antes
 * `combatValue` dava um 8 fixo pra Rainha, então ela parecia uma das melhores
 * cartas da mão e era posicionada logo de cara, justamente quando o campo do
 * oponente ainda está todo oculto e ela valeria só 1. Com o valor real, a
 * Rainha naturalmente cai pro fim da fila enquanto não há nada revelado pra
 * copiar, e sobe sozinha quando aparece um alvo bom.
 */
function coringaQueenCopyValue(opponentField: [FieldSlot, FieldSlot, FieldSlot] | undefined, spotlight: SpotlightState | null): number {
  if (!opponentField) return 1;
  const revealed = opponentField.flatMap((slot) => [
    ...(slot.faceDownCard?.revealed ? [slot.faceDownCard] : []),
    ...slot.horizontalCards.filter((c) => c.revealed),
  ]);
  if (revealed.length === 0) return 1;
  return Math.max(...revealed.map((c) => getSpotlightAdjustedValue(c, spotlight)));
}

function combatValue(card: Card, spotlight: SpotlightState | null, opponentField?: [FieldSlot, FieldSlot, FieldSlot]): number {
  if (card.value === 'A' && card.transformedValue === undefined) {
    return AVERAGE_FIELD_CARD_VALUE;
  }
  // Coringa (redesenho completo) - uma carta-armadilha crua (J/Q/K/Monstro,
  // ainda não transformada em numeral pela Magia Numeral - ver
  // `coringaTransformedToNumeral`, cardUtils.ts) não tem `transformedValue`
  // até ser revelada de verdade (ver applyCoringaTrapCombatValue,
  // gameEngine.ts) - sem isso aqui, `getSpotlightAdjustedValue` pontuaria
  // TODAS como 0 (J/Q/K/Coringa não têm valor de face numérico), fazendo a
  // IA nunca priorizar posicioná-las por acreditar (errado) que não valem
  // nada. Espelha o valor real de cada uma pra ranking de PLANEJAMENTO -
  // nunca usado pela resolução de combate de verdade, que sempre recalcula
  // do zero no momento da revelação. `coringaTransformedToNumeral` já
  // implica dono Coringa (nenhum outro personagem tem esse campo setado),
  // então não precisa saber o personagem aqui pra decidir.
  if (!card.coringaTransformedToNumeral) {
    if (card.value === 'J') return 1;
    if (card.isMonster) return 15;
    // Rainha: vale o que ela conseguiria COPIAR agora (1 sem alvo revelado) -
    // ver coringaQueenCopyValue acima.
    if (card.value === 'Q') return coringaQueenCopyValue(opponentField, spotlight);
    if (card.value === 'K') return 9;
  }
  return getSpotlightAdjustedValue(card, spotlight);
}

/**
 * FIX (pedido do usuário: "escalar agressividade pelo placar de vidas") -
 * diferença de vidas (minhas - do oponente): negativo = estou perdendo,
 * positivo = estou ganhando. Usado para calibrar o apetite de risco da IA em
 * várias decisões (segurar carta forte de propósito, troca às cegas da
 * Besta, orçamento de cargas do Monstro) - sempre com base no placar público
 * de vidas (visível aos dois lados o tempo todo), nunca informação oculta.
 */
/**
 * Coringa (redesenho completo, pedido do usuário) - `isFieldEligible`
 * (cardUtils.ts) nunca inclui J/Q/K/Monstro (nenhum outro personagem pode
 * posicioná-los no campo) - o Coringa é a única exceção, e só de um jeito
 * específico por carta: Valete SÓ como horizontal, Rainha/Rei SÓ como
 * principal, Monstro (tratado como um "15") em qualquer uma das duas -
 * mesmas regras exatas de handlePlayCard (gameEngine.ts). Uma carta já
 * transformada em numeral pela Magia Numeral (`coringaTransformedToNumeral`)
 * não entra mais aqui - vira candidata normal via `isFieldEligible` (seu
 * `transformedValue` de 11/12/13 já a torna elegível pra QUALQUER posição,
 * como qualquer numeral comum).
 */
function isCoringaTrapFieldEligible(character: CharacterId, card: Card, asHorizontal: boolean): boolean {
  if (character !== 'coringa' || card.coringaTransformedToNumeral) return false;
  if (card.value === 'J') return asHorizontal;
  if (card.value === 'Q' || card.value === 'K') return !asHorizontal;
  if (card.isMonster) return true;
  return false;
}

function livesDelta(state: GameState, ai: PlayerNumber): number {
  return state[playerKeyOf(ai)].lives - state[opponentKeyOf(ai)].lives;
}

/**
 * FIX (pedido do usuário: "orçamento do Monstro" - a carta só aguenta
 * MAX_MONSTER_USES ativações no total antes de descartar pra sempre, ver
 * gameEngine.ts) - quantas ativações ainda restam pra esta carta Monstro.
 * Usado por decideMonsterEffect para exigir um ganho maior (ou desespero
 * real - ver livesDelta) antes de gastar a ÚLTIMA carga, em vez de queimá-la
 * na primeira oportunidade marginal que aparecer.
 */
function monsterChargesRemaining(me: PlayerState): number {
  return MAX_MONSTER_USES - (me.monsterCard?.monsterUseCount ?? 0);
}

/**
 * Heurística de "quão valioso é guardar/pegar esta carta", usada para decisões
 * de mão (o que descartar, o que pegar do descarte com Recuperação Selvagem) -
 * DIFERENTE do valor de combate puro: aqui um Coringa ou um Ás valem muito
 * mesmo sem entrar em campo ainda, e uma carta que combina com a Magia Numeral
 * do personagem ganha um bônus extra.
 */
function cardPriority(card: Card, character: CharacterId, spotlight: SpotlightState | null): number {
  if (card.isMonster) return 100;
  if (card.value === 'A') return 90;
  const requiredNumber = getNumeralSpellInfo(character).requiredNumber;
  // FIX (pedido do usuário, Modo Spotlight: "IA deve considerar o Spotlight
  // nas decisões") - a régua de prioridade agora usa o valor JÁ ajustado
  // pelo Spotlight, não o efetivo cru: uma carta positiva vale muito mais
  // guardar/jogar (o `eff` ajustado já entra alto na escala 2-10 abaixo, ou
  // até acima dela - ver clamp), e uma negativa (fixada em 1) cai pro fundo
  // da prioridade normal, incentivando a IA a descartá-la/gastá-la cedo em
  // vez de guardar um "lixo" achando que ainda vale seu número de face.
  const eff = getSpotlightAdjustedValue(card, spotlight);
  // FIX (item 13): cartas que combinam com a Magia Numeral do personagem
  // precisam ter prioridade MAIOR que J/Q/K (80) - antes tinham só 60+eff
  // (no máximo 69), então a IA sempre preferia guardar cartas mágicas a
  // guardar as 3 cartas necessárias para a própria Magia Numeral, e acabava
  // gastando/descartando esses numerais antes de conseguir reuni-los. A
  // comparação com `requiredNumber` também já usa o valor ajustado (ver
  // getMatchingNumeralCards em numeralSpells.ts, mesma regra) - uma carta
  // "9" positiva (27) não conta mais como o "9" do Mago, então não ganha
  // mais este bônus específico (ainda ganha prioridade alta pelo `eff`
  // grande logo abaixo).
  if (eff === requiredNumber) return 88;
  if (card.value === 'J' || card.value === 'Q' || card.value === 'K') return 80;
  // FIX (Modo Spotlight): `eff` pode passar de 10 (positivo, x3) - deixa
  // passar direto nesse caso (prioridade máxima entre as numerais, coerente
  // com valer 3x mais de verdade), só o `>= 2` original segue valendo como
  // piso (o `eff === 1` do negativo cai no `return 0` padrão abaixo, que já
  // é o "sem valor nenhum" de sempre).
  if (eff >= 2) return eff;
  return 0;
}

/**
 * Valor REAL (não descontado) de um slot de campo - o mesmo valor que
 * handleResolveCombat usaria para resolver o combate de verdade (inclui
 * cartas horizontais e o dobro de Fúria Selvagem, quando aplicável). Um slot
 * vazio vale 1 (regra pública, ver FIX item 10 da 2ª rodada em
 * gameEngine.ts).
 *
 * FIX (Fase D): DIFERENTE de combatValue, que desconta um Ás ainda não
 * transformado para fins de planejamento estratégico - esta função é usada
 * quando o valor real e verdadeiro do combate importa (saber se uma disputa
 * específica realmente será vencida, ou simular um combate hipotético contra
 * o pool de cartas não vistas - ver pickCombatSlotWithVariety), já que um Ás
 * já colocado em campo sem transformar continua valendo 14 na resolução
 * real, independente do que a IA "acha" dele para fins de planejamento.
 */
/**
 * FIX (checagem extensa por bugs - vazamento de informação real encontrado):
 * cada carta horizontal (reforço) controla sua PRÓPRIA revelação,
 * independente da carta principal do slot - regra explícita já usada em toda
 * a interface (ver FieldSlotView.tsx: "carta revelada no campo não deve
 * revelar a horizontal e o mesmo pro oposto") e no cabeçalho deste arquivo
 * ("nunca olha o valor de uma carta virada do oponente que ainda não foi
 * revelada"). Esta função somava o valor de TODAS as horizontais de um slot
 * incondicionalmente - correto quando o slot é o PRÓPRIO campo da IA (ela
 * sempre sabe o que colocou), mas era usada também sobre o campo do
 * OPONENTE (`shouldHoldBackField`, `knownSelectedSlotValue`), onde uma
 * horizontal ainda não revelada é informação que um jogador real não teria -
 * a IA "enxergava" o valor de reforços escondidos sempre que a carta
 * PRINCIPAL do mesmo slot já estava revelada. `opts.opponentView` filtra as
 * horizontais não reveladas fora da soma nesses casos; chamadas sobre o
 * próprio campo continuam com informação completa (comportamento inalterado).
 */
function trueSlotValue(
  playerState: PlayerState,
  slotIndex: number,
  character: CharacterId,
  spotlight: SpotlightState | null,
  opts: { opponentView?: boolean } = {}
): number {
  const slot = playerState.field[slotIndex];
  if (!slot.faceDownCard) return 1;
  const doubleId =
    character === 'besta' && playerState.monsterCard?.monsterUsed ? playerState.monsterTargetCardId : undefined;
  // FIX (pedido do usuário, Modo Spotlight): `getSpotlightAdjustedValue` no
  // lugar de `getEffectiveCardValue` - esta função MODELA o mesmo cálculo
  // que handleResolveCombat faz de verdade (ver comentário da função acima),
  // então precisa da mesma fonte de valor pra não achar que está
  // ganhando/perdendo uma disputa que na real já foi decidida pelo Spotlight.
  let base = getSpotlightAdjustedValue(slot.faceDownCard, spotlight);
  if (doubleId && doubleId === slot.faceDownCard.id) base *= 2;
  const visibleHorizontal = opts.opponentView ? slot.horizontalCards.filter((c) => c.revealed) : slot.horizontalCards;
  const horizontal = visibleHorizontal.reduce(
    (sum, c) => sum + (doubleId === c.id ? getSpotlightAdjustedValue(c, spotlight) * 2 : getSpotlightAdjustedValue(c, spotlight)),
    0
  );
  // FIX (pedido do usuário: "no modo towers, a IA não seleciona a torre
  // quando a própria tem valores altos durante as disputas" + "a IA escolhe
  // um valor mais baixo quando o oponente escolhe uma carta revelada") -
  // faltava somar a reserva da torre (Modo Towers) aqui. Diferente de uma
  // horizontal comum (só pública depois de `revealed`, por isso o filtro
  // `opts.opponentView` acima), o valor de uma torre é público por REGRA,
  // sempre - o selo "🗼 NxTotal" (FieldSlotView.tsx, `hasTower` badge) é
  // mostrado incondicionalmente, nunca atrás de `slot.revealed`, mesmo no
  // campo do oponente. Sem contar a reserva, esta função (usada tanto pra
  // avaliar o PRÓPRIO campo quanto, via `knownSelectedSlotValue`, o slot já
  // selecionado do oponente) subestimava sistematicamente qualquer slot com
  // torre nos dois lados: a IA nunca "via" a força real da própria torre pra
  // escolhê-la, e também subestimava a força de uma torre do oponente ao
  // decidir se já sabia o suficiente pra vencer "economicamente" (ver a
  // heurística de vitória econômica em decideCombatPhase) - por isso parecia
  // escolher um valor baixo demais mesmo sabendo o valor do oponente: ela
  // sabia um valor ERRADO (sem a torre), não o valor real.
  const towerValue = (slot.towerReserve ?? []).reduce((sum, c) => sum + getSpotlightAdjustedValue(c, spotlight), 0);
  return base + horizontal + towerValue;
}

function pickHighestBy<T>(items: T[], score: (item: T) => number): T {
  return items.reduce((best, item) => (score(item) > score(best) ? item : best));
}

/**
 * Escolhe até `count` itens DISTINTOS de `items`, em ordem aleatória - usada
 * pelo Mosqueteiro (personagem novo) sempre que a escolha precisa ser às
 * cegas por posição (nunca por valor real oculto, ver cabeçalho do
 * arquivo). Fisher-Yates parcial: só embaralha o suficiente pra tirar
 * `count` itens, não a lista inteira.
 */
function pickRandomN<T>(items: T[], count: number): T[] {
  const pool = [...items];
  const result: T[] = [];
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(random() * pool.length);
    result.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return result;
}

// ============================================================================
// Fase de Compra
// ============================================================================

/**
 * Piromante (personagem novo) - qual slot do oponente mirar ao lançar a Bola
 * de Fogo: prioriza um slot que ela consiga OBLITERAR de vez (valor total <=
 * Bola de Fogo), escolhendo o de MAIOR valor total entre esses (maximiza o
 * que é destruído); sem nenhum totalmente obliterável, mira o de MAIOR valor
 * mesmo assim (reduz o mais perigoso, mesmo sem eliminar) - nunca mira um
 * slot vazio ou protegido (Proteção Divina do Anjo). `null` = nenhum alvo
 * válido agora (campo do oponente vazio ou tudo protegido).
 */
function pickFireballTarget(state: GameState, ai: PlayerNumber): number | null {
  const opponent = opponentOf(ai);
  const opponentState = state[playerKeyOf(opponent)];
  const candidates = opponentState.field
    .map((slot, i) => {
      if (isSlotProtected(state, opponent, i)) return null;
      const cards = [...(slot.faceDownCard ? [slot.faceDownCard] : []), ...slot.horizontalCards];
      if (cards.length === 0) return null;
      return { slotIndex: i, total: cards.reduce((sum, c) => sum + getEffectiveCardValue(c), 0) };
    })
    .filter((c): c is { slotIndex: number; total: number } => c !== null);
  if (candidates.length === 0) return null;

  const fireballValue = state[playerKeyOf(ai)].fireballValue;
  const obliteratable = candidates.filter((c) => c.total <= fireballValue);
  const pool = obliteratable.length > 0 ? obliteratable : candidates;
  return pickHighestBy(pool, (c) => c.total).slotIndex;
}

/**
 * Piromante (personagem novo) - vale a pena lançar a Bola de Fogo AGORA?
 * Sim se ela consegue obliterar algum slot do oponente de vez, OU se já
 * está muito perto do teto (deixar acumular mais seria desperdiçar
 * combustível que vai se perder no arredondamento pro teto).
 */
function shouldLaunchFireball(state: GameState, ai: PlayerNumber): boolean {
  const me = state[playerKeyOf(ai)];
  if (me.fireballValue <= 0) return false;
  const target = pickFireballTarget(state, ai);
  if (target === null) return false;
  const opponent = opponentOf(ai);
  const opponentState = state[playerKeyOf(opponent)];
  const slot = opponentState.field[target];
  const total = [...(slot.faceDownCard ? [slot.faceDownCard] : []), ...slot.horizontalCards].reduce((sum, c) => sum + getEffectiveCardValue(c), 0);
  const cap = getFireballCap(state.gameConfig);
  return me.fireballValue >= total || me.fireballValue >= cap - 3;
}

function decideDrawPhase(state: GameState, ai: PlayerNumber): AiDecision {
  const character = characterOf(state, ai);
  const me = state[playerKeyOf(ai)];
  const ctx = getMagicActivationContext(state, ai);

  // 1. Anjo J (Bênção Divina) - FIX (pedido do usuário: "mude o efeito da
  //    valete do anjo para 'compre um Ás'") - agora busca um Ás garantido em
  //    vez de mexer no limite de mão. Continua valendo a pena ativar sempre
  //    que possível: um Ás é um recurso flexível (vira qualquer numeral, ou
  //    luta cru como 14) que nunca é desperdiçado - `canActivateMagic` já
  //    garante que só ativa quando há espaço na mão e um Ás de verdade
  //    alcançável (baralho ou descarte).
  if (character === 'anjo') {
    const jCard = me.hand.find((c) => c.value === 'J');
    if (jCard && canActivateMagic('draw', 'anjo', 'J', ctx)) {
      return { type: 'action', action: { type: 'ACTIVATE_SIMPLE_MAGIC', player: ai, cardId: jCard.id } };
    }
  }

  // 2. Mago J (Revelação Forçada) - revela uma carta ainda oculta da mão do
  //    oponente (ganha informação), OU descarta uma carta JÁ revelada dela.
  //
  //    FIX (pedido do usuário: "você PODE descartar uma carta JÁ revelada,
  //    não só quando tiver todas") - a regra mudou: descartar uma carta já
  //    revelada não depende mais do resto da mão do oponente estar toda
  //    revelada (ver handleExecuteMagic em gameEngine.ts). Isso abre uma
  //    escolha real pra IA a cada ativação: continuar revelando cartas novas
  //    (ganha informação) ou descartar uma carta já revelada que seja
  //    perigosa (uma magia, um Ás, o Monstro, ou um numeral valioso -
  //    reaproveitando cardPriority, a mesma régua já usada em outras
  //    decisões de "quão valiosa é esta carta"). Só prioriza o descarte
  //    quando a carta já revelada é claramente perigosa - caso contrário,
  //    ganhar informação nova (revelar) vale mais a longo prazo.
  if (character === 'mago') {
    const jCard = me.hand.find((c) => c.value === 'J');
    if (jCard && canActivateMagic('draw', 'mago', 'J', ctx)) {
      const opponentHand = state[opponentKeyOf(ai)].hand;
      const opponentCharacter = characterOf(state, opponentOf(ai));
      const revealed = opponentHand.filter((c) => c.revealed);
      const unrevealed = opponentHand.filter((c) => !c.revealed);

      const bestRevealedTarget = revealed.length > 0 ? pickHighestBy(revealed, (c) => cardPriority(c, opponentCharacter, state.spotlight)) : null;
      const DISCARD_WORTHY_PRIORITY = 80; // magias (J/Q/K), Ás e Monstro - ver cardPriority
      const shouldDiscardRevealed = bestRevealedTarget !== null && cardPriority(bestRevealedTarget, opponentCharacter, state.spotlight) >= DISCARD_WORTHY_PRIORITY;

      const target = shouldDiscardRevealed
        ? bestRevealedTarget
        : unrevealed.length > 0
        ? unrevealed[Math.floor(random() * unrevealed.length)]
        : bestRevealedTarget; // nada mais pra revelar - descarta a melhor carta já revelada, mesmo sem ser "perigosa"

      if (target) {
        return {
          type: 'action',
          action: {
            type: 'EXECUTE_MAGIC',
            player: ai,
            cardId: jCard.id,
            character: 'mago',
            magicType: 'J',
            selection: { selectedCards: [target.id] },
          },
        };
      }
    }
  }

  // 3. Besta J (Recuperação Selvagem) - pega as melhores cartas disponíveis
  //    na pilha de descarte (informação pública, não é "trapaça" usar isso).
  //    FIX (pedido do usuário): só pode recuperar cartas numerais PURAS
  //    (2-10, sem Ás) - filtra ANTES de rankear/escolher, senão a IA tentaria
  //    recuperar magias/Monstro/Ás que o motor agora rejeita/filtra em
  //    silêncio (ver isPlainNumeralCard em cardUtils.ts e o ramo Besta J de
  //    handleExecuteMagic em gameEngine.ts).
  if (character === 'besta') {
    const jCard = me.hand.find((c) => c.value === 'J');
    if (jCard && canActivateMagic('draw', 'besta', 'J', ctx)) {
      const eligible = state.discardPile.filter((c) => isPlainNumeralCard(c));
      const ranked = [...eligible].sort((a, b) => cardPriority(b, 'besta', state.spotlight) - cardPriority(a, 'besta', state.spotlight));
      const picked = ranked.slice(0, 2);
      if (picked.length > 0) {
        return {
          type: 'action',
          action: {
            type: 'EXECUTE_MAGIC',
            player: ai,
            cardId: jCard.id,
            character: 'besta',
            magicType: 'J',
            selection: { selectedCards: picked.map((c) => c.id) },
          },
        };
      }
    }
  }

  // 3b. Coringa - Mão de Ferro (Magia Numeral 7,7,7): enquanto a janela
  //     estiver aberta, transforma PERMANENTEMENTE toda carta de magia
  //     (J/Q/K) ainda na mão em carta de número 11/12/13 - por valor puro,
  //     sempre vale mais que manter qualquer uma delas como armadilha (um
  //     Valete vale só 1 como armadilha, contra 11 transformado; o mesmo
  //     vale, em grau menor, pra Rainha/Rei). Uma carta por decisão (o loop
  //     de decisão volta a chamar esta função de novo se sobrar mais
  //     alguma).
  // FIX (pedido do usuário: "a IA do coringa fica spammando a transformação
  // de carta em número, corrija isso") - a regra acima disparava assim que a
  // janela abria e, como cada decisão transforma UMA carta, a IA gastava
  // várias decisões seguidas transformando a mão inteira logo de cara, antes
  // de jogar qualquer coisa no campo. Agora ela só transforma o que não
  // consegue usar como ARMADILHA agora: enquanto houver slot principal vazio
  // (onde Rainha/Rei/Monstro entrariam como armadilha de verdade), posicionar
  // vem primeiro - a janela dura o turno inteiro, então nada se perde
  // esperando. Com o campo cheio, a carta ficaria parada na mão de qualquer
  // forma e transformá-la é ganho puro.
  if (character === 'coringa' && me.coringaTransformWindowUntilTurn !== undefined && state.turn <= me.coringaTransformWindowUntilTurn) {
    const hasEmptyMainSlot = me.field.some((slot) => !slot.faceDownCard);
    const transformable = me.hand.find((c) => !c.coringaTransformedToNumeral && (c.value === 'J' || c.value === 'Q' || c.value === 'K'));
    if (transformable && !hasEmptyMainSlot) {
      return { type: 'action', action: { type: 'TRANSFORM_CORINGA_MAGIC_CARD', player: ai, cardId: transformable.id } };
    }
  }

  // 3c. Piromante (personagem novo) - Combustão (Valete): prioriza sempre
  //     ALIMENTAR a Bola de Fogo com o combustível disponível (nunca perde
  //     valor, e o Valete pode ser jogado de novo mais tarde se sobrar mais
  //     combustível). Só lança se não houver combustível NENHUM na mão
  //     agora - ver shouldLaunchFireball.
  if (character === 'piromante') {
    const jCard = me.hand.find((c) => c.value === 'J');
    if (jCard && canActivateMagic('draw', 'piromante', 'J', getMagicActivationContext(state, ai))) {
      if (ctx.hasFireFuelInHand) {
        return {
          type: 'action',
          action: { type: 'EXECUTE_MAGIC', player: ai, cardId: jCard.id, character: 'piromante', magicType: 'J', selection: {} },
        };
      }
      if (shouldLaunchFireball(state, ai)) {
        const target = pickFireballTarget(state, ai);
        if (target !== null) {
          return {
            type: 'action',
            action: {
              type: 'EXECUTE_MAGIC',
              player: ai,
              cardId: jCard.id,
              character: 'piromante',
              magicType: 'J',
              selection: { fireballLaunch: true, selectedTargetSlot: target },
            },
          };
        }
      }
    }
  }

  // 4. Fusão (pedido do usuário: "quero que a IA também funda cartas") - ver
  //    decideFusion abaixo.
  const fuseAction = decideFusion(state, ai, character);
  if (fuseAction) return { type: 'action', action: fuseAction };

  // 5. Descarta cartas claramente fracas para girar a mão, mas só quando ela
  //    já está no limite (preserva opções em mãos ainda não cheias).
  //
  //    ARMADILHA (bug real encontrado via simulação IA-vs-IA de milhares de
  //    partidas): a heurística normal trata J/Q/K como "valiosos" (prioridade
  //    80) porque normalmente servem de combustível para magias. Mas J/Q/K
  //    NUNCA podem ir para o campo (só Ás/numeral/Coringa podem - ver
  //    isFieldEligible mais abaixo), e as magias de Dama/Rei só ativam se a
  //    própria IA já tiver carta em campo. Se a mão encher só com J/Q/K (sem
  //    nenhum Ás, numeral ou Coringa não-usado), a IA trava para sempre: não
  //    pode jogar nada em campo, não pode ativar magia nenhuma (sem carta em
  //    campo para ser alvo), não pode comprar (mão já no limite) e, pela
  //    prioridade normal, nunca descartaria um J/Q/K "valioso" - um impasse
  //    permanente onde o turno gira infinitamente sem nenhum progresso. Por
  //    isso, quando NADA na mão pode ir para o campo, a IA descarta mesmo
  //    cartas de prioridade alta (exceto Coringa/Ás, que sempre valem manter)
  //    só para girar a mão e ter chance de puxar algo jogável.
  if (me.discardsThisTurn < getEffectiveDiscardLimit(state.gameConfig) && me.hand.length >= me.handLimit) {
    const hasPlayableCard = me.hand.some(
      (c) => (c.value === 'A' && c.transformedValue === undefined) || isNumeralCard(c) || (c.isMonster && !c.monsterUsed)
    );
    const worst = [...me.hand].filter((c) => !c.revealed).sort((a, b) => cardPriority(a, character, state.spotlight) - cardPriority(b, character, state.spotlight))[0];
    const threshold = hasPlayableCard ? 5 : 100; // sem nada jogável em campo, descarta até J/Q/K para não travar
    if (worst && cardPriority(worst, character, state.spotlight) < threshold) {
      return { type: 'action', action: { type: 'DISCARD_CARDS', player: ai, cardIds: [worst.id] } };
    }
  }

  // 6. Compra até o limite da mão (ou até o limite de compras por turno, se
  //    habilitado - pedido do usuário: "opção no pré-jogo de limite de
  //    compra de cartas"). Sem isso, com o limite já esgotado, a IA ficaria
  //    propondo repetidamente uma DRAW_CARDS que o motor rejeita em silêncio
  //    (mesma família do bug antigo do TRANSFORM_ACE) - por isso o cálculo
  //    já zera `maxDraw` aqui, e ela cai para "ready" corretamente.
  const maxHandDraw = me.handLimit - me.hand.length;
  const maxTurnDraw = state.gameConfig.drawLimitEnabled
    ? Math.max(0, getEffectiveDrawLimit(state.gameConfig) - me.drawsThisTurn)
    : Infinity;
  const maxDraw = Math.min(maxHandDraw, maxTurnDraw);
  if (maxDraw > 0 && (state.deck.length > 0 || state.discardPile.length > 0)) {
    return { type: 'action', action: { type: 'DRAW_CARDS', player: ai, count: maxDraw } };
  }

  return { type: 'ready' };
}

/**
 * FIX (pedido do usuário: "quero que a IA também funda cartas") - decide SE
 * a IA funde 2 cartas agora, tentando 3 motivos possíveis em ordem de valor
 * (o primeiro que encontrar um par válido vence):
 *
 *   1. Fundir uma carta de magia de verdade (J/Q/K) - decideFusionForMagicCard.
 *   2. Fundir rumo ao número da própria Magia Numeral (ex.: 4+5=9 pro Mago) -
 *      decideFusionTowardNumeralSpell (pedido do usuário, item 1).
 *   3. Fundir por necessidade concreta de combate (a IA não tem, agora, nada
 *      que vença a maior ameaça já revelada do oponente) - decideFusionForCombatNecessity.
 *
 * FIX (pedido do usuário: "corrija as fusões compulsivas da IA, faça com
 * que ela só utilize quando absolutamente necessário") - existiam 2 outros
 * motivos aqui (limpar mão com cartas fracas acumuladas / fundir só por não
 * deixar o recurso parado) que fundiam SEM nenhuma necessidade concreta -
 * exatamente a "compulsão" relatada. Foram removidos; a Motivo 3 acima é a
 * única fusão "genérica" (fora dos Motivos 1/2, que já são inerentemente
 * necessários) que sobra, e só age em resposta a uma ameaça real e visível.
 */
function decideFusion(state: GameState, ai: PlayerNumber, character: CharacterId): GameAction | null {
  if (!state.gameConfig.fusion) return null;
  const me = state[playerKeyOf(ai)];
  // FIX (pedido do usuário: "limite de fusões... podendo selecionar quantas
  // fusões os jogadores poderão fazer cada turno") - `fusionLimit` (1-4) no
  // lugar do antigo "1 fusão fixa"; decideAiAction é chamado repetidamente
  // (uma vez por decisão), então retornar uma ação aqui só faz a IA fundir
  // MAIS UMA VEZ - ela naturalmente funde até o limite ao longo de vários
  // ciclos, um par por vez.
  if (me.fusesThisTurn >= state.gameConfig.fusionLimit) return null;

  // As heurísticas abaixo retornam só o PAR de ids (nunca a ação pronta) -
  // a primeira que encontrar um par válido vence (mesma ordem de valor
  // documentada no comentário desta função).
  const pair =
    decideFusionForMagicCard(state, ai, me, character) ??
    decideFusionTowardNumeralSpell(me, character, state.spotlight) ??
    decideFusionForCombatNecessity(state, ai, me, character);
  if (!pair) return null;

  return { type: 'FUSE_CARDS', player: ai, cardId1: pair.cardId1, cardId2: pair.cardId2 };
}

/**
 * FIX (pedido do usuário: "A IA só deveria fazer fusão para magia quando
 * absolutamente necessário, no caso de ter conveniente precisar da magia
 * pro momento certo") - avalia, SEM precisar ter a carta de magia em mãos
 * ainda, se ativar aquele tipo de magia (J/Q/K) para este personagem já
 * teria um alvo/uso real dado o estado ATUAL do jogo - mesma pergunta que
 * decideMagoQ/decideBestaQ/decideAnjoQ/decideMagoK/decideBestaK/decideAnjoK
 * já fazem quando a carta de fato existe na mão, só que aqui reescrita para
 * não depender de já ter a carta (ela ainda nem existe - é o que decidiria
 * se vale a pena CRIÁ-LA via fusão). Um resultado "sim" aqui não garante que
 * a IA vá usar a magia neste exato instante (fusão só acontece na fase de
 * Compra, os usos de Q/K só mais tarde), mas garante que exista uma
 * necessidade concreta e visível agora - evitando fundir magias "torcendo"
 * para que apareça um uso depois.
 */
function wouldMagicFusionHelpNow(state: GameState, ai: PlayerNumber, character: CharacterId, magicValue: string): boolean {
  const me = state[playerKeyOf(ai)];
  const opponent = opponentOf(ai);
  const opponentState = state[opponentKeyOf(ai)];

  if (character === 'mago') {
    if (magicValue === 'J') return opponentState.hand.some((c) => !c.revealed);
    if (magicValue === 'Q') {
      const ownFilled = me.field.filter((slot) => slot.faceDownCard);
      if (ownFilled.length === 0) return false;
      const numeralCandidates = me.hand.filter(isNumeralCard);
      if (numeralCandidates.length === 0) return false;
      const bestHandValue = Math.max(...numeralCandidates.map((c) => combatValue(c, state.spotlight)));
      // FIX (auditoria completa do Mago - bug real encontrado): mesmo caso
      // das demais ocorrências - carta já em campo, valor real
      // (getEffectiveCardValue) importa aqui, não o desconto de planejamento
      // de `combatValue` (que subestimaria um Ás cru já em campo, fazendo a
      // IA achar que vale a pena fundir rumo a uma Rainha sem necessidade).
      const worstFieldValue = Math.min(...ownFilled.map((slot) => getEffectiveCardValue(slot.faceDownCard!)));
      return bestHandValue > worstFieldValue;
    }
    if (magicValue === 'K') {
      return getUnbattledHorizontalSlots(opponentState.field).some((i) => !isSlotProtected(state, opponent, i));
    }
  }

  if (character === 'besta') {
    if (magicValue === 'J') return state.discardPile.some((c) => isPlainNumeralCard(c));
    if (magicValue === 'Q') {
      // FIX (auditoria completa da Besta): `!slot.faceDownCard.isMonster` era
      // morto (uma carta Monstro nunca ocupa `faceDownCard` na arquitetura
      // atual - só a zona própria, ver decidePlaceMonsterCard). Também
      // estendido pra refletir que decideBestaQ agora também pode mirar um
      // slot revelado e desprotegido do OPONENTE (troca ofensiva), não só o
      // próprio campo.
      const hasTarget =
        me.field.some((slot) => slot.faceDownCard) ||
        opponentState.field.some((slot, i) => slot.faceDownCard && slot.revealed && !isSlotProtected(state, opponent, i));
      return hasTarget && state.discardPile.some(isNumeralCard);
    }
    if (magicValue === 'K') {
      const myUnrevealed = getUnrevealedFieldSlots(me.field);
      const opponentUnrevealed = getUnrevealedFieldSlots(opponentState.field).filter((i) => !isSlotProtected(state, opponent, i));
      return myUnrevealed.length > 0 && opponentUnrevealed.length > 0;
    }
  }

  if (character === 'anjo') {
    // FIX (auditoria completa do Anjo): "compre um Ás" só vale a pena fundir
    // se houver algum Ás alcançável pra buscar (mesma condição de
    // `hasAceAvailableToDraw` em getMagicActivationContext/canActivateMagic)
    // - sem isso, a IA fundia 2 cartas numerais num Valete que nunca
    // conseguiria ativar (nenhum Ás em baralho ou descarte), perdendo as 2
    // cartas originais à toa.
    if (magicValue === 'J') return state.deck.some((c) => c.value === 'A') || state.discardPile.some((c) => c.value === 'A');
    if (magicValue === 'Q') {
      const fieldTarget = opponentState.field.some((slot, i) => slot.faceDownCard && !slot.revealed && !isSlotProtected(state, opponent, i));
      const handTarget = opponentState.hand.some((c) => !c.revealed);
      return fieldTarget || handTarget;
    }
    if (magicValue === 'K') {
      // FIX (mesmo bug de decideHorizontalPlacement/decideAnjoK abaixo): uma
      // torre TEM `faceDownCard` mas nunca aceita reforço horizontal.
      const maxHorizontal = 1 + me.horizontalStackBonus;
      const horizontalPlacedThisTurn = me.field.reduce((n, s) => n + s.horizontalCards.length, 0);
      return horizontalPlacedThisTurn >= maxHorizontal && me.field.some((slot) => slot.faceDownCard && !isTowerSlot(slot));
    }
  }

  return false;
}

/**
 * Motivo 1 (o de maior valor entre os 4, mas agora também o mais CRITERIOSO):
 * funde 2 cartas numerais puras da mão SÓ quando o resultado é uma carta de
 * magia de verdade (soma 11, 12 ou 13 - vira Valete/Rainha/Rei do próprio
 * personagem, ver computeFusionResult em fusion.ts) - ganha um efeito de
 * magia extra e repetível pelo resto da partida, o que quase sempre vale
 * mais que manter 2 cartas numerais facilmente repostas por qualquer compra
 * futura. NÃO funde atrás de um resultado numeral comum (ex.: 2+3=5) - isso
 * seria um downgrade puro (1 carta em vez de 2, sem ganhar nenhuma
 * capacidade nova) - nem atrás de um Ás (soma acima de 13): o ganho ali
 * depende de precisar mesmo de um Ás extra agora, uma avaliação mais incerta
 * que fica fora do escopo desta 1ª versão da IA para a variante.
 *
 * FIX (pedido do usuário: "A IA só deveria fazer fusão para magia quando
 * absolutamente necessário... precisar da magia pro momento certo") - antes
 * fundia para QUALQUER par que somasse 11/12/13, mesmo já tendo uma cópia
 * não usada daquele mesmo tipo de magia na mão, ou sem nenhum alvo/uso real
 * à vista - convertendo numerais em magia de forma oportunista demais e
 * esvaziando a mão de cartas numerais (o efeito colateral relatado pelo
 * usuário: "acabando por ficar sem números na mão"). Agora só funde quando
 * (1) a IA NÃO já tem uma carta desse mesmo tipo (J/Q/K) sem usar na mão -
 * não há necessidade de uma 2ª cópia parada - e (2) existe um uso real e
 * visível AGORA para essa magia (ver wouldMagicFusionHelpNow acima), não só
 * uma esperança de que apareça um alvo mais tarde.
 *
 * Nunca usa uma carta "reservada" para a própria Magia Numeral (mesma regra
 * já usada por decideHorizontalPlacement/decideAnjoK - ver
 * reservedNumeralCardIds) - preserva a combinação em andamento.
 */
function decideFusionForMagicCard(
  state: GameState,
  ai: PlayerNumber,
  me: PlayerState,
  character: CharacterId
): { cardId1: string; cardId2: string } | null {
  const reserved = reservedNumeralCardIds(me.hand, character, state.spotlight);
  const candidates = me.hand.filter((c) => isPlainNumeralCard(c) && !reserved.has(c.id));
  if (candidates.length < 2) return null;

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const result = computeFusionResult(candidates[i], candidates[j]);
      if (!result.isMagic) continue;
      if (me.hand.some((c) => c.value === result.value)) continue; // já tem uma cópia dessa magia parada na mão
      if (!wouldMagicFusionHelpNow(state, ai, character, result.value)) continue; // sem uso real à vista agora
      return { cardId1: candidates[i].id, cardId2: candidates[j].id };
    }
  }
  return null;
}

/**
 * Motivo 2 (pedido do usuário: "para magia numeral... fusionando 3+3 e
 * outros que resultam em 6 (besta) e somas que resultam 9 (mago)") - quando
 * o trio de 3 cartas iguais da própria Magia Numeral ainda não está
 * completo, funde 2 OUTRAS cartas numerais cuja soma seja EXATAMENTE o
 * número exigido (6 pra Besta, 9 pro Mago), criando mais uma carta que já
 * conta para o trio.
 *
 * NUNCA se aplica ao Anjo (pedido do usuário: "besta e mago apenas pq anjo é
 * o número 3") - o número dele é 3, e a soma mínima possível ao fundir 2
 * cartas numerais é 2+2=4, então é matematicamente impossível chegar a 3
 * fundindo cartas; a heurística nem tenta.
 *
 * Nunca usa como combustível uma carta que JÁ vale o número exigido (nem uma
 * já reservada, mesma regra da Motivo 1) - o objetivo é CRIAR mais uma
 * cópia a partir de outras cartas, não consumir uma que já serve.
 */
function decideFusionTowardNumeralSpell(me: PlayerState, character: CharacterId, spotlight: SpotlightState | null): { cardId1: string; cardId2: string } | null {
  if (character === 'anjo') return null;

  const requiredNumber = getNumeralSpellInfo(character).requiredNumber;
  if (getMatchingNumeralCards(character, me.hand, spotlight).length >= 3) return null; // trio já completo, não precisa de mais

  const reserved = reservedNumeralCardIds(me.hand, character, spotlight);
  const candidates = me.hand.filter(
    (c) => isPlainNumeralCard(c) && !reserved.has(c.id) && getEffectiveCardValue(c) !== requiredNumber
  );
  if (candidates.length < 2) return null;

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      if (getEffectiveCardValue(candidates[i]) + getEffectiveCardValue(candidates[j]) === requiredNumber) {
        return { cardId1: candidates[i].id, cardId2: candidates[j].id };
      }
    }
  }
  return null;
}

/**
 * Motivo 3 (pedido do usuário: "corrija as fusões compulsivas da IA, faça
 * com que ela só utilize quando absolutamente necessário" - substitui as
 * antigas "limpar mão"/"fusão ociosa", que fundiam mesmo sem nenhuma
 * necessidade concreta - exatamente a "compulsão" relatada, já que fundiam
 * só por já ter cartas fracas acumuladas ou por "não deixar o recurso
 * parado", nunca em resposta a uma ameaça real) - só funde 2 numerais puras
 * numa carta mais forte (soma 4-10; nunca 11+, que já é responsabilidade da
 * Motivo 1) quando isso responde a uma necessidade de combate CONCRETA e
 * visível: existe uma ameaça já REVELADA do oponente (campo ou mão - nunca
 * informação oculta, mesma regra de todo o resto deste arquivo) que a IA
 * não teria como vencer com nenhuma carta que já possui na mão agora (nem
 * fundindo seria útil se ela já tiver algo melhor à disposição - incluindo
 * um Ás cru, que pode virar qualquer número).
 */
function decideFusionForCombatNecessity(
  state: GameState,
  ai: PlayerNumber,
  me: PlayerState,
  character: CharacterId
): { cardId1: string; cardId2: string } | null {
  const opponentState = state[opponentKeyOf(ai)];
  // FIX (auditoria completa da Besta - bug real encontrado, função
  // COMPARTILHADA entre os 3 personagens): a carta de CAMPO do oponente já
  // está comprometida - `combatValue` desconta um Ás cru pra 6, mas o valor
  // real de ameaça é `getEffectiveCardValue` (14). Uma carta na MÃO do
  // oponente (2ª linha) continua usando `combatValue` de propósito: ela
  // ainda pode ser transformada em qualquer coisa antes de ir a campo, então
  // o desconto "de planejamento" é exatamente a modelagem certa pra ela.
  const revealedThreats = [
    ...opponentState.field.filter((slot) => slot.faceDownCard && slot.revealed).map((slot) => getSpotlightAdjustedValue(slot.faceDownCard!, state.spotlight)),
    ...opponentState.hand.filter((c) => c.revealed).map((c) => combatValue(c, state.spotlight)),
  ];
  if (revealedThreats.length === 0) return null; // nenhuma ameaça visível agora - nada "necessário" a responder
  const biggestThreat = Math.max(...revealedThreats);

  // Já tem uma resposta pronta na mão (inclusive um Ás cru, que serve pra
  // qualquer número) - fundir agora seria gasto sem necessidade.
  const hasUntransformedAce = me.hand.some((c) => c.value === 'A' && c.transformedValue === undefined);
  if (hasUntransformedAce) return null;
  const alreadyHasAnswer = me.hand.some((c) => isNumeralCard(c) && combatValue(c, state.spotlight) > biggestThreat);
  if (alreadyHasAnswer) return null;

  const requiredNumber = getNumeralSpellInfo(character).requiredNumber;
  const reserved = reservedNumeralCardIds(me.hand, character, state.spotlight);
  const candidates = me.hand.filter(
    (c) => isPlainNumeralCard(c) && !reserved.has(c.id) && getEffectiveCardValue(c) !== requiredNumber
  );
  if (candidates.length < 2) return null;

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const sum = getEffectiveCardValue(candidates[i]) + getEffectiveCardValue(candidates[j]);
      if (sum > biggestThreat && sum <= 10) {
        return { cardId1: candidates[i].id, cardId2: candidates[j].id };
      }
    }
  }
  return null;
}

// ============================================================================
// Carta Monstro (Coringa) - zona própria e separada (FIX itens 4 e 7 da 3ª
// rodada). Sem restrição de fase no motor para ATIVAR o efeito (só para
// POSICIONAR - ver decidePlaceMonsterCard), então é checado em qualquer fase
// em que a IA tenha vez de agir.
// ============================================================================

/**
 * FIX (item 4): antes a IA tratava a carta Monstro como qualquer carta
 * Normal/Ás elegível para os 3 slots de combate normais (via isFieldEligible
 * implícito em decideFieldPlacement/decideHorizontalPlacement) - exatamente o
 * bug relatado, já que o Monstro nunca teve valor de combate próprio e
 * lutava com 0. Agora a IA posiciona o Monstro na zona própria assim que tiver
 * um na mão e a zona estiver livre, e nunca mais o considera candidato a ir
 * para um slot de combate (ver remoção das cláusulas `isMonster` abaixo).
 */
function decidePlaceMonsterCard(state: GameState, ai: PlayerNumber): GameAction | null {
  const me = state[playerKeyOf(ai)];
  // Coringa (redesenho completo) nunca posiciona a carta Monstro na Zona -
  // ela vai pro campo normal (ver isCoringaTrapFieldEligible), decidida por
  // decideFieldPlacement/decideHorizontalPlacement, nunca aqui.
  if (characterOf(state, ai) === 'coringa') return null;
  if (me.monsterCard) return null; // zona já ocupada
  // FIX (checagem extensa por bugs, achado via teste de propriedade: "a IA
  // nunca propõe uma ação que o motor rejeita em silêncio"): um Coringa que
  // já esgotou MAX_MONSTER_USES pode acabar de volta na mão de qualquer
  // jogador por caminhos legítimos (reembaralhamento do descarte, campo do
  // oponente voltando pra mão numa Magia Numeral, Fúria Sanguinária da
  // Besta) - `monsterUseCount` nunca reseta, então ele nunca mais vale a
  // pena posicionar (handlePlaceMonsterCard, gameEngine.ts, agora rejeita
  // isso na origem). Sem este filtro, a IA propunha posicioná-lo do mesmo
  // jeito - o motor aceitava a colocação em si (antes desta rodada de
  // correções) mas TODA ativação seguinte era sempre rejeitada, um Coringa
  // morto ocupando a zona pra sempre. Agora simplesmente ignora um Coringa
  // esgotado como candidato, como se a mão não tivesse nenhum.
  const joker = me.hand.find((c) => c.isMonster && (c.monsterUseCount ?? 0) < MAX_MONSTER_USES);
  if (!joker) return null;
  return { type: 'PLACE_MONSTER_CARD', player: ai, cardId: joker.id };
}

/**
 * Ativa o efeito do Monstro já posicionado na zona própria, se houver um
 * pronto (ainda não usado neste turno) e valer a pena.
 *
 * FIX (pedido do usuário: "orçamento do Monstro" - a carta só aguenta
 * MAX_MONSTER_USES ativações no total antes de descartar pra sempre) - antes
 * a IA ativava o efeito toda vez que encontrava QUALQUER valor positivo, sem
 * nunca considerar que estava "queimando" uma carga que podia fazer muito
 * mais falta depois. Agora, na ÚLTIMA carga disponível, cada personagem
 * exige um ganho claramente maior do que exigiria com cargas de sobra -
 * A NÃO SER que a IA já esteja perdendo (ver livesDelta): desesperada, ela
 * não pode se dar ao luxo de guardar a última carga pra um "momento melhor"
 * que pode nunca chegar antes do fim da partida.
 */
function decideMonsterEffect(state: GameState, ai: PlayerNumber, character: CharacterId): GameAction | null {
  const me = state[playerKeyOf(ai)];
  // FIX (checagem extensa por bugs - consolidação de regra duplicada): usa
  // `canActivateMonsterEffect` (gameEngine.ts), a MESMA função que
  // handleActivateMonsterEffectSimple/handleExecuteMagoMonsterEffect usam
  // pra aceitar/rejeitar de verdade (inclusive o `monsterUseCount >=
  // MAX_MONSTER_USES` que esta linha não conferia antes - seguro hoje só
  // porque handlePlaceMonsterCard/resolveMonsterCardAtTurnEnd garantem que
  // essa combinação nunca chega na zona, uma garantia que vivia em outro
  // arquivo, não óbvia lendo só esta função).
  if (!canActivateMonsterEffect(state, ai)) return null;

  const isLastCharge = monsterChargesRemaining(me) <= 1;
  const isLosing = livesDelta(state, ai) < 0;
  // Na última carga, só freia se AINDA não estiver perdendo - perdendo, o
  // comportamento normal (sem exigência extra) já se aplica.
  const holdBackLastCharge = isLastCharge && !isLosing;

  // Besta (Fúria Selvagem): FIX (pedido do usuário) - não dobra mais a soma
  // das horizontais de um slot, e sim UMA carta específica do próprio campo
  // (a principal de um slot OU uma horizontal) - escolhe a carta de maior
  // valor entre TODAS as candidatas do campo, em qualquer slot.
  if (character === 'besta') {
    // FIX (auditoria completa da Besta - bug real encontrado, mesma classe
    // já corrigida no Mago): estas cartas já estão EM CAMPO, comprometidas -
    // `combatValue` desconta um Ás cru pra 6 (pensado só pra planejamento de
    // cartas ainda na mão), mas handleActivateMonsterEffectSimple dobra o
    // valor REAL (`getEffectiveCardValue`, 14 pra um Ás cru). Usar
    // `combatValue` aqui fazia a IA preferir dobrar uma carta comum a um Ás
    // cru já em campo, e podia até recusar a última carga do Monstro achando
    // que o Ás (6) não justificava, quando dobrá-lo (28) claramente valeria.
    // FIX (mesma classe do Tiro Certeiro do Mosqueteiro, ver decideMosqueteiroK):
    // handleActivateMonsterEffectSimple exclui cartas-token de Bola de Fogo
    // (`isFireToken`, Piromante) dos alvos válidos - incluí-las aqui fazia a
    // IA propor uma Fúria Selvagem que o motor rejeitava em silêncio.
    const candidates: { slotIndex: number; cardId: string; value: number }[] = [];
    me.field.forEach((slot, i) => {
      if (slot.faceDownCard && !slot.faceDownCard.isFireToken) {
        candidates.push({ slotIndex: i, cardId: slot.faceDownCard.id, value: getEffectiveCardValue(slot.faceDownCard) });
      }
      slot.horizontalCards
        .filter((c) => !c.isFireToken)
        .forEach((c) => candidates.push({ slotIndex: i, cardId: c.id, value: getEffectiveCardValue(c) }));
    });
    if (candidates.length === 0) return null;
    const best = pickHighestBy(candidates, (c) => c.value);
    // FIX (orçamento do Monstro): dobrar uma carta fraca não justifica a
    // última carga - exige um valor de base claramente alto (7+, viraria 14+).
    if (holdBackLastCharge && best.value < 7) return null;
    return { type: 'ACTIVATE_MONSTER_EFFECT_SIMPLE', player: ai, targetSlotIndex: best.slotIndex, targetCardId: best.cardId };
  }

  // Anjo (Proteção Divina): FIX (pedido do usuário) - agora protege o campo
  // INTEIRO de uma vez (não mais um slot escolhido), então não há mais
  // "melhor slot" pra calcular - só vale a pena ativar se houver alguma
  // carta no campo pra proteger (senão o efeito não protege nada de fato).
  if (character === 'anjo') {
    const filledSlots = me.field.filter((slot) => slot.faceDownCard);
    if (filledSlots.length === 0) return null;
    // FIX (orçamento do Monstro + "contra-jogo específico por personagem do
    // oponente"): a última carga só compensa protegendo um campo com valor
    // real em risco (2+ cartas, ou soma alta) - EXCETO contra um oponente
    // Mago ou Besta, que conseguem explorar um slot revelado e desprotegido
    // (Substituição Arcana e Troca Predatória, respectivamente, ambas trocam
    // uma carta do próprio campo por uma fraca) - contra esses personagens
    // especificamente, a régua da última carga cai para "qualquer coisa a
    // proteger já basta", igual sem restrição de carga nenhuma.
    const opponentCharacter = characterOf(state, opponentOf(ai));
    // FIX (auditoria completa do Anjo - bug real encontrado, mesma classe já
    // corrigida no Mago e na Besta): estas cartas já estão EM CAMPO,
    // comprometidas - `combatValue` desconta um Ás cru pra 6 (pensado só pra
    // planejamento de cartas ainda na mão), subestimando um Ás cru já em
    // campo e fazendo a IA recusar a última carga achando que o campo (na
    // real 14+) não valia a pena proteger.
    const totalFieldValue = filledSlots.reduce((sum, slot) => sum + getEffectiveCardValue(slot.faceDownCard!), 0);
    const worthLastChargeAnyway =
      opponentCharacter === 'mago' || opponentCharacter === 'besta' || filledSlots.length >= 2 || totalFieldValue >= 8;
    if (holdBackLastCharge && !worthLastChargeAnyway) return null;
    return { type: 'ACTIVATE_MONSTER_EFFECT_SIMPLE', player: ai };
  }

  // Mago (Ilusão Arcana): copia o valor da carta revelada mais forte em
  // qualquer campo para reforçar a PRÓPRIA carta numeral mais fraca já em
  // campo. Só ativa quando o ganho realmente vale a pena, já que só pode
  // usar uma vez por turno.
  if (character === 'mago') {
    // FIX (pedido do usuário: "a IA do mago buga a carta do monstro às
    // vezes") - `isNumeralCard` conta um Ás TRANSFORMADO como numeral (seu
    // valor efetivo cai em 2-10) - mas handleExecuteMagoMonsterEffect em
    // gameEngine.ts rejeita QUALQUER carta com `value === 'A'` como alvo da
    // Ilusão Arcana, transformada ou não (o `.value` da carta continua 'A'
    // para sempre, só `transformedValue` muda). Se o pior candidato do
    // próprio campo (worstOwn, abaixo) fosse um Ás já transformado, a IA
    // propunha repetidamente uma ação que o motor sempre rejeitava em
    // silêncio (sem mudar o estado) - como nada mudava, ela ficava presa
    // propondo a MESMA ação rejeitada para sempre (loop de decisão travado,
    // mesma família do bug antigo do TRANSFORM_ACE documentado mais abaixo
    // neste arquivo). Agora exclui Áses (transformados ou não) dos
    // candidatos, batendo exatamente com a regra real do motor.
    const ownCandidates = me.field
      .map((slot, i) => ({ slot, i }))
      .filter(({ slot }) => slot.faceDownCard && isPlainNumeralCard(slot.faceDownCard));
    if (ownCandidates.length === 0) return null;

    // FIX (auditoria completa do Mago - bug real encontrado): a varredura
    // abaixo procura "a carta revelada mais forte em qualquer campo" pra
    // copiar - mas essas cartas já estão REVELADAS e COMPROMETIDAS em campo
    // (própria ou do oponente), não mais "em planejamento" na mão. Usar
    // `combatValue` aqui (que deliberadamente desconta um Ás cru pra 6,
    // pensado só pra cartas ainda na mão) subestimava um Ás cru revelado -
    // handleExecuteMagoMonsterEffect (gameEngine.ts) sempre copia o valor
    // REAL (`getEffectiveCardValue`, 14 pra um Ás cru), então a IA podia
    // achar que a melhor carta disponível valia só 6 e desistir de ativar
    // a Ilusão Arcana bem na hora que ela mais valeria a pena.
    let bestValue = 0;
    let bestCardId: string | null = null;
    for (const field of [state.player1.field, state.player2.field]) {
      for (const slot of field) {
        if (slot.faceDownCard && slot.revealed && !slot.faceDownCard.isMonster) {
          const value = getEffectiveCardValue(slot.faceDownCard);
          if (value > bestValue) {
            bestValue = value;
            bestCardId = slot.faceDownCard.id;
          }
        }
      }
    }
    if (!bestCardId || bestValue < 8) return null;

    const worstOwn = ownCandidates.reduce((worst, entry) =>
      combatValue(entry.slot.faceDownCard!, state.spotlight) < combatValue(worst.slot.faceDownCard!, state.spotlight) ? entry : worst
    );
    const gain = bestValue - combatValue(worstOwn.slot.faceDownCard!, state.spotlight);
    if (gain <= 0) return null;
    // FIX (orçamento do Monstro): na última carga, exige um ganho bem mais
    // largo (não só "um pouco melhor") - senão guarda a carga.
    if (holdBackLastCharge && gain < 5) return null;

    return { type: 'EXECUTE_MAGO_MONSTER_EFFECT', player: ai, targetSlotIndex: worstOwn.i, targetCardId: bestCardId };
  }

  // Mosqueteiro (Recarga Rápida): só vale a pena se a IA tiver um Valete ou
  // Rainha PRÓPRIA na mão pra de fato aproveitar o redirecionamento ainda
  // neste turno (senão a flag fica pendurada à toa até expirar no fim do
  // turno - ver mosqueteiroRedirectNextDiscard) E o oponente tiver pelo
  // menos 1 carta na mão pra descartar (senão não há alvo nenhum pro
  // redirecionamento).
  if (character === 'mosqueteiro') {
    const opponentState = state[playerKeyOf(opponentOf(ai))];
    if (opponentState.hand.length === 0) return null;
    const hasFollowUp = me.hand.some((c) => c.value === 'J' || c.value === 'Q');
    if (!hasFollowUp) return null;
    if (holdBackLastCharge && opponentState.hand.length < 2) return null;
    return { type: 'ACTIVATE_MONSTER_EFFECT_SIMPLE', player: ai };
  }

  // Coringa (redesenho completo) nunca chega aqui - sua carta Monstro nunca
  // ocupa a Zona Monstro (ver decidePlaceMonsterCard/handlePlaceMonsterCard)
  // - é tratada como uma carta de número 15, decidida junto com o resto do
  // campo normal (ver isCoringaTrapFieldEligible/decideFieldPlacement/
  // decideHorizontalPlacement).

  // Piromante (personagem novo) - Brasa (+5 na Bola de Fogo, sem alvo) quase
  // não tem desvantagem real, então ativa sempre que possível - só freia na
  // última carga se a Bola de Fogo já estiver perto do teto (senão o
  // combustível extra se perderia no arredondamento pro teto).
  if (character === 'piromante') {
    const cap = getFireballCap(state.gameConfig);
    if (holdBackLastCharge && me.fireballValue >= cap - 2) return null;
    return { type: 'ACTIVATE_MONSTER_EFFECT_SIMPLE', player: ai };
  }

  return null;
}

// ============================================================================
// Fase de Estratégia
// ============================================================================

function decideMagoQ(state: GameState, ai: PlayerNumber): GameAction | null {
  const me = state[playerKeyOf(ai)];
  const qCard = me.hand.find((c) => c.value === 'Q');
  if (!qCard) return null;
  if (!canActivateMagic('strategy', 'mago', 'Q', getMagicActivationContext(state, ai))) return null;

  // Só usa no PRÓPRIO campo: substituir uma carta do oponente entregaria a
  // ele uma carta nova (da mão da própria IA) de graça, o que ajudaria o
  // adversário em vez de prejudicá-lo.
  // FIX (Modo Towers - risco real encontrado): uma torre não é mais
  // "substituída de graça" por esta magia (ver o novo mecanismo funde/
  // descasca em handleExecuteMagic) - se o valor da carta escolhida não
  // bater com o topo da torre, o efeito vira "descarta o topo da PRÓPRIA
  // torre sem ganhar nada" (a carta nova nunca entra) - um auto-sabotagem
  // sem sentido nenhum pra esta função, que só existe pra "trocar por uma
  // carta melhor de graça". Excluída dos candidatos - reforçar a própria
  // torre já tem um caminho dedicado e correto (decideTowerAction).
  const ownFilled = me.field.map((slot, i) => ({ slot, i })).filter(({ slot }) => slot.faceDownCard && !isTowerSlot(slot));
  if (ownFilled.length === 0) return null;

  // FIX (auditoria completa do Mago - bug real encontrado): esta era a única
  // função de decisão de mão do Mago que nunca chamava reservedNumeralCardIds
  // - podia perfeitamente escolher jogar no campo uma das cartas "9"
  // reservadas pra completar o trio da própria Magia Numeral (Visão Arcana),
  // destruindo uma combinação quase pronta por uma troca sem necessidade
  // tática real. Mesma proteção que decideFieldPlacement/
  // decideHorizontalPlacement/as funções de fusão já usam.
  const reserved = reservedNumeralCardIds(me.hand, 'mago', state.spotlight);
  const numeralCandidates = me.hand.filter((c) => c.id !== qCard.id && !reserved.has(c.id) && isNumeralCard(c));
  if (numeralCandidates.length === 0) return null;

  const bestHandCard = pickHighestBy(numeralCandidates, (c) => combatValue(c, state.spotlight));
  // FIX (auditoria completa do Mago - bug real encontrado): `entry.slot.faceDownCard`
  // já está EM CAMPO, comprometido - pode ser um Ás cru (decideFieldPlacement
  // permite isso quando não há outra opção), cujo valor REAL é 14
  // (getEffectiveCardValue), não o 6 "de planejamento" que `combatValue`
  // atribui pra Áses ainda na mão. Usar `combatValue` aqui fazia a IA achar
  // que o próprio Ás forte já em campo era "a pior carta" e trocá-lo por um
  // numeral medíocre da mão - uma downgrade real, não uma melhora.
  // FIX (pedido do usuário, Modo Spotlight): `getSpotlightAdjustedValue` no
  // lugar de `getEffectiveCardValue` aqui - a mesma lógica do parágrafo
  // acima (comparar a força REAL da carta já em campo), agora também
  // considerando que ela pode estar spotlighted.
  const worstFieldEntry = ownFilled.reduce((worst, entry) =>
    getSpotlightAdjustedValue(entry.slot.faceDownCard!, state.spotlight) < getSpotlightAdjustedValue(worst.slot.faceDownCard!, state.spotlight) ? entry : worst
  );

  if (combatValue(bestHandCard, state.spotlight) <= getSpotlightAdjustedValue(worstFieldEntry.slot.faceDownCard!, state.spotlight)) return null;

  return {
    type: 'EXECUTE_MAGIC',
    player: ai,
    cardId: qCard.id,
    character: 'mago',
    magicType: 'Q',
    selection: { selectedSlot: worstFieldEntry.i, selectedTargetPlayer: ai, selectedCards: [bestHandCard.id] },
  };
}

/**
 * FIX (auditoria completa da Besta - 2 bugs reais encontrados):
 *
 * 1. `worstFieldEntry`/a comparação final usavam `combatValue` numa carta já
 *    EM CAMPO (comprometida) - mesma classe de bug já corrigida no Mago:
 *    `combatValue` desconta um Ás cru pra 6 (pensado só pra planejamento de
 *    cartas ainda na mão), mas o valor real de campo é `getEffectiveCardValue`
 *    (14 pra um Ás cru). Isso fazia a IA trocar o próprio Ás forte já em
 *    campo por uma carta do descarte pior, achando que estava melhorando.
 *
 * 2. A função nunca considerava mirar o campo do OPONENTE, mesmo
 *    `canActivateMagic` permitindo isso (ver `hasCardsInField`/
 *    `hasRevealedUnprotectedCardInOpponentField`) e o próprio motor
 *    (`handleExecuteMagic`) suportando isso plenamente - diferente da
 *    Substituição Arcana do Mago (onde mirar o oponente entregaria a ele uma
 *    carta da MÃO da própria IA de graça), a Troca Predatória usa uma carta
 *    do DESCARTE (recurso público) e DESCARTA a carta antiga do alvo pra
 *    sempre (nunca volta pra mão dele - ver comentário em handleExecuteMagic)
 *    - ou seja, mirar o oponente é puramente ofensivo: rebaixa o campo dele
 *    trocando a carta mais forte revelada e desprotegida por uma fraca do
 *    descarte. Sem essa opção, a IA ficava sem nenhuma jogada sempre que o
 *    PRÓPRIO campo estivesse vazio (um beco sem saída real, mesmo com a
 *    magia legalmente ativável).
 */
function decideBestaQ(state: GameState, ai: PlayerNumber): GameAction | null {
  const me = state[playerKeyOf(ai)];
  const qCard = me.hand.find((c) => c.value === 'Q');
  if (!qCard) return null;
  if (!canActivateMagic('strategy', 'besta', 'Q', getMagicActivationContext(state, ai))) return null;

  const discardNumerals = state.discardPile.filter((c) => isNumeralCard(c));
  if (discardNumerals.length === 0) return null;

  // Motivo 1 (defensivo): melhora o próprio campo, se houver uma carta pior
  // do que o melhor numeral disponível no descarte.
  // FIX (Modo Towers - mesmo risco encontrado em decideMagoQ): excluída a
  // própria torre dos candidatos - sem garantia de que o valor bate com o
  // topo dela, isso viraria "descarta o topo da PRÓPRIA torre sem ganhar
  // nada" em vez de uma troca vantajosa. Reforçar a própria torre já tem um
  // caminho dedicado (decideTowerAction).
  const ownFilled = me.field.map((slot, i) => ({ slot, i })).filter(({ slot }) => slot.faceDownCard && !isTowerSlot(slot));
  if (ownFilled.length > 0) {
    const bestDiscardCard = pickHighestBy(discardNumerals, (c) => combatValue(c, state.spotlight));
    const worstFieldEntry = pickHighestBy(ownFilled, (entry) => -getSpotlightAdjustedValue(entry.slot.faceDownCard!, state.spotlight));
    if (getSpotlightAdjustedValue(bestDiscardCard, state.spotlight) > getSpotlightAdjustedValue(worstFieldEntry.slot.faceDownCard!, state.spotlight)) {
      return {
        type: 'EXECUTE_MAGIC',
        player: ai,
        cardId: qCard.id,
        character: 'besta',
        magicType: 'Q',
        selection: { selectedSlot: worstFieldEntry.i, selectedCards: [bestDiscardCard.id] },
      };
    }
  }

  // Motivo 2 (ofensivo): sem melhora própria disponível (ou campo próprio
  // vazio), sabota a carta mais forte revelada e desprotegida do oponente,
  // rebaixando-a com a PIOR carta do descarte (não desperdiça uma boa).
  const opponent = opponentOf(ai);
  const opponentField = state[opponentKeyOf(ai)].field;
  const opponentTargets = opponentField
    .map((slot, i) => ({ slot, i }))
    .filter(({ slot, i }) => slot.faceDownCard && slot.revealed && !isSlotProtected(state, opponent, i));
  if (opponentTargets.length === 0) return null;

  const bestOpponentEntry = pickHighestBy(opponentTargets, (entry) => getSpotlightAdjustedValue(entry.slot.faceDownCard!, state.spotlight));

  // FIX (Modo Towers - pedido do usuário: "Substituição Arcana/Troca
  // Predatória viram ferramenta anti-torre"): mirando uma torre do
  // oponente, "a pior carta do descarte" precisa EVITAR bater com o valor
  // do topo da torre - um valor igual FUNDIRIA a carta trazida na torre
  // inimiga (reforçando ela, o oposto do que esta sabotagem quer). Quando
  // não bate, o efeito só descarta o topo da torre (encolhe 1) - o resultado
  // desejado. Se TODA carta do descarte coincidir com o valor da torre (raro,
  // mas possível), não há como sabotar sem sem querer ajudar - desiste desta
  // vez.
  //
  // FIX (pedido do usuário, Modo Spotlight): a comparação de valor "igual ao
  // topo da torre" usa o valor BASE (getEffectiveCardValue), não o ajustado -
  // é uma checagem de FUSÃO/empilhamento (mesmo número de face), não de
  // força de combate, e a torre em si (canFormOrReinforceTower) também
  // compara por valor base - ver towerEligibleValue em gameEngine.ts.
  const isTargetTower = isTowerSlot(bestOpponentEntry.slot);
  const targetTopValue = isTargetTower ? getEffectiveCardValue(bestOpponentEntry.slot.faceDownCard!) : null;
  const safeDiscardCandidates = isTargetTower ? discardNumerals.filter((c) => getEffectiveCardValue(c) !== targetTopValue) : discardNumerals;
  if (safeDiscardCandidates.length === 0) return null;
  const worstDiscardCard = pickHighestBy(safeDiscardCandidates, (c) => -getSpotlightAdjustedValue(c, state.spotlight));

  if (!isTargetTower && getSpotlightAdjustedValue(bestOpponentEntry.slot.faceDownCard!, state.spotlight) <= getSpotlightAdjustedValue(worstDiscardCard, state.spotlight)) return null;

  return {
    type: 'EXECUTE_MAGIC',
    player: ai,
    cardId: qCard.id,
    character: 'besta',
    magicType: 'Q',
    selection: { selectedSlot: bestOpponentEntry.i, selectedTargetPlayer: opponent, selectedCards: [worstDiscardCard.id] },
  };
}

function decideAnjoQ(state: GameState, ai: PlayerNumber): GameAction | null {
  const me = state[playerKeyOf(ai)];
  const qCard = me.hand.find((c) => c.value === 'Q');
  if (!qCard) return null;
  if (!canActivateMagic('strategy', 'anjo', 'Q', getMagicActivationContext(state, ai))) return null;

  const opponent = opponentOf(ai);
  const opponentField = state[opponentKeyOf(ai)].field;
  const fieldTarget = opponentField.findIndex((slot, i) => slot.faceDownCard && !slot.revealed && !isSlotProtected(state, opponent, i));
  if (fieldTarget !== -1) {
    return {
      type: 'EXECUTE_MAGIC',
      player: ai,
      cardId: qCard.id,
      character: 'anjo',
      magicType: 'Q',
      selection: { selectedSlot: fieldTarget },
    };
  }

  const opponentHand = state[opponentKeyOf(ai)].hand;
  const handTarget = opponentHand.find((c) => !c.revealed);
  if (handTarget) {
    return {
      type: 'EXECUTE_MAGIC',
      player: ai,
      cardId: qCard.id,
      character: 'anjo',
      magicType: 'Q',
      selection: { selectedCards: [handTarget.id] },
    };
  }

  return null; // nada de novo para revelar
}

/**
 * Rei do Anjo (Reforço Angelical) - permite empilhar 1 carta horizontal
 * EXTRA no turno (cumulativo, sem teto - ver `horizontalStackBonus`).
 *
 * FIX (pedido do usuário: "veja se a IA utiliza magias corretamente") - até
 * aqui a IA NUNCA ativava esta magia (a nota que existia aqui antes dizia
 * que isso era intencional porque "a IA só posiciona 1 carta horizontal por
 * turno" - mas isso só descreve o comportamento SEM a magia; a magia em si
 * ficava permanentemente sem uso, mesmo quando valeria a pena). Agora ativa
 * quando o limite normal deste turno já foi atingido, ainda existe um slot
 * com carta principal pra receber outra horizontal, e sobra uma carta boa +
 * reserva de mão suficiente depois de gastar o Rei e essa carta.
 */
function decideAnjoK(state: GameState, ai: PlayerNumber): GameAction | null {
  const me = state[playerKeyOf(ai)];
  const kCard = me.hand.find((c) => c.value === 'K');
  if (!kCard) return null;
  if (!canActivateMagic('strategy', 'anjo', 'K', getMagicActivationContext(state, ai))) return null;

  const maxHorizontal = 1 + me.horizontalStackBonus;
  const horizontalPlacedThisTurn = me.field.reduce((n, s) => n + s.horizontalCards.length, 0);
  if (horizontalPlacedThisTurn < maxHorizontal) return null; // ainda não bateu no limite atual - a magia não faria diferença agora

  // FIX (mesmo bug de decideHorizontalPlacement acima): uma torre TEM
  // `faceDownCard` mas nunca aceita reforço horizontal - sem excluir
  // `isTowerSlot`, a IA podia achar que valia a pena gastar o Rei aqui
  // mesmo quando o único slot preenchido era uma torre, e a horizontal
  // subsequente nunca teria onde ir.
  const hasSlotForHorizontal = me.field.some((slot) => slot.faceDownCard && !isTowerSlot(slot));
  if (!hasSlotForHorizontal) return null;

  const reserved = reservedNumeralCardIds(me.hand, 'anjo', state.spotlight);
  const candidates = me.hand.filter((c) => c.id !== kCard.id && !c.revealed && !reserved.has(c.id) && isFieldEligible(c));
  if (candidates.length === 0) return null;
  if (me.hand.length - 2 < 2) return null; // gasta o Rei + a carta candidata (próximo ciclo) - mantém reserva de 2

  return { type: 'ACTIVATE_SIMPLE_MAGIC', player: ai, cardId: kCard.id };
}

/**
 * Mosqueteiro J (Tiro de Cobertura): descarta 1 carta pra ganhar +1 no
 * limite de horizontais deste turno (mesmo mecanismo de Reforço Angelical
 * do Anjo, ver decideAnjoK acima) - só ativa quando já existe pelo menos 1
 * slot preenchido (senão o bônus não teria onde ser usado ainda) e uma
 * carta candidata sobrando na mão pra descartar.
 *
 * Fonte do descarte: normalmente a PRÓPRIA mão (descarta a carta mais fraca
 * disponível, preservando as reservadas pra própria Magia Numeral). Se a
 * Recarga Rápida (Monstro) estiver ativa, a fonte vira a mão do OPONENTE -
 * e como a IA nunca lê o valor de uma carta ainda não revelada do oponente
 * (mesmo princípio documentado no topo deste arquivo, ver Mago J em
 * decideDrawPhase), a escolha ali é sempre ALEATÓRIA por posição, nunca por
 * valor real.
 */
/**
 * Mosqueteiro - filtra candidatos a descarte da PRÓPRIA mão (Valete/Rainha)
 * pra nunca sacrificar cartas elegíveis pro campo (Ás/numeral) que ainda
 * fazem falta pra preencher os slots vazios deste turno.
 *
 * FIX (pedido do usuário: "a IA do mosqueteiro não posiciona 3 cartas no
 * campo quando necessário") - a Rajada Reveladora (Rainha) descarta até 3
 * cartas de uma vez, ordenando por MENOR combatValue - exatamente a mesma
 * régua que prioriza numerais baratos (2-10) antes de magias J/K (11/13),
 * já que `combatValue` usa o valor de face. Sem nenhuma proteção, isso
 * esvaziava a mão das próprias cartas mais baratas que iriam pro campo,
 * deixando slot(s) vazios (valendo só 1 no combate) sem necessidade real -
 * a mão ainda tinha magias J/K sobrando que nunca iriam pro campo mesmo, e
 * seriam descartes mais seguros.
 *
 * Só restringe quando REALMENTE não há sobra (cartas elegíveis no total <=
 * slots vazios) - com sobra de verdade, qualquer carta (incluindo
 * elegíveis) pode ser descartada normalmente, sem ficar mais conservador
 * que o necessário.
 */
function fieldSafeDiscardCandidates(me: PlayerState, candidates: Card[]): Card[] {
  const emptySlots = 3 - getFilledFieldSlots(me.field).length;
  if (emptySlots <= 0) return candidates;
  const eligibleInHand = me.hand.filter((c) => isFieldEligible(c)).length;
  if (eligibleInHand > emptySlots) return candidates;
  return candidates.filter((c) => !isFieldEligible(c));
}

function decideMosqueteiroJ(state: GameState, ai: PlayerNumber): GameAction | null {
  const me = state[playerKeyOf(ai)];
  const jCard = me.hand.find((c) => c.value === 'J');
  if (!jCard) return null;
  if (!canActivateMagic('strategy', 'mosqueteiro', 'J', getMagicActivationContext(state, ai))) return null;

  const hasSlotForHorizontal = me.field.some((slot) => slot.faceDownCard && !isTowerSlot(slot));
  if (!hasSlotForHorizontal) return null;

  const redirecting = me.mosqueteiroRedirectNextDiscard;
  if (redirecting) {
    const opponentHand = state[opponentKeyOf(ai)].hand;
    if (opponentHand.length === 0) return null;
    const target = opponentHand[Math.floor(random() * opponentHand.length)];
    return {
      type: 'EXECUTE_MAGIC',
      player: ai,
      cardId: jCard.id,
      character: 'mosqueteiro',
      magicType: 'J',
      selection: { selectedCards: [target.id] },
    };
  }

  const reserved = reservedNumeralCardIds(me.hand, 'mosqueteiro', state.spotlight);
  const candidates = fieldSafeDiscardCandidates(me, me.hand.filter((c) => c.id !== jCard.id && !reserved.has(c.id)));
  if (candidates.length === 0) return null;
  if (me.hand.length - 2 < 2) return null; // gasta o Valete + a carta candidata - mantém reserva de 2

  const worst = candidates.reduce((worst, c) => (combatValue(c, state.spotlight) < combatValue(worst, state.spotlight) ? c : worst));
  return {
    type: 'EXECUTE_MAGIC',
    player: ai,
    cardId: jCard.id,
    character: 'mosqueteiro',
    magicType: 'J',
    selection: { selectedCards: [worst.id] },
  };
}

/**
 * Mosqueteiro Q (Rajada Reveladora): descarta até 3 cartas (mesma fonte do
 * Valete acima) pra revelar essa mesma quantidade de cartas ocultas do
 * oponente (mão OU campo) - a escolha de QUAIS cartas do oponente revelar é
 * sempre ALEATÓRIA (às cegas por posição, mesmo princípio de nunca ler
 * valor oculto real - ver cabeçalho do arquivo), já que revelar é o próprio
 * PONTO da magia (não haveria vantagem informacional em "escolher bem" um
 * alvo cujo valor a IA não deveria conhecer de antemão).
 */
function decideMosqueteiroQ(state: GameState, ai: PlayerNumber): GameAction | null {
  const me = state[playerKeyOf(ai)];
  const qCard = me.hand.find((c) => c.value === 'Q');
  if (!qCard) return null;
  if (!canActivateMagic('strategy', 'mosqueteiro', 'Q', getMagicActivationContext(state, ai))) return null;

  const redirecting = me.mosqueteiroRedirectNextDiscard;
  const reserved = reservedNumeralCardIds(me.hand, 'mosqueteiro', state.spotlight);
  const ownPool = fieldSafeDiscardCandidates(me, me.hand.filter((c) => c.id !== qCard.id && !reserved.has(c.id)));
  const discardPool = redirecting ? state[opponentKeyOf(ai)].hand : ownPool;
  if (discardPool.length === 0) return null;
  // Mantém reserva de 2 cartas na própria mão quando descartando da própria
  // (mesmo espírito de decideMosqueteiroJ acima) - não se aplica quando
  // descartando da mão do OPONENTE, já que isso não consome a mão da IA.
  const maxFromOwn = redirecting ? 3 : Math.max(0, me.hand.length - 1 - 2);
  const discardCount = Math.min(3, discardPool.length, redirecting ? discardPool.length : maxFromOwn);
  if (discardCount === 0) return null;

  const discardTargets = redirecting
    ? pickRandomN(discardPool, discardCount)
    : [...discardPool].sort((a, b) => combatValue(a, state.spotlight) - combatValue(b, state.spotlight)).slice(0, discardCount);

  const opponentState = state[opponentKeyOf(ai)];
  const discardTargetIds = new Set(discardTargets.map((c) => c.id));
  const revealHandTargets = opponentState.hand.filter((c) => !c.revealed && !discardTargetIds.has(c.id));
  const revealFieldTargets: Card[] = [];
  opponentState.field.forEach((slot) => {
    if (slot.faceDownCard && !slot.faceDownCard.revealed) revealFieldTargets.push(slot.faceDownCard);
    slot.horizontalCards.forEach((h) => {
      if (!h.revealed) revealFieldTargets.push(h);
    });
  });
  const revealPool = [...revealHandTargets, ...revealFieldTargets];
  const revealTargets = pickRandomN(revealPool, discardTargets.length);

  return {
    type: 'EXECUTE_MAGIC',
    player: ai,
    cardId: qCard.id,
    character: 'mosqueteiro',
    magicType: 'Q',
    selection: { selectedCards: discardTargets.map((c) => c.id), selectedRevealCardIds: revealTargets.map((c) => c.id) },
  };
}

function decideStrategyMagic(state: GameState, ai: PlayerNumber, character: CharacterId): GameAction | null {
  if (character === 'mago') return decideMagoQ(state, ai);
  if (character === 'besta') return decideBestaQ(state, ai);
  if (character === 'anjo') return decideAnjoQ(state, ai) ?? decideAnjoK(state, ai);
  // Mosqueteiro (personagem novo): Valete E Rainha são AMBOS de Estratégia
  // (diferente dos outros 3, que têm no máximo 1 magia de Estratégia cada) -
  // tenta o Valete primeiro (mais barato, 1 carta) antes da Rainha (até 3).
  if (character === 'mosqueteiro') return decideMosqueteiroJ(state, ai) ?? decideMosqueteiroQ(state, ai);
  // Coringa (redesenho completo) nunca chega aqui - Rainha/Rei são
  // posicionados no campo normal (decideFieldPlacement), não ativados.
  if (character === 'piromante') return decidePiromanteQ(state, ai);
  return null;
}

/**
 * Piromante (personagem novo) - Roubo Flamejante (Rainha): queima a carta
 * revelada mais valiosa do oponente (mão ou horizontal no campo, valor 2-10)
 * disponível - prioriza SEMPRE alimentar a Bola de Fogo (nunca perde valor,
 * e ainda sabota o oponente de brinde) sobre lançar; só lança se não houver
 * nenhum alvo pra queimar agora.
 */
function decidePiromanteQ(state: GameState, ai: PlayerNumber): GameAction | null {
  const me = state[playerKeyOf(ai)];
  const qCard = me.hand.find((c) => c.value === 'Q');
  if (!qCard || !canActivateMagic('strategy', 'piromante', 'Q', getMagicActivationContext(state, ai))) return null;

  const opponentState = state[playerKeyOf(opponentOf(ai))];
  const candidates = [
    ...opponentState.hand.filter((c) => c.revealed && isNumeralCard(c)),
    ...opponentState.field.flatMap((slot) => slot.horizontalCards.filter((c) => c.revealed && isNumeralCard(c))),
  ];
  if (candidates.length > 0) {
    const best = pickHighestBy(candidates, (c) => getEffectiveCardValue(c));
    return { type: 'EXECUTE_MAGIC', player: ai, cardId: qCard.id, character: 'piromante', magicType: 'Q', selection: { selectedCards: [best.id] } };
  }

  if (shouldLaunchFireball(state, ai)) {
    const target = pickFireballTarget(state, ai);
    if (target !== null) {
      return {
        type: 'EXECUTE_MAGIC',
        player: ai,
        cardId: qCard.id,
        character: 'piromante',
        magicType: 'Q',
        selection: { fireballLaunch: true, selectedTargetSlot: target },
      };
    }
  }
  return null;
}

/**
 * Coringa (redesenho completo, pedido do usuário) - Rainha armadilha
 * revelada em Combate: qual carta REVELADA do campo do oponente copiar.
 * Chamada por GameBoard.tsx quando a IA é a dona da Rainha envolvida numa
 * disputa - escolhe sempre a de MAIOR valor efetivo entre as reveladas
 * (mesma informação que um jogador real já teria, nunca lê nada oculto).
 * `undefined` quando não há nenhuma carta revelada do oponente disponível -
 * handleResolveCombat trata a ausência de alvo como valor 1 (gameEngine.ts).
 */
export function decideCoringaQCopyTarget(state: GameState, qOwner: PlayerNumber): string | undefined {
  const opponentState = state[playerKeyOf(opponentOf(qOwner))];
  const revealedOpponentCards = opponentState.field.flatMap((slot) => [
    ...(slot.faceDownCard?.revealed ? [slot.faceDownCard] : []),
    ...slot.horizontalCards.filter((c) => c.revealed),
  ]);
  if (revealedOpponentCards.length === 0) return undefined;
  return pickHighestBy(revealedOpponentCards, (c) => getEffectiveCardValue(c)).id;
}

/**
 * FIX (item 13): quando a mão já tem 2+ cartas que combinam com a Magia
 * Numeral do personagem (faltando só 1 para completar o trio de 3), essas
 * cartas ficam "reservadas" - a IA para de considerá-las candidatas a ir
 * para o campo (nem virada, nem horizontal), preservando a combinação até
 * conseguir a 3ª carta e poder ativar a magia. Antes a IA nunca reservava
 * nada de propósito: mesmo com 2 cartas do número certo na mão, a
 * prioridade normal de posicionamento podia perfeitamente escolher jogar
 * uma delas em campo, destruindo a combinação antes mesmo de ela se
 * completar.
 */
function reservedNumeralCardIds(hand: Card[], character: CharacterId, spotlight: SpotlightState | null): Set<string> {
  const matching = getMatchingNumeralCards(character, hand, spotlight);
  if (matching.length < 2) return new Set();
  return new Set(matching.map((c) => c.id));
}

/**
 * FIX (pedido do usuário: "quando tem menos vidas que o oponente e a mão só
 * consiste de 2 ou menos cartas que seriam utilizadas para magia numeral...
 * a IA não põe elas nos campos na fase de estratégia, corrija isso, ele as
 * coloca caso esteja perdendo") - quando a IA está PERDENDO (menos vidas que
 * o oponente) e a mão não tem NENHUMA outra carta elegível pra campo fora
 * das reservadas pra própria Magia Numeral, guardar a combinação-em-
 * andamento vira um luxo que ela não pode mais bancar: sem isso, ela ficava
 * de campo vazio o turno inteiro só esperando uma 3ª carta que talvez nunca
 * chegue, enquanto ia perdendo a partida aos poucos. Nesse cenário específico
 * ela sacrifica a combinação e joga as cartas reservadas mesmo.
 *
 * Só se aplica a Besta e Mago (pedido explícito do usuário) - o Anjo fica de
 * fora.
 */
function shouldSacrificeNumeralSpellForCombat(state: GameState, ai: PlayerNumber, character: CharacterId): boolean {
  if (character !== 'besta' && character !== 'mago') return false;
  const me = state[playerKeyOf(ai)];
  const opponent = state[opponentKeyOf(ai)];
  return me.lives < opponent.lives;
}

function decideHorizontalPlacement(state: GameState, ai: PlayerNumber, character: CharacterId): GameAction | null {
  const me = state[playerKeyOf(ai)];
  // FIX (item 1, revisado): o limite de cartas horizontais é por TURNO
  // (campo inteiro), não por slot - já colocou o máximo permitido neste
  // turno (1, +1 a cada ativação do Reforço Angelical do Anjo, que a IA
  // nunca ativa proativamente), não tenta mais nenhuma.
  const maxHorizontal = 1 + me.horizontalStackBonus;
  const horizontalPlacedThisTurn = me.field.reduce((n, s) => n + s.horizontalCards.length, 0);
  if (horizontalPlacedThisTurn >= maxHorizontal) return null;

  // FIX (auditoria completa do Anjo - lacuna de capacidade encontrada): o
  // motor permite empilhar MAIS DE UMA carta horizontal no MESMO slot (só o
  // total do campo inteiro no turno é limitado, ver handlePlayCard em
  // gameEngine.ts) - mas a busca antiga só considerava slots com ZERO
  // horizontais (`slot.horizontalCards.length === 0`), então assim que todo
  // slot preenchido já tivesse 1 carta horizontal, a capacidade extra
  // desbloqueada pelo Reforço Angelical (Rei do Anjo) ficava presa sem uso -
  // a IA gastava o Rei e depois não conseguia colocar a horizontal extra que
  // ele deveria ter permitido. Agora escolhe o slot preenchido com MENOS
  // horizontais (espalha primeiro pelos slots vazios, e só empilha uma 2ª no
  // mesmo slot quando não sobra mais nenhum com zero).
  // FIX (bug reportado pelo usuário - log de ações lotado de "Não é possível
  // posicionar carta horizontal sobre uma torre!"): torres nunca aceitam
  // reforço horizontal (ver canFormOrReinforceTower/handlePlayCard em
  // gameEngine.ts - horizontalCards.length > 0 nem sequer é permitido ao
  // formar uma torre, e o motor rejeita o inverso também), mas esse filtro
  // só excluía slots vazios (`!slot.faceDownCard`) - uma torre TEM
  // `faceDownCard` (o topo dela), então a IA a tratava como um slot comum
  // preenchido e tentava reforçá-la a cada turno, sendo sempre recusada pelo
  // motor e nunca desistindo (nenhum outro slot preenchido "usava" a
  // tentativa, então ela repetia a cada ciclo de decisão).
  const eligibleSlots = me.field.map((slot, i) => ({ slot, i })).filter(({ slot }) => slot.faceDownCard && !isTowerSlot(slot));
  if (eligibleSlots.length === 0) return null;
  const target = eligibleSlots.reduce((best, cur) => (cur.slot.horizontalCards.length < best.slot.horizontalCards.length ? cur : best));
  const targetSlotIndex = target.i;

  // Mantém ao menos 2 cartas de reserva na mão (combustível para magias
  // como Substituição Arcana, ou só para não ficar sem opções).
  if (me.hand.length - 1 < 2) return null;

  // FIX (item 4): cartas Monstro nunca podem mais ir para reforço horizontal
  // (nem para nenhum dos 3 slots de combate normais) - elas só vão para a
  // zona própria (ver decidePlaceMonsterCard), então `isFieldEligible` já
  // basta aqui sem nenhuma cláusula extra para `isMonster`.
  const reserved = reservedNumeralCardIds(me.hand, character, state.spotlight);
  const candidates = me.hand.filter(
    (c) => !c.revealed && !reserved.has(c.id) && (isFieldEligible(c) || isCoringaTrapFieldEligible(character, c, true))
  );
  if (candidates.length === 0) return null;

  // FIX (pedido do usuário: "contra-jogo específico por personagem do
  // oponente" - "evitar deixar uma carta fraca sem revelar" reformulado pro
  // caso realmente acionável: Destruição de Reforço do Mago destrói TODAS as
  // horizontais de um slot de graça, então empilhar a carta mais FORTE ali
  // é o pior lugar pra arriscá-la contra esse personagem especificamente -
  // reservada pro slot principal, ela nunca é alvo dessa magia. Só muda a
  // escolha (pior candidata em vez da melhor) quando o oponente É Mago -
  // contra qualquer outro personagem, continua escolhendo a melhor
  // disponível, já que não há esse risco de destruição gratuita.
  const opponentCharacter = characterOf(state, opponentOf(ai));
  const chosen = opponentCharacter === 'mago'
    ? pickHighestBy(candidates, (c) => -combatValue(c, state.spotlight))
    : pickHighestBy(candidates, (c) => combatValue(c, state.spotlight));
  return { type: 'PLAY_CARD', player: ai, cardId: chosen.id, slotIndex: targetSlotIndex, asHorizontal: true };
}

/**
 * FIX (Fase D): decide, de forma condicional e parcialmente aleatória, se
 * vale a pena SEGURAR uma carta na mão (deixar um slot de campo vazio de
 * propósito) em vez de jogá-la agora - abrindo mão de uma disputa deste
 * turno (um slot vazio ainda vale 1 no combate, então não é um desperdício
 * total) para guardar uma carta forte para o próximo turno, quando já se
 * sabe, por cartas REVELADAS do oponente (nunca por informação oculta), que
 * ele tem cartas de valor muito alto em campo. Deliberadamente probabilística
 * (não sempre que houver uma ameaça revelada) para não criar um padrão
 * óbvio e explorável.
 *
 * FIX (pedido do usuário: "escalar agressividade pelo placar de vidas... ser
 * mais agressiva com cartas fortes quando à beira da derrota, jogar mais
 * conservador quando muito à frente") - o placar de vidas (público, visível
 * aos dois lados) agora ajusta essa chance: perdendo, a IA não pode mais se
 * dar ao luxo de abrir mão de NENHUMA disputa de propósito (precisa de toda
 * carta forte comprometida JÁ); ganhando por 2 vidas ou mais mesmo folga
 * pra sacrificar uma disputa com mais frequência, preservando recursos pro
 * resto da partida enquanto a vantagem absorve o risco.
 */
function shouldHoldBackField(state: GameState, ai: PlayerNumber): boolean {
  const humanKey = opponentKeyOf(ai);
  const opponentCharacter = characterOf(state, opponentOf(ai));
  const opponentState = state[humanKey];
  const hasRevealedThreat = opponentState.field.some(
    (slot, i) =>
      slot.faceDownCard && slot.revealed && trueSlotValue(opponentState, i, opponentCharacter, state.spotlight, { opponentView: true }) >= 9
  );
  if (!hasRevealedThreat) return false;

  const delta = livesDelta(state, ai);
  if (delta < 0) return false; // perdendo: nunca segura de propósito, precisa de campo cheio agora
  if (delta >= 2) return random() < 0.65; // ganhando por folga: mais disposta a preservar recursos
  return random() < 0.4;
}

function decideFieldPlacement(state: GameState, ai: PlayerNumber, character: CharacterId): GameAction | null {
  const horizontalAction = decideHorizontalPlacement(state, ai, character);
  if (horizontalAction) return horizontalAction;

  const me = state[playerKeyOf(ai)];
  const emptySlotIndex = me.field.findIndex((slot) => !slot.faceDownCard);
  if (emptySlotIndex === -1) return null;

  // FIX (Fase D): a 1ª carta do turno sempre entra em campo normalmente -
  // só a partir da 2ª é que a IA pode decidir segurar uma carta de
  // propósito (ver shouldHoldBackField acima).
  //
  // FIX (pedido do usuário: "NUNCA permita que a IA jogue apenas uma carta
  // no campo, no mínimo duas caso capaz, mesmo se abrir mão de sua magia
  // numeral") - `mustGuaranteeMinimum` (menos de 2 cartas já em campo) agora
  // desliga as DUAS proteções que antes podiam deixar a IA parar em 0 ou 1
  // carta mesmo com mais cartas jogáveis na mão: segurar de propósito
  // (shouldHoldBackField, útil só a partir da 3ª carta em diante) e
  // preservar cartas reservadas pra própria Magia Numeral (reservedNumeralCardIds) -
  // essa 2ª proteção, incondicional aqui (não depende mais de personagem
  // nem de estar perdendo, ao contrário de shouldSacrificeNumeralSpellForCombat
  // abaixo, mantida só pra decidir sacrificar a 3ª carta em diante). "Capaz"
  // significa que ainda existe ALGUMA carta elegível pro campo (reservada ou
  // não) - sem nenhuma, a função ainda devolve null normalmente no fim.
  const alreadyPlacedThisTurn = getFilledFieldSlots(me.field).length;
  const mustGuaranteeMinimum = alreadyPlacedThisTurn < 2;
  if (!mustGuaranteeMinimum && shouldHoldBackField(state, ai)) {
    return null;
  }

  // FIX (item 4): a carta Monstro nunca mais é candidata a ocupar um slot de
  // combate normal (nem sozinha, nem como "só sobrou ela na mão") - ela só
  // vai para a zona própria, decidida separadamente em decidePlaceMonsterCard
  // (chamada antes desta função em decideStrategyPhase).
  const reserved = reservedNumeralCardIds(me.hand, character, state.spotlight);
  const isMainEligible = (c: Card) => isFieldEligible(c) || isCoringaTrapFieldEligible(character, c, false);
  const hand = me.hand.filter((c) => !reserved.has(c.id));
  let numeralOrAce = hand.filter(isMainEligible);

  // FIX (pedido do usuário: "quando tem menos vidas... a mão só consiste de
  // 2 ou menos cartas que seriam utilizadas para magia numeral... corrija
  // isso, ele as coloca caso esteja perdendo") - sem NENHUMA carta elegível
  // fora das reservadas, sacrifica a combinação em vez de deixar o slot
  // vazio quando: ainda faltam cartas pro mínimo garantido de 2 acima
  // (`mustGuaranteeMinimum`, incondicional), OU (3ª carta em diante) o
  // personagem/situação de shouldSacrificeNumeralSpellForCombat pede.
  if (numeralOrAce.length === 0 && reserved.size > 0 && (mustGuaranteeMinimum || shouldSacrificeNumeralSpellForCombat(state, ai, character))) {
    numeralOrAce = me.hand.filter(isMainEligible);
  }

  if (numeralOrAce.length === 0) return null;

  // O campo do oponente entra na conta por causa da Rainha do Coringa, que
  // vale o que conseguir COPIAR de uma carta revelada de lá (1 se não houver
  // nenhuma) - ver coringaQueenCopyValue.
  const chosen: Card = pickHighestBy(numeralOrAce, (c) => combatValue(c, state.spotlight, state[opponentKeyOf(ai)].field));
  return { type: 'PLAY_CARD', player: ai, cardId: chosen.id, slotIndex: emptySlotIndex, asHorizontal: false };
}

/**
 * FIX (pedido do usuário): a IA nunca ativava TRANSFORM_ACE - todo Ás que a
 * IA jogava em campo entrava sempre "cru" (nunca transformado), então na
 * prática sempre lutava com o valor cheio de 14 quando revelado (a regra
 * real de combate para um Ás não transformado, nunca alterada - ver
 * combatValue/trueSlotValue acima). De fora, a IA se comportava exatamente
 * como "só sabe jogar o Ás como uma carta de número 14".
 *
 * REGRA (pedido explícito do usuário, 2ª rodada de ajuste): sempre que a IA
 * tem um Ás ainda não transformado na mão, ela deve transformá-lo já, com
 * esta prioridade:
 *   1. Se já tem 1 OU MAIS cartas na mão com o número exigido pela própria
 *      Magia Numeral (Mago=9, Besta=6, Anjo=3), transforma o Ás nesse número
 *      - avança (ou completa) o trio, mesmo faltando só chegar a 2 ainda.
 *   2. Senão (nenhuma carta do número exigido na mão), transforma no MAIOR
 *      número numeral (2-10) presente na mão.
 * Só fica sem transformar se não houver NENHUMA carta numeral de verdade na
 * mão pra copiar (ex.: mão só com magias) - nesse caso não há alvo válido.
 *
 * FIX (pedido do usuário: "o mago da IA ainda utiliza o Ás como número 14",
 * 2 rodadas seguidas) - duas causas raiz encontradas e corrigidas:
 *   (a) a checagem saía IMEDIATAMENTE (sem transformar nada) sempre que a
 *       própria Magia Numeral já estava ativa, mesmo quando só a Prioridade
 *       1 (perseguir o trio) deixava de fazer sentido - agora só ELA é
 *       condicionada a isso, a Prioridade 2 roda sempre.
 *   (b) `handleTransformAce` (gameEngine.ts) rejeitava QUALQUER alvo com
 *       `.value === 'A'`, mesmo já transformado - então, com 2+ Áses na mão
 *       e nenhuma carta numeral "de verdade", depois de transformar o 1º
 *       Ás não sobrava NENHUM alvo válido pra transformar o 2º (que ficava
 *       cru pra sempre). Essa restrição do motor foi removida (um Ás já
 *       transformado agora é uma referência válida, "já é" um número
 *       normal) - por isso `validReferenceHand` abaixo só exclui um Ás CRU
 *       (sem transformedValue), nunca um Ás já transformado.
 *
 * FIX (pedido do usuário: "remova a possibilidade de re-transformar Ás...
 * depois que transforma uma vez, não é pra poder re-transformar em outra
 * carta") - reverte o FIX anterior (b acima permanece: um Ás já transformado
 * ainda serve como REFERÊNCIA válida pra transformar um Ás DIFERENTE, ainda
 * cru - isso nunca muda o valor do Ás de referência em si). O que foi
 * removido foi a Prioridade 1b que existia aqui: tentar RE-transformar um Ás
 * que a própria IA já tinha transformado antes, quando o valor atual dele
 * não batia com o número exigido pela Magia Numeral. handleTransformAce
 * (gameEngine.ts) agora rejeita isso incondicionalmente - manter essa
 * prioridade aqui faria a IA propor repetidamente uma ação sempre recusada
 * pelo motor (mesma família do bug antigo do TRANSFORM_ACE documentado mais
 * abaixo neste arquivo: uma ação rejeitada em silêncio, proposta pra
 * sempre, sem nada mudar no estado).
 */
function decideAceTransform(state: GameState, ai: PlayerNumber, character: CharacterId, me: PlayerState): GameAction | null {
  const requiredNumber = getNumeralSpellInfo(character).requiredNumber;
  const numeralSpellAlreadyActive = state.activeNumeralSpells[ai] !== undefined;

  // `getMatchingNumeralCards` conta pelo valor EFETIVO (inclui um Ás JÁ
  // transformado no número certo) - usado só para saber se o trio já está
  // completo, para não ficar transformando Áses a mais sem necessidade.
  const alreadyMatching = getMatchingNumeralCards(character, me.hand, state.spotlight);

  // Referências válidas pra copiar valor: `isValidAceTransformTarget`
  // (cardUtils.ts) - a MESMA função que handleTransformAce (gameEngine.ts)
  // usa pra aceitar/rejeitar de verdade. FIX (checagem extensa por bugs -
  // consolidação de regra duplicada): antes esta linha só excluía um Ás CRU
  // "na mão" - nunca filtrava J/Q/K/Monstro aqui (só depois, e só na
  // Prioridade 2 via `isNumeralCard`) - a Prioridade 1 (`requiredMatch`
  // abaixo) podia, em teoria, escolher uma magia como referência se o valor
  // numérico dela batesse com o número exigido pela Magia Numeral. Nenhum
  // valor de J/Q/K (11/12/13) bate com os números atuais (3, 6, 9), então
  // nunca divergiu NA PRÁTICA - mas era coincidência do conjunto atual de
  // números, não uma garantia estrutural (ver comentário completo em
  // isValidAceTransformTarget). Usar a mesma função aqui fecha isso de vez,
  // pros dois lados nunca mais poderem divergir.
  const validReferenceHand = me.hand.filter(isValidAceTransformTarget);

  const untransformedAce = me.hand.find((c) => c.value === 'A' && c.transformedValue === undefined);
  if (untransformedAce) {
    // Prioridade 1: 1 ou mais cartas do número exigido pela Magia Numeral já
    // na mão (e o trio ainda não fechou, e a Magia Numeral ainda não está
    // ativa - senão perseguir o trio não tem mais propósito) - transforma o
    // Ás cru nesse número.
    if (!numeralSpellAlreadyActive && alreadyMatching.length < 3) {
      const requiredMatch = validReferenceHand.find((c) => c.id !== untransformedAce.id && getEffectiveCardValue(c) === requiredNumber);
      if (requiredMatch) {
        return { type: 'TRANSFORM_ACE', player: ai, aceCardId: untransformedAce.id, targetCardId: requiredMatch.id };
      }
    }

    // Prioridade 2: nenhuma carta do número exigido na mão - transforma no
    // MAIOR número numeral (2-10) disponível na mão (inclui outro Ás já
    // transformado, agora que isso é permitido).
    const numeralCandidates = validReferenceHand.filter((c) => c.id !== untransformedAce.id && isNumeralCard(c));
    if (numeralCandidates.length > 0) {
      const highest = pickHighestBy(numeralCandidates, getEffectiveCardValue);
      return { type: 'TRANSFORM_ACE', player: ai, aceCardId: untransformedAce.id, targetCardId: highest.id };
    }
    // Nenhuma carta numeral (nem outro Ás já transformado) pra copiar - nada
    // a fazer com este Ás cru agora.
  }

  return null;
}

function decideStrategyPhase(state: GameState, ai: PlayerNumber): AiDecision {
  const character = characterOf(state, ai);
  const me = state[playerKeyOf(ai)];

  // 0. Transformação do Ás: ver decideAceTransform acima - precisa rodar
  //    ANTES da checagem da Magia Numeral logo abaixo, já que é exatamente o
  //    que torna um Ás elegível para completar o trio.
  const aceTransformAction = decideAceTransform(state, ai, character, me);
  if (aceTransformAction) return { type: 'action', action: aceTransformAction };

  // 1. Magia Numeral: exige campo vazio, então precisa ser checada ANTES de
  //    qualquer posicionamento de carta acontecer neste turno.
  // FIX (item 12 da 5ª rodada): a checagem usava `Boolean(state.activeNumeralSpell)`
  // - ou seja, "existe QUALQUER Magia Numeral ativa", em vez de "EU já tenho
  // uma ativa". No caso Mago vs Mago, isso fazia a IA se recusar a ativar a
  // própria Visão Arcana só porque o oponente (humano) já tinha a dele ativa
  // - mesmo sendo efeitos completamente independentes. Agora checa só o
  // próprio slot da IA no mapa por jogador.
  if (
    getFilledFieldSlots(me.field).length === 0 &&
    canActivateNumeralSpell(character, me.hand, me.field, state.activeNumeralSpells[ai] !== undefined, state.spotlight)
  ) {
    return { type: 'action', action: { type: 'ACTIVATE_NUMERAL_SPELL', player: ai } };
  }

  const monsterAction = decideMonsterEffect(state, ai, character);
  if (monsterAction) return { type: 'action', action: monsterAction };

  // FIX (itens 4 e 7): posiciona a carta Monstro na zona própria assim que
  // possível (nunca mais compete com decideFieldPlacement pelos 3 slots
  // normais - ver comentário em decidePlaceMonsterCard).
  const placeMonsterAction = decidePlaceMonsterCard(state, ai);
  if (placeMonsterAction) return { type: 'action', action: placeMonsterAction };

  const magicAction = decideStrategyMagic(state, ai, character);
  if (magicAction) return { type: 'action', action: magicAction };

  // Modo Towers (pedido do usuário: a IA já deve saber formar/reforçar
  // torres nesta primeira versão) - checado ANTES de decideFieldPlacement:
  // se a IA tem 2+ cartas de mesmo valor sobrando (nunca as reservadas pra
  // própria Magia Numeral - ver reservedNumeralCardIds), empilhar concentra
  // mais valor de combate num só slot do que jogá-las separadas em slots
  // diferentes. As outras cartas da mão continuam preenchendo os demais
  // slots normalmente nas próximas chamadas (decideFieldPlacement roda de
  // novo a cada ciclo, e o slot da torre já estará ocupado).
  const towerAction = decideTowerAction(state, ai, character, me);
  if (towerAction) return { type: 'action', action: towerAction };

  const placeAction = decideFieldPlacement(state, ai, character);
  if (placeAction) return { type: 'action', action: placeAction };

  return { type: 'ready' };
}

/**
 * Modo Towers (pedido do usuário): decide se vale a pena formar uma torre
 * nova ou reforçar a já formada neste turno.
 *
 * - Já tem uma torre neste turno (`towerSlotThisTurn`): só procura 1 carta
 *   restante de valor igual ao topo atual pra reforçar - nunca tenta
 *   começar uma 2ª torre em outro slot (a regra só permite 1 por turno).
 * - Ainda não tem: procura o MAIOR grupo de cartas elegíveis (numeral 2-10
 *   ou Ás, nunca as reservadas pra própria Magia Numeral) de mesmo valor
 *   efetivo - "maior" pelo VALOR TOTAL resultante (contagem × valor), não só
 *   pela contagem, pra preferir empilhar 3 cartas de 8 (24) a 4 cartas de 2
 *   (8). Só forma com 2+ cartas, num slot vazio ou com uma carta comum
 *   (não-torre) de valor igual pra absorver.
 */
function decideTowerAction(state: GameState, ai: PlayerNumber, character: CharacterId, me: PlayerState): GameAction | null {
  if (!state.gameConfig.towersMode) return null;
  const reserved = reservedNumeralCardIds(me.hand, character, state.spotlight);
  const eligible = me.hand.filter((c) => !reserved.has(c.id) && towerEligibleValue(c) !== null);
  if (eligible.length === 0) return null;

  if (me.towerSlotThisTurn !== undefined) {
    const slot = me.field[me.towerSlotThisTurn];
    if (!isTowerSlot(slot)) return null; // torre foi desfeita nesse meio tempo (ex.: magia inimiga esvaziou) - não recria
    const topValue = getEffectiveCardValue(slot.faceDownCard!);
    const reinforceCard = eligible.find((c) => towerEligibleValue(c) === topValue);
    if (!reinforceCard) return null;
    if (!canFormOrReinforceTower(state, ai, me.towerSlotThisTurn, [reinforceCard.id])) return null;
    return { type: 'FORM_OR_REINFORCE_TOWER', player: ai, slotIndex: me.towerSlotThisTurn, cardIds: [reinforceCard.id] };
  }

  const groups = new Map<number, Card[]>();
  for (const c of eligible) {
    const value = towerEligibleValue(c)!;
    const group = groups.get(value) ?? [];
    group.push(c);
    groups.set(value, group);
  }
  const candidateGroups = Array.from(groups.entries()).filter(([, cards]) => cards.length >= 2);
  if (candidateGroups.length === 0) return null;
  const [bestValue, bestCards] = candidateGroups.reduce((best, cur) => (cur[0] * cur[1].length > best[0] * best[1].length ? cur : best));

  const emptySlotIndex = me.field.findIndex((s) => !s.faceDownCard);
  const absorbSlotIndex = me.field.findIndex((s) => s.faceDownCard && !isTowerSlot(s) && getEffectiveCardValue(s.faceDownCard) === bestValue);
  const targetSlot = emptySlotIndex !== -1 ? emptySlotIndex : absorbSlotIndex;
  if (targetSlot === -1) return null;

  const cardIds = bestCards.map((c) => c.id);
  if (!canFormOrReinforceTower(state, ai, targetSlot, cardIds)) return null;
  return { type: 'FORM_OR_REINFORCE_TOWER', player: ai, slotIndex: targetSlot, cardIds };
}

// ============================================================================
// Fase de Combate
// ============================================================================

function decideMagoK(state: GameState, ai: PlayerNumber): GameAction | null {
  const me = state[playerKeyOf(ai)];
  const kCard = me.hand.find((c) => c.value === 'K');
  if (!kCard) return null;
  if (!canActivateMagic('combat', 'mago', 'K', getMagicActivationContext(state, ai))) return null;

  const opponent = opponentOf(ai);
  const opponentField = state[opponentKeyOf(ai)].field;
  const targets = getUnbattledHorizontalSlots(opponentField).filter((i) => !isSlotProtected(state, opponent, i));
  if (targets.length === 0) return null;

  // FIX: a magia agora destrói TODAS as cartas horizontais empilhadas do
  // slot alvo de uma vez (até 2, com Reforço Angelical do Anjo) - soma os
  // valores do slot inteiro para escolher o alvo mais valioso, em vez de
  // olhar só uma carta horizontal.
  // FIX (auditoria completa do Mago - bug real encontrado): estas cartas já
  // estão posicionadas (horizontal) no campo do OPONENTE - se uma delas for
  // um Ás cru, seu valor real de destruição é 14 (getEffectiveCardValue,
  // usado por handleExecuteMagic ao resolver a magia de verdade), não o 6
  // "de planejamento" que `combatValue` atribuía, o que podia fazer a IA
  // destruir a pilha errada (uma mais fraca) por achar a com o Ás mais fraca.
  // FIX (checagem extensa por bugs - vazamento de informação real
  // encontrado): esta soma olhava o valor de TODAS as horizontais do alvo,
  // mesmo as ainda não reveladas (cada horizontal tem seu próprio `revealed`,
  // independente da carta principal do slot - ver trueSlotValue acima) - a IA
  // "sabia" de antemão qual pilha escondida valia mais e destruía sempre a
  // certa, uma decisão que nenhum jogador real conseguiria tomar. Agora só
  // soma horizontais JÁ reveladas; se nenhum dos alvos tem NADA revelado (a
  // escolha é totalmente às cegas, como seria para um humano), sorteia entre
  // eles em vez de cair sempre no primeiro da lista por empate em 0.
  const revealedHorizontalValue = (i: number) =>
    opponentField[i].horizontalCards.reduce((sum, c) => sum + (c.revealed ? getEffectiveCardValue(c) : 0), 0);
  const anyRevealed = targets.some((i) => opponentField[i].horizontalCards.some((c) => c.revealed));
  const best = anyRevealed
    ? targets.reduce((a, b) => (revealedHorizontalValue(b) > revealedHorizontalValue(a) ? b : a))
    : targets[Math.floor(random() * targets.length)];
  return { type: 'EXECUTE_MAGIC', player: ai, cardId: kCard.id, character: 'mago', magicType: 'K', selection: { selectedSlot: best } };
}

function decideBestaK(state: GameState, ai: PlayerNumber): GameAction | null {
  const me = state[playerKeyOf(ai)];
  const kCard = me.hand.find((c) => c.value === 'K');
  if (!kCard) return null;
  if (!canActivateMagic('combat', 'besta', 'K', getMagicActivationContext(state, ai))) return null;

  const opponent = opponentOf(ai);
  const myUnrevealed = getUnrevealedFieldSlots(me.field);
  const opponentUnrevealed = getUnrevealedFieldSlots(state[opponentKeyOf(ai)].field).filter((i) => !isSlotProtected(state, opponent, i));
  if (myUnrevealed.length === 0 || opponentUnrevealed.length === 0) return null;

  // A IA conhece o valor das PRÓPRIAS cartas (como qualquer jogador
  // conheceria a própria carta que colocou em campo), mas NUNCA olha o valor
  // da carta ainda não revelada do oponente - a escolha do alvo é sempre às
  // cegas, exatamente como seria para um jogador humano.
  // FIX (auditoria completa da Besta - bug real encontrado, mesma classe já
  // corrigida no Mago): a carta já está EM CAMPO, comprometida - `combatValue`
  // desconta um Ás cru pra 6 (só faz sentido pra planejamento de mão), mas o
  // valor real é `getEffectiveCardValue` (14). Usar `combatValue` aqui fazia
  // a IA achar que o próprio Ás cru (na verdade a MELHOR carta possível) era
  // "a pior" e arriscá-lo numa troca às cegas - quase sempre uma perda líquida.
  const myWorstIndex = pickHighestBy(myUnrevealed, (i) => -getEffectiveCardValue(me.field[i].faceDownCard!));
  const myWorstValue = getEffectiveCardValue(me.field[myWorstIndex].faceDownCard!);
  // FIX (pedido do usuário: "arriscar mais em trocas às cegas da Besta...
  // quando à beira da derrota") - normalmente só troca uma carta já fraca
  // (abaixo da média); perdendo, manter o status quo não é mais uma opção
  // segura, então ela aceita arriscar até uma carta mediana numa troca às
  // cegas, na esperança de sair com algo melhor.
  const riskThreshold = livesDelta(state, ai) < 0 ? AVERAGE_FIELD_CARD_VALUE + 3 : AVERAGE_FIELD_CARD_VALUE;
  if (myWorstValue >= riskThreshold) return null; // já é uma carta boa o bastante pro momento, não vale arriscar numa troca às cegas

  const targetIndex = opponentUnrevealed[Math.floor(random() * opponentUnrevealed.length)];

  return {
    type: 'EXECUTE_MAGIC',
    player: ai,
    cardId: kCard.id,
    character: 'besta',
    magicType: 'K',
    selection: { selectedSlot: myWorstIndex, selectedTargetSlot: targetIndex },
  };
}

/**
 * Mosqueteiro K (Tiro Certeiro): reforça a carta do PRÓPRIO campo (principal
 * ou horizontal, revelada ou não - usuário confirmou "a qualquer momento do
 * combate") em +N, onde N é quantas cartas as próprias magias descartaram
 * NESTE turno E NO ANTERIOR (FIX pedido do usuário: "o valor extra também
 * conta o turno anterior" - antes só contava este turno, mesma janela de 2
 * turnos usada de verdade em handleExecuteMagic/gameEngine.ts). Só ativa se
 * já houver ALGUM descarte acumulado nessa janela (senão o Rei seria gasto
 * por +0, puro desperdício) e reforça sempre a carta de MAIOR valor já em
 * campo - consolidar numa disputa que já tende a vencer rende mais do que
 * tentar "salvar" a mais fraca com um bônus fixo.
 */
function decideMosqueteiroK(state: GameState, ai: PlayerNumber): GameAction | null {
  const me = state[playerKeyOf(ai)];
  const kCard = me.hand.find((c) => c.value === 'K');
  if (!kCard) return null;
  if (!canActivateMagic('combat', 'mosqueteiro', 'K', getMagicActivationContext(state, ai))) return null;
  if (me.mosqueteiroDiscardsThisTurn + me.mosqueteiroDiscardsTurnMinus1 <= 0) return null;

  // FIX (falha intermitente da suíte, "a IA nunca propõe uma ação que o motor
  // rejeita em silêncio"): handleExecuteMagic recusa uma carta-token de Bola
  // de Fogo (`isFireToken`, Piromante) como alvo do Tiro Certeiro, mas esta
  // lista de candidatos aceitava qualquer carta do campo - contra o Piromante,
  // um slot reduzido a token virava o "melhor alvo" (valor restante alto) e a
  // IA propunha uma ativação que o motor devolvia sem mudar nada, travando a
  // vez dela. Mesmo critério do motor aqui.
  const candidates: { id: string; value: number }[] = [];
  me.field.forEach((slot) => {
    if (slot.faceDownCard && !slot.faceDownCard.isFireToken) {
      candidates.push({ id: slot.faceDownCard.id, value: getSpotlightAdjustedValue(slot.faceDownCard, state.spotlight) });
    }
    slot.horizontalCards
      .filter((h) => !h.isFireToken)
      .forEach((h) => candidates.push({ id: h.id, value: getSpotlightAdjustedValue(h, state.spotlight) }));
  });
  if (candidates.length === 0) return null;

  const best = pickHighestBy(candidates, (c) => c.value);
  return {
    type: 'EXECUTE_MAGIC',
    player: ai,
    cardId: kCard.id,
    character: 'mosqueteiro',
    magicType: 'K',
    selection: { selectedCards: [best.id] },
  };
}

/**
 * Piromante K (Queima do Reforço): queima uma carta horizontal (não
 * combatida) do campo do oponente, somando seu valor à Bola de Fogo - ou
 * lança a Bola de Fogo já acumulada, mesma escolha J/Q/K. Mira apenas o
 * valor REVELADO ao decidir entre candidatas (nunca olha o valor de uma
 * carta ainda não revelada do oponente, igual ao Mago K acima); se nenhuma
 * candidata estiver revelada, sorteia entre elas às cegas.
 */
function decidePiromanteK(state: GameState, ai: PlayerNumber): GameAction | null {
  const me = state[playerKeyOf(ai)];
  const kCard = me.hand.find((c) => c.value === 'K');
  if (!kCard) return null;
  if (!canActivateMagic('combat', 'piromante', 'K', getMagicActivationContext(state, ai))) return null;

  const opponent = opponentOf(ai);
  const opponentField = state[opponentKeyOf(ai)].field;
  const candidates = getUnbattledHorizontalSlots(opponentField)
    .filter((i) => !isSlotProtected(state, opponent, i))
    .flatMap((i) => opponentField[i].horizontalCards.filter((c) => !c.battled));

  if (candidates.length > 0) {
    const revealedCandidates = candidates.filter((c) => c.revealed);
    const target =
      revealedCandidates.length > 0
        ? pickHighestBy(revealedCandidates, (c) => getEffectiveCardValue(c))
        : candidates[Math.floor(random() * candidates.length)];
    return {
      type: 'EXECUTE_MAGIC',
      player: ai,
      cardId: kCard.id,
      character: 'piromante',
      magicType: 'K',
      selection: { selectedCards: [target.id] },
    };
  }

  if (shouldLaunchFireball(state, ai)) {
    const target = pickFireballTarget(state, ai);
    if (target !== null) {
      return {
        type: 'EXECUTE_MAGIC',
        player: ai,
        cardId: kCard.id,
        character: 'piromante',
        magicType: 'K',
        selection: { fireballLaunch: true, selectedTargetSlot: target },
      };
    }
  }
  return null;
}

/**
 * Piromante - lança a Bola de Fogo em Combate usando QUALQUER carta de magia
 * disponível (J/Q/K), não só o Rei. FIX (pedido do usuário: "a IA do
 * piromante não utiliza as magias na fase de combate para atirar as bolas de
 * fogo") - `decidePiromanteK` só cobre o caso "ainda tenho um Rei na mão";
 * como toda magia se consome ao ativar, é comum o Rei já ter sido jogado ou
 * descartado em turnos anteriores enquanto Valete/Rainha continuam na mão -
 * essas duas ganharam a mesma janela extra de Combate (só pra lançar, ver
 * `canActivateMagic` em magicCards.ts), mas nada na IA tentava usá-la; sem
 * Rei na mão, a IA simplesmente nunca cogitava lançar, mesmo com a Bola
 * cheia e um alvo obliterável na mesa. Chamada como fallback depois de
 * `decidePiromanteK` (que já cobre o caso "tenho Rei" - queimar reforço OU
 * lançar com ele - então só entra em ação quando ele devolve null).
 */
function decidePiromanteCombatFireball(state: GameState, ai: PlayerNumber): GameAction | null {
  if (!shouldLaunchFireball(state, ai)) return null;
  const target = pickFireballTarget(state, ai);
  if (target === null) return null;
  const me = state[playerKeyOf(ai)];
  for (const value of ['K', 'Q', 'J'] as const) {
    const card = me.hand.find((c) => c.value === value);
    if (!card) continue;
    if (!canActivateMagic('combat', 'piromante', value, getMagicActivationContext(state, ai))) continue;
    return {
      type: 'EXECUTE_MAGIC',
      player: ai,
      cardId: card.id,
      character: 'piromante',
      magicType: value,
      selection: { fireballLaunch: true, selectedTargetSlot: target },
    };
  }
  return null;
}

function decideCombatMagic(state: GameState, ai: PlayerNumber, character: CharacterId): GameAction | null {
  if (character === 'mago') return decideMagoK(state, ai);
  if (character === 'besta') return decideBestaK(state, ai);
  if (character === 'mosqueteiro') return decideMosqueteiroK(state, ai);
  if (character === 'piromante') return decidePiromanteK(state, ai) ?? decidePiromanteCombatFireball(state, ai);
  return null;
}

/**
 * Escolhe (ou aguarda a vez de escolher) um slot para o combate. Espelha
 * exatamente a mesma checagem de handleSelectCombatSlot em gameEngine.ts.
 *
 * ARMADILHA (afeta hotseat também, não é específica da IA): a regra exige
 * que o jogador "que vira primeiro" (firstToFlip) escolha um slot ANTES do
 * outro poder responder. Se os dois jogadores terminaram a fase de
 * Estratégia com quantidades DIFERENTES de cartas em campo (perfeitamente
 * normal - nada obriga preencher os 3 slots), o lado com campo vazio não
 * fica mais travado esperando: um slot vazio também é um alvo de combate
 * válido (vale 1, ver FIX item 10 da 2ª rodada em gameEngine.ts), então
 * mesmo sem cartas reais a IA usa um desses slots para responder (ver FIX
 * Fase D abaixo). Só quando NENHUM dos dois lados tem mais nenhuma carta
 * real é que a IA desiste de vez e marca "Pronto" (ou o jogo ficaria
 * repetindo empates de 1 contra 1 para sempre).
 */
/**
 * Valor do slot de combate atualmente selecionado pelo OPONENTE, SE E SOMENTE
 * SE essa informação já for pública (slot vazio - sempre público, vale 1 -
 * ou carta já revelada) - devolve null quando o valor ainda é informação
 * oculta que um jogador real não teria (mesma regra do cabeçalho do
 * arquivo: nunca olhar o valor de uma carta ainda não revelada do oponente).
 */
function knownSelectedSlotValue(state: GameState, ai: PlayerNumber): number | null {
  const humanKey = opponentKeyOf(ai);
  const theirSelection = state.combatSelection[humanKey];
  if (theirSelection === undefined) return null;
  const slot = state[humanKey].field[theirSelection];
  if (!slot.faceDownCard) return 1;
  if (!slot.revealed) return null;
  const humanCharacter = characterOf(state, opponentOf(ai));
  return trueSlotValue(state[humanKey], theirSelection, humanCharacter, state.spotlight, { opponentView: true });
}

/**
 * SIMULAÇÃO DE COMBATE (pedido do usuário: "IA mais inteligente" via
 * "simulação de jogadas futuras") - antes, quando a IA não tinha nenhuma
 * informação pública sobre o slot do oponente (a maioria das vezes: ou ela
 * escolhe PRIMEIRO, ou escolhe depois mas o valor ainda está oculto), ela só
 * olhava para as PRÓPRIAS cartas (trueSlotValue) e escolhia a de maior
 * valor - sem nenhuma noção de "contra o que, provavelmente, estou
 * competindo". Isso a fazia gastar cartas fortes contra respostas fracas e
 * arriscar cartas fracas contra respostas fortes, sem diferença.
 *
 * Agora ela reconstrói - por ELIMINAÇÃO, nunca lendo o valor de uma carta
 * oculta do oponente (mesma regra do cabeçalho do arquivo) - a distribuição
 * de valores que ainda podem estar em qualquer lugar que ela não enxerga (o
 * baralho, a mão do oponente, o campo do oponente), e usa isso para simular
 * centenas de combates hipotéticos por carta candidata, chegando numa
 * probabilidade real de vitória em vez de um palpite às cegas.
 */

/** As únicas 10 identidades de carta que podem ocupar um slot de campo (Ás e 2-10) - nunca J/Q/K/Coringa. */
const FIELD_ELIGIBLE_VALUES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

/**
 * Reconstrói a lista de valores de combate (já resolvendo Ás como 14, a
 * regra real de handleResolveCombat) de toda carta elegível para campo que a
 * IA NÃO enxerga agora - baralho + mão do oponente ainda não revelada + campo
 * do oponente ainda não revelado. Cada elemento da lista representa
 * exatamente 1 carta física restante (a contagem certa de cada valor, não
 * uma média) - pronta para sorteio uniforme nas simulações abaixo.
 *
 * NUNCA lê `state.deck` nem o valor de uma carta do oponente com
 * `revealed !== true` - a lista é obtida por ELIMINAÇÃO a partir da
 * composição total teórica do baralho (4 naipes × 10 valores = 40),
 * subtraindo só o que a IA tem o DIREITO de conhecer (própria mão, próprio
 * campo, descarte público, cartas do oponente já reveladas por alguma
 * magia) - exatamente a "contagem de cartas" que um jogador humano atento
 * também poderia fazer de cabeça.
 *
 * APROXIMAÇÃO ACEITA: um Ás ainda oculto entra no pool valendo 14 (o valor
 * real de um Ás não transformado) mesmo que, na prática, ele já possa ter
 * sido transformado pelo oponente (o que baixaria seu valor real) - a IA não
 * tem como distinguir os dois casos sem espiar, então assume o cenário mais
 * perigoso/conservador.
 */
function buildUnseenCombatValuePool(state: GameState, ai: PlayerNumber): number[] {
  const aiKey = playerKeyOf(ai);
  const opponentKey = opponentKeyOf(ai);
  const remaining = new Map<string, number>(FIELD_ELIGIBLE_VALUES.map((v) => [v, 4]));

  const subtract = (card: Card) => {
    const count = remaining.get(card.value);
    if (count === undefined) return; // J/Q/K/Coringa - não faz parte deste pool de 40
    remaining.set(card.value, Math.max(0, count - 1));
  };

  // Própria mão e campo: sempre conhecidos por mim, sempre subtraídos.
  state[aiKey].hand.forEach(subtract);
  state[aiKey].field.forEach((slot) => {
    if (slot.faceDownCard) subtract(slot.faceDownCard);
    slot.horizontalCards.forEach(subtract);
  });

  // Descarte: público para os dois lados.
  state.discardPile.forEach(subtract);

  // Cartas do OPONENTE só saem do pool se JÁ reveladas (mesma convenção de
  // knownSelectedSlotValue/getUnrevealedFieldSlots) - uma carta ainda não
  // revelada continua no pool, é exatamente isso que a torna "não vista".
  state[opponentKey].hand.forEach((c) => c.revealed && subtract(c));
  state[opponentKey].field.forEach((slot) => {
    if (slot.faceDownCard?.revealed) subtract(slot.faceDownCard);
    slot.horizontalCards.forEach((c) => c.revealed && subtract(c));
  });

  const pool: number[] = [];
  remaining.forEach((count, value) => {
    const combatVal = value === 'A' ? 14 : Number(value);
    for (let i = 0; i < count; i++) pool.push(combatVal);
  });
  return pool;
}

const COMBAT_SIMULATION_TRIALS = 300;

/**
 * Probabilidade estimada de `myValue` vencer um valor sorteado do `pool` -
 * empate conta meio ponto (nem vitória nem derrota real). Com o pool vazio
 * (visibilidade total, caso raro de fim de baralho) devolve 0.5 (neutro) em
 * vez de enviesar a decisão sem nenhuma base real.
 */
function estimateWinProbability(myValue: number, pool: number[]): number {
  if (pool.length === 0) return 0.5;
  let wins = 0;
  for (let i = 0; i < COMBAT_SIMULATION_TRIALS; i++) {
    const theirValue = pool[Math.floor(random() * pool.length)];
    if (myValue > theirValue) wins += 1;
    else if (myValue === theirValue) wins += 0.5;
  }
  return wins / COMBAT_SIMULATION_TRIALS;
}

/**
 * Escolhe um slot para o combate simulando, para cada carta própria
 * candidata, centenas de combates hipotéticos contra a distribuição real de
 * cartas ainda não vistas (buildUnseenCombatValuePool) - prioriza a MAIOR
 * chance de vitória; entre opções com chance equivalente (diferença < 3%),
 * prefere a de MENOR valor, para economizar as cartas mais fortes para uma
 * disputa futura (mesmo princípio já usado no ramo de "vitória garantida" de
 * decideCombatSlotSelection, agora estendido para o caso incerto). Mantém
 * uma leve variação não-determinística (20% de chance de escolher a 2ª
 * melhor opção) para o comportamento da IA não ficar sempre perfeitamente
 * previsível (FIX Fase D, pedido do usuário original).
 */
function pickCombatSlotWithVariety(
  state: GameState,
  ai: PlayerNumber,
  myFilledSlots: number[],
  playerState: PlayerState,
  character: CharacterId
): number {
  const pool = buildUnseenCombatValuePool(state, ai);
  const scored = myFilledSlots.map((slotIndex) => {
    const value = trueSlotValue(playerState, slotIndex, character, state.spotlight);
    return { slotIndex, value, winProb: estimateWinProbability(value, pool) };
  });
  const ranked = [...scored].sort((a, b) => {
    if (Math.abs(a.winProb - b.winProb) >= 0.03) return b.winProb - a.winProb;
    return a.value - b.value;
  });
  if (ranked.length >= 2 && random() < 0.2) return ranked[1].slotIndex;
  return ranked[0].slotIndex;
}

function decideCombatSlotSelection(state: GameState, ai: PlayerNumber): AiDecision {
  const character = characterOf(state, ai);
  const aiKey = playerKeyOf(ai);
  const humanKey = opponentKeyOf(ai);
  const mySelection = state.combatSelection[aiKey];

  const myFilledSlots = getFilledFieldSlots(state[aiKey].field);
  const opponentFilledSlots = getFilledFieldSlots(state[humanKey].field);

  // FIX (Fase D, pedido do usuário): só desiste de vez (ready) quando NENHUM
  // dos dois lados tem mais nenhuma carta real em campo - nesse caso não há
  // mais nada produtivo a decidir (um combate "vazio contra vazio" nunca
  // fecharia disputa nenhuma - ver TIE em handleResolveCombat - e ficaria
  // repetindo pra sempre sem sentido). Enquanto QUALQUER um dos dois ainda
  // tiver uma carta real, o combate continua: o lado sem cartas passa a usar
  // um slot vazio próprio (vale 1) para responder, em vez de desistir (ver
  // mais abaixo) - por isso o antigo atalho "se o oponente já não tem nada
  // em campo, desisto" foi removido: ele fazia justamente o lado que AINDA
  // tinha cartas desistir cedo demais, travando o jogo (o outro lado ficava
  // esperando por uma seleção que nunca vinha).
  const nobodyHasRealCards = myFilledSlots.length === 0 && opponentFilledSlots.length === 0;

  if (mySelection !== undefined) {
    // Já escolhi e aguardo a resolução automática.
    return nobodyHasRealCards ? { type: 'ready' } : { type: 'wait' };
  }

  if (nobodyHasRealCards) return { type: 'ready' };

  // FIX (checagem extensa por bugs - consolidação de regra duplicada): usa
  // `canSelectCombatSlot` (gameEngine.ts), a MESMA função que
  // handleSelectCombatSlot usa pra aceitar/rejeitar de verdade, em vez de
  // recalcular a mesma expressão aqui - ver o comentário completo lá.
  const canSelectNow = canSelectCombatSlot(state, ai);
  if (!canSelectNow) return { type: 'wait' };

  const myPlayerState = state[aiKey];

  // FIX (pedido do usuário, de uma rodada anterior, só agora implementado:
  // "um método da IA esperar um pouco antes de escolher uma carta no combate
  // quando tem noção que tá em desvantagem") - quando a IA está perdendo no
  // placar de vidas (`livesDelta`, o mesmo sinal público - vidas de ambos são
  // sempre visíveis - já usado em todo o resto do arquivo para "está
  // perdendo"), ela hesita mais antes de revelar sua escolha de combate,
  // nitidamente mais longo que o "pensando" padrão (700-1200ms, ver
  // GameBoard.tsx) ou até o disfarce de reação a informação já revelada logo
  // abaixo (1.6-2.5s) - simula genuína hesitação/ansiedade numa disputa que
  // pode custar mais uma vida.
  // FIX (pedido do usuário: "a IA está demorando muito para fazer uma ação
  // no turno dela no combate") - a 1ª versão usava 5-8s, seguindo à risca um
  // pedido antigo por "mais de 5 segundos" - mas um turno de combate pode ter
  // até 3 disputas de slot seguidas, e perdendo (quando essa hesitação mais
  // se aplica) é justamente quando ela mais se repete: 3× 5-8s virava até
  // ~24s de espera pura num turno só, exagerado demais na prática. Reduzido
  // para 2-3.2s - ainda claramente mais lento que o normal, sem arrastar o
  // turno inteiro.
  const isLosing = livesDelta(state, ai) < 0;
  const disadvantageThinkTimeMs = 2000 + random() * 1200;

  // FIX (Fase D, pedido do usuário): antes, se a IA não tivesse mais NENHUMA
  // carta em campo, ela simplesmente desistia (`ready`), deixando a seleção
  // do oponente sem resposta enquanto ele ainda tivesse cartas - a rodada só
  // fechava se o oponente também ficasse sem nada. Um slot próprio VAZIO
  // também é um alvo de combate válido (vale 1, ver FIX item 10 da 2ª rodada
  // em gameEngine.ts) - agora a IA usa um dos próprios slots vazios para
  // continuar respondendo ao combate em vez de deixar o oponente "no vácuo".
  if (myFilledSlots.length === 0) {
    const emptySlotIndex = myPlayerState.field.findIndex((slot) => !slot.faceDownCard);
    if (emptySlotIndex === -1) return { type: 'ready' }; // não deveria acontecer (campo sempre tem 3 slots), guarda de segurança
    // FIX (pedido do usuário: "a escolha ser automática e imediata quando há
    // apenas uma carta faltando para ser selecionada") - qualquer slot vazio
    // vale exatamente o mesmo (1, "vale 1 no combate"), então não há NENHUMA
    // decisão real acontecendo aqui - `thinkTimeMs: 0` remove a hesitação
    // "pensando..." padrão (700-1200ms) que só fazia sentido simulando uma
    // escolha genuína.
    return { type: 'action', action: { type: 'SELECT_COMBAT_SLOT', player: ai, slotIndex: emptySlotIndex }, thinkTimeMs: 0 };
  }

  // FIX (mesmo pedido acima): com exatamente 1 carta real restante em campo,
  // também não há nenhuma escolha de verdade a fazer (é ela ou nada) - pula
  // direto para a seleção, sem passar pelas heurísticas de reação a
  // informação conhecida ou hesitação por desvantagem abaixo (que só fazem
  // sentido quando existe mais de uma carta entre as quais escolher).
  if (myFilledSlots.length === 1) {
    return { type: 'action', action: { type: 'SELECT_COMBAT_SLOT', player: ai, slotIndex: myFilledSlots[0] }, thinkTimeMs: 0 };
  }

  // FIX (Fase D, pedido do usuário): quando o oponente JÁ escolheu um slot e
  // esse valor já é informação pública (slot vazio ou carta revelada), a IA
  // às vezes (não sempre - "condicional e relativamente aleatório", para não
  // criar um padrão perceptível) faz questão de escolher uma carta própria
  // de valor MAIOR para vencer a disputa, preferindo entre as opções
  // vencedoras a de MENOR valor (suficiente para vencer, sem desperdiçar a
  // melhor carta à toa). Usa o valor REAL (trueSlotValue), não o de
  // planejamento, porque o que importa aqui é se a disputa será mesmo
  // vencida de verdade.
  const knownValue = knownSelectedSlotValue(state, ai);
  if (knownValue !== null && random() < 0.75) {
    const winningSlots = myFilledSlots.filter((i) => trueSlotValue(myPlayerState, i, character, state.spotlight) > knownValue);
    if (winningSlots.length > 0) {
      const economical = winningSlots.reduce((best, i) =>
        trueSlotValue(myPlayerState, i, character, state.spotlight) < trueSlotValue(myPlayerState, best, character, state.spotlight) ? i : best
      );
      // "esperando um pouco antes de agir naturalmente" - um atraso maior
      // que o padrão disfarça que a IA está reagindo a uma informação já
      // conhecida, em vez de decidir instantaneamente (o que pareceria
      // suspeito/óbvio demais). Perdendo no placar, a hesitação por
      // desvantagem (bem mais longa) tem prioridade sobre essa - faz mais
      // sentido "parecer nervosa" do que só "disfarçar reação".
      return {
        type: 'action',
        action: { type: 'SELECT_COMBAT_SLOT', player: ai, slotIndex: economical },
        thinkTimeMs: isLosing ? disadvantageThinkTimeMs : 1600 + random() * 900,
      };
    }
  }

  const bestSlot = pickCombatSlotWithVariety(state, ai, myFilledSlots, myPlayerState, character);
  return {
    type: 'action',
    action: { type: 'SELECT_COMBAT_SLOT', player: ai, slotIndex: bestSlot },
    thinkTimeMs: isLosing ? disadvantageThinkTimeMs : undefined,
  };
}

function decideCombatPhase(state: GameState, ai: PlayerNumber): AiDecision {
  const character = characterOf(state, ai);

  const magicAction = decideCombatMagic(state, ai, character);
  if (magicAction) return { type: 'action', action: magicAction };

  const monsterAction = decideMonsterEffect(state, ai, character);
  if (monsterAction) return { type: 'action', action: monsterAction };

  return decideCombatSlotSelection(state, ai);
}

// ============================================================================
// Ponto de entrada
// ============================================================================

/**
 * Decide a próxima ação da IA a partir do estado atual do jogo. Chamada
 * repetidamente pela camada de UI (GameBoard.tsx) a cada mudança de estado -
 * cada chamada devolve NO MÁXIMO uma ação (a IA "pensa e age" uma coisa de
 * cada vez, como faria um jogador humano clicando na interface).
 */
export function decideAiAction(state: GameState, ai: PlayerNumber): AiDecision {
  if (state.phase === 'draw') return decideDrawPhase(state, ai);
  if (state.phase === 'strategy') return decideStrategyPhase(state, ai);
  if (state.phase === 'combat') return decideCombatPhase(state, ai);
  return { type: 'ready' };
}

/**
 * Modo Reações (pedido do usuário: "aleatório") - decide se `ai` reage a uma
 * magia anunciada em `state.pendingReaction`. Só faz sentido chamar quando
 * `ai` É o oponente de quem anunciou (`opponentOf(pendingReaction.casterPlayer)`)
 * - devolve `null` em qualquer outro caso, inclusive sem nenhuma carta
 * elegível na mão ou com o limite de reações da fase já esgotado. Fora
 * desses casos, decide com 50% de chance (nem sempre reage, nem nunca) -
 * mantém a decisão simples e imprevisível de propósito, sem nenhuma
 * avaliação de quão perigosa é a magia anunciada.
 *
 * Usada tanto por GameBoard.tsx (a IA reagindo de verdade durante a janela
 * real de 3s) quanto por scripts/sanity-test.ts (a simulação IA vs IA não
 * tem timer real - precisa desta mesma decisão pra saber se dispara
 * REACT_TO_MAGIC ou avança direto pra RESOLVE_PENDING_REACTION).
 */
export function decideReactionToMagic(
  state: GameState,
  ai: PlayerNumber
): { type: 'REACT_TO_MAGIC'; player: PlayerNumber; cardId: string } | null {
  const pending = state.pendingReaction;
  if (!pending || opponentOf(pending.casterPlayer) !== ai) return null;

  const reactionsUsed = state.reactionsUsedThisPhase[ai] ?? 0;
  if (reactionsUsed >= state.gameConfig.reactionsLimit) return null;

  const candidate = state[playerKeyOf(ai)].hand.find((c) => c.value === pending.cardValue);
  if (!candidate) return null;

  if (random() >= 0.5) return null;
  return { type: 'REACT_TO_MAGIC', player: ai, cardId: candidate.id };
}
