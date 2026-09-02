/**
 * actionSpace.ts - Enumerador de espaço de ações (pedido do usuário: "uma
 * forma de conseguir prever qualquer tipo de ação possível de se acontecer",
 * pra melhorar o debug mode).
 *
 * Duas formas de gerar candidatos de `GameAction`, com propósitos diferentes:
 *
 * - `enumerateLegalActions` (modo "legal", barato): reaproveita os
 *   predicados `canX` que já existem no motor (`canActivateMagic`,
 *   `canFuseCards`, `canFormOrReinforceTower`, `canActivateNumeralSpell`,
 *   `canActivateMonsterEffect`, `canSelectCombatSlot`, `isSlotProtected`,
 *   `isFieldEligible`) pra só gerar ações que JÁ deveriam ser aceitas -
 *   usado pra explorar espaço de estado rápido (fuzzing amplo, ver
 *   `scripts/fuzz.ts`).
 *
 * - `enumerateCandidateActions` (modo "ingênuo"/exaustivo): gera toda ação
 *   sintaticamente plausível SEM consultar nenhum predicado `canX` - cada
 *   carta da mão × cada slot × horizontal/não, cada seleção plausível de
 *   magia, etc. - pra ser despachada contra o `gameReducer` DE VERDADE e
 *   nunca contra uma segunda cópia das regras.
 *
 * - `checkActionDivergence` compara as duas: onde um predicado disse "legal"
 *   mas o motor recusou (ou o contrário) - é exatamente a classe de bug já
 *   encontrada 2x nesta sessão (a IA mirando cartas-token de fogo do
 *   Piromante que o motor recusa em silêncio) e a mesma razão pela qual a
 *   elegibilidade de armadilha do Coringa (duplicada em `aiPlayer.ts` e 2x
 *   em `PlayerZone.tsx`, sem nenhum helper compartilhado) é um risco
 *   conhecido deste projeto.
 *
 * LIMITAÇÃO DE PROPÓSITO (documentada, não um bug): gerar uma seleção de
 * magia (`MagicSelection`) exige ALGUM conhecimento do FORMATO dos campos
 * (`selectedCards` é um array de ids, `selectedSlot` é um índice 0-2, etc.) -
 * isso é inevitável (não dá pra gerar um candidato sem nenhuma noção da sua
 * forma), mas é uma duplicação de risco BEM menor que duplicar elegibilidade:
 * o pior caso aqui é um FALSO NEGATIVO (deixar de gerar uma seleção que o
 * motor teria aceitado, sub-testando aquela magia) - nunca um FALSO POSITIVO
 * (`enumerateCandidateActions` nunca afirma que algo é ilegal; a legalidade
 * real é decidida só por "o `gameReducer` mudou o estado?", nunca pela
 * opinião do gerador). Por isso, pra qualquer campo de seleção que seja um
 * ARRAY (`selectedCards`, `selectedRevealCardIds`), o modo exaustivo GERA
 * amostras de tamanho 0/1/2/"todos elegíveis" em vez do powerset completo -
 * a Rainha do Mosqueteiro sozinha (2 subconjuntos independentes:
 * `selectedCards` + `selectedRevealCardIds`) explodiria pra dezenas de
 * milhares de candidatos em powerset completo. Os campos de ÍNDICE/ENUM
 * (`selectedSlot`, `selectedTargetPlayer`, `selectedTargetSlot`,
 * `fireballLaunch`) continuam exaustivos de verdade (baratos, sempre
 * completos).
 *
 * FORA DE ESCOPO (nomeado, não ignorado): tudo aqui opera direto contra
 * `gameReducer`/`decideAiAction` - nenhuma parte renderiza componentes React.
 * `checkActionDivergence` pega divergências futuras entre `aiPlayer.ts` e o
 * motor, mas NÃO consegue pegar uma divergência entre `PlayerZone.tsx`
 * (lógica de clique da UI) e o motor - isso exigiria renderizar o componente
 * de verdade e simular cliques.
 */
