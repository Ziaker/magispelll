/**
 * coringaTrapHandlers.ts - reações automáticas das armadilhas do Coringa.
 *
 * Concentra reação ao ser alvejada/revelada e o escudo do Valete.
 * Não depende do reducer nem importa gameEngine.ts.
 */
import { drawCards, reshuffleDiscardIntoDeck, resetCardForDiscard, shuffle, type Card } from './cardUtils';
import { ensureDeckHasCards, pushToDiscard } from './deckLifecycle';
import { appendLog } from './gameLog';
import { characterOf, playerKeyOf } from './gameSelectors';
import { isCoringaRawTrapCard } from './coringaRules';
import { applyTimedCombatModifier } from './statusEffects';
import type { FieldSlot, GameState } from './gameStateTypes';
import type { PlayerNumber } from './gameTypes';
/**
 * Reação de UMA carta-armadilha do Coringa ao ser revelada por um efeito do
 * OPONENTE durante a fase de ESTRATÉGIA (nunca chamado pra revelação normal
 * de combate, nem pra revelação causada pelo próprio Coringa):
 *   - Valete: descarta a carta (fumaça + riso) e o Coringa compra 1 carta.
 *   - Rainha/Monstro: volta pra mão do Coringa OCULTA, embaralhando a mão
 *     inteira (impede o oponente de rastrear qual carta da mão é aquela).
 *   - Rei: destrói a carta (descarte) e o Coringa compra um Ás específico
 *     (reembaralha o descarte de volta se precisar, mesma busca já usada
 *     pela Benção Divina do Anjo).
 */
