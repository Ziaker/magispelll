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
import { handleFinalizeCombat, handleResolveCombat, handleSelectCombatSlot } from './combatHandlers';
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