import {
  gameReducer,
  playerKeyOf,
  opponentKeyOf,
  characterOf,
  isSlotProtected,
  getMagicActivationContext,
  canFormOrReinforceTower,
  canActivateMonsterEffect,
  canSelectCombatSlot,
  towerEligibleValue,
  isTowerSlot,
  getEffectiveDiscardLimit,
  type GameState,
  type GameAction,
  type PlayerNumber,
  type FieldSlot,
  type MagicSelection,
} from './gameEngine';
import { canActivateMagic, type MagicCardType } from './magicCards';
import { canActivateNumeralSpell, type NumeralCharacter } from './numeralSpells';
import { canFuseCards } from './fusion';
import { isFieldEligible, isPlainNumeralCard, getEffectiveCardValue, type Card } from './cardUtils';

/**
 * Compara dois estados IGNORANDO o campo `log` - descoberto ao validar este
 * módulo: o motor tem um padrão DELIBERADO e generalizado (13+ ocorrências em
 * `gameEngine.ts`, ex.: "Esse slot está protegido por Proteção Divina!",
 * limite de compra/descarte atingido) de rejeição "com aviso" - devolve
 * `{ ...state, log: appendLog(...) }`, uma referência NOVA só pra anexar um
 * toast explicando por quê, mesmo sem mudar nada além do log. Comparar por
 * referência crua (`result !== state`, o mesmo padrão que `rejectedActions`
 * em `fastForward`/`scripts/sanity-test.ts` já usa) conta ERRADO essas
 * rejeições como "aceitas", porque a IA heurística sempre se auto-filtra
 * ANTES de despachar (nunca bate nesses avisos na prática) - mas o modo
 * exaustivo deste módulo despacha candidatos de propósito SEM esse
 * autofiltro, e bateu neles direto na validação. Esta função ignora `log`
 * pra medir só a mudança de estado que REALMENTE importa pro jogo.
 */
export function isSameGameplayState(a: GameState, b: GameState): boolean {
  if (a === b) return true;
  const { log: logA, ...restA } = a;
  const { log: logB, ...restB } = b;
  return JSON.stringify(restA) === JSON.stringify(restB);
}

/** Ids de toda carta presente num campo (principal + horizontais) - torre/reserva fica de fora de propósito (nunca é alvo direto de nenhuma ação, só se move via combate). */
function fieldCardIds(field: [FieldSlot, FieldSlot, FieldSlot]): string[] {
  return field.flatMap((slot) => [...(slot.faceDownCard ? [slot.faceDownCard.id] : []), ...slot.horizontalCards.map((c) => c.id)]);
}

/** Amostras BOUNDED de um array: [] (tamanho 0), cada item sozinho (tamanho 1), até `pairCount` pares (tamanho 2), e o array inteiro ("todos"). Nunca o powerset completo - ver comentário do módulo. */
function boundedSubsets<T>(items: T[], pairCount = 3): T[][] {
  const out: T[][] = [[]];
  for (const item of items) out.push([item]);
  for (let i = 0; i < items.length && out.length < pairCount + items.length + 1; i++) {
    for (let j = i + 1; j < items.length; j++) out.push([items[i], items[j]]);
  }
  if (items.length > 2) out.push([...items]);
  return out;
}

const MAGIC_TYPES: MagicCardType[] = ['J', 'Q', 'K'];
const SLOT_INDICES = [0, 1, 2];
const PLAYERS: PlayerNumber[] = [1, 2];

/**
 * Gera candidatos de `MagicSelection` pra uma ativação de magia - varia UM
 * grupo de campos de cada vez a partir de uma base vazia (mantém a
 * combinatória linear, não exponencial), mais alguns combos conhecidos que
 * precisam de 2 campos simultâneos (Piromante lançar bola de fogo mirando um
 * slot; Mosqueteiro Rainha descartar E revelar ao mesmo tempo). Nunca
 * codifica QUAL personagem/magia precisa de qual campo - isso é decidido
 * pelo motor ao aceitar ou recusar cada candidato.
 */