export function applyCoringaTrapReaction(
  state: GameState,
  owner: PlayerNumber,
  slotIndex: number,
  kind: 'main' | 'horizontal',
  card: Card
): GameState {
  const ownerKey = playerKeyOf(owner);
  const ownerState = state[ownerKey];
  const slot = ownerState.field[slotIndex];
  const newField = [...ownerState.field] as [FieldSlot, FieldSlot, FieldSlot];

  // FIX (bug real encontrado por simulação IA vs IA - conservação de cartas):
  // uma carta horizontal empilhada sobre a carta PRINCIPAL do slot (ex.: um
  // reforço qualquer colocado em cima da Rainha/Rei/Monstro armadilha do
  // Coringa) não tinha pra onde ir quando `kind === 'main'` - `removeFromField`
  // só limpava `faceDownCard`, deixando `horizontalCards` intacto no slot,
  // um slot "órfão" (mesmo estado inconsistente que o comentário de
  // handleReturnCardToHand já alertava). Como `canActivateNumeralSpell` só
  // olha `faceDownCard` pra decidir se o campo está "vazio", esse slot órfão
  // passava despercebido - e a Magia Numeral seguinte sobrescrevia o campo
  // inteiro (`field: newField`), descartando a carta horizontal órfã sem
  // nunca a mandar pra mão/descarte, sumindo do jogo de vez. Agora qualquer
  // horizontal presente é devolvida pra mão do dono junto com a reação
  // (mesmo destino de handleReturnCardToHand), nunca deixada pra trás.
  const orphanedHorizontal = kind === 'main' ? slot.horizontalCards : [];
  const removeFromField = (): FieldSlot =>
    kind === 'main'
      ? { ...slot, faceDownCard: undefined, revealed: false, horizontalCards: [] }
      : { ...slot, horizontalCards: slot.horizontalCards.filter((c) => c.id !== card.id) };

  // FIX (pedido do usuário, sistema de alvo genérico - ver comentário
  // completo em resolveCoringaTrapTargeting): a reação agora também dispara
  // sem a carta nunca ter sido revelada (só alvejada) - "foi revelado(a)"
  // ficaria errado nesse caso, então o texto do log agora reflete qual dos
  // dois de verdade aconteceu.
  const triggerVerb = card.revealed ? 'foi revelado' : 'foi alvejado';

  if (card.value === 'J') {
    newField[slotIndex] = removeFromField();
    // FIX (pedido do usuário, nova feature: "o valete agora também funciona
    // como um escudo... deixa um marcador +5 em cima da carta que ele
    // estava como horizontal"): `kind` é SEMPRE 'horizontal' pro Valete
    // (isCoringaTrapFieldEligible só permite ele como horizontal, nunca
    // principal - ver comentário lá; `kind === 'main'` só existe em cenários
    // sintéticos de teste, sem host nenhum pra marcar). Só quando
    // `kind === 'horizontal'` existe uma carta HOST de verdade
    // (`newField[slotIndex].faceDownCard`, intacta - `removeFromField` só
    // tira o Valete das horizontais, nunca mexe no principal) - ela recebe
    // +5 de marcador de combate. Acontece SEMPRE que o Valete reage nesse
    // caso, não importa o gatilho - alvejado/revelado direto (esta função,
    // chamada normalmente) OU o escudo bloqueando um efeito mirado na carta
    // protegida (ver tryCoringaJShieldBlock mais abaixo, que também chama
    // esta mesma função).
    const hostCard = kind === 'horizontal' ? newField[slotIndex].faceDownCard : undefined;
    if (hostCard) {
      newField[slotIndex] = {
        ...newField[slotIndex],
        faceDownCard: applyTimedCombatModifier(
          hostCard,
          { kind: 'combatModifier', source: 'coringa', label: 'Valete - Escudo', mode: 'add', magnitude: 5, duration: { type: 'untilPhase', phase: 'draw' } },
          { turn: state.turn, phase: state.phase },
          (existing, incoming) => ({ ...incoming, magnitude: (existing.magnitude ?? 0) + (incoming.magnitude ?? 0) }),
          { isOwnBuff: true } // Escudo sempre protege uma carta do PRÓPRIO dono da armadilha.
        ),
      };
    }
    const { deck, discardPile } = pushToDiscard(state, [card]);
    let log = appendLog(
      state,
      state.log,
      'magic',
      hostCard
        ? `O Valete armadilha de Jogador ${owner} ${triggerVerb} e se dissipou em fumaça - deixou um escudo de +5 na carta que protegia!`
        : `O Valete armadilha de Jogador ${owner} ${triggerVerb} e se dissipou em fumaça!`,
      { player: owner, slotIndex, trigger: 'coringa-trap-j' }
    );
    const { deck: ensuredDeck, discardPile: ensuredDiscard, reshuffled } = ensureDeckHasCards({ ...state, deck, discardPile });
    if (reshuffled) log = appendLog(state, log, 'system', `O baralho esgotou - a pilha de descarte foi reembaralhada de volta`, { trigger: 'deck-reshuffled' });
    const maxCanDraw = ownerState.handLimit - ownerState.hand.length;
    const actualCount = Math.min(1, maxCanDraw, ensuredDeck.length);
    const { drawn, remaining } = actualCount > 0 ? drawCards(ensuredDeck, actualCount) : { drawn: [] as Card[], remaining: ensuredDeck };
    if (drawn.length > 0) {
      log = appendLog(state, log, 'draw', `Jogador ${owner} comprou 1 carta de reposição`, { player: owner });
    }
    return {
      ...state,
      deck: remaining,
      discardPile: ensuredDiscard,
      log,
      [ownerKey]: { ...ownerState, field: newField, hand: [...ownerState.hand, ...orphanedHorizontal, ...drawn] },
    };
  }

  if (card.value === 'Q' || card.isMonster) {
    newField[slotIndex] = removeFromField();
    // FIX (bug real exposto pelo novo gatilho "alvejada, não só revelada" -
    // ver resolveCoringaTrapTargeting): `hideCard` só limpa `revealed`, mas
    // agora esta reação também pode disparar em cima de uma carta que outro
    // efeito já tinha marcado com algum StatusEffect ANTES de reagir (ex.:
    // Criogenar do Glacial congela sem revelar; Visão Celestial do Anjo já
    // aplicava `magicLocked` ao revelar - bug pré-existente, só nunca
    // exposto porque a reação só disparava em cima de revelação mesmo).
    // `resetCardForDiscard` (mesma convenção documentada em cardUtils.ts:
    // "nenhum status effect ligado a uma carta específica deveria sobreviver
    // a ela sair de campo/mão") já limpa `statusEffects` e `revealed` juntos
    // - sem isso, a carta podia voltar pra mão do Coringa permanentemente
    // congelada ou trancada, sem nenhum Glacial/Anjo envolvido na mão dele.
    const newHand = shuffle([...ownerState.hand, resetCardForDiscard(card), ...orphanedHorizontal]);
    const label = card.value === 'Q' ? 'A Rainha armadilha' : 'O Monstro';
    const log = appendLog(
      state,
      state.log,
      'magic',
      `${label} de Jogador ${owner} ${card.revealed ? 'foi revelado(a)' : 'foi alvejado(a)'} e voltou oculto(a) pra mão - a mão foi embaralhada`,
      { player: owner, trigger: card.value === 'Q' ? 'coringa-trap-q' : undefined }
    );
    return {
      ...state,
      log,
      [ownerKey]: { ...ownerState, field: newField, hand: newHand },
    };
  }

  if (card.value === 'K') {
    newField[slotIndex] = removeFromField();
    const { deck, discardPile } = pushToDiscard(state, [card]);
    let log = appendLog(
      state,
      state.log,
      'magic',
      `O Rei armadilha de Jogador ${owner} ${triggerVerb} e explodiu em fumaça e nuvens!`,
      { player: owner, slotIndex, trigger: 'coringa-trap-k' }
    );

    let aceDeck = deck;
    let aceDiscard = discardPile;
    let aceIndex = aceDeck.findIndex((c) => c.value === 'A');
    if (aceIndex === -1 && aceDiscard.length > 0) {
      const reshuffled = reshuffleDiscardIntoDeck(aceDeck, aceDiscard, 'all');
      aceDeck = reshuffled.deck;
      aceDiscard = reshuffled.discardPile;
      aceIndex = aceDeck.findIndex((c) => c.value === 'A');
    }
    if (aceIndex === -1 || ownerState.hand.length >= ownerState.handLimit) {
      return {
        ...state,
        deck: aceDeck,
        discardPile: aceDiscard,
        log,
        [ownerKey]: { ...ownerState, field: newField, hand: [...ownerState.hand, ...orphanedHorizontal] },
      };
    }
    const ace = aceDeck[aceIndex];
    const remainingDeck = [...aceDeck.slice(0, aceIndex), ...aceDeck.slice(aceIndex + 1)];
    log = appendLog(state, log, 'draw', `Jogador ${owner} comprou um Ás`, { player: owner });
    return {
      ...state,
      deck: remainingDeck,
      discardPile: aceDiscard,
      log,
      [ownerKey]: { ...ownerState, field: newField, hand: [...ownerState.hand, ...orphanedHorizontal, ace] },
    };
  }

  return state;
}

