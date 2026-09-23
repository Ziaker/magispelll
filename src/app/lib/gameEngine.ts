/**
 * gameEngine.ts - Motor de regras do Magispelll
 *
 * Toda a lógica de jogo mora aqui, como um reducer puro: (GameState, GameAction) => GameState.
 * Nenhuma função neste arquivo chama setTimeout, lê o relógio, ou tem qualquer
 * efeito colateral - dado o mesmo estado e a mesma ação, sempre produz o mesmo
 * resultado. Isso existe para eliminar uma classe inteira de bugs de estado
 * que existia na versão anterior do jogo, em que a lógica ficava misturada
 * com timers e chamadas de setState aninhadas dentro do próprio componente
 * React (o que causava, por exemplo, cartas sendo simultaneamente "no campo"
 * e "na pilha de descarte" depois de vencer uma disputa de combate).
 *
 * GameBoard.tsx (a camada de UI) é responsável apenas por:
 * - despachar ações em resposta a cliques
 * - decidir QUANDO mostrar popups/animações e agendar a próxima ação depois
 *   de um tempo (ex.: mostrar o resultado do combate por 2.5s antes de
 *   despachar FINALIZE_COMBAT)
 * - renderizar o estado atual
 *
 * O estado em si (quem tem quantas vidas, quais cartas estão em qual mão ou
 * campo, etc.) é sempre 100% consistente logo após qualquer dispatch - nunca
 * existe uma janela onde o estado está "temporariamente errado" esperando um
 * timer terminar.
 */

import {
  drawCards,
  getDisplaySuit,
  getDisplayValue,
  getEffectiveCardValue,
  isNumeralCard,
  isPlainNumeralCard,
  revealCard,
  reshuffleDiscardIntoDeck,
  resetCardForDiscard,
  shuffle,
  type Card,
} from './cardUtils';
import { DEFAULT_GAME_CONFIG, type GameConfig } from './gameConfig';
import { getEffectiveDrawLimit, getEffectiveDiscardLimit } from './gameLimits';
import { canActivateMagic, type MagicCardType } from './magicCards';
import { canActivateNumeralSpell, formatNumeralRequirement, getMatchingNumeralCards, getNumeralSpellInfo } from './numeralSpells';
import { handleActivateNumeralSpell, handleFinalizeNumeralSpell } from './numeralSpellHandlers';
import { getSpotlightAdjustedValue } from './spotlight';
import {
  applyCombatModifierStatuses,
  applyStatus,
  applyTimedCombatModifier,
  getCombatModifierStatuses,
  getStatusMagnitude,
  hasStatus,
  removeStatus,
  removeStatusFromField,
} from './statusEffects';
import { ALL_CHARACTER_IDS, type CharacterId } from './characterRegistry';
import { isSameGameplayState } from './gameplayState';
import type { Phase, PlayerNumber, PlayerKey } from './gameTypes';
import { appendLog } from './gameLog';
import { applyBestaBloodRageSweep } from './bestaLifecycle';
import { handleDiscardCards, handleDrawCards } from './drawPhaseHandlers';
import { handlePlayCard, handleReturnCardToHand, handleReturnHorizontalCardToHand, handleSwapFieldCard } from './strategyFieldHandlers';
import { handleFormOrReinforceTower } from './towerHandlers';
import { handlePayToUnfreeze } from './glacialHandlers';
import { handleTransformAce } from './aceHandlers';
import { handlePlaceMonsterCard } from './monsterHandlers';
import { handleActivateMonsterEffectSimple, handleExecuteMagoMonsterEffect } from './monsterEffectHandlers';
import { handleFuseCards } from './fusionHandlers';
import { handleTransformCoringaMagicCard } from './coringaHandlers';
import { resolveCoringaTrapTargeting, tryCoringaJShieldBlock } from './coringaTrapHandlers';
import { handleSelectCombatSlot } from './combatHandlers';
import { handleActivateSimpleMagic, handleExecuteMagic } from './magicHandlers';
import type { GameAction, MagicSelection } from './gameActionTypes';
import { handleReactToMagic, handleResolvePendingReaction, maybeDeferForReaction } from './reactionHandlers';
import { playerKeyOf, opponentKeyOf, opponentOf, characterOf } from './gameSelectors';
import { advancePhaseState, handleToggleReady } from './phaseHandlers';
import { MAX_MONSTER_USES, resolveMonsterCardAtTurnEnd, canActivateMonsterEffect } from './monsterLifecycle';
import { pushToDiscard, ensureDeckHasCards, ensureDeckHasAtLeast } from './deckLifecycle';
import { isTowerSlot, isBrotoSlot } from './fieldLifecycle';
import { resolveCombatSlot, updateFieldSlot } from './fieldOperations';
import { fieldCards, wasEverTowerSlot, getUnbattledHorizontalSlots, getDestroyableReinforcementSlots, getUnrevealedFieldSlots, getFilledFieldSlots } from './fieldQueries';
import { getGlacialGolemValue, isFrozenPlayBlocked, isFrozenMagicActivationBlocked } from './glacialRules';
import { isSlotProtected } from './anjoRules';
import { getFireballCap } from './piromanteRules';
import { applyCoringaTrapCombatValue, isCoringaRawTrapCard } from './coringaRules';
import { getMagicActivationContext } from './magicActivationContext';
import { growDruidaBrotoField } from './druidaLifecycle';
import type { FieldSlot, PlayerState, CombatResolution, NumeralSpellPending, PendingReaction, GameState } from './gameStateTypes';
import { emptyField, createPlayerState, createInitialState } from './gameStateFactory';

