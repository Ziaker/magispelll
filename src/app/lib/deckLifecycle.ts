/**
 * deckLifecycle.ts - operações puras de descarte e reembaralhamento.
 *
 * Centraliza conservação de cartas sintéticas e recuperação do baralho vazio
 * sem conhecer fases, personagens, UI, IA ou o reducer.
 */
import { expandSyntheticCard, reshuffleDiscardIntoDeck, resetCardsForDiscard, type Card } from './cardUtils';
import type { GameState } from './gameStateTypes';
/**
 * Move cartas para a pilha de descarte, sempre resetando seus campos
 * transitórios (ver resetCardForDiscard) e aplicando o "shuffle automático"
 * configurável: quando o descarte atinge 20+ cartas, metade delas volta
 * aleatoriamente para o baralho.
 *
 * Toda carta que passa por aqui primeiro é expandida via `expandSyntheticCard`
 * (cardUtils.ts) - uma carta-token de Bola de Fogo do Piromante (`vanish`)
 * some sem nunca entrar na pilha, e uma carta fundida (`decompose`, ver
 * fusion.ts) "desfaz" a fusão e devolve as cartas físicas originais que a
 * compuseram, em vez de entrar ela mesma - sem isso, a conservação total de
 * cartas do jogo (invariante fixo que todo o resto do motor assume)
 * quebraria a cada Bola de Fogo sem obliterar, ou cada fusão criaria uma
 * carta nova "do nada" fora da composição original do baralho. Ver
 * `SyntheticCardLifecycle` em cardUtils.ts - um personagem novo com uma
 * carta sintética própria só precisa marcar `synthetic` corretamente na
 * criação da carta pra herdar essa conservação de graça.
 *
 * FIX (achado montando fixtures da Fase 0.4/0.5 do overhaul de animações):
 * `reshuffled` no retorno sinaliza quando o shuffle automático (20+ cartas)
 * disparou aqui - antes o reembaralhamento acontecia silenciosamente (jogo
 * correto, mas SEM nenhum sinal estrutural pra UI saber). Todos os call
 * sites agora conferem isso e emitem 'deck-reshuffled' quando necessário.
 */
export function pushToDiscard(
  state: Pick<GameState, 'deck' | 'discardPile' | 'gameConfig'>,
  cards: Card[]
): { deck: Card[]; discardPile: Card[]; reshuffled: boolean } {
  if (cards.length === 0) return { deck: state.deck, discardPile: state.discardPile, reshuffled: false };

  let discardPile = [...state.discardPile, ...resetCardsForDiscard(cards.flatMap(expandSyntheticCard))];
  let deck = state.deck;
  let reshuffled = false;

  if (state.gameConfig.autoShuffle && discardPile.length >= 20) {
    const shuffledResult = reshuffleDiscardIntoDeck(deck, discardPile, 'half');
    deck = shuffledResult.deck;
    discardPile = shuffledResult.discardPile;
    reshuffled = true;
  }

  return { deck, discardPile, reshuffled };
}

/**
 * Garante que o baralho tenha cartas antes de uma compra. Se estiver vazio e
 * houver cartas no descarte, reembaralha TODO o descarte de volta - sem essa
 * rede de segurança, o baralho podia esgotar e o jogo travava (compra
 * simplesmente parava de trazer cartas, sem forma de continuar).
 */
export function ensureDeckHasCards(state: GameState): { deck: Card[]; discardPile: Card[]; reshuffled: boolean } {
  if (state.deck.length > 0 || state.discardPile.length === 0) {
    return { deck: state.deck, discardPile: state.discardPile, reshuffled: false };
  }
  const reshuffled = reshuffleDiscardIntoDeck(state.deck, state.discardPile, 'all');
  return { ...reshuffled, reshuffled: true };
}

/**
 * Como `ensureDeckHasCards`, mas garante um número MÍNIMO de cartas no
 * baralho (não só "não vazio") - usada pela Fúria Sanguinária da Besta
 * (item 16), que pode precisar comprar 7+ cartas de uma vez para o
 * oponente, mais do que o baralho sozinho costuma ter disponível.
 */
export function ensureDeckHasAtLeast(
  deckState: { deck: Card[]; discardPile: Card[]; gameConfig: GameState['gameConfig'] },
  needed: number
): { deck: Card[]; discardPile: Card[]; reshuffled: boolean } {
  if (deckState.deck.length >= needed || deckState.discardPile.length === 0) {
    return { deck: deckState.deck, discardPile: deckState.discardPile, reshuffled: false };
  }
  return { ...reshuffleDiscardIntoDeck(deckState.deck, deckState.discardPile, 'all'), reshuffled: true };
}