/**
 * Coringa - dispara a reação de armadilhas de campo (J/Q/K/Monstro) do
 * ALVO quando uma delas é ALVEJADA por um efeito de Estratégia.
 *
 * FIX (pedido do usuário, sistema de alvo genérico - Coringa é o 1º a
 * usar): antes, a reação só disparava quando a carta era REVELADA (diff
 * `revealed: false → true` entre o estado antes/depois do efeito - ver
 * antiga resolveCoringaFieldTraps). Isso deixava passando batido qualquer
 * efeito mais novo que MIRA uma carta oculta sem nunca revelar ela de
 * verdade (Criogenar/Crioespinho do Glacial, que congelam/marcam uma carta
 * oculta do oponente e a mantêm oculta) - uma armadilha do Coringa podia ser
 * congelada ou marcada silenciosamente, sem reagir nem uma vez, porque
 * nunca passava pelo diff de revelação. Agora QUALQUER efeito que mire
 * especificamente a carta (revelando ou não) já é "cutucar" a armadilha o
 * bastante pra ela reagir - o chamador passa os ids exatos que alvejou
 * (não varre o campo inteiro comparando estados), então cobre os dois casos
 * (revela ou não) com a mesma função. Cartas na MÃO nunca contam aqui (só
 * viram "armadilha" de verdade quando POSICIONADAS no campo - mirar uma
 * carta ainda na mão, como a Revelação Forçada do Mago faz, nunca foi nem
 * deveria ser um gatilho).
 */