export type { Phase, PlayerNumber, PlayerKey } from './gameTypes';
export { ALL_CHARACTER_IDS, type CharacterId } from './characterRegistry';
export type { LogEntry, LogEventType } from './gameLogTypes';
export type { GameAction, MagicSelection } from './gameActionTypes';
export type { FieldSlot, PlayerState, CombatResolution, NumeralSpellPending, PendingReaction, GameState } from './gameStateTypes';
export { playerKeyOf, opponentKeyOf, opponentOf, characterOf } from './gameSelectors';
export { MAX_MONSTER_USES, canActivateMonsterEffect } from './monsterLifecycle';
export { isTowerSlot, isBrotoSlot } from './fieldLifecycle';
export { fieldCards, wasEverTowerSlot, getUnbattledHorizontalSlots, getDestroyableReinforcementSlots, getUnrevealedFieldSlots, getFilledFieldSlots } from './fieldQueries';
export { getGlacialGolemValue, isFrozenPlayBlocked, isFrozenMagicActivationBlocked } from './glacialRules';
export { isSlotProtected } from './anjoRules';
export { canSelectCombatSlot } from './combatRules';
export { getFireballCap } from './piromanteRules';
export { isCoringaRawTrapCard } from './coringaRules';
export { getMagicActivationContext } from './magicActivationContext';
export { canMagicTriggerReactionAnnouncement } from './reactionHandlers';
export { towerEligibleValue, canFormOrReinforceTower } from './towerRules';
export { getEffectiveDrawLimit, getEffectiveDiscardLimit } from './gameLimits';
export { createInitialState } from './gameStateFactory';

export function gameReducer(state: GameState, action: GameAction): GameState {
  return applyBestaBloodRageSweep(reduceGameAction(state, action));
}

function reduceGameAction(state: GameState, action: GameAction): GameState {
  // Modo de debug - passthrough puro, ANTES de qualquer guard de fase/janela
  // pendente abaixo (numeralSpellPending, pendingReaction etc.) de propósito:
  // um cenário de debug precisa poder substituir o estado mesmo no meio de
  // uma dessas janelas, não só entre elas. Ver comentário completo no tipo
  // 'DEBUG_FORCE_STATE' (definição de GameAction, acima).
  if (action.type === 'DEBUG_FORCE_STATE') return action.state;
  // FIX (pedido do usuário: "re-corrija o problema da besta dar softlock no
  // jogo quando faz a Magia Numeral") - handleToggleReady já bloqueava a SI
  // MESMA durante a janela de ~3s entre ativar uma Magia Numeral e
  // handleFinalizeNumeralSpell rodar de fato (ver comentário lá), mas
  // QUALQUER outra ação que mexe em mão/campo durante essa janela corrompe o
  // estado pendente do mesmo jeito - inclusive ativar uma SEGUNDA Magia
  // Numeral (do OUTRO jogador): handleActivateNumeralSpell esvazia o campo
  // do oponente como parte da própria ativação, então é bem comum o
  // oponente também já ter 3 cartas iguais + campo vazio bem nesse instante
  // - se ele ativar a dele também, `numeralSpellPending` é sobrescrito com
  // os dados DELE, e quando o timer de 3s do PRIMEIRO jogador chamar
  // FINALIZE_NUMERAL_SPELL, ele finaliza o efeito ERRADO - o primeiro
  // jogador fica com as 3 cartas da própria ativação paradas no campo pra
  // sempre, sem nunca ser descartadas nem destravar o turno dele. A Fúria
  // Sanguinária da Besta (que sempre esvazia o campo do oponente, igual às
  // outras, mas é a que o usuário mais reproduziu) não é a causa raiz
  // específica - é só o gatilho mais fácil de bater nessa janela. Bloqueado
  // aqui, de uma vez por todas, pra TODA ação que não seja a própria
  // finalização ou pausar/despausar - nunca confiar só na UI (o popup já
  // deveria impedir cliques por baixo, mas isso protege mesmo se algo
  // escapar, como já documentado no comentário de handleToggleReady).
  if (state.numeralSpellPending && action.type !== 'FINALIZE_NUMERAL_SPELL' && action.type !== 'TOGGLE_PAUSE') {
    return state;
  }
  // FIX (pedido do usuário, Modo Reações): "o jogo é pausado" - mesmo padrão
  // do guard de numeralSpellPending acima (pausa TOTAL, nenhuma outra ação
  // acontece) enquanto uma magia está anunciada aguardando a janela de 3s -
  // só a reação em si, a expiração da janela, ou pausar/despausar passam.
  if (state.pendingReaction && action.type !== 'REACT_TO_MAGIC' && action.type !== 'RESOLVE_PENDING_REACTION' && action.type !== 'TOGGLE_PAUSE') {
    return state;
  }
  switch (action.type) {
    case 'DRAW_CARDS':
      return handleDrawCards(state, action.player, action.count);
    case 'DISCARD_CARDS':
      return handleDiscardCards(state, action.player, action.cardIds);
    case 'FUSE_CARDS':
      return handleFuseCards(state, action.player, action.cardId1, action.cardId2);
    case 'PLAY_CARD':
      return handlePlayCard(state, action.player, action.cardId, action.slotIndex, action.asHorizontal);
    case 'RETURN_CARD_TO_HAND':
      return handleReturnCardToHand(state, action.player, action.slotIndex);
    case 'RETURN_HORIZONTAL_CARD_TO_HAND':
      return handleReturnHorizontalCardToHand(state, action.player, action.slotIndex, action.cardId);
    case 'SWAP_FIELD_CARD':
      return handleSwapFieldCard(state, action.player, action.cardId, action.slotIndex);
    case 'PAY_TO_UNFREEZE':
      return handlePayToUnfreeze(state, action.player, action.paymentCardId, action.targetCardId);
    case 'FORM_OR_REINFORCE_TOWER':
      return handleFormOrReinforceTower(state, action.player, action.slotIndex, action.cardIds);
    case 'TRANSFORM_ACE':
      return handleTransformAce(state, action.player, action.aceCardId, action.targetCardId);
    case 'ACTIVATE_SIMPLE_MAGIC':
      return maybeDeferForReaction(state, action, action.player, action.cardId, handleActivateSimpleMagic(state, action.player, action.cardId));
    case 'EXECUTE_MAGIC':
      return maybeDeferForReaction(state, action, action.player, action.cardId, handleExecuteMagic(state, action));
    case 'REACT_TO_MAGIC':
      return handleReactToMagic(state, action.player, action.cardId);
    case 'RESOLVE_PENDING_REACTION':
      return handleResolvePendingReaction(state);
    case 'PLACE_MONSTER_CARD':
      return handlePlaceMonsterCard(state, action.player, action.cardId);
    case 'ACTIVATE_MONSTER_EFFECT_SIMPLE':
      return handleActivateMonsterEffectSimple(state, action.player, action.targetSlotIndex, action.targetCardId);
    case 'EXECUTE_MAGO_MONSTER_EFFECT':
      return handleExecuteMagoMonsterEffect(state, action.player, action.targetSlotIndex, action.targetCardId);
    case 'TRANSFORM_CORINGA_MAGIC_CARD':
      return handleTransformCoringaMagicCard(state, action.player, action.cardId);
    case 'ACTIVATE_NUMERAL_SPELL':
      return handleActivateNumeralSpell(state, action.player);
    case 'FINALIZE_NUMERAL_SPELL':
      return handleFinalizeNumeralSpell(state);
    case 'SELECT_COMBAT_SLOT':
      return handleSelectCombatSlot(state, action.player, action.slotIndex);
    case 'RESOLVE_COMBAT':
      return handleResolveCombat(state, action.coringaQCopyTargetId);
    case 'FINALIZE_COMBAT':
      return handleFinalizeCombat(state);
    case 'TOGGLE_READY':
      return handleToggleReady(state, action.player);
    case 'TOGGLE_PAUSE':
      return { ...state, paused: !state.paused };
    case 'REMATCH':
      return createInitialState(state.player1Character, state.player2Character, state.gameConfig);
    default:
      return state;
  }
}

