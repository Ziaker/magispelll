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
import { handleReturnCardToHand, handleReturnHorizontalCardToHand, handleSwapFieldCard } from './strategyFieldHandlers';
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

function handlePlayCard(state: GameState, player: PlayerNumber, cardId: string, slotIndex: number, asHorizontal: boolean): GameState {
  const playerKey = playerKeyOf(player);
  const playerState = state[playerKey];
  const card = playerState.hand.find((c) => c.id === cardId);
  if (!card) return state;
  const character = characterOf(state, player);
  // Glacial (personagem novo) - o Criogolem também nunca usa a Zona Monstro
  // (ver handlePlaceMonsterCard) - mesmo padrão do Monstro-15 do Coringa e
  // do Broto Espelhado do Druida. Calculado aqui em cima (antes só existia
  // mais abaixo) porque o guard de fase logo a seguir também depende dele.
  const isGlacialMonsterCard = character === 'glacial' && Boolean(card.isMonster);
  // FIX (pedido do usuário: "o monstro do glacial só pode ser posicionado
  // da mão para o campo na fase de combate quando ele tiver um campo
  // livre, a ideia é ser uma surpresa") - o Criogolem agora é a ÚNICA
  // carta jogável FORA da Estratégia: só pode ser posicionado durante o
  // COMBATE (nunca mais na Estratégia, onde denunciaria de antemão qual
  // slot esconde uma carta extra antes mesmo do oponente escolher os
  // confrontos daquela rodada - "a ideia é ser uma surpresa"). Qualquer
  // outra carta (de qualquer personagem) continua exigindo a Estratégia
  // como sempre. `decideGlacialMonster`/`decideCombatPhase` (aiPlayer.ts)
  // espelham esta mesma regra pra IA.
  if (isGlacialMonsterCard) {
    if (state.phase !== 'combat') return state;
  } else if (state.phase !== 'strategy') {
    return state;
  }

  if (isFrozenPlayBlocked(character, card)) {
    return { ...state, log: appendLog(state, state.log, 'warning', `Esta carta está congelada e não pode ser jogada!`) };
  }

  // FIX (pedido do usuário: "as correntes do anjo também devem proibir a
  // utilização/posicionamento da carta monstro do oponente") - Visão
  // Celestial agora também tranca (StatusEffect 'magicLocked') a carta
  // Monstro do oponente quando é ELA a revelada (ver o branch 'anjo'+'Q'
  // mais abaixo, mesmo padrão já usado pra J/Q/K). Coringa/Druida/Glacial
  // jogam a própria carta Monstro como substituto de numeral direto por
  // PLAY_CARD (nunca por PLACE_MONSTER_CARD - ver isCoringaTrapCard/
  // isDruidaMonsterCard/isGlacialMonsterCard mais abaixo), então o guard
  // certo pra eles é aqui; os outros 5 personagens usam a Zona Monstro
  // (handlePlaceMonsterCard, guard irmão deste logo abaixo no arquivo).
  if (card.isMonster && hasStatus(card, 'magicLocked')) {
    return { ...state, log: appendLog(state, state.log, 'warning', `Esta carta Monstro está trancada pela Visão Celestial e não pode ser jogada!`) };
  }

  // Coringa (redesenho completo, pedido do usuário): diferente de todos os
  // outros personagens, suas cartas de magia (J/Q/K) e Monstro NÃO ativam
  // efeito nenhum "na mão" - elas são POSICIONADAS no campo como armadilhas,
  // cada uma numa posição fixa (Valete só horizontal, Rainha/Rei só
  // principal, Monstro em qualquer uma - ver comentário completo em
  // isCoringaTrapCard/coringaFieldPlacementSlotKind, cardUtils.ts) e só
  // revelam seu efeito de verdade quando reveladas de fato (na Estratégia
  // por um efeito do oponente, ou no Combate ao serem selecionadas - ver
  // triggerCoringaStrategyRevealTrap/handleResolveCombat).
  // FIX (pedido do usuário: "o valete transformado do coringa não está
  // podendo ser posicionado") - faltava excluir cartas já transformadas pela
  // Magia Numeral "Mão de Ferro" (`coringaTransformedToNumeral`) daqui. Uma
  // vez transformada, a carta LARGA o comportamento de armadilha por
  // completo (ver comentário no topo desta seção) e passa a valer como uma
  // carta numeral comum (11/12/13) - devia poder ser posicionada como
  // QUALQUER carta numeral normal (principal OU horizontal, sem a restrição
  // de posição fixa da armadilha crua). Sem esta exclusão, `isCoringaTrapCard`
  // continuava `true` só por causa do `card.value` ainda ser 'J'/'Q'/'K'
  // (a transformação nunca muda `.value`, só adiciona `.transformedValue` -
  // mesmo padrão do Ás transformado), então a carta já transformada
  // continuava presa às regras de posição fixa da armadilha (Valete só
  // horizontal, Rainha/Rei só principal) - rejeitada ao tentar posicionar do
  // jeito "normal" que um número transformado deveria aceitar.
  const isCoringaTransformedCard = character === 'coringa' && card.coringaTransformedToNumeral;
  const isCoringaTrapCard = character === 'coringa' && !isCoringaTransformedCard && (card.value === 'J' || card.value === 'Q' || card.value === 'K' || card.isMonster);
  // Druida (personagem novo) - o Broto (Valete) nunca "ativa" como as outras
  // magias: é POSICIONADO no campo (plantado ou empilhado sobre um Broto já
  // existente - ver mais abaixo), igual à Rainha/Rei do Coringa serem
  // posicionadas em vez de ativadas. O Monstro dele também nunca usa a Zona
  // Monstro (ver handlePlaceMonsterCard) - é jogado como carta numeral comum,
  // valendo o valor atual do Broto - mesmo padrão do Monstro-15 do Coringa.
  //
  // FIX (pedido do usuário: "faça o druida ser capaz de plantar brotos com
  // as outras magias também... permitindo que o Q, K e J sejam posicionados
  // encima de um Q, K ou J também no campo") - Rainha (Simbiose) e Rei
  // (Urtiga) agora TAMBÉM podem ser plantados/empilhados como o Broto,
  // funcionando exatamente como o Valete pra esse fim - uma segunda forma de
  // usar a mesma carta física, independente de EXECUTE_MAGIC (Simbiose/
  // Urtiga continuam existindo normalmente como magias de verdade; o
  // jogador escolhe, pra cada carta em mãos, qual das duas ações tomar com
  // ela).
  const isDruidaBrotoCard = character === 'druida' && (card.value === 'J' || card.value === 'Q' || card.value === 'K');
  const isDruidaMonsterCard = character === 'druida' && Boolean(card.isMonster);
  // isGlacialMonsterCard já foi calculado no topo da função (o guard de fase
  // depende dele antes de chegarmos aqui).
  if (!isCoringaTrapCard && !isDruidaBrotoCard && !isDruidaMonsterCard && !isGlacialMonsterCard) {
    // FIX: Cartas mágicas (J, Q, K) de qualquer OUTRO personagem nunca podem
    // ser posicionadas no campo como carta comum - elas só saem da mão
    // ativando seu efeito de magia. Não se aplica a uma carta do Coringa já
    // transformada (`isCoringaTransformedCard`) - mesmo com `.value` ainda
    // 'J'/'Q'/'K', ela já é uma carta numeral de verdade agora.
    if (!isCoringaTransformedCard && (card.value === 'J' || card.value === 'Q' || card.value === 'K')) {
      return { ...state, log: appendLog(state, state.log, 'warning', `Cartas mágicas só podem ser usadas ativando sua magia, não posicionadas no campo!`) };
    }

    // FIX (itens 4 e 7 da 3ª rodada): cartas Monstro de qualquer OUTRO
    // personagem não podem ocupar um dos 3 slots de combate como se fossem
    // uma carta comum - esse era exatamente o bug do item 4 (a IA, e a
    // interface em geral, tratava o Monstro como uma carta Normal/Ás,
    // lutando em combate com valor 0). Elas só podem ir para sua zona
    // própria (ver PLACE_MONSTER_CARD).
    if (card.isMonster) {
      return { ...state, log: appendLog(state, state.log, 'warning', `Cartas Monstro só podem ser posicionadas na sua zona própria, não em um slot de combate!`) };
    }

    // FIX (pedido do usuário: "o Ás está podendo ser posicionado como carta
    // no campo/horizontal, corrija isso, não permita, em TODOS modos de
    // jogo") - um Ás CRU (sem `transformedValue`) nunca pode ser posicionado,
    // nem como principal nem como horizontal - precisa ser transformado
    // primeiro (TRANSFORM_ACE, ainda na mão - ver handleTransformAce) pra
    // virar uma carta numeral de verdade. Reverte o mecanismo antigo ("Ás cru
    // vale 14 e pode ser jogado direto"; ver isFieldEligible, cardUtils.ts,
    // pra mesma regra usada pela IA/UI).
    if (card.value === 'A' && card.transformedValue === undefined) {
      return { ...state, log: appendLog(state, state.log, 'warning', `Um Ás precisa ser transformado (arraste sobre outra carta) antes de ser posicionado!`) };
    }
  } else if (isCoringaTrapCard) {
    // Valete: SÓ pode ir como horizontal ("Esta carta pode ser posicionada
    // como horizontal em uma carta sua"). Rainha/Rei: SÓ como carta
    // principal ("posicionada como uma carta normal"/"virada no seu
    // campo"). Monstro (tratado como um "15"): qualquer uma das duas,
    // igual a uma carta numeral comum.
    if (card.value === 'J' && !asHorizontal) {
      return { ...state, log: appendLog(state, state.log, 'warning', `O Valete do Palhaço só pode ser posicionado como carta horizontal!`) };
    }
    if ((card.value === 'Q' || card.value === 'K') && asHorizontal) {
      return { ...state, log: appendLog(state, state.log, 'warning', `Esta carta do Palhaço só pode ser posicionada como carta principal, não horizontal!`) };
    }
  } else if (isDruidaBrotoCard) {
    // "Não pode receber horizontais" também vale pra ele MESMO ser
    // posicionado como horizontal - o Broto só existe como carta principal
    // de um slot (plantado ou empilhado - ver mais abaixo).
    if (asHorizontal) {
      return { ...state, log: appendLog(state, state.log, 'warning', `O Broto do Druida só pode ser plantado como carta principal, não horizontal!`) };
    }
  } else if (isDruidaMonsterCard) {
    // "Pode ser jogada no campo como uma carta numeral" (sem restrição de
    // posição, igual ao Monstro-15 do Coringa) - mas só com um Broto ativo
    // em algum slot do próprio campo (decisão confirmada com o usuário: sem
    // Broto, a carta fica bloqueada na mão).
    if (!playerState.field.some(isBrotoSlot)) {
      return { ...state, log: appendLog(state, state.log, 'warning', `O Monstro do Druida só pode ser jogado com um Broto ativo no campo!`) };
    }
  }

  const newHand = playerState.hand.filter((c) => c.id !== cardId);
  const newField = [...playerState.field] as [FieldSlot, FieldSlot, FieldSlot];
  let log = state.log;

  if (asHorizontal) {
    if (!newField[slotIndex].faceDownCard) {
      return { ...state, log: appendLog(state, log, 'warning', `Não é possível posicionar carta horizontal sem carta no campo!`) };
    }
    // FIX (Modo Towers, pedido do usuário: "sem carta horizontal em cima de
    // torre") - uma torre nunca recebe reforço horizontal.
    if (isTowerSlot(newField[slotIndex])) {
      return { ...state, log: appendLog(state, log, 'warning', `Não é possível posicionar carta horizontal sobre uma torre!`) };
    }
    // Druida (personagem novo, "não pode receber horizontais"): mesma regra
    // acima, aplicada ao Broto.
    if (isBrotoSlot(newField[slotIndex])) {
      return { ...state, log: appendLog(state, log, 'warning', `Não é possível posicionar carta horizontal sobre o Broto!`) };
    }
    // FIX (item 1, revisado): o limite de cartas horizontais é por TURNO
    // (contando o campo inteiro do jogador), não por slot - "Reforço
    // Angelical" do Rei do Anjo é descrito como "permite empilhar uma carta
    // horizontal EXTRA NESTE TURNO", ou seja, sem a magia o jogador só pode
    // posicionar UMA carta horizontal no turno inteiro (em qualquer slot que
    // escolher). Uma correção anterior somava a carta ao array em vez de
    // sobrescrever (o que já estava certo), mas checava o limite só dentro do
    // slot alvo - isso deixava um jogador colocar 1 carta horizontal em CADA
    // um dos 3 slots do próprio campo no mesmo turno (3 no total) sem nenhuma
    // magia, o que é exatamente o bug relatado: cartas horizontais sendo
    // colocadas mais de uma vez por turno mesmo fora do caso de magia que
    // permita. Agora o total já colocado em TODO o campo do jogador é que é
    // comparado ao limite.
    //
    // FIX (pedido do usuário, rodada seguinte): `horizontalStackBonus` agora
    // é cumulativo (cada ativação do Rei do Anjo soma +1, sem teto) - ver
    // comentário completo em PlayerState.
    //
    // FIX (pedido do usuário: "é pra vc conseguir colocar um valete mesmo
    // já tendo colocado um horizontal" - o comportamento ORIGINALMENTE
    // pedido, que eu tinha entendido ao contrário): o Valete armadilha CRU
    // do Coringa (`isCoringaTrapCard`) NÃO é um reforço horizontal de
    // verdade - é um disfarce (a carta só vale 1 fixo em combate, ver
    // applyCoringaTrapCombatValue, nunca soma ao total do slot como um
    // reforço de qualquer outro personagem soma) - por isso ele fica de
    // fora deste limite por completo, tanto na CONTAGEM (um Valete já
    // posicionado não consome a cota de reforço "de verdade" de outra
    // carta) quanto na CHECAGEM (posicionar outro Valete nunca esbarra
    // nela, não importa quantos horizontais - de qualquer tipo - o jogador
    // já tenha). Uma carta já TRANSFORMADA em numeral pela Mão de Ferro
    // (`isCoringaTrapCard` já é `false` pra ela, ver início da função) volta
    // a valer como reforço de verdade e ENTRA nesta conta normalmente.
    const maxHorizontal = 1 + playerState.horizontalStackBonus;
    const horizontalPlacedThisTurn = newField.reduce(
      (n, s) => n + s.horizontalCards.filter((c) => !isCoringaRawTrapCard(state, player, c)).length,
      0
    );
    if (!isCoringaTrapCard && horizontalPlacedThisTurn >= maxHorizontal) {
      return { ...state, log: appendLog(state, log, 'warning', `Limite de cartas horizontais deste turno já foi atingido!`) };
    }
    // FIX: cartas já reveladas (por alguma magia, ou um Ás transformado -
    // que fica sempre revelado) podiam ser posicionadas como carta principal
    // mas eram rejeitadas ao tentar posicionar como horizontal, sem motivo -
    // agora elas são aceitas normalmente e continuam mostrando a face para
    // cima (ver BattleField.tsx, que respeita o `revealed` de cada carta
    // individualmente, não só o do slot).
    newField[slotIndex] = { ...newField[slotIndex], horizontalCards: [...newField[slotIndex].horizontalCards, { ...card, placedOnTurn: state.turn }] };
    log = appendLog(state, log, 'field', `Jogador ${player} posicionou uma carta ${card.revealed ? 'revelada ' : ''}horizontal no slot ${slotIndex + 1}`, { player });
  } else if (isDruidaBrotoCard) {
    // Druida - plantar (sem Broto ativo em nenhum slot do próprio campo
    // ainda) ou empilhar (já existe um Broto - "só 1 por vez", decisão
    // confirmada: plantar de novo SEMPRE empilha no já existente, nunca cria
    // um segundo Broto independente em outro slot).
    const existingBrotoIndex = playerState.field.findIndex(isBrotoSlot);
    if (existingBrotoIndex !== -1) {
      if (slotIndex !== existingBrotoIndex) {
        return { ...state, log: appendLog(state, log, 'warning', `Já existe um Broto plantado - a próxima carta precisa empilhar no mesmo slot!`) };
      }
      const brotoSlot = newField[slotIndex];
      const oldTop = brotoSlot.faceDownCard!;
      const newValue = (oldTop.transformedValue ?? 1) + 1;
      newField[slotIndex] = {
        ...brotoSlot,
        faceDownCard: { ...card, revealed: true, transformedValue: newValue, placedOnTurn: state.turn },
        brotoReserve: [...(brotoSlot.brotoReserve ?? []), { ...oldTop, revealed: true }],
        revealed: true,
      };
      log = appendLog(state, log, 'field', `Jogador ${player} empilhou o Broto no slot ${slotIndex + 1} (agora vale ${newValue})`, { player, slotIndex });
    } else {
      if (newField[slotIndex].faceDownCard) return state;
      newField[slotIndex] = {
        ...newField[slotIndex],
        faceDownCard: { ...card, revealed: true, transformedValue: 1, placedOnTurn: state.turn },
        brotoReserve: [],
        revealed: true,
      };
      log = appendLog(state, log, 'field', `Jogador ${player} plantou um Broto no slot ${slotIndex + 1}`, { player, slotIndex });
    }
  } else if (isDruidaMonsterCard) {
    // Druida - Monstro travado no valor ATUAL do Broto no instante em que é
    // jogado (snapshot, decisão confirmada - não sincroniza depois se o
    // Broto continuar crescendo). `playerState.field.some(isBrotoSlot)` já
    // foi validado acima (guard de posicionamento), então sempre existe um
    // Broto aqui.
    if (newField[slotIndex].faceDownCard) return state;
    const brotoTop = playerState.field.find(isBrotoSlot)?.faceDownCard;
    const brotoValue = brotoTop?.transformedValue ?? 1;
    newField[slotIndex] = {
      ...newField[slotIndex],
      faceDownCard: { ...card, revealed: true, transformedValue: brotoValue, placedOnTurn: state.turn },
      revealed: true,
    };
    log = appendLog(state, log, 'monster', `Jogador ${player} posicionou o Monstro no slot ${slotIndex + 1} (valendo ${brotoValue}, como o Broto)`, { player, cardValue: '🃏' });
  } else if (isGlacialMonsterCard) {
    // Glacial - Criogolem travado (snapshot) no valor 8 + 1 por carta
    // congelada em jogo NESTE instante (mão e campo dos DOIS jogadores) -
    // não recalcula depois se mais cartas forem congeladas/descongeladas.
    if (newField[slotIndex].faceDownCard) return state;
    const golemValue = getGlacialGolemValue(state);
    // FIX (feature nova, pedido do usuário: "ao ser jogado congelado, ele
    // adiciona um marcador -2 para as cartas do oponente em campo") - lido
    // ANTES de sobrescrever `newField[slotIndex]` abaixo (que preserva os
    // statusEffects da carta original, incluindo 'frozen' - jogar uma carta
    // congelada nunca "descongela" ela sozinho, ver isFrozenPlayBlocked
    // acima). Só é alcançável de verdade se o próprio Criogolem foi
    // congelado (por Criogenar, de qualquer um dos dois jogadores) enquanto
    // ainda estava na mão - a exceção de handlePlayCard que permite ao
    // Glacial jogar sua própria carta congelada é o que torna isto possível.
    const wasFrozen = hasStatus(card, 'frozen');
    newField[slotIndex] = {
      ...newField[slotIndex],
      faceDownCard: { ...card, revealed: true, transformedValue: golemValue, placedOnTurn: state.turn },
      revealed: true,
    };
    // FIX (pedido do usuário: "efeitos... para o golem") - `slotIndex` no
    // metadata do log (mesmo padrão do Broto do Druida, gameEngine.ts acima)
    // é o que permite GameBoard.tsx disparar o burst visual no slot exato
    // onde o Criogolem caiu - sem isso, `entry.slotIndex` chegaria sempre
    // `undefined` e o burst nunca dispararia (só o som).
    log = appendLog(state, log, 'monster', `Jogador ${player} posicionou o Criogolem no slot ${slotIndex + 1} (valendo ${golemValue})`, { player, cardValue: '🃏', slotIndex });

    if (wasFrozen) {
      // "As cartas do oponente em campo" - carta principal E horizontais de
      // TODO o campo do oponente, de uma vez, sem seleção de alvo (mesmo
      // padrão de alcance total do efeito de Combate do Crioescudo, ver
      // applyCrioescudoMarker acima) - exceto slots protegidos pela Proteção
      // Divina do Anjo (`isSlotProtected`), mesma exceção de toda magia que
      // mira o campo do oponente (Crioespinho, Urtiga, Tiro Certeiro).
      const opponentKey = opponentKeyOf(player);
      const opponent = opponentOf(player);
      const opponentState = state[opponentKey];
      const newOpponentField = opponentState.field.map((slot, i) => {
        if (isSlotProtected(state, opponent, i)) return slot;
        return {
          ...slot,
          faceDownCard: slot.faceDownCard
            ? applyTimedCombatModifier(
                slot.faceDownCard,
                { kind: 'combatModifier', source: 'glacial', label: 'Criogolem Congelado', mode: 'add', magnitude: -2, duration: { type: 'untilPhase', phase: 'draw' } },
                { turn: state.turn, phase: state.phase },
                (existing, incoming) => ({ ...incoming, magnitude: (existing.magnitude ?? 0) + (incoming.magnitude ?? 0) }),
                { isOwnBuff: false } // Sempre mira o campo do OPONENTE (debuff -2, nunca bloqueado por congelamento mesmo assim).
              )
            : slot.faceDownCard,
          horizontalCards: slot.horizontalCards.map((c) =>
            applyTimedCombatModifier(
              c,
              { kind: 'combatModifier', source: 'glacial', label: 'Criogolem Congelado', mode: 'add', magnitude: -2, duration: { type: 'untilPhase', phase: 'draw' } },
              { turn: state.turn, phase: state.phase },
              (existing, incoming) => ({ ...incoming, magnitude: (existing.magnitude ?? 0) + (incoming.magnitude ?? 0) }),
              { isOwnBuff: false }
            )
          ),
        };
      }) as [FieldSlot, FieldSlot, FieldSlot];
      log = appendLog(
        state,
        log,
        'monster',
        `O Criogolem chegou congelado: -2 de marcador em toda carta de Jogador ${opponent} no campo`,
        { player }
      );
      return {
        ...state,
        log,
        [playerKey]: { ...playerState, hand: newHand, field: newField },
        [opponentKey]: { ...opponentState, field: newOpponentField },
      };
    }
  } else {
    if (newField[slotIndex].faceDownCard) return state;

    const shouldReveal = card.transformedValue !== undefined || card.revealed === true;
    newField[slotIndex] = {
      ...newField[slotIndex],
      faceDownCard: { ...(shouldReveal ? revealCard(card) : card), placedOnTurn: state.turn },
      revealed: shouldReveal,
    };
    log = appendLog(state, log, 'field', `Jogador ${player} posicionou uma carta ${shouldReveal ? 'revelada ' : ''}no slot ${slotIndex + 1}`, { player });
  }

  return { ...state, log, [playerKey]: { ...playerState, hand: newHand, field: newField } };
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
