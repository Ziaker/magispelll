/**
 * magicHandlers.ts - handlers de ativação/execução das magias J/Q/K.
 *
 * Começa pelas ativações simples (Anjo J/K) e cresce por domínio, sem
 * depender de gameEngine.ts.
 */
import { reshuffleDiscardIntoDeck } from './cardUtils';
import { pushToDiscard } from './deckLifecycle';
import { appendLog } from './gameLog';
import { playerKeyOf, characterOf } from './gameSelectors';
import type { GameState } from './gameStateTypes';
import type { PlayerNumber } from './gameTypes';
import { canActivateMagic } from './magicCards';
import { getMagicActivationContext } from './magicActivationContext';

import { isSlotProtected } from './anjoRules';
import { getEffectiveCardValue, isNumeralCard, isPlainNumeralCard, revealCard } from './cardUtils';
import type { Card } from './cardUtils';
import type { CharacterId } from './characterRegistry';
import { isCoringaRawTrapCard } from './coringaRules';
import { resolveCoringaTrapTargeting, tryCoringaJShieldBlock } from './coringaTrapHandlers';
import { isBrotoSlot, isTowerSlot } from './fieldLifecycle';
import { updateFieldSlot } from './fieldOperations';
import { fieldCards } from './fieldQueries';
import type { MagicSelection } from './gameActionTypes';
import { opponentKeyOf, opponentOf } from './gameSelectors';
import type { FieldSlot, PlayerState } from './gameStateTypes';
import type { PlayerKey } from './gameTypes';
import { isFrozenMagicActivationBlocked } from './glacialRules';
import type { MagicCardType } from './magicCards';
import { getFireballCap } from './piromanteRules';
import { applyStatus, applyTimedCombatModifier, getStatusMagnitude, hasStatus, removeStatus } from './statusEffects';

// ---------------------------------------------------------------------------
// Magias (J, Q, K)
// ---------------------------------------------------------------------------

export function handleActivateSimpleMagic(state: GameState, player: PlayerNumber, cardId: string): GameState {
  const playerKey = playerKeyOf(player);
  const playerState = state[playerKey];
  const card = playerState.hand.find((c) => c.id === cardId);
  if (!card || (card.value !== 'J' && card.value !== 'K')) return state;
  const character = characterOf(state, player);

  // Anjo J - Benção Divina (fase de compra): FIX (pedido do usuário: "mude o
  // efeito da valete do anjo para 'compre um Ás'") - o efeito antigo
  // (aumentar o limite de mão permanentemente + comprar 2 cartas aleatórias)
  // foi substituído por um efeito novo e simples: busca um Ás específico no
  // baralho (reembaralhando TODO o descarte de volta primeiro, se nenhum Ás
  // estiver no baralho no momento) e coloca ele direto na mão - uma compra
  // garantida, não aleatória. `permanentDrawBonus`/`handLimit` não são mais
  // tocados por esta magia (continuam existindo só para a Magia Numeral do
  // Anjo, Benção Eterna - uma habilidade totalmente separada, inalterada).
  if (character === 'anjo' && card.value === 'J' && state.phase === 'draw') {
    if (!canActivateMagic(state.phase, character, 'J', getMagicActivationContext(state, player))) return state;
    const newHand = playerState.hand.filter((c) => c.id !== cardId);

    let deck = state.deck;
    let discardPile = state.discardPile;
    let aceIndex = deck.findIndex((c) => c.value === 'A');
    if (aceIndex === -1 && discardPile.length > 0) {
      const reshuffled = reshuffleDiscardIntoDeck(deck, discardPile, 'all');
      deck = reshuffled.deck;
      discardPile = reshuffled.discardPile;
      aceIndex = deck.findIndex((c) => c.value === 'A');
    }

    // Guarda de segurança - não deveria acontecer (canActivateMagic já exige
    // `hasAceAvailableToDraw`), mas nunca confia só na UI: sem nenhum Ás
    // alcançável (todos já em jogo em mãos/campos/zonas de Monstro), o
    // Valete é gasto sem efeito, com aviso no log.
    if (aceIndex === -1) {
      const { deck: finalDeck, discardPile: finalDiscard } = pushToDiscard({ deck, discardPile, gameConfig: state.gameConfig }, [card]);
      const log = appendLog(state, state.log, 'warning', `Nenhum Ás disponível pra comprar agora!`, { animationPolicy: 'suppress' });
      return { ...state, deck: finalDeck, discardPile: finalDiscard, log, [playerKey]: { ...playerState, hand: newHand } };
    }

    const ace = deck[aceIndex];
    const remainingDeck = [...deck.slice(0, aceIndex), ...deck.slice(aceIndex + 1)];
    const { deck: finalDeck, discardPile: finalDiscard } = pushToDiscard({ deck: remainingDeck, discardPile, gameConfig: state.gameConfig }, [card]);
    const log = appendLog(state, state.log, 'magic', `Jogador ${player} comprou um Ás`, { player, cardValue: card.value, cardSuit: card.suit });
    return {
      ...state,
      deck: finalDeck,
      discardPile: finalDiscard,
      log,
      [playerKey]: { ...playerState, hand: [...newHand, ace] },
    };
  }

  // Anjo K - Reforço Angelical (fase de estratégia): permite empilhar
  // horizontal. FIX (pedido do usuário): cada ativação soma +1 ao bônus
  // (`horizontalStackBonus`) em vez de só ligar um boolean - ativar de novo
  // (com um 2º, 3º... Rei na mão, no mesmo turno) agora realmente permite
  // mais uma carta horizontal a cada vez, sem teto.
  if (character === 'anjo' && card.value === 'K' && state.phase === 'strategy') {
    if (!canActivateMagic(state.phase, character, 'K', getMagicActivationContext(state, player))) return state;
    const newHand = playerState.hand.filter((c) => c.id !== cardId);
    const { deck, discardPile } = pushToDiscard(state, [card]);
    const newHorizontalStackBonus = playerState.horizontalStackBonus + 1;
    const log = appendLog(state, state.log, 'magic', `Jogador ${player} pode agora posicionar até ${1 + newHorizontalStackBonus} cartas horizontais neste turno`, { player, cardValue: card.value, cardSuit: card.suit });
    return {
      ...state,
      deck,
      discardPile,
      log,
      [playerKey]: { ...playerState, hand: newHand, horizontalStackBonus: newHorizontalStackBonus },
    };
  }

  return state;
}

/**
 * Piromante (personagem novo, "momento game design") - lança a Bola de Fogo
 * acumulada contra o campo do oponente. Compartilhada pelas 3 magias (J/Q/K
 * escolhendo "lançar" em vez do efeito próprio de alimentar - ver
 * MagicSelection.fireballLaunch) - a única diferença entre elas é QUAL carta
 * sai da mão do jogador antes de chamar esta função.
 *
 * Sem `piromanteSpreadArmed` (Magia Numeral "Chama Repartida" não ativa):
 * mira 1 slot só (`targetSlot`), reduzindo/obliterando pelo valor TOTAL da
 * Bola de Fogo.
 * Com `piromanteSpreadArmed`: mira os 3 slots do oponente de uma vez, cada
 * um recebendo só uma FRAÇÃO do valor (dividido por 3, arredondado pra
 * baixo - o resto da divisão se perde, mesmo trade-off "força concentrada
 * vs espalhada" descrito pelo usuário).
 *
 * Cada slot atingido: soma o valor de TUDO que está empilhado ali (carta
 * principal + reserva de torre, se houver + horizontal(is) - ver
 * isTowerSlot/FieldSlot). Se a fatia da Bola de Fogo for >= a esse total, o
 * slot inteiro é obliterado (fica vazio). Se for menor, todas as cartas de
 * lá saem (descartadas normalmente, são cartas REAIS) e uma única
 * carta-token nova (`isFireToken`, ver cardUtils.ts) com o valor restante
 * ocupa o lugar da carta principal - nunca vai pro descarte quando sai de
 * campo depois (ver pushToDiscard).
 *
 * Slots protegidos por Proteção Divina do Anjo (isSlotProtected) são
 * ignorados por completo (pedido do usuário: "bloqueia") - o fogo passa
 * por cima sem efeito nenhum ali, mas a Bola de Fogo é consumida do mesmo
 * jeito (o "tiro" foi dado, o alvo é que resistiu).
 */
export function executeFireballLaunch(state: GameState, player: PlayerNumber, targetSlot: number | undefined): GameState {
  // FIX (pedido do usuário, repetido: "os segundos efeitos de todas magias do
  // piromante (de lançar a bola de fogo) só podem ser ativados na fase de
  // combate") - guard no MOTOR, não só na UI: `canLaunchFireball`
  // (getMagicActivationContext) já esconde a opção fora do Combate, mas quem
  // decide de verdade é aqui, no único ponto por onde os 3 lançamentos
  // (J/Q/K) passam - assim nenhuma outra porta de entrada (IA, um diálogo que
  // ficou aberto atravessando a virada de fase, um dispatch direto) consegue
  // lançar fora da hora.
  if (state.phase !== 'combat') return state;
  const playerKey = playerKeyOf(player);
  const opponentKey = opponentKeyOf(player);
  const opponent = opponentOf(player);
  const playerState = state[playerKey];
  const opponentState = state[opponentKey];
  const fireballValue = playerState.fireballValue;
  if (fireballValue <= 0) return state;

  const spread = hasStatus(playerState, 'spreadArmed');
  const targets = spread ? [0, 1, 2] : targetSlot !== undefined ? [targetSlot] : [];
  if (targets.length === 0) return state;

  const perTargetValue = spread ? Math.floor(fireballValue / 3) : fireballValue;

  let newField = [...opponentState.field] as [FieldSlot, FieldSlot, FieldSlot];
  let deck = state.deck;
  let discardPile = state.discardPile;
  let log = state.log;

  for (const slotIndex of targets) {
    if (isSlotProtected(state, opponent, slotIndex)) {
      log = appendLog(state, log, 'magic', `A Bola de Fogo de Jogador ${player} não teve efeito no slot ${slotIndex + 1} de Jogador ${opponent} - protegido!`, { player, slotIndex });
      continue;
    }
    if (perTargetValue <= 0) continue;
    const slot = newField[slotIndex];
    // FIX (Druida, personagem novo, bug real de perda de cartas achado numa
    // auditoria - Piromante vs Druida perdia 1 carta por partida): faltava
    // `slot.brotoReserve` aqui, mesmo padrão de `towerReserve` na mesma
    // linha - sem isso, as cartas empilhadas por baixo do topo de um Broto
    // atingido pela Bola de Fogo nunca eram coletadas nem por
    // `pushToDiscard` (abaixo) nem pelo `newField[slotIndex] = {...}` que
    // substitui o slot inteiro (obliteração) ou vira um token (redução) -
    // ficavam permanentemente fora do jogo (nem campo, nem mão, nem
    // descarte), sem nenhum erro visível.
    const slotCards = [...(slot.faceDownCard ? [slot.faceDownCard] : []), ...(slot.towerReserve ?? []), ...(slot.brotoReserve ?? []), ...slot.horizontalCards];
    if (slotCards.length === 0) continue;
    const slotTotal = slotCards.reduce((sum, c) => sum + getEffectiveCardValue(c), 0);

    const pushed = pushToDiscard({ deck, discardPile, gameConfig: state.gameConfig }, slotCards);
    deck = pushed.deck;
    discardPile = pushed.discardPile;

    if (perTargetValue >= slotTotal) {
      newField[slotIndex] = { revealed: false, horizontalCards: [] };
      log = appendLog(state, log, 'magic', `A Bola de Fogo de Jogador ${player} obliterou o slot ${slotIndex + 1} de Jogador ${opponent}!`, { player, slotIndex });
    } else {
      const remaining = slotTotal - perTargetValue;
      const tokenCard: Card = {
        id: `fire-token-p${player}-t${state.turn}-s${slotIndex}-v${fireballValue}`,
        value: 'FIRE',
        suit: '🔥',
        transformedValue: remaining,
        isFireToken: true,
        synthetic: { onDiscard: 'vanish' },
        revealed: true,
      };
      newField[slotIndex] = { faceDownCard: tokenCard, revealed: true, horizontalCards: [] };
      log = appendLog(
        state,
        log,
        'magic',
        `A Bola de Fogo de Jogador ${player} reduziu o slot ${slotIndex + 1} de Jogador ${opponent} - restam ${remaining}`,
        { player, slotIndex }
      );
    }
  }

  return {
    ...state,
    deck,
    discardPile,
    log,
    [playerKey]: removeStatus({ ...playerState, fireballValue: 0 }, 'spreadArmed'),
    [opponentKey]: { ...opponentState, field: newField },
  };
}