export function resolveCoringaTrapTargeting(state: GameState, targetPlayer: PlayerNumber, targetCardIds: readonly string[]): GameState {
  if (state.phase !== 'strategy') return state;
  if (characterOf(state, targetPlayer) !== 'coringa') return state;
  let result = state;
  for (const targetCardId of targetCardIds) {
    const targetField = result[playerKeyOf(targetPlayer)].field;
    for (let i = 0; i < 3; i++) {
      const slot = targetField[i];
      if (slot.faceDownCard?.id === targetCardId && isCoringaRawTrapCard(result, targetPlayer, slot.faceDownCard)) {
        result = applyCoringaTrapReaction(result, targetPlayer, i, 'main', slot.faceDownCard);
        break;
      }
      const horizontalTrap = slot.horizontalCards.find((c) => c.id === targetCardId);
      if (horizontalTrap && isCoringaRawTrapCard(result, targetPlayer, horizontalTrap)) {
        result = applyCoringaTrapReaction(result, targetPlayer, i, 'horizontal', horizontalTrap);
        break;
      }
    }
  }
  return result;
}

/**
 * Coringa - o Valete-armadilha (sempre horizontal, nunca principal - ver
 * isCoringaTrapFieldEligible em aiPlayer.ts) agora também funciona como
 * ESCUDO pra carta que ele está montado em cima (pedido do usuário): se
 * `targetCardId` for a `faceDownCard` PRINCIPAL de um slot com um Valete
 * ainda cru entre as horizontais dele, o efeito que tentou mirar essa carta
 * é BLOQUEADO POR COMPLETO (nunca chega a aplicar) - só o Valete reage no
 * lugar (mesma `applyCoringaTrapReaction`, branch 'J', que já deixa o
 * marcador +5 na carta protegida por baixo dele, não importa o gatilho -
 * ver comentário completo lá). Diferente de `resolveCoringaTrapTargeting`
 * acima (que reage DEPOIS do efeito original já ter sido aplicado), esta
 * função precisa ser chamada ANTES - cada handler que mira uma carta
 * principal de campo na Estratégia consulta isto primeiro; um resultado
 * não-nulo significa "pare aqui, devolva isto" (o efeito de quem chamou
 * nunca roda). `null` = sem escudo, o chamador segue seu próprio efeito
 * normalmente.
 *
 * Escopo: só Estratégia (mesmo escopo do sistema de alvo já existente) - a
 * carta protegida continua lutando normalmente no Combate, sem escudo
 * nenhum lá.
 */
export function tryCoringaJShieldBlock(state: GameState, targetPlayer: PlayerNumber, targetCardId: string): GameState | null {
  if (state.phase !== 'strategy') return null;
  if (characterOf(state, targetPlayer) !== 'coringa') return null;
  const targetField = state[playerKeyOf(targetPlayer)].field;
  for (let i = 0; i < 3; i++) {
    const slot = targetField[i];
    if (slot.faceDownCard?.id !== targetCardId) continue;
    const jGuard = slot.horizontalCards.find((c) => c.value === 'J' && isCoringaRawTrapCard(state, targetPlayer, c));
    if (!jGuard) return null;
    return applyCoringaTrapReaction(state, targetPlayer, i, 'horizontal', jGuard);
  }
  return null;
}