/**
 * Calcula o valor de combate TOTAL de um slot (carta principal + horizontais
 * + reserva de torre) para UM jogador, aplicando os StatusEffect de
 * `kind: 'combatModifier'` já presentes em cada carta (overhaul de Status
 * Effects - ver statusEffects.ts) e registrando no log qualquer modificador
 * que de fato bateu numa carta presente no slot. Extraído daqui pra ser
 * chamado uma vez por jogador em `handleResolveCombat`, no lugar de ~25
 * linhas repetidas P1/P2 (a mesma lógica, uma cópia por jogador) que
 * existiam antes desta função - `resolveWholeField` (handleFinalizeCombat,
 * mais abaixo) já usava esse mesmo padrão de helper compartilhado, este
 * ponto era a exceção.
 *
 * Torre NUNCA recebe modificador (só o topo do slot ou uma horizontal - ver
 * design do Modo Towers) - por isso `slot.towerReserve` é somado por fora,
 * sem passar por `applyCombatModifierStatuses`.
 */
function slotCombatTotal(
  state: GameState,
  log: GameState['log'],
  player: PlayerNumber,
  slot: FieldSlot,
  horizontalCards: Card[],
  spotlight: GameState['spotlight']
): { total: number; log: GameState['log'] } {
  let nextLog = log;
  const allCards = [...(slot.faceDownCard ? [slot.faceDownCard] : []), ...horizontalCards];
  for (const card of allCards) {
    for (const modifier of getCombatModifierStatuses(card)) {
      const base = getSpotlightAdjustedValue(card, spotlight);
      const amount = modifier.magnitude ?? 0;
      // FIX (bug real exposto pela mudança de planos do Tiro Certeiro do
      // Mosqueteiro, "marcadores negativos nas cartas do campo do oponente"):
      // esta linha sempre disse "reforçou... em +{amount}", certo enquanto o
      // ÚNICO modificador 'add' fora Simbiose (sempre positivo) era o Tiro
      // Certeiro antigo (também sempre positivo) - com Urtiga do Druida
      // (já existia, sempre negativo) e agora Tiro Certeiro (negativo também)
      // usando o mesmo `mode: 'add'`, um `amount` negativo produzia "reforçou
      // ... em +-3" (sinal duplicado, verbo errado). Agora escolhe o verbo e o
      // sinal certos conforme o valor de verdade.
      nextLog =
        modifier.mode === 'multiply'
          ? appendLog(state, nextLog, 'monster', `${modifier.label} dobrou a carta ${card.value}${card.suit} de Jogador ${player} (${base} → ${base * amount})`, { player })
          : appendLog(
              state,
              nextLog,
              'magic',
              `${modifier.label} ${amount >= 0 ? 'reforçou' : 'enfraqueceu'} a carta ${card.value}${card.suit} de Jogador ${player} em ${amount >= 0 ? '+' : ''}${amount}`,
              { player }
            );
    }
  }
  const mainValue = slot.faceDownCard ? applyCombatModifierStatuses(getSpotlightAdjustedValue(slot.faceDownCard, spotlight), slot.faceDownCard) : 1;
  const horizontalValue = horizontalCards.reduce((sum, c) => sum + applyCombatModifierStatuses(getSpotlightAdjustedValue(c, spotlight), c), 0);
  // FIX (Modo Towers, pedido do usuário): a reserva da torre (cartas
  // empilhadas ABAIXO do topo) soma ao valor de combate do slot - o topo
  // (mainValue acima) já é contado normalmente, então isso nunca soma em
  // dobro.
  const towerValue = (slot.towerReserve ?? []).reduce((sum, c) => sum + getSpotlightAdjustedValue(c, spotlight), 0);
  return { total: mainValue + horizontalValue + towerValue, log: nextLog };
}