function generateMagicSelections(state: GameState, player: PlayerNumber, ownCardIdPool: string[]): MagicSelection[] {
  const opponent = state[opponentKeyOf(player)];
  const me = state[playerKeyOf(player)];
  const opponentHandIds = opponent.hand.map((c) => c.id);
  const opponentFieldIds = fieldCardIds(opponent.field);
  const ownFieldIds = fieldCardIds(me.field);
  const allTargetableIds = [...ownCardIdPool, ...opponentHandIds, ...opponentFieldIds, ...ownFieldIds];

  const selections: MagicSelection[] = [{}];
  for (const subset of boundedSubsets(allTargetableIds, 2)) {
    if (subset.length > 0) selections.push({ selectedCards: subset });
  }
  for (const slot of SLOT_INDICES) {
    selections.push({ selectedSlot: slot });
    selections.push({ selectedTargetSlot: slot });
    for (const tp of PLAYERS) selections.push({ selectedTargetPlayer: tp, selectedSlot: slot });
  }
  // Besta K (Roubo Brutal): troca um slot PRÓPRIO por um slot do OPONENTE -
  // handleExecuteMagic (gameEngine.ts) exige `selectedSlot` E
  // `selectedTargetSlot` setados AO MESMO TEMPO (rejeita se qualquer um
  // faltar). O laço acima gera os dois campos separadamente, nunca juntos -
  // sem este combo dedicado, nenhum candidato exhaustivo jamais bate com a
  // única forma real de ativar esta magia, gerando um falso-positivo em
  // checkActionDivergence (mesma classe de risco já documentada pra
  // Mosqueteiro Q logo abaixo, só que descoberta depois via fuzzing real).
  for (const ownSlot of SLOT_INDICES) {
    for (const targetSlot of SLOT_INDICES) selections.push({ selectedSlot: ownSlot, selectedTargetSlot: targetSlot });
  }
  // Mosqueteiro - Rajada Reveladora: descarte + revelação às cegas, juntos.
  const revealPool = [...opponentHandIds, ...opponentFieldIds];
  for (const discardSubset of boundedSubsets(ownCardIdPool, 1)) {
    for (const revealSubset of boundedSubsets(revealPool, 1)) {
      if (discardSubset.length > 0) selections.push({ selectedCards: discardSubset, selectedRevealCardIds: revealSubset });
    }
  }
  // Piromante - lançar a Bola de Fogo já acumulada, mirando cada slot do oponente.
  for (const slot of SLOT_INDICES) selections.push({ fireballLaunch: true, selectedTargetSlot: slot });
  return selections;
}

/**
 * `enumerateLegalActions` - modo "legal": só gera ações que os predicados
 * `canX` já existentes dizem que deveriam ser aceitas agora. Rápido,
 * usado pra fuzzing amplo (ver `scripts/fuzz.ts`).
 */