/**
 * Glacial (personagem novo) - gimmick passiva: ativar uma magia PRÓPRIA
 * congelada (por qualquer meio - não importa quem congelou) não é bloqueado
 * como qualquer outra carta congelada (ver guard em handleExecuteMagic) - em
 * vez disso, o efeito da magia RODA normalmente, mas a carta só é consumida
 * (descartada) na SEGUNDA ativação; a primeira só remove o congelamento e a
 * carta volta pra mão, intacta. Cada um dos 3 branches de magia do Glacial
 * usa isto no lugar do `hand: handWithoutMagic` + `pushToDiscard(state, [card, ...])`
 * padrão - `cardToDiscard` null significa "não inclua `card` no pushToDiscard".
 */
export function resolveGlacialCardConsumption(playerState: PlayerState, card: Card, cardId: string): { hand: Card[]; cardToDiscard: Card | null } {
  if (hasStatus(card, 'frozen')) {
    return { hand: playerState.hand.map((c) => (c.id === cardId ? removeStatus(c, 'frozen') : c)), cardToDiscard: null };
  }
  return { hand: playerState.hand.filter((c) => c.id !== cardId), cardToDiscard: card };
}

export function handleExecuteMagic(
  state: GameState,
  action: { player: PlayerNumber; cardId: string; character: CharacterId; magicType: MagicCardType; selection: MagicSelection }
): GameState {
  const { player, cardId, character, magicType, selection } = action;
  if (characterOf(state, player) !== character) return state;

  const playerKey = playerKeyOf(player);
  const opponentKey = opponentKeyOf(player);
  const opponent = opponentOf(player);
  const playerState = state[playerKey];
  const card = playerState.hand.find((c) => c.id === cardId);
  if (!card || card.value !== magicType) return state;

  // FIX (pedido do usuário: "a rainha do anjo agora impede a ativação de um
  // efeito caso a carta revelada por ela seja uma carta mágica até o fim do
  // turno") - guarda de topo, vale pra QUALQUER personagem/carta (ver
  // StatusEffect kind 'magicLocked' em statusEffects.ts e o efeito de Visão
  // Celestial abaixo).
  if (hasStatus(card, 'magicLocked')) {
    return { ...state, log: appendLog(state, state.log, 'warning', `Essa carta foi revelada pela Visão Celestial e está trancada até o fim do turno!`, { animationPolicy: 'suppress' }) };
  }

  if (isFrozenMagicActivationBlocked(character, card)) {
    return { ...state, log: appendLog(state, state.log, 'warning', `Essa carta está congelada e não pode ser ativada!`, { animationPolicy: 'suppress' }) };
  }

  if (!canActivateMagic(state.phase, character, magicType, getMagicActivationContext(state, player))) {
    return { ...state, log: appendLog(state, state.log, 'warning', `Essa magia não pode ser ativada agora`, { animationPolicy: 'suppress' }) };
  }

  const { selectedCards, selectedSlot, selectedTargetPlayer, selectedTargetSlot, selectedRevealCardIds } = selection;
  const handWithoutMagic = playerState.hand.filter((c) => c.id !== cardId);

  // ----- Mago J: Revelação Forçada -----
  if (character === 'mago' && magicType === 'J') {
    const targetId = selectedCards?.[0];
    if (!targetId) return state;
    const opponentState = state[opponentKey];
    const targetCard = opponentState.hand.find((c) => c.id === targetId);
    if (!targetCard) return state;
    // Glacial (personagem novo) - uma carta congelada nunca revela, não
    // importa o efeito - rejeita de vez em vez de silenciosamente não fazer
    // nada (revealCard já bloquearia a revelação, mas o resto do efeito
    // desta magia não faz sentido sem ela).
    if (hasStatus(targetCard, 'frozen')) {
      return { ...state, log: appendLog(state, state.log, 'warning', `Essa carta está congelada e não pode ser revelada!`, { animationPolicy: 'suppress' }) };
    }

    // FIX (pedido do usuário: "isso tá incorreto... você PODE descartar uma
    // carta JÁ revelada, não só quando tiver todas") - a regra original era
    // "revelar uma carta já revelada não faz nada de útil, então só quando
    // TODA a mão do oponente já estivesse revelada a magia passava a
    // descartar" - mas o pedido original do usuário sempre foi mais simples:
    // qualquer carta JÁ revelada (de uma ativação anterior desta mesma
    // magia, não importa se o resto da mão ainda está oculto) pode ser
    // escolhida para descartar agora, em vez de exigir a mão inteira
    // revelada primeiro. Continua nunca sendo possível "revelar" (sem
    // efeito) uma carta que já está revelada - nesse caso ela é descartada.
    if (targetCard.revealed) {
      const newOpponentHand = opponentState.hand.filter((c) => c.id !== targetId);
      const { deck, discardPile } = pushToDiscard(state, [card, targetCard]);
      const log = appendLog(state, state.log, 'magic', `Jogador ${player} descartou ${targetCard.value}${targetCard.suit} de Jogador ${opponent}`, { player, cardValue: card.value, cardSuit: card.suit });
      return {
        ...state,
        deck,
        discardPile,
        log,
        [playerKey]: { ...playerState, hand: handWithoutMagic },
        [opponentKey]: { ...opponentState, hand: newOpponentHand },
      };
    }

    const newOpponentHand = opponentState.hand.map((c) => (c.id === targetId ? { ...c, revealed: true } : c));
    const { deck, discardPile } = pushToDiscard(state, [card]);
    const log = appendLog(state, state.log, 'magic', `Jogador ${player} revelou ${targetCard.value}${targetCard.suit} de Jogador ${opponent}`, { player, cardValue: card.value, cardSuit: card.suit });
    return {
      ...state,
      deck,
      discardPile,
      log,
      [playerKey]: { ...playerState, hand: handWithoutMagic },
      [opponentKey]: { ...opponentState, hand: newOpponentHand },
    };
  }

  // ----- Besta J: Recuperação Selvagem -----
  if (character === 'besta' && magicType === 'J') {
    // FIX (pedido do usuário): só pode recuperar cartas NUMERAIS puras
    // (2-10) da pilha de descarte - nunca magias (J/Q/K), o Monstro
    // (Coringa), nem o Ás (mesmo transformado). Antes qualquer id pedido era
    // aceito sem checar o tipo da carta, então dava pra "recuperar" qualquer
    // coisa do descarte com esta magia. Filtra aqui, nunca confiando só na
    // UI (mesmo princípio já documentado no topo de magicCards.ts).
    const eligibleDiscardIds = new Set(state.discardPile.filter((c) => isPlainNumeralCard(c)).map((c) => c.id));
    const requestedIds = (selectedCards ?? []).filter((id) => eligibleDiscardIds.has(id)).slice(0, 2);
    if (requestedIds.length === 0) return state;

    // FIX (pedido do usuário: "o efeito da valete da besta não está comprando
    // duas cartas quando a mão está cheia, é para aumentar o limite apenas
    // para o efeito quando ativado") - a Recuperação Selvagem sempre entrega
    // as até 2 cartas pedidas, mesmo que isso deixe a mão temporariamente
    // acima do `handLimit` normal (o limite volta a valer normalmente no
    // próximo descarte/compra - não é alterado de verdade, só não bloqueia
    // ESTE efeito específico). Antes a mão cheia podia zerar o efeito por
    // completo (idsToTake vazio), fazendo o Valete ser gasto sem dar nada.
    const idsToTakeSet = new Set(requestedIds);
    const cardsFromDiscard = state.discardPile.filter((c) => idsToTakeSet.has(c.id)).map((c) => ({ ...c, revealed: true }));
    const remainingDiscard = state.discardPile.filter((c) => !idsToTakeSet.has(c.id));

    let log = state.log;
    log = appendLog(state, log, 'magic', `Jogador ${player} pegou ${cardsFromDiscard.length} carta(s) do descarte`, { player, cardValue: card.value, cardSuit: card.suit });

    const { deck, discardPile } = pushToDiscard({ deck: state.deck, discardPile: remainingDiscard, gameConfig: state.gameConfig }, [card]);

    return {
      ...state,
      deck,
      discardPile,
      log,
      [playerKey]: { ...playerState, hand: [...handWithoutMagic, ...cardsFromDiscard] },
    };
  }

  // ----- Mago Q: Substituição Arcana -----
  if (character === 'mago' && magicType === 'Q') {
    if (selectedSlot === undefined || !selectedCards?.[0]) return state;
    const targetPlayer = selectedTargetPlayer ?? player;
    const targetKey = playerKeyOf(targetPlayer);
    const targetState = state[targetKey];
    const targetSlot = targetState.field[selectedSlot];

    // Alvo precisa existir, e se for do oponente precisa estar revelado e não protegido
    // Glacial (personagem novo): carta congelada no campo não recebe efeitos
    // transformadores de terceiros - não pode ser substituída por esta magia.
    if (!targetSlot.faceDownCard || hasStatus(targetSlot.faceDownCard, 'frozen')) return state;
    if (targetPlayer !== player) {
      if (!targetSlot.revealed) return state;
      if (isSlotProtected(state, targetPlayer, selectedSlot)) {
        return { ...state, log: appendLog(state, state.log, 'warning', `Esse slot está protegido por Proteção Divina!`, { animationPolicy: 'suppress' }) };
      }
    }
    // Coringa (novo, pedido do usuário) - Valete-armadilha funciona como
    // escudo pra carta que está montado em cima (ver tryCoringaJShieldBlock)
    // - bloqueia a Substituição Arcana por completo se o alvo tiver um.
    const jShieldResult = tryCoringaJShieldBlock(state, targetPlayer, targetSlot.faceDownCard.id);
    if (jShieldResult) return jShieldResult;

    // FIX (pedido do usuário): a carta numeral usada na troca agora também
    // pode vir da mão do OPONENTE, não só da própria - mas, nesse caso, só se
    // aquela carta específica já estiver revelada (a mesma regra "sua ou do
    // oponente se revelada" já usada acima para o alvo do campo, aplicada
    // agora também à origem da carta usada na troca). Sem essa checagem seria
    // possível usar qualquer carta da mão do oponente às cegas - o Mago só
    // tem controle sobre informação que ele mesmo já expôs.
    const opponentState = state[opponentKey];
    let sourceOwner: PlayerNumber = player;
    let cardToPlace = playerState.hand.find((c) => c.id === selectedCards[0]);
    if (!cardToPlace) {
      const opponentCard = opponentState.hand.find((c) => c.id === selectedCards[0] && c.revealed);
      if (opponentCard) {
        sourceOwner = opponent;
        cardToPlace = opponentCard;
      }
    }
    // FIX (mudança de regra pedida pelo usuário - ver isFrozenPlayBlocked):
    // usar uma carta congelada como peça de troca equivale a "jogá-la" no
    // campo por outro caminho - mesma liberação de PLAY_CARD, não bloqueia
    // mais por causa do congelamento.
    if (!cardToPlace || !isNumeralCard(cardToPlace)) return state;
    const sourceKey = playerKeyOf(sourceOwner);

    // FIX (Modo Towers, pedido do usuário: "Substituição Arcana vira uma
    // ferramenta anti-torre") - mirando uma torre, a troca normal não se
    // aplica: se o valor efetivo da carta trazida bate com o topo atual da
    // torre, ela FUNDE (vira o novo topo, o antigo desce pra reserva - a
    // torre cresce, nada volta pra mão nenhuma); se não bate, a carta trazida
    // NUNCA entra em jogo (fica intocada na mão de origem) e o efeito só
    // descasca o topo da torre pro descarte (a torre encolhe 1). Confirmado
    // com o usuário: efeito colateral intencional, não um bug - dá aos
    // personagens com magia de troca um jeito de sabotar uma torre grande do
    // adversário mesmo sem ter uma carta do número certo à mão.
    if (isTowerSlot(targetSlot)) {
      const reserve = targetSlot.towerReserve!;
      const topValue = getEffectiveCardValue(targetSlot.faceDownCard!);
      const incomingValue = getEffectiveCardValue(cardToPlace);
      const newTargetField = [...targetState.field] as [FieldSlot, FieldSlot, FieldSlot];
      let newPlayer1 = state.player1;
      let newPlayer2 = state.player2;
      // FIX: `handOf` lê o estado JÁ ACUMULADO (newPlayer1/newPlayer2), não
      // `state[key].hand` cru - essencial quando `sourceKey === playerKey`
      // (o caso mais comum: usar uma carta da PRÓPRIA mão na troca), senão o
      // filtro abaixo partiria da mão ORIGINAL (ainda com a Rainha usada
      // pra ativar a magia) e desfaria silenciosamente o `setHand(playerKey,
      // handWithoutMagic)` de baixo, deixando a Rainha "voltar" pra mão.
      const handOf = (key: PlayerKey) => (key === 'player1' ? newPlayer1.hand : newPlayer2.hand);
      const setHand = (key: PlayerKey, hand: Card[]) => {
        if (key === 'player1') newPlayer1 = { ...newPlayer1, hand };
        else newPlayer2 = { ...newPlayer2, hand };
      };
      const setField = (key: PlayerKey, field: [FieldSlot, FieldSlot, FieldSlot]) => {
        if (key === 'player1') newPlayer1 = { ...newPlayer1, field };
        else newPlayer2 = { ...newPlayer2, field };
      };
      setHand(playerKey, handWithoutMagic);

      if (incomingValue === topValue) {
        newTargetField[selectedSlot] = {
          ...targetSlot,
          faceDownCard: { ...cardToPlace, revealed: true, placedOnTurn: state.turn },
          towerReserve: [...reserve, { ...targetSlot.faceDownCard!, revealed: true }],
          revealed: true,
        };
        setHand(sourceKey, handOf(sourceKey).filter((c) => c.id !== selectedCards[0]));
        setField(targetKey, newTargetField);
        const { deck, discardPile } = pushToDiscard(state, [card]);
        const log = appendLog(state, state.log, 'magic', `Jogador ${player} reforçou uma torre com uma carta revelada`, { player, cardValue: card.value, cardSuit: card.suit });
        return { ...state, deck, discardPile, log, player1: newPlayer1, player2: newPlayer2 };
      }

      const newReserve = [...reserve];
      const newTop = newReserve.pop();
      newTargetField[selectedSlot] = { ...targetSlot, faceDownCard: newTop, towerReserve: newReserve, revealed: Boolean(newTop) };
      setField(targetKey, newTargetField);
      const { deck, discardPile } = pushToDiscard(state, [card, targetSlot.faceDownCard!]);
      const log = appendLog(state, state.log, 'magic', `Jogador ${player} descartou o topo de uma torre (a carta não bateu com o número)`, { player, cardValue: card.value, cardSuit: card.suit });
      return { ...state, deck, discardPile, log, player1: newPlayer1, player2: newPlayer2 };
    }

    const oldCard = targetSlot.faceDownCard;
    const newTargetField = [...targetState.field] as [FieldSlot, FieldSlot, FieldSlot];
    newTargetField[selectedSlot] = { ...newTargetField[selectedSlot], faceDownCard: { ...cardToPlace, revealed: true, placedOnTurn: state.turn }, revealed: true };

    const { deck, discardPile } = pushToDiscard(state, [card]);
    const log = appendLog(
      state,
      state.log,
      'magic',
      sourceOwner === player
        ? `Jogador ${player} substituiu carta no campo`
        : `Jogador ${player} substituiu carta no campo usando uma carta revelada da mão de Jogador ${opponent}`,
      { player, cardValue: card.value, cardSuit: card.suit }
    );

    // FIX: alvo do campo (own/opponent) e dono da carta usada na troca
    // (own/opponent) agora são escolhas independentes - até 4 combinações
    // possíveis. Monta o novo estado dos dois jogadores passo a passo, cada
    // ajuste lendo o resultado já atualizado do passo anterior (importante
    // quando dois passos mexem na mesma mão, ex.: sourceKey === targetKey).
    let newPlayer1 = state.player1;
    let newPlayer2 = state.player2;
    const handOf = (key: PlayerKey) => (key === 'player1' ? newPlayer1.hand : newPlayer2.hand);
    const setHand = (key: PlayerKey, hand: typeof newPlayer1.hand) => {
      if (key === 'player1') newPlayer1 = { ...newPlayer1, hand };
      else newPlayer2 = { ...newPlayer2, hand };
    };
    const setField = (key: PlayerKey, field: typeof newPlayer1.field) => {
      if (key === 'player1') newPlayer1 = { ...newPlayer1, field };
      else newPlayer2 = { ...newPlayer2, field };
    };

    // 1. A carta Rainha usada para ativar a magia sempre sai da mão de quem ativou.
    setHand(playerKey, handWithoutMagic);
    // 2. A carta numeral usada na troca sai da mão de quem a possuía.
    setHand(sourceKey, handOf(sourceKey).filter((c) => c.id !== selectedCards[0]));
    // 3. O campo alvo recebe a carta numeral.
    setField(targetKey, newTargetField);
    // 4. A carta antiga do slot alvo volta para a mão de quem era dona do slot
    //    (não necessariamente quem ativou a magia nem quem cedeu a carta nova).
    // FIX (checagem extensa por bugs - interação Piromante x Mago): uma
    // carta-token de Bola de Fogo (`isFireToken`, ver cardUtils.ts) nunca
    // existiu no baralho de 54 cartas - ela precisa DESAPARECER ao sair do
    // campo (mesma regra que pushToDiscard já aplica em todo outro lugar),
    // nunca ir pra mão de ninguém. Sem esta checagem, Substituição Arcana
    // conseguia "resgatar" o token pra mão (e de lá, até jogá-lo de volta
    // ao campo como se fosse uma carta de verdade) - o único ponto de saída
    // de campo que não passava por pushToDiscard.
    if (oldCard && !oldCard.isFireToken) {
      setHand(targetKey, [...handOf(targetKey), oldCard]);
    }

    return {
      ...state,
      deck,
      discardPile,
      log,
      player1: newPlayer1,
      player2: newPlayer2,
    };
  }

  // ----- Besta Q: Troca Predatória -----
  // FIX (itens 12 e 18): o alvo agora pode ser tanto um slot do PRÓPRIO campo
  // quanto um slot já REVELADO (e não protegido) do campo do OPONENTE - antes
  // só o próprio campo era aceito, o que criava um beco sem saída na
  // interface sempre que `canActivateMagic` permitia ativar a magia porque
  // só o oponente tinha cartas em campo (o próprio jogador com campo vazio
  // não tinha nenhum slot próprio para oferecer como alvo).
  if (character === 'besta' && magicType === 'Q') {
    if (selectedSlot === undefined || !selectedCards?.[0]) return state;
    const targetPlayer = selectedTargetPlayer ?? player;
    const targetKey = playerKeyOf(targetPlayer);
    const targetState = state[targetKey];
    const targetSlot = targetState.field[selectedSlot];
    if (!targetSlot.faceDownCard) return state;
    if (targetPlayer !== player) {
      if (!targetSlot.revealed) return state;
      if (isSlotProtected(state, targetPlayer, selectedSlot)) {
        return { ...state, log: appendLog(state, state.log, 'warning', `Esse slot está protegido por Proteção Divina!`, { animationPolicy: 'suppress' }) };
      }
    }
    // Coringa (novo, pedido do usuário) - Valete-armadilha funciona como
    // escudo pra carta que está montado em cima (ver tryCoringaJShieldBlock)
    // - bloqueia a Troca Predatória por completo se o alvo tiver um.
    const jShieldResult = tryCoringaJShieldBlock(state, targetPlayer, targetSlot.faceDownCard.id);
    if (jShieldResult) return jShieldResult;

    // FIX (auditoria completa da Besta - brecha real encontrada): antes não
    // havia checagem nenhuma de tipo aqui, diferente da Besta J logo acima
    // (que já filtra `isPlainNumeralCard` com o comentário explícito "nunca
    // confiando só na UI") - um id de magia (J/Q/K) ou do Monstro no
    // descarte podia ser colocado direto num slot de combate, violando a
    // regra central de que só cartas numerais (2-10) ocupam os 3 slots.
    const cardFromDiscard = state.discardPile.find((c) => c.id === selectedCards[0] && isPlainNumeralCard(c));
    if (!cardFromDiscard) return state;

    // FIX (Modo Towers, pedido do usuário): mesma regra anti-torre da
    // Substituição Arcana do Mago (ver comentário completo lá) - só que aqui
    // a carta trazida vem do DESCARTE, não da mão: se bater, funde (sai do
    // descarte, vira o novo topo); se não bater, "nunca entra" significa que
    // ela CONTINUA no descarte intocada, e só o topo antigo da torre é
    // descartado (a torre encolhe 1).
    if (isTowerSlot(targetSlot)) {
      const reserve = targetSlot.towerReserve!;
      const topValue = getEffectiveCardValue(targetSlot.faceDownCard!);
      const incomingValue = getEffectiveCardValue(cardFromDiscard);
      const newTargetField = [...targetState.field] as [FieldSlot, FieldSlot, FieldSlot];

      // FIX: `targetKey` pode ser IGUAL a `playerKey` (torre no próprio
      // campo) - um objeto literal com as duas chaves computadas colidiria
      // nesse caso (a última sobrescreveria a primeira silenciosamente,
      // perdendo a mudança na mão). Mesmo padrão condicional já usado pelo
      // resto desta função (targetPlayer !== player) pra nunca colidir.
      if (incomingValue === topValue) {
        newTargetField[selectedSlot] = {
          ...targetSlot,
          faceDownCard: { ...cardFromDiscard, revealed: true, placedOnTurn: state.turn },
          towerReserve: [...reserve, { ...targetSlot.faceDownCard!, revealed: true }],
          revealed: true,
        };
        const discardWithoutTaken = state.discardPile.filter((c) => c.id !== selectedCards[0]);
        const { deck, discardPile } = pushToDiscard({ deck: state.deck, discardPile: discardWithoutTaken, gameConfig: state.gameConfig }, [card]);
        const log = appendLog(state, state.log, 'magic', `Jogador ${player} reforçou uma torre com uma carta do descarte`, { player, cardValue: card.value, cardSuit: card.suit });
        if (targetPlayer !== player) {
          return { ...state, deck, discardPile, log, [playerKey]: { ...playerState, hand: handWithoutMagic }, [targetKey]: { ...targetState, field: newTargetField } };
        }
        return { ...state, deck, discardPile, log, [playerKey]: { ...playerState, hand: handWithoutMagic, field: newTargetField } };
      }

      const newReserve = [...reserve];
      const newTop = newReserve.pop();
      newTargetField[selectedSlot] = { ...targetSlot, faceDownCard: newTop, towerReserve: newReserve, revealed: Boolean(newTop) };
      const { deck, discardPile } = pushToDiscard(state, [card, targetSlot.faceDownCard!]);
      const log = appendLog(state, state.log, 'magic', `Jogador ${player} descartou o topo de uma torre (a carta não bateu com o número)`, { player, cardValue: card.value, cardSuit: card.suit });
      if (targetPlayer !== player) {
        return { ...state, deck, discardPile, log, [playerKey]: { ...playerState, hand: handWithoutMagic }, [targetKey]: { ...targetState, field: newTargetField } };
      }
      return { ...state, deck, discardPile, log, [playerKey]: { ...playerState, hand: handWithoutMagic, field: newTargetField } };
    }

    const oldCard = targetSlot.faceDownCard;
    const newTargetField = [...targetState.field] as [FieldSlot, FieldSlot, FieldSlot];
    // FIX (pedido do usuário: "a carta selecionada da rainha da besta vai
    // para o campo oculta (mesmo se o alvo for uma carta do oponente)") -
    // antes a carta trazida do descarte sempre entrava REVELADA (mesmo
    // quando o slot alvo era o campo do PRÓPRIO jogador, sem motivo pra
    // revelar algo que só ele veria de qualquer forma). Agora entra oculta,
    // com a chance normal de ser revelada mais tarde como qualquer carta em
    // campo.
    newTargetField[selectedSlot] = { ...newTargetField[selectedSlot], faceDownCard: { ...cardFromDiscard, revealed: false, placedOnTurn: state.turn }, revealed: false };

    const discardWithoutTaken = state.discardPile.filter((c) => c.id !== selectedCards[0]);
    // A carta removida do slot alvo vai para o descarte (mesmo quando o alvo
    // é o campo do oponente) - a "Troca Predatória" consome a carta do
    // oponente, ela não volta para a mão dele, diferente da Substituição
    // Arcana do Mago.
    const { deck, discardPile } = pushToDiscard({ deck: state.deck, discardPile: discardWithoutTaken, gameConfig: state.gameConfig }, [card, oldCard]);

    const log = appendLog(
      state,
      state.log,
      'magic',
      `Jogador ${player} trocou carta do campo${targetPlayer !== player ? ` de Jogador ${targetPlayer}` : ''} por uma do descarte`,
      { player, cardValue: card.value, cardSuit: card.suit }
    );

    if (targetPlayer !== player) {
      return {
        ...state,
        deck,
        discardPile,
        log,
        [playerKey]: { ...playerState, hand: handWithoutMagic },
        [targetKey]: { ...targetState, field: newTargetField },
      };
    }

    return {
      ...state,
      deck,
      discardPile,
      log,
      [playerKey]: { ...playerState, hand: handWithoutMagic, field: newTargetField },
    };
  }

  // ----- Anjo Q: Visão Celestial -----
  if (character === 'anjo' && magicType === 'Q') {
    const opponentState = state[opponentKey];

    if (selectedCards?.[0]) {
      // FIX (pedido do usuário: "não permita que o jogador selecione
      // cartas... que já estão reveladas") - revelar uma carta já revelada
      // não faz nada de útil. Diferente do Mago J, o Anjo Q não tem um
      // efeito alternativo para esse caso - só rejeita a ativação.
      const targetHandCard = opponentState.hand.find((c) => c.id === selectedCards[0]);
      // Glacial (personagem novo) - carta congelada nunca revela, mesma
      // rejeição silenciosa de uma carta já revelada.
      if (!targetHandCard || targetHandCard.revealed || hasStatus(targetHandCard, 'frozen')) return state;

      // FIX (pedido do usuário: "a rainha do anjo agora impede a ativação de
      // um efeito caso a carta revelada por ela seja uma carta mágica até o
      // fim do turno") - aplica o StatusEffect 'magicLocked' quando a carta
      // revelada é J/Q/K (ver guarda de topo em handleExecuteMagic e o tick
      // em resetForNewTurn).
      // FIX (pedido do usuário: "as correntes do anjo também devem proibir a
      // utilização/posicionamento da carta monstro do oponente") - a carta
      // Monstro (isMonster) entra na mesma trava - ver os guards de
      // 'magicLocked' em handlePlayCard/handlePlaceMonsterCard.
      const isLockableValue = targetHandCard.value === 'J' || targetHandCard.value === 'Q' || targetHandCard.value === 'K' || Boolean(targetHandCard.isMonster);
      const newOpponentHand = opponentState.hand.map((c) => {
        if (c.id !== selectedCards[0]) return c;
        const revealedCard = { ...c, revealed: true };
        return isLockableValue
          ? applyStatus(revealedCard, { kind: 'magicLocked', source: 'anjo', label: 'Visão Celestial', duration: { type: 'untilPhase', phase: 'draw' } })
          : revealedCard;
      });
      const { deck, discardPile } = pushToDiscard(state, [card]);
      const log = appendLog(
        state,
        state.log,
        'magic',
        `Jogador ${player} revelou uma carta da mão de Jogador ${opponent}${isLockableValue ? ' (trancada até o fim do turno)' : ''}`,
        { player, cardValue: card.value, cardSuit: card.suit }
      );
      return {
        ...state,
        deck,
        discardPile,
        log,
        [playerKey]: { ...playerState, hand: handWithoutMagic },
        [opponentKey]: { ...opponentState, hand: newOpponentHand },
      };
    }

    if (selectedSlot !== undefined) {
      const targetSlot = opponentState.field[selectedSlot];
      if (!targetSlot.faceDownCard) return state;
      // FIX (pedido do usuário): mesma proteção contra revelar um slot que
      // já está revelado. Glacial (personagem novo): mesma rejeição
      // silenciosa se a carta estiver congelada.
      if (targetSlot.revealed || hasStatus(targetSlot.faceDownCard, 'frozen')) return state;
      if (isSlotProtected(state, opponent, selectedSlot)) {
        return { ...state, log: appendLog(state, state.log, 'warning', `Esse slot está protegido por Proteção Divina!`, { animationPolicy: 'suppress' }) };
      }
      // Coringa (novo, pedido do usuário) - Valete-armadilha funciona como
      // escudo pra carta que está montado em cima (ver tryCoringaJShieldBlock)
      // - bloqueia a revelação da Visão Celestial por completo se o alvo tiver um.
      const jShieldResult = tryCoringaJShieldBlock(state, opponent, targetSlot.faceDownCard.id);
      if (jShieldResult) return jShieldResult;

      // FIX (pedido do usuário: "as correntes do anjo também devem proibir a
      // utilização/posicionamento da carta monstro do oponente") - ver
      // comentário completo no branch 'selectedCards' logo acima.
      const isLockableValue =
        targetSlot.faceDownCard.value === 'J' || targetSlot.faceDownCard.value === 'Q' || targetSlot.faceDownCard.value === 'K' || Boolean(targetSlot.faceDownCard.isMonster);
      const revealedFieldCard = { ...targetSlot.faceDownCard, revealed: true };
      const newField = [...opponentState.field] as [FieldSlot, FieldSlot, FieldSlot];
      newField[selectedSlot] = {
        ...newField[selectedSlot],
        revealed: true,
        faceDownCard: isLockableValue
          ? applyStatus(revealedFieldCard, { kind: 'magicLocked', source: 'anjo', label: 'Visão Celestial', duration: { type: 'untilPhase', phase: 'draw' } })
          : revealedFieldCard,
      };

      const { deck, discardPile } = pushToDiscard(state, [card]);
      const log = appendLog(
        state,
        state.log,
        'magic',
        `Jogador ${player} revelou carta do campo de Jogador ${opponent}${isLockableValue ? ' (trancada até o fim do turno)' : ''}`,
        { player, cardValue: card.value, cardSuit: card.suit }
      );
      const resultState: GameState = {
        ...state,
        deck,
        discardPile,
        log,
        [playerKey]: { ...playerState, hand: handWithoutMagic },
        [opponentKey]: { ...opponentState, field: newField },
      };
      // Coringa (redesenho completo) - armadilhas de campo (J/Q/K/Monstro)
      // reagem quando alvejadas por um efeito do OPONENTE na Estratégia -
      // ver comentário completo em resolveCoringaTrapTargeting.
      return resolveCoringaTrapTargeting(resultState, opponent, [targetSlot.faceDownCard.id]);
    }

    return state;
  }

  // ----- Mago K: Destruição de Reforço -----
  if (character === 'mago' && magicType === 'K') {
    if (selectedSlot === undefined) return state;
    const opponentState = state[opponentKey];
    const targetSlot = opponentState.field[selectedSlot];
    // FIX: um slot agora pode ter até 2 cartas horizontais empilhadas (Reforço
    // Angelical do Anjo) - a magia destrói a pilha INTEIRA de reforços daquele
    // slot de uma vez (todas ainda não batalhadas), não só a primeira carta.
    const horizontalCards = targetSlot.horizontalCards;
    const hasUnbattledHorizontal = horizontalCards.length > 0 && horizontalCards.every((c) => !c.battled);
    // FIX (pedido do usuário: "permita que o mago possa destruir marcadores
    // em sua magia do rei") - "Destruição de Reforço" agora também mira
    // qualquer StatusEffect `kind: 'combatModifier'` (Fúria Selvagem da
    // Besta, Tiro Certeiro do Mosqueteiro) ainda ativo sobre uma carta AINDA
    // NÃO batalhada deste slot (principal ou horizontal) - um marcador é tão
    // "reforço" quanto uma carta horizontal empilhada, e a magia já existe
    // pra neutralizar exatamente esse tipo de ameaça antes da disputa.
    const unbattledCards: Card[] = [];
    if (targetSlot.faceDownCard && !targetSlot.faceDownCard.battled) unbattledCards.push(targetSlot.faceDownCard);
    horizontalCards.filter((c) => !c.battled).forEach((c) => unbattledCards.push(c));
    const hasDestroyableModifier = unbattledCards.some((c) => hasStatus(c, 'combatModifier'));
    if (!hasUnbattledHorizontal && !hasDestroyableModifier) return state;
    if (isSlotProtected(state, opponent, selectedSlot)) {
      return { ...state, log: appendLog(state, state.log, 'warning', `Esse slot está protegido por Proteção Divina!`, { animationPolicy: 'suppress' }) };
    }

    const newField = [...opponentState.field] as [FieldSlot, FieldSlot, FieldSlot];
    newField[selectedSlot] = {
      ...newField[selectedSlot],
      ...(hasUnbattledHorizontal
        ? { horizontalCards: [] }
        : hasDestroyableModifier
        ? { horizontalCards: newField[selectedSlot].horizontalCards.map((c) => (!c.battled ? removeStatus(c, 'combatModifier') : c)) }
        : {}),
      ...(hasDestroyableModifier && targetSlot.faceDownCard && !targetSlot.faceDownCard.battled
        ? { faceDownCard: removeStatus(newField[selectedSlot].faceDownCard!, 'combatModifier') }
        : {}),
    };

    const { deck, discardPile } = pushToDiscard(state, hasUnbattledHorizontal ? [card, ...horizontalCards] : [card]);
    const destroyedParts = [
      ...(hasUnbattledHorizontal ? [horizontalCards.length > 1 ? 'as cartas horizontais' : 'a carta horizontal'] : []),
      ...(hasDestroyableModifier ? ['o(s) marcador(es) de reforço'] : []),
    ];
    const log = appendLog(
      state,
      state.log,
      'magic',
      `Jogador ${player} destruiu ${destroyedParts.join(' e ')} de Jogador ${opponent}`,
      { player, cardValue: card.value, cardSuit: card.suit }
    );

    return {
      ...state,
      deck,
      discardPile,
      log,
      [playerKey]: { ...playerState, hand: handWithoutMagic },
      [opponentKey]: { ...opponentState, field: newField },
    };
  }

  // ----- Besta K: Roubo Brutal -----
  if (character === 'besta' && magicType === 'K') {
    if (selectedSlot === undefined || selectedTargetSlot === undefined) return state;
    const opponentState = state[opponentKey];

    const newPlayerField = [...playerState.field] as [FieldSlot, FieldSlot, FieldSlot];
    const newOpponentField = [...opponentState.field] as [FieldSlot, FieldSlot, FieldSlot];

    const playerCard = newPlayerField[selectedSlot].faceDownCard;
    const opponentCard = newOpponentField[selectedTargetSlot].faceDownCard;
    // FIX: a troca só vale "antes de virar" - ambas as cartas precisam estar não-reveladas.
    if (!playerCard || !opponentCard) return state;
    if (newPlayerField[selectedSlot].revealed || newOpponentField[selectedTargetSlot].revealed) return state;
    // FIX (auditoria "personagem por personagem", pedido do usuário): faltava
    // a mesma checagem de congelado que toda outra magia com alvo já tem -
    // sem isso, o Roubo Brutal trocava uma carta congelada do Glacial pro
    // campo do oponente livremente, "escapando" do congelamento.
    if (hasStatus(playerCard, 'frozen') || hasStatus(opponentCard, 'frozen')) return state;
    if (isSlotProtected(state, opponent, selectedTargetSlot)) {
      return { ...state, log: appendLog(state, state.log, 'warning', `Esse slot está protegido por Proteção Divina!`, { animationPolicy: 'suppress' }) };
    }

    newPlayerField[selectedSlot] = { ...newPlayerField[selectedSlot], faceDownCard: opponentCard };
    newOpponentField[selectedTargetSlot] = { ...newOpponentField[selectedTargetSlot], faceDownCard: playerCard };

    const { deck, discardPile } = pushToDiscard(state, [card]);
    const log = appendLog(state, state.log, 'magic', `Jogador ${player} trocou carta com Jogador ${opponent}`, { player, cardValue: card.value, cardSuit: card.suit });

    return {
      ...state,
      deck,
      discardPile,
      log,
      [playerKey]: { ...playerState, hand: handWithoutMagic, field: newPlayerField },
      [opponentKey]: { ...opponentState, field: newOpponentField },
    };
  }

  // ----- Mosqueteiro J: Tiro de Cobertura -----
  // Personagem novo, foco em descarte (pedido do usuário). Descarta a
  // própria carta + 1 carta extra escolhida (da mão própria, ou da mão do
  // OPONENTE às cegas por posição se a Recarga Rápida/Monstro estiver
  // ativa) e concede +1 ao limite de cartas horizontais deste turno - mesmo
  // mecanismo de `horizontalStackBonus` do Reforço Angelical do Anjo, só
  // que pago com um descarte em vez de ser de graça.
  if (character === 'mosqueteiro' && magicType === 'J') {
    const targetId = selectedCards?.[0];
    if (!targetId) return state;
    const redirecting = hasStatus(playerState, 'redirectNextDiscard');
    const opponentState = state[opponentKey];

    const targetCard = redirecting
      ? opponentState.hand.find((c) => c.id === targetId)
      : playerState.hand.find((c) => c.id === targetId && c.id !== cardId);
    if (!targetCard) return state;

    const newOwnHand = redirecting ? handWithoutMagic : handWithoutMagic.filter((c) => c.id !== targetId);
    const newOpponentHand = redirecting ? opponentState.hand.filter((c) => c.id !== targetId) : opponentState.hand;

    const { deck, discardPile } = pushToDiscard(state, [card, targetCard]);
    const log = appendLog(
      state,
      state.log,
      'magic',
      redirecting
        ? `Jogador ${player} ativou Tiro de Cobertura - Jogador ${opponent} descartou ${targetCard.value}${targetCard.suit} às cegas`
        : `Jogador ${player} descartou ${targetCard.value}${targetCard.suit} para posicionar uma carta horizontal a mais neste turno`,
      { player, cardValue: card.value, cardSuit: card.suit }
    );

    return {
      ...state,
      deck,
      discardPile,
      log,
      [playerKey]: removeStatus(
        {
          ...playerState,
          hand: newOwnHand,
          horizontalStackBonus: playerState.horizontalStackBonus + 1,
          mosqueteiroDiscardsThisTurn: playerState.mosqueteiroDiscardsThisTurn + 1,
        },
        'redirectNextDiscard'
      ),
      [opponentKey]: { ...opponentState, hand: newOpponentHand },
    };
  }

  // ----- Mosqueteiro Q: Rajada Reveladora -----
  // Descarta até 3 cartas extras (mesma fonte "própria ou do oponente às
  // cegas" do Valete acima) e revela essa mesma quantidade de cartas ainda
  // ocultas do oponente (mão OU campo, também escolhidas às cegas por
  // posição - ver selectedRevealCardIds em MagicSelection).
  if (character === 'mosqueteiro' && magicType === 'Q') {
    const discardIds = (selectedCards ?? []).slice(0, 3);
    if (discardIds.length === 0) return state;
    const redirecting = hasStatus(playerState, 'redirectNextDiscard');
    const opponentState = state[opponentKey];

    const discardSourceHand = redirecting ? opponentState.hand : playerState.hand.filter((c) => c.id !== cardId);
    const discardedCards = discardIds
      .map((id) => discardSourceHand.find((c) => c.id === id))
      .filter((c): c is Card => Boolean(c));
    if (discardedCards.length === 0) return state;

    const discardedIdSet = new Set(discardedCards.map((c) => c.id));
    const newOwnHand = redirecting ? handWithoutMagic : handWithoutMagic.filter((c) => !discardedIdSet.has(c.id));
    const opponentHandAfterDiscard = redirecting
      ? opponentState.hand.filter((c) => !discardedIdSet.has(c.id))
      : opponentState.hand;

    // Revela até `discardedCards.length` cartas ocultas do oponente (mão OU
    // campo) - o número de alvos escolhidos pode ser menor (poucas cartas
    // ocultas disponíveis), nunca maior.
    const revealIds = new Set((selectedRevealCardIds ?? []).slice(0, discardedCards.length));
    // Coringa (novo, pedido do usuário) - Valete-armadilha funciona como
    // escudo pra carta que está montado em cima (ver tryCoringaJShieldBlock):
    // essa revelação é em LOTE (várias cartas de uma vez), então antes de
    // revelar qualquer coisa, separa quais alvos são a carta PRINCIPAL de um
    // slot com um Valete cru ainda montado nela - essas NUNCA são reveladas
    // aqui (o escudo bloqueia por completo), e reagem à parte, depois do
    // resto do lote ser resolvido normalmente (`shieldedRevealIds` abaixo).
    const shieldedRevealIds = new Set(
      [...revealIds].filter((id) =>
        opponentState.field.some(
          (slot) => slot.faceDownCard?.id === id && slot.horizontalCards.some((c) => c.value === 'J' && isCoringaRawTrapCard(state, opponent, c))
        )
      )
    );
    const nonShieldedRevealIds = new Set([...revealIds].filter((id) => !shieldedRevealIds.has(id)));
    // Glacial (personagem novo): `revealCard` já no-opa em cima de uma carta
    // congelada (nunca revela) - como esta revelação é "às cegas por
    // posição", não faz sentido rejeitar a magia inteira só porque um dos
    // alvos sorteados calhou de estar congelado, o resto do efeito continua.
    const newOpponentHand = opponentHandAfterDiscard.map((c) => (nonShieldedRevealIds.has(c.id) ? revealCard(c) : c));
    const newOpponentField = opponentState.field.map((slot) => {
      let newSlot = slot;
      if (slot.faceDownCard && nonShieldedRevealIds.has(slot.faceDownCard.id)) {
        // FIX (bug real achado por auditoria): `revealCard` já no-opa numa
        // carta congelada (devolve ela intocada, `revealed` continua false) -
        // mas isto marcava `slot.revealed = true` de qualquer jeito, mesmo
        // quando a carta por baixo continuou oculta. Como vários lugares do
        // jogo confiam em `slot.revealed` pra decidir se PODEM mostrar o
        // valor real (ex.: o diálogo de Descongelar, `canSeeValue`), isso
        // vazava a existência de um valor "público" que na verdade nunca foi
        // revelado - `slot.revealed` agora reflete o resultado de verdade.
        const revealedCard = revealCard(slot.faceDownCard);
        newSlot = { ...newSlot, faceDownCard: revealedCard, revealed: revealedCard.revealed === true };
      }
      if (slot.horizontalCards.some((h) => revealIds.has(h.id))) {
        newSlot = { ...newSlot, horizontalCards: newSlot.horizontalCards.map((h) => (revealIds.has(h.id) ? revealCard(h) : h)) };
      }
      return newSlot;
    }) as [FieldSlot, FieldSlot, FieldSlot];

    const { deck, discardPile } = pushToDiscard(state, [card, ...discardedCards]);
    let log = appendLog(
      state,
      state.log,
      'magic',
      redirecting
        ? `Jogador ${player} ativou Rajada Reveladora - Jogador ${opponent} descartou ${discardedCards.length} carta(s) às cegas`
        : `Jogador ${player} descartou ${discardedCards.length} carta(s) com Rajada Reveladora`,
      { player, cardValue: card.value, cardSuit: card.suit }
    );
    if (nonShieldedRevealIds.size > 0) {
      log = appendLog(state, log, 'magic', `${nonShieldedRevealIds.size} carta(s) de Jogador ${opponent} foram reveladas`, { player });
    }

    const resultState: GameState = {
      ...state,
      deck,
      discardPile,
      log,
      [playerKey]: removeStatus(
        {
          ...playerState,
          hand: newOwnHand,
          mosqueteiroDiscardsThisTurn: playerState.mosqueteiroDiscardsThisTurn + discardedCards.length,
        },
        'redirectNextDiscard'
      ),
      [opponentKey]: { ...opponentState, hand: newOpponentHand, field: newOpponentField },
    };
    // Coringa (redesenho completo) - armadilhas de campo reagem quando
    // alvejadas por um efeito do OPONENTE na Estratégia - ver comentário
    // completo em resolveCoringaTrapTargeting. `revealIds` mira mão E campo
    // às cegas, mas só o subconjunto que era mesmo carta de CAMPO conta
    // (mão nunca é "armadilha" de verdade - ver comentário da função).
    const fieldRevealIds = fieldCards(opponentState.field)
      .map((c) => c.id)
      .filter((id) => revealIds.has(id));
    let finalState = resolveCoringaTrapTargeting(resultState, opponent, fieldRevealIds);
    // Coringa (novo, pedido do usuário) - reage o escudo do Valete pra cada
    // alvo separado acima em `shieldedRevealIds` (revelação em lote - cada
    // um reage à parte, depois do resto do lote já ter sido resolvido).
    for (const shieldedId of shieldedRevealIds) {
      const shieldResult = tryCoringaJShieldBlock(finalState, opponent, shieldedId);
      if (shieldResult) finalState = shieldResult;
    }
    return finalState;
  }

  // ----- Mosqueteiro K: Tiro Certeiro -----
  // Fase de COMBATE (como Mago K/Besta K - ver MAGIC_CARDS).
  //
  // MUDANÇA DE PLANOS (pedido explícito do usuário): antes reforçava uma
  // carta do PRÓPRIO campo em +N; agora enfraquece uma carta do campo do
  // OPONENTE em -N - mesmo padrão de Urtiga do Druida (ver bloco logo
  // abaixo), inclusive a mesma checagem de Proteção Divina do Anjo (nunca
  // existia antes, já que mirar o próprio campo nunca precisou disso). N é
  // `mosqueteiroDiscardsThisTurn + mosqueteiroDiscardsTurnMinus1` NO
  // INSTANTE da ativação (quantas cartas as magias do Mosqueteiro
  // descartaram NESTE turno E no ANTERIOR) - lido e congelado aqui num
  // StatusEffect `kind: 'combatModifier'` (ver statusEffects.ts), aplicado
  // de verdade na resolução de combate (ver handleResolveCombat). Só os 2
  // turnos mais recentes contam aqui - a janela de 3 turnos (T-2 incluso) é
  // só da Magia Numeral, ver handleFinalizeNumeralSpell.
  if (character === 'mosqueteiro' && magicType === 'K') {
    const targetId = selectedCards?.[0];
    if (!targetId) return state;
    const opponentState = state[opponentKey];
    const targetSlotIndex = opponentState.field.findIndex((s) => s.faceDownCard?.id === targetId || s.horizontalCards.some((c) => c.id === targetId));
    if (targetSlotIndex === -1) return state;
    if (isSlotProtected(state, opponent, targetSlotIndex)) {
      return { ...state, log: appendLog(state, state.log, 'warning', `Esse slot está protegido por Proteção Divina!`, { animationPolicy: 'suppress' }) };
    }
    const targetSlot = opponentState.field[targetSlotIndex];
    const targetCard = targetSlot.faceDownCard?.id === targetId ? targetSlot.faceDownCard : targetSlot.horizontalCards.find((c) => c.id === targetId);
    // FIX (checagem extensa por bugs - interação Piromante x Mosqueteiro):
    // Tiro Certeiro foi desenhado pra mirar uma carta numeral de verdade no
    // combate - uma carta-token de Bola de Fogo (`isFireToken`) nunca
    // deveria ser um alvo válido (cosmético, mas inconsistente com a
    // identidade visual/temática do efeito).
    if (!targetCard || targetCard.isFireToken) return state;

    const boostAmount = playerState.mosqueteiroDiscardsThisTurn + playerState.mosqueteiroDiscardsTurnMinus1;
    // FIX (pedido do usuário: "múltiplos usos da magia devem adicionar valor
    // no mesmo marcador já posicionado"): antes, QUALQUER ativação removia o
    // único marcador 'mosqueteiro' existente (não importa a carta) e criava
    // um novo do zero com o `boostAmount` recém-calculado - reativar sobre a
    // MESMA carta não acumulava nada (só recomputava o mesmo valor), e
    // reativar sobre outra carta simplesmente MOVIA o bônus, nunca somava.
    // Agora o StatusEffect é procurado por carta (`applyStatus` com merge
    // customizado): reativar sobre a carta já marcada SOMA (nesse sentido,
    // aprofunda) o valor existente; mirar uma carta diferente cria um
    // marcador independente, permitindo vários "Tiro Certeiro" simultâneos
    // em cartas diferentes do campo do oponente.
    const markedCard = applyTimedCombatModifier(
      targetCard,
      { kind: 'combatModifier', source: 'mosqueteiro', label: 'Tiro Certeiro', mode: 'add', magnitude: -boostAmount, duration: { type: 'untilPhase', phase: 'draw' } },
      { turn: state.turn, phase: state.phase },
      (existing, incoming) => ({ ...incoming, magnitude: (existing.magnitude ?? 0) + (incoming.magnitude ?? 0) }),
      { isOwnBuff: false } // Sempre mira o campo do OPONENTE (debuff, nunca bloqueado por congelamento mesmo assim).
    );
    const newAmount = getStatusMagnitude(markedCard, 'combatModifier', { source: 'mosqueteiro' });
    const newField = [...opponentState.field] as [FieldSlot, FieldSlot, FieldSlot];
    newField[targetSlotIndex] =
      targetSlot.faceDownCard?.id === targetId
        ? { ...targetSlot, faceDownCard: markedCard }
        : { ...targetSlot, horizontalCards: targetSlot.horizontalCards.map((c) => (c.id === targetId ? markedCard : c)) };

    const { deck, discardPile } = pushToDiscard(state, [card]);
    // FIX (mesma classe de bug do Glacial: "o jogo esta notificando qual
    // carta o glacial esta congelando mesmo ela estando oculta" - auditoria
    // encontrou o mesmo vazamento aqui, Tiro Certeiro nunca revela o alvo):
    // só mostra valor/naipe se a carta já estiver revelada.
    const targetDescription = targetCard.revealed ? `${targetCard.value}${targetCard.suit}` : 'uma carta oculta';
    const log = appendLog(
      state,
      state.log,
      'magic',
      `Jogador ${player} ativou Tiro Certeiro e enfraqueceu ${targetDescription} de Jogador ${opponent} em -${boostAmount} de valor no combate (total: ${newAmount})`,
      { player, cardValue: card.value, cardSuit: card.suit }
    );

    return {
      ...state,
      deck,
      discardPile,
      log,
      [playerKey]: { ...playerState, hand: handWithoutMagic },
      [opponentKey]: { ...opponentState, field: newField },
    };
  }

  // ----- Piromante J: Combustão -----
  // Fase de COMPRA. `selection.fireballLaunch` decide qual dos 2 caminhos:
  // lançar a Bola de Fogo já acumulada (ver executeFireballLaunch), ou o
  // efeito próprio (junta cartas <5 da mão como combustível).
  if (character === 'piromante' && magicType === 'J') {
    if (selection.fireballLaunch) {
      const { deck, discardPile } = pushToDiscard(state, [card]);
      const midState: GameState = { ...state, deck, discardPile, [playerKey]: { ...playerState, hand: handWithoutMagic } };
      return executeFireballLaunch(midState, player, selectedTargetSlot);
    }
    // O efeito PRÓPRIO continua sendo de Compra - a janela extra que a carta
    // ganha no Combate (ver canActivateMagic) existe só pra lançar a Bola de
    // Fogo, nunca pra queimar combustível fora da hora.
    if (state.phase !== 'draw') return state;
    const cap = getFireballCap(state.gameConfig);
    // DECISÃO DE DESIGN (pedido explícito do usuário, não um bug pra
    // corrigir): o combustível ganho aqui usa `getEffectiveCardValue`
    // (valor cru), de propósito NUNCA `getSpotlightAdjustedValue` como o
    // resto do jogo (combate, Magia Numeral, Torres) - deixar o Spotlight
    // multiplicar o ganho de combustível (x3 num número positivo) deixaria a
    // Bola de Fogo forte demais. Mesma decisão vale para Roubo Flamejante
    // (Q) e Queima do Reforço (K) logo abaixo.
    const fuelCards = handWithoutMagic.filter((c) => isPlainNumeralCard(c) && getEffectiveCardValue(c) < 5);
    const fuelSum = fuelCards.reduce((sum, c) => sum + getEffectiveCardValue(c), 0);
    const fuelIds = new Set(fuelCards.map((c) => c.id));
    const newHand = handWithoutMagic.filter((c) => !fuelIds.has(c.id));
    const { deck, discardPile } = pushToDiscard(state, [card, ...fuelCards]);
    const newFireball = Math.min(cap, playerState.fireballValue + fuelSum);
    const log =
      fuelCards.length > 0
        ? appendLog(
            state,
            state.log,
            'magic',
            `Jogador ${player} queimou ${fuelCards.length} carta(s) da mão e somou ${fuelSum} à Bola de Fogo (agora ${newFireball})`,
            { player, cardValue: card.value, cardSuit: card.suit }
          )
        : appendLog(state, state.log, 'magic', `Jogador ${player} não tinha cartas pequenas na mão pra queimar`, { player, cardValue: card.value, cardSuit: card.suit });
    return { ...state, deck, discardPile, log, [playerKey]: { ...playerState, hand: newHand, fireballValue: newFireball } };
  }

  // ----- Piromante Q: Roubo Flamejante -----
  // Fase de ESTRATÉGIA. Efeito próprio: queima uma carta REVELADA do
  // oponente (mão, ou horizontal no campo) valendo 2-10. FIX (simplificação
  // consciente por escopo/tempo): não aceita a carta PRINCIPAL de um slot
  // (nem torre) como alvo aqui - remover ela exigiria promover a reserva de
  // torre pro novo topo (mesma lógica de handleResolveCombat), fora do
  // escopo desta primeira versão. Mão e horizontais já cobrem a maior parte
  // dos casos de uso reais.
  if (character === 'piromante' && magicType === 'Q') {
    if (selection.fireballLaunch) {
      const { deck, discardPile } = pushToDiscard(state, [card]);
      const midState: GameState = { ...state, deck, discardPile, [playerKey]: { ...playerState, hand: handWithoutMagic } };
      return executeFireballLaunch(midState, player, selectedTargetSlot);
    }
    // FIX (pedido do usuário: "troque a fase da rainha do piromante de
    // estratégia para compra") - o efeito próprio agora é de Compra (ver
    // magicCards.ts, `phase: 'draw'`); a janela extra no Combate (ver
    // canActivateMagic) só serve pra lançar a Bola de Fogo.
    if (state.phase !== 'draw') return state;
    const targetId = selectedCards?.[0];
    if (!targetId) return state;
    const opponentState = state[opponentKey];
    const handTarget = opponentState.hand.find((c) => c.id === targetId);
    const horizTarget = opponentState.field.flatMap((slot) => slot.horizontalCards).find((c) => c.id === targetId);
    const targetCard = handTarget ?? horizTarget;
    if (!targetCard || !targetCard.revealed) return state;
    // DECISÃO DE DESIGN (não um bug): mesmo motivo do Valete acima - valor
    // cru de propósito, Spotlight nunca multiplica combustível.
    const value = getEffectiveCardValue(targetCard);
    if (value < 2 || value > 10) return state;
    if (horizTarget && isSlotProtected(state, opponent, 0)) return state;

    const newOpponentHand = opponentState.hand.filter((c) => c.id !== targetId);
    const newOpponentField = opponentState.field.map((slot) => ({
      ...slot,
      horizontalCards: slot.horizontalCards.filter((c) => c.id !== targetId),
    })) as [FieldSlot, FieldSlot, FieldSlot];

    const cap = getFireballCap(state.gameConfig);
    const newFireball = Math.min(cap, playerState.fireballValue + value);
    const { deck, discardPile } = pushToDiscard(state, [card, targetCard]);
    const log = appendLog(
      state,
      state.log,
      'magic',
      `Jogador ${player} queimou ${targetCard.value}${targetCard.suit} de Jogador ${opponent} e somou ${value} à Bola de Fogo (agora ${newFireball})`,
      { player, cardValue: card.value, cardSuit: card.suit }
    );
    return {
      ...state,
      deck,
      discardPile,
      log,
      [playerKey]: { ...playerState, hand: handWithoutMagic, fireballValue: newFireball },
      [opponentKey]: { ...opponentState, hand: newOpponentHand, field: newOpponentField },
    };
  }

  // ----- Piromante K: Queima do Reforço -----
  // Fase de COMBATE. Efeito próprio: queima uma carta horizontal do campo
  // do oponente (mesmo alvo do Rei do Mago - Destruição de Reforço - mas em
  // vez de só descartar, o valor dela vira combustível).
  if (character === 'piromante' && magicType === 'K') {
    if (selection.fireballLaunch) {
      const { deck, discardPile } = pushToDiscard(state, [card]);
      const midState: GameState = { ...state, deck, discardPile, [playerKey]: { ...playerState, hand: handWithoutMagic } };
      return executeFireballLaunch(midState, player, selectedTargetSlot);
    }
    const targetId = selectedCards?.[0];
    if (!targetId) return state;
    const opponentState = state[opponentKey];
    const targetSlotIndex = opponentState.field.findIndex((slot) => slot.horizontalCards.some((c) => c.id === targetId && !c.battled));
    if (targetSlotIndex === -1) return state;
    if (isSlotProtected(state, opponent, targetSlotIndex)) return state;
    const targetCard = opponentState.field[targetSlotIndex].horizontalCards.find((c) => c.id === targetId)!;

    // DECISÃO DE DESIGN (não um bug): mesmo motivo do Valete/Rainha acima -
    // valor cru de propósito, Spotlight nunca multiplica combustível.
    const value = getEffectiveCardValue(targetCard);
    const newOpponentField = opponentState.field.map((slot, i) =>
      i === targetSlotIndex ? { ...slot, horizontalCards: slot.horizontalCards.filter((c) => c.id !== targetId) } : slot
    ) as [FieldSlot, FieldSlot, FieldSlot];

    const cap = getFireballCap(state.gameConfig);
    const newFireball = Math.min(cap, playerState.fireballValue + value);
    const { deck, discardPile } = pushToDiscard(state, [card, targetCard]);
    const log = appendLog(
      state,
      state.log,
      'magic',
      `Jogador ${player} queimou uma horizontal de Jogador ${opponent} e somou ${value} à Bola de Fogo (agora ${newFireball})`,
      { player, cardValue: card.value, cardSuit: card.suit }
    );
    return {
      ...state,
      deck,
      discardPile,
      log,
      [playerKey]: { ...playerState, hand: handWithoutMagic, fireballValue: newFireball },
      [opponentKey]: { ...opponentState, field: newOpponentField },
    };
  }

  // ----- Druida Q: Simbiose -----
  // Fase de ESTRATÉGIA. FIX (pedido do usuário: "remova o segundo efeito de
  // aumentar em 2 - plantar a própria carta como Broto é que deve ser o
  // segundo efeito"): único efeito de ativação agora é reduzir o Broto pela
  // metade para adicionar um marcador de combate numa carta PRÓPRIA (vale a
  // metade reduzida + nível de Fotossíntese) - crescer o Broto sem sacrifício
  // virou plantar/empilhar a própria carta Q no campo em vez de ativá-la (ver
  // isDruidaBrotoCard mais abaixo). `canActivateMagic`/`getMagicActivationContext`
  // já garantem um Broto com valor >= 2 e um alvo de verdade antes de chegar
  // aqui, mas os `return state` abaixo continuam validando de novo - nunca
  // confiar só na UI.
  if (character === 'druida' && magicType === 'Q') {
    const brotoSlotIndex = playerState.field.findIndex(isBrotoSlot);
    if (brotoSlotIndex === -1) return state;
    const brotoSlot = playerState.field[brotoSlotIndex];
    const brotoTop = brotoSlot.faceDownCard!;
    const brotoValue = brotoTop.transformedValue ?? 1;
    const level = playerState.druidaPhotosynthesisLevel;

    const targetId = selectedCards?.[0];
    if (!targetId) return state;
    const targetMain = playerState.field.find((s) => s.faceDownCard?.id === targetId)?.faceDownCard;
    const targetHorizontal = playerState.field.flatMap((s) => s.horizontalCards).find((c) => c.id === targetId);
    const targetCard = targetMain ?? targetHorizontal;
    // O próprio Broto nunca pode ser o alvo do marcador (ele já É a fonte do
    // efeito) - sem esta exclusão, `combatModifiers` somaria um marcador em
    // cima do `transformedValue` que a própria redução acabou de definir.
    // FIX (auditoria "personagem por personagem", pedido do usuário): faltava
    // a mesma checagem de congelado que toda outra magia de Estratégia com
    // alvo já tem (Mago Q, Anjo Q, Besta Q, Glacial J/Q) - sem isso, Simbiose
    // marcava uma carta própria congelada pelo Glacial normalmente.
    if (!targetCard || targetCard.id === brotoTop.id || hasStatus(targetCard, 'frozen')) return state;

    const halved = Math.floor(brotoValue / 2);
    if (halved <= 0) return state; // Broto vale 1 (ou 0) - nada pra reduzir
    const markerAmount = halved + level;
    const markedCard = applyStatus(targetCard, {
      kind: 'combatModifier',
      source: 'druida',
      label: 'Simbiose',
      mode: 'add',
      magnitude: markerAmount,
      duration: { type: 'untilPhase', phase: 'draw' },
    });
    // O alvo nunca é a `faceDownCard` do slot do Broto (é sempre o próprio
    // `brotoTop`, já excluído acima) - só pode ser a carta principal de OUTRO
    // slot, ou uma horizontal empilhada em qualquer slot (inclusive o do
    // Broto). Por isso as duas mudanças (reduzir o Broto / marcar o alvo)
    // nunca competem pelo mesmo `faceDownCard`, mas podem cair no mesmo
    // índice de slot (horizontal sobre o próprio Broto).
    const targetSlotIndex = playerState.field.findIndex((s) => s.faceDownCard?.id === targetId || s.horizontalCards.some((c) => c.id === targetId));
    const newField = playerState.field.map((slot, i) => {
      const withBrotoReduced = i === brotoSlotIndex ? { ...slot, faceDownCard: { ...brotoTop, transformedValue: halved } } : slot;
      if (i !== targetSlotIndex) return withBrotoReduced;
      return slot.faceDownCard?.id === targetId
        ? { ...withBrotoReduced, faceDownCard: markedCard }
        : { ...withBrotoReduced, horizontalCards: slot.horizontalCards.map((c) => (c.id === targetId ? markedCard : c)) };
    }) as [FieldSlot, FieldSlot, FieldSlot];
    const { deck, discardPile } = pushToDiscard(state, [card]);
    // FIX (mesma classe de bug do Glacial - auditoria encontrou o mesmo
    // vazamento aqui, Simbiose nunca revela o alvo): só mostra valor/naipe
    // se a carta já estiver revelada.
    const targetDescription = targetCard.revealed ? `${targetCard.value}${targetCard.suit}` : 'uma carta oculta';
    const log = appendLog(
      state,
      state.log,
      'magic',
      `Jogador ${player} reduziu o Broto para ${halved} e marcou ${targetDescription} com +${markerAmount}`,
      { player, cardValue: card.value, cardSuit: card.suit }
    );
    return {
      ...state,
      deck,
      discardPile,
      log,
      [playerKey]: { ...playerState, hand: handWithoutMagic, field: newField },
    };
  }

  // ----- Druida K: Urtiga -----
  // Fase de COMBATE. FIX (pedido do usuário: mesma mudança de Simbiose acima
  // - único efeito de ativação agora é reduzir o Broto pela metade): o
  // marcador é NEGATIVO e mira uma carta do OPONENTE - primeira magia do
  // jogo a escrever um StatusEffect `kind: 'combatModifier'` no campo do
  // adversário (Besta/Mosqueteiro só se auto-buffam).
  if (character === 'druida' && magicType === 'K') {
    const brotoSlotIndex = playerState.field.findIndex(isBrotoSlot);
    if (brotoSlotIndex === -1) return state;
    const brotoSlot = playerState.field[brotoSlotIndex];
    const brotoTop = brotoSlot.faceDownCard!;
    const brotoValue = brotoTop.transformedValue ?? 1;
    const level = playerState.druidaPhotosynthesisLevel;

    const targetId = selectedCards?.[0];
    if (!targetId) return state;
    const opponentState = state[opponentKey];
    const targetSlotIndex = opponentState.field.findIndex((s) => s.faceDownCard?.id === targetId || s.horizontalCards.some((c) => c.id === targetId));
    if (targetSlotIndex === -1) return state;
    if (isSlotProtected(state, opponent, targetSlotIndex)) {
      return { ...state, log: appendLog(state, state.log, 'warning', `Esse slot está protegido por Proteção Divina!`, { animationPolicy: 'suppress' }) };
    }
    const targetSlot = opponentState.field[targetSlotIndex];
    const targetCard = targetSlot.faceDownCard?.id === targetId ? targetSlot.faceDownCard : targetSlot.horizontalCards.find((c) => c.id === targetId);
    // FIX (auditoria "personagem por personagem", pedido do usuário): faltava
    // a mesma checagem de congelado que toda outra magia com alvo já tem -
    // sem isso, a Urtiga marcava uma carta congelada do Glacial normalmente.
    if (!targetCard || hasStatus(targetCard, 'frozen')) return state;

    const halved = Math.floor(brotoValue / 2);
    if (halved <= 0) return state;
    const debuffAmount = halved + level;
    const newField = [...playerState.field] as [FieldSlot, FieldSlot, FieldSlot];
    newField[brotoSlotIndex] = { ...brotoSlot, faceDownCard: { ...brotoTop, transformedValue: halved } };
    const markedCard = applyStatus(targetCard, {
      kind: 'combatModifier',
      source: 'druida',
      label: 'Urtiga',
      mode: 'add',
      magnitude: -debuffAmount,
      duration: { type: 'untilPhase', phase: 'draw' },
    });
    const newOpponentField = [...opponentState.field] as [FieldSlot, FieldSlot, FieldSlot];
    newOpponentField[targetSlotIndex] =
      targetSlot.faceDownCard?.id === targetId
        ? { ...targetSlot, faceDownCard: markedCard }
        : { ...targetSlot, horizontalCards: targetSlot.horizontalCards.map((c) => (c.id === targetId ? markedCard : c)) };
    const { deck, discardPile } = pushToDiscard(state, [card]);
    // FIX (mesma classe de bug do Glacial - auditoria encontrou o mesmo
    // vazamento aqui, Urtiga nunca revela o alvo): só mostra valor/naipe se
    // a carta já estiver revelada.
    const targetDescription = targetCard.revealed ? `${targetCard.value}${targetCard.suit}` : 'uma carta oculta';
    const log = appendLog(
      state,
      state.log,
      'magic',
      `Jogador ${player} reduziu o Broto para ${halved} e enfraqueceu ${targetDescription} de Jogador ${opponent} em -${debuffAmount}`,
      { player, cardValue: card.value, cardSuit: card.suit }
    );
    return {
      ...state,
      deck,
      discardPile,
      log,
      [playerKey]: { ...playerState, hand: handWithoutMagic, field: newField },
      [opponentKey]: { ...opponentState, field: newOpponentField },
    };
  }

  // ----- Glacial J: Criogenar -----
  // Congela 1 carta - da mão ou do campo, de QUALQUER jogador (alvo omisso
  // na especificação = qualquer alvo possível). `selectedTargetPlayer`
  // decide de quem é o alvo (própria carta ou do oponente); `selectedCards`
  // mira a mão, `selectedSlot` mira o campo - mesmo par de campos que Anjo
  // Q/Mago Q já usam para esse tipo de escolha.
  if (character === 'glacial' && magicType === 'J') {
    const targetPlayer = selectedTargetPlayer ?? opponent;
    const targetKey = playerKeyOf(targetPlayer);

    // Acumula os dois PlayerState como Substituição Arcana do Mago faz -
    // `handOf`/`fieldOf` sempre leem o estado JÁ ACUMULADO, essencial quando
    // `targetKey === playerKey` (congelando a própria carta), senão a
    // segunda escrita sobrescreveria a primeira em vez de compor.
    let newPlayer1 = state.player1;
    let newPlayer2 = state.player2;
    const handOf = (key: PlayerKey) => (key === 'player1' ? newPlayer1.hand : newPlayer2.hand);
    const fieldOf = (key: PlayerKey) => (key === 'player1' ? newPlayer1.field : newPlayer2.field);
    const setHand = (key: PlayerKey, hand: Card[]) => {
      if (key === 'player1') newPlayer1 = { ...newPlayer1, hand };
      else newPlayer2 = { ...newPlayer2, hand };
    };
    const setField = (key: PlayerKey, field: [FieldSlot, FieldSlot, FieldSlot]) => {
      if (key === 'player1') newPlayer1 = { ...newPlayer1, field };
      else newPlayer2 = { ...newPlayer2, field };
    };

    let targetCard: Card | undefined;
    let targetedOnField = false;
    if (selectedCards?.[0]) {
      const targetId = selectedCards[0];
      // FIX (pedido do usuário: "não permita que o glacial consiga congelar
      // a própria carta sendo utilizada, isso faz apenas que a carta se
      // descarte") - só é possível quando `targetKey === playerKey` (mirando
      // a própria mão) e o alvo escolhido é o próprio J que está ativando
      // agora; mesmo guard que Crioescudo (K, Estratégia) já usa abaixo.
      if (targetId === cardId) return state;
      targetCard = handOf(targetKey).find((c) => c.id === targetId);
      if (!targetCard || hasStatus(targetCard, 'frozen')) return state;
      const frozenCard = applyStatus(targetCard, { kind: 'frozen', source: 'glacial', label: 'Criogenar', duration: { type: 'permanent' } });
      setHand(targetKey, handOf(targetKey).map((c) => (c.id === targetId ? frozenCard : c)));
    } else if (selectedSlot !== undefined) {
      const targetSlot = fieldOf(targetKey)[selectedSlot];
      targetCard = targetSlot.faceDownCard;
      if (!targetCard || hasStatus(targetCard, 'frozen')) return state;
      if (targetPlayer !== player && isSlotProtected(state, targetPlayer, selectedSlot)) {
        return { ...state, log: appendLog(state, state.log, 'warning', `Esse slot está protegido por Proteção Divina!`, { animationPolicy: 'suppress' }) };
      }
      // Coringa (novo, pedido do usuário) - Valete-armadilha funciona como
      // escudo pra carta que está montado em cima (ver tryCoringaJShieldBlock)
      // - bloqueia o Criogenar por completo se o alvo tiver um (a carta
      // congelante do Glacial nem chega a ser gasta, mesmo padrão de
      // "Esse slot está protegido" acima).
      const jShieldResult = tryCoringaJShieldBlock(state, targetPlayer, targetCard.id);
      if (jShieldResult) return jShieldResult;
      const frozenCard = applyStatus(targetCard, { kind: 'frozen', source: 'glacial', label: 'Criogenar', duration: { type: 'permanent' } });
      setField(targetKey, updateFieldSlot(fieldOf(targetKey), selectedSlot, { faceDownCard: frozenCard }));
      targetedOnField = true;
    } else {
      return state;
    }

    const { hand: consumedHand, cardToDiscard } = resolveGlacialCardConsumption({ ...playerState, hand: handOf(playerKey) }, card, cardId);
    setHand(playerKey, consumedHand);
    const { deck, discardPile } = pushToDiscard(state, cardToDiscard ? [cardToDiscard] : []);
    // FIX (pedido do usuário: "o jogo esta notificando qual carta o glacial
    // esta congelando mesmo ela estando oculta") - só mostra valor/naipe no
    // log quando a carta já está revelada (pra qualquer um ver); oculta
    // continua oculta mesmo no log do Criogenar.
    const targetDescription = targetCard.revealed ? `${targetCard.value}${targetCard.suit}` : 'uma carta oculta';
    const log = appendLog(
      state,
      state.log,
      'magic',
      `Jogador ${player} congelou ${targetDescription} de Jogador ${targetPlayer}`,
      { player, cardValue: card.value, cardSuit: card.suit }
    );
    const resultState: GameState = { ...state, deck, discardPile, log, player1: newPlayer1, player2: newPlayer2 };
    // Coringa (redesenho completo) - armadilhas de campo reagem quando
    // alvejadas por um efeito na Estratégia, mesmo sem revelar (ver
    // comentário completo em resolveCoringaTrapTargeting) - Criogenar pode
    // mirar uma carta de campo sem nunca revelá-la.
    return targetedOnField ? resolveCoringaTrapTargeting(resultState, targetPlayer, [targetCard.id]) : resultState;
  }

  // ----- Glacial Q: Crioespinho -----
  // Congela 1 carta NO CAMPO (de qualquer jogador) e aplica um marcador de
  // combate: +2 se for própria, -2 se for do oponente.
  if (character === 'glacial' && magicType === 'Q') {
    if (selectedSlot === undefined || !selectedCards?.[0]) return state;
    const targetPlayer = selectedTargetPlayer ?? player;
    const targetKey = playerKeyOf(targetPlayer);
    const targetState = state[targetKey];
    const targetId = selectedCards[0];
    const targetSlot = targetState.field[selectedSlot];
    const targetCard = targetSlot.faceDownCard?.id === targetId ? targetSlot.faceDownCard : targetSlot.horizontalCards.find((c) => c.id === targetId);
    if (!targetCard || hasStatus(targetCard, 'frozen')) return state;
    if (targetPlayer !== player && isSlotProtected(state, targetPlayer, selectedSlot)) {
      return { ...state, log: appendLog(state, state.log, 'warning', `Esse slot está protegido por Proteção Divina!`, { animationPolicy: 'suppress' }) };
    }
    // Coringa (novo, pedido do usuário) - Valete-armadilha funciona como
    // escudo pra carta que está montado em cima (ver tryCoringaJShieldBlock)
    // - só relevante quando o alvo é a carta PRINCIPAL do slot (mirar o
    // próprio Valete, uma horizontal, já reage normalmente por outro
    // caminho depois - ver resolveCoringaTrapTargeting mais abaixo).
    if (targetSlot.faceDownCard?.id === targetId) {
      const jShieldResult = tryCoringaJShieldBlock(state, targetPlayer, targetId);
      if (jShieldResult) return jShieldResult;
    }

    const isOwn = targetPlayer === player;
    const markedCard = applyStatus(
      applyStatus(targetCard, { kind: 'frozen', source: 'glacial', label: 'Crioespinho', duration: { type: 'permanent' } }),
      { kind: 'combatModifier', source: 'glacial', label: 'Crioespinho', mode: 'add', magnitude: isOwn ? 2 : -2, duration: { type: 'untilPhase', phase: 'draw' } }
    );
    const newTargetField = updateFieldSlot(targetState.field, selectedSlot, (s) =>
      s.faceDownCard?.id === targetId
        ? { faceDownCard: markedCard }
        : { horizontalCards: s.horizontalCards.map((c) => (c.id === targetId ? markedCard : c)) }
    );

    let newPlayer1 = state.player1;
    let newPlayer2 = state.player2;
    const applyToKey = (key: PlayerKey, patch: Partial<PlayerState>) => {
      if (key === 'player1') newPlayer1 = { ...newPlayer1, ...patch };
      else newPlayer2 = { ...newPlayer2, ...patch };
    };
    const { hand: consumedHand, cardToDiscard } = resolveGlacialCardConsumption(playerState, card, cardId);
    applyToKey(playerKey, { hand: consumedHand });
    applyToKey(targetKey, { field: newTargetField });
    const { deck, discardPile } = pushToDiscard(state, cardToDiscard ? [cardToDiscard] : []);
    // FIX (mesmo pedido do usuário do Criogenar acima): só mostra valor/naipe
    // quando a carta já está revelada.
    const targetDescription = targetCard.revealed ? `${targetCard.value}${targetCard.suit}` : 'uma carta oculta';
    const log = appendLog(
      state,
      state.log,
      'magic',
      `Jogador ${player} congelou ${targetDescription} de Jogador ${targetPlayer} e aplicou ${isOwn ? '+2' : '-2'} de marcador`,
      { player, cardValue: card.value, cardSuit: card.suit }
    );
    const resultState: GameState = { ...state, deck, discardPile, log, player1: newPlayer1, player2: newPlayer2 };
    // Coringa (redesenho completo) - armadilhas de campo reagem quando
    // alvejadas na Estratégia, mesmo sem revelar (ver resolveCoringaTrapTargeting)
    // - Crioespinho sempre mira o campo, nunca revela.
    return resolveCoringaTrapTargeting(resultState, targetPlayer, [targetCard.id]);
  }

  // ----- Glacial K: Crioescudo -----
  // Mudança de efeito pedida pelo usuário: a carta agora tem DOIS efeitos
  // independentes, um por fase - `state.phase` decide qual roda (canActivateMagic
  // já garante, via a janela extra na Estratégia, que só chega aqui numa
  // fase onde o efeito correspondente é mesmo ativável).
  if (character === 'glacial' && magicType === 'K') {
    if (state.phase === 'combat') {
      // Efeito de COMBATE (o original, agora também mirando o oponente):
      // sem seleção de alvo, soma +1 de marcador em TODAS as próprias cartas
      // já congeladas no campo E -1 em TODAS as já congeladas do campo do
      // OPONENTE, de uma vez.
      const opponentState = state[opponentKey];
      const ownFrozenCards = fieldCards(playerState.field).filter((c) => hasStatus(c, 'frozen'));
      const opponentFrozenCards = fieldCards(opponentState.field).filter((c) => hasStatus(c, 'frozen'));
      if (ownFrozenCards.length === 0 && opponentFrozenCards.length === 0) return state;

      const applyCrioescudoMarker = (field: [FieldSlot, FieldSlot, FieldSlot], magnitude: number, isOwnField: boolean): [FieldSlot, FieldSlot, FieldSlot] =>
        field.map((slot) => ({
          ...slot,
          faceDownCard:
            slot.faceDownCard && hasStatus(slot.faceDownCard, 'frozen')
              ? applyTimedCombatModifier(
                  slot.faceDownCard,
                  { kind: 'combatModifier', source: 'glacial', label: 'Crioescudo', mode: 'add', magnitude, duration: { type: 'untilPhase', phase: 'draw' } },
                  { turn: state.turn, phase: state.phase },
                  (existing, incoming) => ({ ...incoming, magnitude: (existing.magnitude ?? 0) + (incoming.magnitude ?? 0) }),
                  { isOwnBuff: isOwnField }
                )
              : slot.faceDownCard,
          horizontalCards: slot.horizontalCards.map((c) =>
            hasStatus(c, 'frozen')
              ? applyTimedCombatModifier(
                  c,
                  { kind: 'combatModifier', source: 'glacial', label: 'Crioescudo', mode: 'add', magnitude, duration: { type: 'untilPhase', phase: 'draw' } },
                  { turn: state.turn, phase: state.phase },
                  (existing, incoming) => ({ ...incoming, magnitude: (existing.magnitude ?? 0) + (incoming.magnitude ?? 0) }),
                  { isOwnBuff: isOwnField }
                )
              : c
          ),
        })) as [FieldSlot, FieldSlot, FieldSlot];

      // FIX (mecânica nova, "frozen destrói buff de outro jogador"): o +1
      // aqui é o próprio Glacial reforçando cartas que ELE MESMO congelou
      // (isOwnField: true, sempre aplicado) - o -1 no campo do oponente é um
      // debuff (nunca bloqueado por congelamento de qualquer forma), mas
      // marcado isOwnField: false por honestidade/consistência.
      const newField = applyCrioescudoMarker(playerState.field, 1, true);
      const newOpponentField = applyCrioescudoMarker(opponentState.field, -1, false);

      const { hand: consumedHand, cardToDiscard } = resolveGlacialCardConsumption(playerState, card, cardId);
      const { deck, discardPile } = pushToDiscard(state, cardToDiscard ? [cardToDiscard] : []);
      const parts = [
        ...(ownFrozenCards.length > 0 ? [`+1 em ${ownFrozenCards.length} carta(s) própria(s)`] : []),
        ...(opponentFrozenCards.length > 0 ? [`-1 em ${opponentFrozenCards.length} carta(s) de Jogador ${opponent}`] : []),
      ];
      const log = appendLog(
        state,
        state.log,
        'magic',
        `Jogador ${player} reforçou o Crioescudo: ${parts.join(' e ')} (congelada(s) no campo)`,
        { player, cardValue: card.value, cardSuit: card.suit }
      );
      return {
        ...state,
        deck,
        discardPile,
        log,
        [playerKey]: { ...playerState, hand: consumedHand, field: newField },
        [opponentKey]: { ...opponentState, field: newOpponentField },
      };
    }

    if (state.phase === 'strategy') {
      // NOVO efeito de ESTRATÉGIA (pedido do usuário: "permite você congelar
      // uma carta sua na mão ou campo") - sempre mira o PRÓPRIO jogador
      // (nunca o oponente, "uma carta SUA"), mesmo par de campos de seleção
      // que Criogenar (J) usa pro alvo (`selectedCards` mira a mão,
      // `selectedSlot` mira o campo), mas sem `selectedTargetPlayer` - não
      // há "de quem" pra escolher aqui.
      let targetCard: Card | undefined;
      let newHand = playerState.hand;
      let newField = playerState.field;
      if (selectedCards?.[0]) {
        const targetId = selectedCards[0];
        // Nunca a si mesma - congelar a própria carta que está sendo
        // ativada agora não faz sentido (ela seria descartada de qualquer
        // jeito ao final desta mesma ativação).
        if (targetId === cardId) return state;
        targetCard = playerState.hand.find((c) => c.id === targetId);
        if (!targetCard || hasStatus(targetCard, 'frozen')) return state;
        const frozenCard = applyStatus(targetCard, { kind: 'frozen', source: 'glacial', label: 'Crioescudo', duration: { type: 'permanent' } });
        newHand = playerState.hand.map((c) => (c.id === targetId ? frozenCard : c));
      } else if (selectedSlot !== undefined) {
        const targetSlot = playerState.field[selectedSlot];
        targetCard = targetSlot.faceDownCard;
        if (!targetCard || hasStatus(targetCard, 'frozen')) return state;
        const frozenCard = applyStatus(targetCard, { kind: 'frozen', source: 'glacial', label: 'Crioescudo', duration: { type: 'permanent' } });
        newField = updateFieldSlot(playerState.field, selectedSlot, { faceDownCard: frozenCard });
      } else {
        return state;
      }

      const { hand: consumedHand, cardToDiscard } = resolveGlacialCardConsumption({ ...playerState, hand: newHand }, card, cardId);
      const { deck, discardPile } = pushToDiscard(state, cardToDiscard ? [cardToDiscard] : []);
      // FIX (mesmo pedido do usuário do Criogenar/Crioespinho acima): mesmo
      // sendo a PRÓPRIA carta do Glacial, o log é visível pro oponente
      // também - só mostra valor/naipe se já estiver revelada.
      const targetDescription = targetCard.revealed ? `${targetCard.value}${targetCard.suit}` : 'uma carta oculta';
      const log = appendLog(
        state,
        state.log,
        'magic',
        `Jogador ${player} congelou a própria ${targetDescription} com o Crioescudo`,
        { player, cardValue: card.value, cardSuit: card.suit }
      );
      return { ...state, deck, discardPile, log, [playerKey]: { ...playerState, hand: consumedHand, field: newField } };
    }

    return state;
  }

  return state;
}