/**
 * Resolve o combate assim que os dois jogadores selecionaram um slot: revela
 * as cartas, calcula valores, aplica vitórias/disputa/vidas/fim-de-jogo
 * IMEDIATAMENTE (o placar já reflete o resultado assim que o popup aparece).
 * As cartas permanecem visíveis nos slots (reveladas) até FINALIZE_COMBAT ser
 * despachado pela UI, alguns segundos depois - só então elas são de fato
 * descartadas e os slots limpos, evitando a antiga janela onde uma carta
 * podia aparecer simultaneamente "em campo" e "no descarte".
 */
function handleResolveCombat(state: GameState, coringaQCopyTargetId?: string): GameState {
  const { player1: p1Slot0, player2: p2Slot0 } = state.combatSelection;
  if (p1Slot0 === undefined || p2Slot0 === undefined) return state;

  let p1Slot = state.player1.field[p1Slot0];
  let p2Slot = state.player2.field[p2Slot0];
  // FIX (item 10 da 2ª rodada): um slot sem carta principal não é mais
  // motivo para recusar a resolução - ele participa do combate valendo 1
  // (ver p1Base/p2Base abaixo), representando "nada posicionado aqui".

  const newP1Field = [...state.player1.field] as [FieldSlot, FieldSlot, FieldSlot];
  const newP2Field = [...state.player2.field] as [FieldSlot, FieldSlot, FieldSlot];

  // Coringa (redesenho completo) - armadilha revelada em COMBATE (não mais
  // na Estratégia, tratado à parte por resolveCoringaFieldTraps): Valete
  // vale 1, Monstro vale 15, Rainha copia o valor escolhido - ver
  // applyCoringaTrapCombatValue. `p1Slot`/`p2Slot` são reatribuídos aqui
  // (viram `let` só por causa disso) pra que TODO o resto da função (cálculo
  // de valor, montagem dos slots revelados) já enxergue o `transformedValue`
  // certo sem precisar duplicar a lógica. O Rei não precisa de nada aqui
  // (resolvido à parte, depois do resultado normal - ver mais abaixo).
  if (p1Slot.faceDownCard) {
    p1Slot = { ...p1Slot, faceDownCard: applyCoringaTrapCombatValue(state, 1, p1Slot.faceDownCard, state.player2.field, coringaQCopyTargetId) };
  }
  if (p2Slot.faceDownCard) {
    p2Slot = { ...p2Slot, faceDownCard: applyCoringaTrapCombatValue(state, 2, p2Slot.faceDownCard, state.player1.field, coringaQCopyTargetId) };
  }

  // FIX: um slot pode ter até 2 cartas horizontais empilhadas (Reforço
  // Angelical do Anjo) - todas as cartas horizontais do slot entram em
  // combate juntas, cada uma marcada como batalhada, e seus valores somam.
  //
  // FIX (pedido do usuário: "carta revelada no campo não deve revelar a
  // horizontal e o mesmo pro oposto... só ocorre quando a carta no campo é
  // revelada por um efeito de magia") - cada carta horizontal agora também
  // ganha `revealed: true` individualmente aqui, no momento real em que o
  // combate a revela de verdade. Antes só o SLOT ficava marcado como
  // revelado (linha abaixo) e a UI (FieldSlotView.tsx) usava esse mesmo
  // `slot.revealed` pra decidir se TODA carta horizontal do slot (mesmo uma
  // colocada DEPOIS, num turno seguinte, sem nunca ter sido revelada de
  // verdade) devia mostrar a face - o que vazava a revelação de uma magia
  // anterior (Substituição Arcana, Visão Celestial, Transformar Ás) pra
  // qualquer horizontal nova naquele slot. Agora cada carta controla sua
  // própria exibição via seu próprio `revealed` (ver FieldSlotView.tsx).
  const p1Horizontal = p1Slot.horizontalCards.map((c) =>
    applyCoringaTrapCombatValue(state, 1, { ...c, battled: true, revealed: true }, state.player2.field, coringaQCopyTargetId)
  );
  const p2Horizontal = p2Slot.horizontalCards.map((c) =>
    applyCoringaTrapCombatValue(state, 2, { ...c, battled: true, revealed: true }, state.player1.field, coringaQCopyTargetId)
  );
  newP1Field[p1Slot0] = {
    ...p1Slot,
    revealed: true,
    faceDownCard: p1Slot.faceDownCard ? { ...p1Slot.faceDownCard, revealed: true } : p1Slot.faceDownCard,
    horizontalCards: p1Horizontal,
  };
  newP2Field[p2Slot0] = {
    ...p2Slot,
    revealed: true,
    faceDownCard: p2Slot.faceDownCard ? { ...p2Slot.faceDownCard, revealed: true } : p2Slot.faceDownCard,
    horizontalCards: p2Horizontal,
  };

  let log = state.log;

  // Coringa (redesenho completo) - Rainha armadilha revelada em Combate: sem
  // isso, uma cópia decidida automaticamente pela IA (quando a dona da
  // Rainha é a IA - ver decideCoringaQCopyTarget/GameBoard.tsx) fica
  // completamente muda pro adversário humano, que só vê o valor final sem
  // entender de onde veio. `isCoringaRawTrapCard` continua `true` aqui
  // mesmo após `applyCoringaTrapCombatValue` já ter aplicado o
  // `transformedValue` (só marca `coringaTransformedToNumeral`, nunca
  // setado neste caminho) - por isso dá pra checar depois da reatribuição.
  if (p1Slot.faceDownCard && p1Slot.faceDownCard.value === 'Q' && isCoringaRawTrapCard(state, 1, p1Slot.faceDownCard)) {
    log = appendLog(state, log, 'magic', `A Rainha armadilha de Jogador 1 copiou o valor ${p1Slot.faceDownCard.transformedValue} nesta disputa`, { player: 1 });
  }
  if (p2Slot.faceDownCard && p2Slot.faceDownCard.value === 'Q' && isCoringaRawTrapCard(state, 2, p2Slot.faceDownCard)) {
    log = appendLog(state, log, 'magic', `A Rainha armadilha de Jogador 2 copiou o valor ${p2Slot.faceDownCard.transformedValue} nesta disputa`, { player: 2 });
  }

  // FIX (item 10 da 2ª rodada): campo vazio (jogador não posicionou carta
  // ali) vale 1 no combate, em vez de ser um caso impossível/recusado.
  // FIX (pedido do usuário, Modo Spotlight): `getSpotlightAdjustedValue` no
  // lugar de `getEffectiveCardValue` em toda esta função - já resolve o
  // valor efetivo normal quando não há Spotlight ativo (ver spotlight.ts).
  //
  // Fúria Selvagem da Besta e Tiro Certeiro do Mosqueteiro (StatusEffect
  // kind 'combatModifier', ver statusEffects.ts) são aplicados aqui via
  // `slotCombatTotal` (helper compartilhado logo abaixo, chamado uma vez por
  // jogador) em vez de lógica duplicada P1/P2 - o efeito já mora dentro da
  // carta certa, então não precisa checar `player1Character`/
  // `monsterCard?.monsterUsed` aqui: a presença do StatusEffect já significa
  // "ativado e ainda válido neste turno" (removido pelo tick em resetForNewTurn).
  const p1Result = slotCombatTotal(state, log, 1, p1Slot, p1Horizontal, state.spotlight);
  log = p1Result.log;
  const p1Total = p1Result.total;
  const p1TowerValue = (p1Slot.towerReserve ?? []).reduce((sum, c) => sum + getSpotlightAdjustedValue(c, state.spotlight), 0);

  const p2Result = slotCombatTotal(state, log, 2, p2Slot, p2Horizontal, state.spotlight);
  log = p2Result.log;
  const p2Total = p2Result.total;
  const p2TowerValue = (p2Slot.towerReserve ?? []).reduce((sum, c) => sum + getSpotlightAdjustedValue(c, state.spotlight), 0);

  const p1HorizontalText = p1Horizontal.length > 0 ? ` + ${p1Horizontal.map((c) => `${c.value}${c.suit}`).join(' + ')}` : '';
  const p2HorizontalText = p2Horizontal.length > 0 ? ` + ${p2Horizontal.map((c) => `${c.value}${c.suit}`).join(' + ')}` : '';
  const p1TowerText = (p1Slot.towerReserve ?? []).length > 0 ? ` + torre(${p1TowerValue})` : '';
  const p2TowerText = (p2Slot.towerReserve ?? []).length > 0 ? ` + torre(${p2TowerValue})` : '';
  const p1CardText = p1Slot.faceDownCard ? `${p1Slot.faceDownCard.value}${p1Slot.faceDownCard.suit}` : 'campo vazio (1)';
  const p2CardText = p2Slot.faceDownCard ? `${p2Slot.faceDownCard.value}${p2Slot.faceDownCard.suit}` : 'campo vazio (1)';
  log = appendLog(
    state,
    log,
    'combat',
    `Cartas reveladas: Jogador 1 (${p1CardText}${p1HorizontalText}${p1TowerText}) vs Jogador 2 (${p2CardText}${p2HorizontalText}${p2TowerText})`
  );

  let player1: PlayerState = { ...state.player1, field: newP1Field };
  let player2: PlayerState = { ...state.player2, field: newP2Field };
  let winner: PlayerNumber | 'tie';
  let disputeWinner: PlayerNumber | null = null;
  let gameOver: GameState['gameOver'] = null;

  // Coringa (redesenho completo) - Rei armadilha revelado em Combate: força
  // esta disputa a empate por completo, ANTES de comparar p1Total/p2Total -
  // o valor de qualquer um dos dois lados nunca importa quando o Rei está
  // envolvido (mesmo se ele "venceria" por valor, o resultado real é
  // sempre o empate forçado). A devolução da carta do oponente pra mão
  // (ou o "pop" do topo da torre) acontece em handleFinalizeCombat.
  const p1RawKing = p1Slot.faceDownCard && isCoringaRawTrapCard(state, 1, p1Slot.faceDownCard) && p1Slot.faceDownCard.value === 'K';
  const p2RawKing = p2Slot.faceDownCard && isCoringaRawTrapCard(state, 2, p2Slot.faceDownCard) && p2Slot.faceDownCard.value === 'K';
  let coringaKForcedTie: CombatResolution['coringaKForcedTie'];
  if (p1RawKing || p2RawKing) {
    const koPlayer: PlayerNumber = p1RawKing ? 1 : 2;
    winner = 'tie';
    coringaKForcedTie = { koPlayer };
    log = appendLog(
      state,
      log,
      'magic',
      `O Rei armadilha de Jogador ${koPlayer} explodiu em fumaça e nuvens - a disputa é um empate e a carta do oponente volta pra mão dele!`,
      { player: koPlayer }
    );
  } else if (p1Total > p2Total) {
    winner = 1;
    player1 = { ...player1, combatWins: state.player1.combatWins + 1 };
    log = appendLog(state, log, 'combat', `Jogador 1 vence o combate! (${p1Total} > ${p2Total})`, { player: 1 });

    if (player1.combatWins >= 2) {
      disputeWinner = 1;
      player2 = { ...player2, lives: state.player2.lives - 1, combatWins: 0 };
      player1 = { ...player1, combatWins: 0 };
      log = appendLog(state, log, 'combat', `Jogador 1 vence a DISPUTA! Jogador 2 perde 1 vida`, { player: 1 });
      if (player2.lives <= 0) gameOver = { winner: 1 };
    }
  } else if (p2Total > p1Total) {
    winner = 2;
    player2 = { ...player2, combatWins: state.player2.combatWins + 1 };
    log = appendLog(state, log, 'combat', `Jogador 2 vence o combate! (${p2Total} > ${p1Total})`, { player: 2 });

    if (player2.combatWins >= 2) {
      disputeWinner = 2;
      player1 = { ...player1, lives: state.player1.lives - 1, combatWins: 0 };
      player2 = { ...player2, combatWins: 0 };
      log = appendLog(state, log, 'combat', `Jogador 2 vence a DISPUTA! Jogador 1 perde 1 vida`, { player: 2 });
      if (player1.lives <= 0) gameOver = { winner: 2 };
    }
  } else {
    winner = 'tie';
    log = appendLog(state, log, 'combat', `Empate! (${p1Total} = ${p2Total})`);
  }

  return {
    ...state,
    player1,
    player2,
    log,
    combatSelection: {},
    // FIX (pedido do usuário - turno preso em empate/vitória não-decisiva):
    // conta este combate resolvido, não importa o resultado (vitória,
    // disputa fechada ou empate) - handleFinalizeCombat usa isso pra saber
    // se ainda restam pares de slot pra batalhar nesta fase.
    combatRoundsThisPhase: state.combatRoundsThisPhase + 1,
    gameOver,
    combatResolution: { p1SlotIndex: p1Slot0, p2SlotIndex: p2Slot0, winner, p1Value: p1Total, p2Value: p2Total, disputeWinner, coringaKForcedTie },
  };
}