export function enumerateLegalActions(state: GameState, player: PlayerNumber): GameAction[] {
  const actions: GameAction[] = [];
  const key = playerKeyOf(player);
  const me = state[key];
  const character = characterOf(state, player);

  actions.push({ type: 'TOGGLE_READY', player });

  if (state.phase === 'draw') {
    const maxDraw = Math.max(0, me.handLimit - me.hand.length);
    for (let count = 1; count <= Math.min(maxDraw, 4); count++) actions.push({ type: 'DRAW_CARDS', player, count });

    const discardable = me.hand.filter((c) => !c.revealed).map((c) => c.id);
    const discardLimit = getEffectiveDiscardLimit(state.gameConfig);
    for (const subset of boundedSubsets(discardable, 2)) {
      if (subset.length > 0 && subset.length <= discardLimit) actions.push({ type: 'DISCARD_CARDS', player, cardIds: subset });
    }

    for (let i = 0; i < me.hand.length; i++) {
      for (let j = i + 1; j < me.hand.length; j++) {
        if (canFuseCards(state.phase, state.gameConfig.fusion, me.fusesThisTurn, state.gameConfig.fusionLimit, state.gameConfig.monsterCards, me.hand[i], me.hand[j])) {
          actions.push({ type: 'FUSE_CARDS', player, cardId1: me.hand[i].id, cardId2: me.hand[j].id });
        }
      }
    }
  }

  if (state.phase === 'strategy') {
    for (const card of me.hand) {
      if (!isFieldEligible(card) && character !== 'coringa') continue;
      for (const slotIndex of SLOT_INDICES) {
        actions.push({ type: 'PLAY_CARD', player, cardId: card.id, slotIndex, asHorizontal: false });
        actions.push({ type: 'PLAY_CARD', player, cardId: card.id, slotIndex, asHorizontal: true });
        actions.push({ type: 'SWAP_FIELD_CARD', player, cardId: card.id, slotIndex });
      }
    }
    for (const slotIndex of SLOT_INDICES) {
      actions.push({ type: 'RETURN_CARD_TO_HAND', player, slotIndex });
      for (const hCard of me.field[slotIndex].horizontalCards) {
        actions.push({ type: 'RETURN_HORIZONTAL_CARD_TO_HAND', player, slotIndex, cardId: hCard.id });
      }
    }

    const aces = me.hand.filter((c) => c.value === 'A' && c.transformedValue === undefined);
    const transformTargets = [...me.hand.map((c) => c.id), ...fieldCardIds(me.field)];
    for (const ace of aces) {
      for (const targetId of transformTargets) {
        if (targetId !== ace.id) actions.push({ type: 'TRANSFORM_ACE', player, aceCardId: ace.id, targetCardId: targetId });
      }
    }

    if (state.gameConfig.towersMode) {
      const grouped = new Map<number, string[]>();
      for (const card of me.hand) {
        const v = towerEligibleValue(card);
        if (v === null) continue;
        grouped.set(v, [...(grouped.get(v) ?? []), card.id]);
      }
      for (const [, cardIds] of grouped) {
        for (const slotIndex of SLOT_INDICES) {
          if (canFormOrReinforceTower(state, player, slotIndex, cardIds)) {
            actions.push({ type: 'FORM_OR_REINFORCE_TOWER', player, slotIndex, cardIds });
          }
          // Reforço de 1 carta por vez também é válido, além do grupo inteiro.
          for (const id of cardIds) {
            if (canFormOrReinforceTower(state, player, slotIndex, [id])) {
              actions.push({ type: 'FORM_OR_REINFORCE_TOWER', player, slotIndex, cardIds: [id] });
            }
          }
        }
      }
    }

    if (canActivateNumeralSpell(character as NumeralCharacter, me.hand, me.field, state.activeNumeralSpells[player] !== undefined, state.spotlight)) {
      actions.push({ type: 'ACTIVATE_NUMERAL_SPELL', player });
    }

    const monster = me.monsterCard;
    if (monster && !monster.value) {
      // nunca deveria faltar `value` - guarda de tipo, sem efeito prático.
    }
    for (const card of me.hand) {
      if (card.isMonster) actions.push({ type: 'PLACE_MONSTER_CARD', player, cardId: card.id });
      if (card.value === 'J' || card.value === 'Q' || card.value === 'K') {
        actions.push({ type: 'TRANSFORM_CORINGA_MAGIC_CARD', player, cardId: card.id });
      }
    }
    if (canActivateMonsterEffect(state, player)) {
      actions.push({ type: 'ACTIVATE_MONSTER_EFFECT_SIMPLE', player });
      for (const slotIndex of SLOT_INDICES) {
        for (const cardId of [...(me.field[slotIndex].faceDownCard ? [me.field[slotIndex].faceDownCard!.id] : []), ...me.field[slotIndex].horizontalCards.map((c) => c.id)]) {
          actions.push({ type: 'ACTIVATE_MONSTER_EFFECT_SIMPLE', player, targetSlotIndex: slotIndex, targetCardId: cardId });
        }
        if (character === 'mago') {
          for (const targetId of [...fieldCardIds(me.field), ...fieldCardIds(state[opponentKeyOf(player)].field)]) {
            actions.push({ type: 'EXECUTE_MAGO_MONSTER_EFFECT', player, targetSlotIndex: slotIndex, targetCardId: targetId });
          }
        }
      }
    }
  }

  if (state.phase === 'combat' && canSelectCombatSlot(state, player)) {
    for (const slotIndex of SLOT_INDICES) actions.push({ type: 'SELECT_COMBAT_SLOT', player, slotIndex });
  }

  // Magias (J/Q/K): reaproveita `canActivateMagic` pra só considerar cartas
  // cuja fase bate (ou a janela extra de Combate do Piromante pra lançar) -
  // as SELEÇÕES ainda são geradas genericamente (ver generateMagicSelections),
  // nunca por personagem/tipo específico.
  const ctx = getMagicActivationContext(state, player);
  for (const card of me.hand) {
    if (card.value !== 'J' && card.value !== 'Q' && card.value !== 'K') continue;
    if (!canActivateMagic(state.phase, character, card.value as MagicCardType, ctx)) continue;
    if (card.value === 'J' || card.value === 'K') actions.push({ type: 'ACTIVATE_SIMPLE_MAGIC', player, cardId: card.id });
    const ownCardIdPool = me.hand.filter((c) => c.id !== card.id).map((c) => c.id);
    for (const selection of generateMagicSelections(state, player, ownCardIdPool)) {
      actions.push({ type: 'EXECUTE_MAGIC', player, cardId: card.id, character, magicType: card.value as MagicCardType, selection });
    }
  }

  if (state.pendingReaction && opponentOfCaster(state, player)) {
    for (const card of me.hand) {
      if (card.value === state.pendingReaction.cardValue) actions.push({ type: 'REACT_TO_MAGIC', player, cardId: card.id });
    }
  }

  return actions;
}

