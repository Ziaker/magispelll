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
      const log = appendLog(state, state.log, 'warning', `Nenhum Ás disponível pra comprar agora!`);
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