/**
 * Segunda etapa da resolução de combate, despachada pela UI depois de exibir
 * o popup de resultado por alguns segundos.
 *
 * FIX (bug original mais grave do jogo): aqui é onde ficava a duplicação de
 * cartas. A versão anterior calculava "quais cartas descartar" em dois
 * lugares diferentes e depois um sobrescrevia parcialmente o outro, deixando
 * cartas simultaneamente em campo e na pilha de descarte quando alguém vencia
 * uma disputa com um terceiro slot ainda não batalhado. Agora existe uma
 * única fonte de verdade: se a disputa foi fechada, TODOS os slots de ambos
 * os jogadores são limpos e suas cartas descartadas; senão, só os dois slots
 * que batalharam são limpos. Nunca os dois ao mesmo tempo, nunca em duplicado.
 */
function handleFinalizeCombat(state: GameState): GameState {
  const resolution = state.combatResolution;
  if (!resolution) return state;
  const { p1SlotIndex, p2SlotIndex, disputeWinner } = resolution;

  let player1 = state.player1;
  let player2 = state.player2;
  let cardsToDiscard: Card[];
  let log = state.log;

  if (disputeWinner) {
    // FIX (itens 4 e 7 da 3ª rodada): quando a disputa fecha, TODO o campo de
    // ambos os jogadores é descartado (ver comentário original desta função).
    // FIX (pedido do usuário, rodada seguinte): a carta Monstro de cada zona
    // própria NÃO entra mais aqui incondicionalmente - ela só se descarta
    // depois do 3º uso (ver resolveMonsterCardAtTurnEnd). Como uma disputa
    // fechada sempre avança pro turno seguinte via advancePhaseState logo
    // abaixo (a menos que a partida tenha acabado agora), é ele quem decide
    // se a carta Monstro persiste ou descarta - aqui só o campo normal (os 3
    // slots de combate) é descartado.
    // FIX (pedido do usuário: "caso tenha uma disputa vencida ou empatada
    // contra uma carta avulsa, a torre deve permanecer no campo (caso ainda
    // tenha mais que um componente)") - fechar a disputa não é mais uma
    // exceção que apaga torres: o slot que BATALHOU segue a mesma regra de
    // erosão de resolveCombatSlot (só perde o topo, a menos que tenha
    // enfrentado outra torre), e uma torre parada num slot que NEM chegou a
    // batalhar permanece intacta (não disputou contra torre nenhuma, então
    // não há motivo pra ela se descartar). Todo o resto do campo continua
    // sendo descartado como antes.
    const p1FoughtSlot = player1.field[p1SlotIndex];
    const p2FoughtSlot = player2.field[p2SlotIndex];
    const towerVsTower = isTowerSlot(p1FoughtSlot) && isTowerSlot(p2FoughtSlot);

    const resolveWholeField = (
      field: [FieldSlot, FieldSlot, FieldSlot],
      foughtIndex: number,
      owner: PlayerNumber
    ): { newField: [FieldSlot, FieldSlot, FieldSlot]; discarded: Card[] } => {
      const discarded: Card[] = [];
      const newField = field.map((slot, i) => {
        if (i === foughtIndex) {
          // FIX (pedido do usuário: "mantenha o broto presente no campo
          // mesmo se ganhar uma disputa, a ideia é o broto só sair se ele
          // for derrotado em uma disputa") - o resto do campo (normal ou
          // Torre) sempre é descartado quando a disputa FECHA, não importa
          // quem venceu cada rodada - mas o Broto quebra essa regra: só
          // colapsa se ELE PRÓPRIO perdeu a rodada que fechou a disputa
          // (`resolution.winner` é o vencedor desta rodada específica,
          // 'tie' inclusa - só sobrevive com uma vitória clara do dono).
          if (isBrotoSlot(slot) && resolution.winner === owner) return slot;
          const result = resolveCombatSlot(slot, isTowerSlot(slot) && !towerVsTower);
          discarded.push(...result.discarded);
          return result.newSlot;
        }
        // Druida: um Broto que NÃO batalhou nesta disputa (ela fechou por
        // outro par de slots) permanece intacto, mesmo motivo de uma torre
        // parada - "é removida apenas se for combatida" (ver spec do
        // personagem); só o slot que de fato lutou passa por resolveCombatSlot.
        if (isTowerSlot(slot) || isBrotoSlot(slot)) return slot;
        discarded.push(...[slot.faceDownCard, ...slot.horizontalCards].filter((c): c is Card => Boolean(c)));
        return { revealed: false, horizontalCards: [] } as FieldSlot;
      }) as [FieldSlot, FieldSlot, FieldSlot];
      return { newField, discarded };
    };

    const p1FieldResult = resolveWholeField(player1.field, p1SlotIndex, 1);
    const p2FieldResult = resolveWholeField(player2.field, p2SlotIndex, 2);
    cardsToDiscard = [...p1FieldResult.discarded, ...p2FieldResult.discarded];
    player1 = { ...player1, field: p1FieldResult.newField };
    player2 = { ...player2, field: p2FieldResult.newField };
  } else {
    const p1Slot = player1.field[p1SlotIndex];
    const p2Slot = player2.field[p2SlotIndex];

    // Modo Towers: uma torre só perde a carta do topo por combate; só vai
    // inteira pro descarte se batalhou contra OUTRA torre (ou se já estava
    // na última carta). Ver resolveCombatSlot para a regra completa.
    const towerVsTower = isTowerSlot(p1Slot) && isTowerSlot(p2Slot);
    const isP1LoneTower = isTowerSlot(p1Slot) && !towerVsTower;
    const isP2LoneTower = isTowerSlot(p2Slot) && !towerVsTower;
    // FIX (pedido do usuário: "mantenha o broto presente no campo mesmo se
    // ganhar uma disputa, a ideia é o broto só sair se ele for derrotado em
    // uma disputa") - mesma regra da disputa FECHANDO (ver resolveWholeField
    // acima), agora pro caminho bem mais comum: uma rodada de combate que
    // NÃO fecha a disputa (a maioria - só fecha a cada 2 vitórias). Sem esta
    // checagem, `resolveSlot` colapsava o Broto (nunca é Torre, então nunca
    // "eroda" - vai sempre pro branch de colapso total) mesmo numa vitória.
    const resolveSlot = (slot: FieldSlot, owner: PlayerNumber, erodeOnly: boolean) =>
      isBrotoSlot(slot) && resolution.winner === owner ? { newSlot: slot, discarded: [] } : resolveCombatSlot(slot, erodeOnly);

    // Coringa (redesenho completo) - Rei armadilha: a carta do OPONENTE
    // (nunca a do próprio Coringa, que explode/descarta normalmente via
    // resolveSlot acima) volta pra MÃO dele em vez de ir pro descarte - "a
    // qualquer momento" (não importa quem venceria por valor, já forçado a
    // empate em handleResolveCombat). No modo Towers contra uma torre, só o
    // TOPO volta pra mão (resposta do usuário confirmada) - o resto da
    // reserva permanece no campo, promovendo a próxima carta a novo topo,
    // mesmo padrão de "pop" já usado pela torre solitária acima.
    const koForcedTie = resolution.coringaKForcedTie;
    const opponentOfKo = koForcedTie ? opponentOf(koForcedTie.koPlayer) : undefined;
    const resolveSlotToHand = (slot: FieldSlot): { newSlot: FieldSlot; returnedToHand: Card[] } => {
      const reserve = slot.towerReserve ?? [];
      // Druida: se o alvo for um Broto (nunca tem towerReserve, então cai
      // sempre no branch de baixo), a reserva dele também precisa voltar pra
      // mão junto - senão essas cartas ficariam órfãs (nem em campo, nem na
      // mão, nem no descarte).
      const returnedToHand = [slot.faceDownCard, ...(slot.brotoReserve ?? []), ...slot.horizontalCards].filter((c): c is Card => Boolean(c));
      if (reserve.length === 0) {
        return { newSlot: { revealed: false, horizontalCards: [] }, returnedToHand };
      }
      const newTop = reserve[reserve.length - 1];
      const newReserve = reserve.slice(0, -1);
      return {
        // Mesmo `towerReserve: newReserve` direto de resolveCombatSlot acima
        // (nunca `undefined` ao esvaziar) - preserva o sinal de
        // wasEverTowerSlot mesmo neste caminho irmão (Rei armadilha do Coringa).
        newSlot: { faceDownCard: newTop, towerReserve: newReserve, revealed: true, horizontalCards: [] },
        returnedToHand,
      };
    };

    let p1ReturnedToHand: Card[] = [];
    let p2ReturnedToHand: Card[] = [];
    let p1Result: { newSlot: FieldSlot; discarded: Card[] };
    let p2Result: { newSlot: FieldSlot; discarded: Card[] };

    if (opponentOfKo === 1) {
      const toHand = resolveSlotToHand(p1Slot);
      p1Result = { newSlot: toHand.newSlot, discarded: [] };
      p1ReturnedToHand = toHand.returnedToHand;
      p2Result = resolveSlot(p2Slot, 2, isP2LoneTower);
    } else if (opponentOfKo === 2) {
      const toHand = resolveSlotToHand(p2Slot);
      p2Result = { newSlot: toHand.newSlot, discarded: [] };
      p2ReturnedToHand = toHand.returnedToHand;
      p1Result = resolveSlot(p1Slot, 1, isP1LoneTower);
    } else {
      p1Result = resolveSlot(p1Slot, 1, isP1LoneTower);
      p2Result = resolveSlot(p2Slot, 2, isP2LoneTower);
    }
    cardsToDiscard = [...p1Result.discarded, ...p2Result.discarded];

    const newP1Field = [...player1.field] as [FieldSlot, FieldSlot, FieldSlot];
    const newP2Field = [...player2.field] as [FieldSlot, FieldSlot, FieldSlot];
    newP1Field[p1SlotIndex] = p1Result.newSlot;
    newP2Field[p2SlotIndex] = p2Result.newSlot;
    player1 = {
      ...player1,
      field: newP1Field,
      hand: p1ReturnedToHand.length > 0 ? [...player1.hand, ...p1ReturnedToHand.map((c) => ({ ...c, revealed: false }))] : player1.hand,
    };
    player2 = {
      ...player2,
      field: newP2Field,
      hand: p2ReturnedToHand.length > 0 ? [...player2.hand, ...p2ReturnedToHand.map((c) => ({ ...c, revealed: false }))] : player2.hand,
    };
    if (p1ReturnedToHand.length > 0 || p2ReturnedToHand.length > 0) {
      log = appendLog(state, log, 'combat', `A carta atingida pelo Rei armadilha voltou pra mão do dono, ainda oculta`);
    }
  }

  const { deck, discardPile } = pushToDiscard(state, cardsToDiscard);

  let nextState: GameState = {
    ...state,
    player1,
    player2,
    deck,
    discardPile,
    log,
    combatResolution: null,
  };

  // Uma disputa fechada avança o jogo direto para o próximo turno (a menos
  // que a partida tenha acabado agora); uma resolução de combate "normal"
  // (vitória que não fecha a disputa, ou empate) limpa os dois slots e
  // aguarda os jogadores continuarem (outra seleção de combate, ou ambos
  // marcarem "Pronto") - A NÃO SER que não sobre nenhum par de slot pra
  // batalhar.
  //
  // FIX (pedido do usuário: "turnos aparentemente só acabam caso um jogador
  // vença um combate, ao invés de acabar... quando ocorre um empate") - só
  // existem 3 pares de slot possíveis por fase de Combate; antes, se os 3
  // resolvessem sem ninguém fechar uma disputa (ex.: um empate, ou um
  // placar 1-1 que nunca chega a 2), a fase ficava "presa" esperando os dois
  // jogadores clicarem "Pronto" manualmente, mesmo sem mais nada pra
  // batalhar. Agora, ao atingir o 3º combate resolvido nesta fase
  // (`combatRoundsThisPhase >= 3`), o turno avança automaticamente também
  // nesses casos.
  if (!nextState.gameOver && (disputeWinner || nextState.combatRoundsThisPhase >= 3)) {
    nextState = advancePhaseState(nextState);
  }

  return nextState;
}