function opponentOfCaster(state: GameState, player: PlayerNumber): boolean {
  return state.pendingReaction !== null && state.pendingReaction.casterPlayer !== player;
}

/**
 * `enumerateCandidateActions` - modo "ingênuo"/exaustivo: mesma geração de
 * `enumerateLegalActions`, mas SEM nenhum filtro `canX` - gera TUDO que é
 * sintaticamente plausível (a única diferença real está em PLAY_CARD/
 * SWAP_FIELD_CARD, que aqui tentam TODA carta da mão, não só as
 * `isFieldEligible`) e deixa o `gameReducer` ser o único juiz de legalidade.
 * Mais caro - ver limites de combinatória no comentário do módulo.
 */
export function enumerateCandidateActions(state: GameState, player: PlayerNumber): GameAction[] {
  const actions: GameAction[] = [];
  const key = playerKeyOf(player);
  const me = state[key];
  const character = characterOf(state, player);

  actions.push({ type: 'TOGGLE_READY', player });
  for (let count = 1; count <= 4; count++) actions.push({ type: 'DRAW_CARDS', player, count });

  const allHandIds = me.hand.map((c) => c.id);
  for (const subset of boundedSubsets(allHandIds, 2)) {
    if (subset.length > 0) actions.push({ type: 'DISCARD_CARDS', player, cardIds: subset });
  }
  for (let i = 0; i < me.hand.length; i++) {
    for (let j = i + 1; j < me.hand.length; j++) {
      actions.push({ type: 'FUSE_CARDS', player, cardId1: me.hand[i].id, cardId2: me.hand[j].id });
    }
  }

  for (const card of me.hand) {
    for (const slotIndex of SLOT_INDICES) {
      actions.push({ type: 'PLAY_CARD', player, cardId: card.id, slotIndex, asHorizontal: false });
      actions.push({ type: 'PLAY_CARD', player, cardId: card.id, slotIndex, asHorizontal: true });
      actions.push({ type: 'SWAP_FIELD_CARD', player, cardId: card.id, slotIndex });
    }
  }
  for (const slotIndex of SLOT_INDICES) {
    actions.push({ type: 'RETURN_CARD_TO_HAND', player, slotIndex });
    for (const hCard of me.field[slotIndex].horizontalCards) {
      actions.push({ type: 'RETURN_HORIZONTAL_CARD_TO_HAND', player, slotIndex, cardId: hCard.id });
    }
  }

  const transformTargets = [...allHandIds, ...fieldCardIds(me.field)];
  for (const ace of me.hand.filter((c) => c.value === 'A')) {
    for (const targetId of transformTargets) {
      if (targetId !== ace.id) actions.push({ type: 'TRANSFORM_ACE', player, aceCardId: ace.id, targetCardId: targetId });
    }
  }

  if (state.gameConfig.towersMode) {
    const grouped = new Map<number, string[]>();
    for (const card of me.hand) {
      const v = towerEligibleValue(card);
      if (v !== null) grouped.set(v, [...(grouped.get(v) ?? []), card.id]);
    }
    for (const [, cardIds] of grouped) {
      for (const slotIndex of SLOT_INDICES) actions.push({ type: 'FORM_OR_REINFORCE_TOWER', player, slotIndex, cardIds });
    }
  }

  actions.push({ type: 'ACTIVATE_NUMERAL_SPELL', player });
  for (const card of me.hand) {
    if (card.value === 'J' || card.value === 'K') actions.push({ type: 'ACTIVATE_SIMPLE_MAGIC', player, cardId: card.id });
    if (card.value === 'J' || card.value === 'Q' || card.value === 'K') {
      actions.push({ type: 'TRANSFORM_CORINGA_MAGIC_CARD', player, cardId: card.id });
      const ownCardIdPool = me.hand.filter((c) => c.id !== card.id).map((c) => c.id);
      for (const selection of generateMagicSelections(state, player, ownCardIdPool)) {
        actions.push({ type: 'EXECUTE_MAGIC', player, cardId: card.id, character, magicType: card.value, selection });
      }
    }
    if (card.isMonster) actions.push({ type: 'PLACE_MONSTER_CARD', player, cardId: card.id });
  }
  actions.push({ type: 'ACTIVATE_MONSTER_EFFECT_SIMPLE', player });
  for (const slotIndex of SLOT_INDICES) {
    for (const cardId of fieldCardIds(me.field)) {
      actions.push({ type: 'ACTIVATE_MONSTER_EFFECT_SIMPLE', player, targetSlotIndex: slotIndex, targetCardId: cardId });
      for (const targetId of [...fieldCardIds(me.field), ...fieldCardIds(state[opponentKeyOf(player)].field)]) {
        actions.push({ type: 'EXECUTE_MAGO_MONSTER_EFFECT', player, targetSlotIndex: slotIndex, targetCardId: targetId });
      }
    }
  }
  for (const slotIndex of SLOT_INDICES) actions.push({ type: 'SELECT_COMBAT_SLOT', player, slotIndex });
  if (state.pendingReaction) {
    for (const card of me.hand) actions.push({ type: 'REACT_TO_MAGIC', player, cardId: card.id });
  }

  return actions;
}

/** Um item do relatório de `checkActionDivergence` - ver comentário do módulo. */
export interface DivergenceReport {
  action: GameAction;
  /** O que um predicado `canX` existente (quando há um mapeável pro tipo de ação) previu. `undefined` = não há predicado equivalente pra comparar (ex.: PLAY_CARD não tem um "canPlayCard" único). */
  predicateSaidLegal: boolean | undefined;
  /** Se o `gameReducer` de verdade aceitou (mudou o estado) ou recusou (devolveu a MESMA referência) esta ação. */
  reducerAccepted: boolean;
}

/**
 * Roda `enumerateCandidateActions` (modo exaustivo) contra o `gameReducer`
 * DE VERDADE e reporta só os casos onde um predicado `canX` existente
 * discorda do resultado real - a ferramenta pensada pra pegar a classe de
 * bug "IA propõe uma ação que o motor recusa em silêncio" antes dela
 * acontecer de novo, em vez de esperar a IA heurística tropeçar nela.
 *
 * NUNCA muta `state` de verdade - cada candidato é despachado contra
 * `gameReducer` isoladamente, sempre a partir do MESMO `state` de entrada
 * (não encadeado), então o resultado de uma ação nunca afeta o teste da
 * próxima.
 */
export function checkActionDivergence(state: GameState, player: PlayerNumber): DivergenceReport[] {
  const reports: DivergenceReport[] = [];
  const character = characterOf(state, player);
  const ctx = getMagicActivationContext(state, player);

  // FIX (descoberto validando este módulo): `canActivateMagic` é um portão
  // COMPARTILHADO por 2 canais de despacho (`ACTIVATE_SIMPLE_MAGIC` - só
  // J/K, um punhado de combos específicos tipo Anjo K/J - e `EXECUTE_MAGIC` -
  // todo o resto), mas nem toda magia aceita os dois. Comparar cada
  // candidato ISOLADAMENTE contra `canActivateMagic` gerava falso-positivo
  // em massa pra qualquer magia "só ACTIVATE_SIMPLE_MAGIC" (ex.: Anjo K):
  // toda tentativa via EXECUTE_MAGIC "divergia" mesmo sem bug nenhum, porque
  // o canal certo nem era esse. Agora agrupa por carta e considera "aceito"
  // se QUALQUER variante (dos 2 canais, todas as seleções geradas) funcionou -
  // só reporta divergência quando NENHUMA variante bate com o que
  // `canActivateMagic` previu.
  const magicCandidatesByCard = new Map<string, { magicType: MagicCardType; anyAccepted: boolean; sample: GameAction }>();
  const otherCandidates: GameAction[] = [];

  for (const action of enumerateCandidateActions(state, player)) {
    if (action.type === 'EXECUTE_MAGIC' || action.type === 'ACTIVATE_SIMPLE_MAGIC') {
      const card = state[playerKeyOf(player)].hand.find((c) => c.id === action.cardId);
      if (!card || (card.value !== 'J' && card.value !== 'Q' && card.value !== 'K')) continue;
      const result = gameReducer(state, action);
      const accepted = !isSameGameplayState(result, state);
      const entry = magicCandidatesByCard.get(action.cardId);
      if (!entry) {
        magicCandidatesByCard.set(action.cardId, { magicType: card.value, anyAccepted: accepted, sample: action });
      } else if (accepted && !entry.anyAccepted) {
        magicCandidatesByCard.set(action.cardId, { magicType: card.value, anyAccepted: true, sample: action });
      }
    } else {
      otherCandidates.push(action);
    }
  }

  for (const { magicType, anyAccepted, sample } of magicCandidatesByCard.values()) {
    const predicateSaidLegal = canActivateMagic(state.phase, character, magicType, ctx);
    if (predicateSaidLegal !== anyAccepted) {
      reports.push({ action: sample, predicateSaidLegal, reducerAccepted: anyAccepted });
    }
  }

  for (const action of otherCandidates) {
    const result = gameReducer(state, action);
    const reducerAccepted = !isSameGameplayState(result, state);

    let predicateSaidLegal: boolean | undefined;
    if (action.type === 'FUSE_CARDS') {
      const c1 = state[playerKeyOf(player)].hand.find((c) => c.id === action.cardId1);
      const c2 = state[playerKeyOf(player)].hand.find((c) => c.id === action.cardId2);
      predicateSaidLegal = canFuseCards(state.phase, state.gameConfig.fusion, state[playerKeyOf(player)].fusesThisTurn, state.gameConfig.fusionLimit, state.gameConfig.monsterCards, c1, c2);
    } else if (action.type === 'FORM_OR_REINFORCE_TOWER') {
      predicateSaidLegal = canFormOrReinforceTower(state, player, action.slotIndex, action.cardIds);
    } else if (action.type === 'ACTIVATE_NUMERAL_SPELL') {
      const me = state[playerKeyOf(player)];
      predicateSaidLegal = state.phase === 'strategy' && canActivateNumeralSpell(character as NumeralCharacter, me.hand, me.field, state.activeNumeralSpells[player] !== undefined, state.spotlight);
    } else if (action.type === 'SELECT_COMBAT_SLOT') {
      predicateSaidLegal = canSelectCombatSlot(state, player);
    }
    // Ações sem predicado equivalente mapeável (PLAY_CARD, SWAP_FIELD_CARD,
    // TRANSFORM_ACE, etc.) ficam com `predicateSaidLegal: undefined` - só o
    // resultado real do motor é reportado pra elas; não há "2ª opinião" pra
    // comparar, então não há divergência possível de detectar.
    if (predicateSaidLegal === undefined) continue;
    if (predicateSaidLegal !== reducerAccepted) {
      reports.push({ action, predicateSaidLegal, reducerAccepted });
    }
  }

  return reports;
}

// Reexport de conveniência - `isSlotProtected` é usado por quem monta
// cenários de teste em cima deste módulo (ex.: scripts/fuzz.ts) pra montar
// campos válidos sem reimplementar a checagem de proteção do Anjo.
export { isSlotProtected };
