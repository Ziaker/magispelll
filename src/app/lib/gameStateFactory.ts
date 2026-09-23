/**
 * gameStateFactory.ts - construção de estruturas-base do estado.
 *
 * Mantém defaults estruturais e a construção inicial da partida fora do reducer.
 * Não conhece IA nem UI; apenas compõe tipos, baralho, Spotlight e defaults de estado.
 */
import { drawCards, generateDeck, type Card } from './cardUtils';
import type { CharacterId } from './characterRegistry';
import type { GameConfig } from './gameConfig';
import { rollSpotlight } from './spotlight';
import type { FieldSlot, GameState, PlayerState } from './gameStateTypes';
// ============================================================================
// Helpers puros
// ============================================================================

export function emptyField(): [FieldSlot, FieldSlot, FieldSlot] {
  return [
    { revealed: false, horizontalCards: [] },
    { revealed: false, horizontalCards: [] },
    { revealed: false, horizontalCards: [] },
  ];
}

export function createPlayerState(hand: Card[], handLimit: number): PlayerState {
  return {
    hand,
    field: emptyField(),
    readyForNextPhase: false,
    lives: 3,
    combatWins: 0,
    handLimit,
    horizontalStackBonus: 0,
    permanentDrawBonus: 0,
    discardsThisTurn: 0,
    drawsThisTurn: 0,
    fusesThisTurn: 0,
    monsterCard: undefined,
    monsterTargetSlot: undefined,
    monsterProtectedSlots: [],
    mosqueteiroDiscardsThisTurn: 0,
    mosqueteiroDiscardsTurnMinus1: 0,
    mosqueteiroDiscardsTurnMinus2: 0,
    fireballValue: 0,
    druidaPhotosynthesisLevel: 0,
  };
}

export function createInitialState(
  player1Character: CharacterId,
  player2Character: CharacterId,
  gameConfig: GameConfig
): GameState {
  const deck = generateDeck(gameConfig.monsterCards, gameConfig.deckType === 'thematic', gameConfig.towersMode);
  // FIX (Modo Towers, pedido do usuário): "mão aumentada em 1" - a mão
  // inicial também acompanha o novo limite base (9 em vez de 8), não só o
  // teto pra compras futuras.
  const baseHandLimit = 8 + (gameConfig.towersMode ? 1 : 0);
  const { drawn: p1Hand, remaining: afterP1 } = drawCards(deck, baseHandLimit);
  const { drawn: p2Hand, remaining: afterP2 } = drawCards(afterP1, baseHandLimit);

  return {
    turn: 1,
    phase: 'draw',
    firstToFlip: 1,
    paused: false,
    player1: createPlayerState(p1Hand, baseHandLimit),
    player2: createPlayerState(p2Hand, baseHandLimit),
    player1Character,
    player2Character,
    gameConfig,
    deck: afterP2,
    discardPile: [],
    combatSelection: {},
    combatRoundsThisPhase: 0,
    activeNumeralSpells: {},
    combatResolution: null,
    numeralSpellPending: null,
    gameOver: null,
    spotlight: rollSpotlight(gameConfig),
    pendingReaction: null,
    reactionsUsedThisPhase: {},
    combatLoneTower: null,
    log: [
      { id: 0, turn: 1, phase: 'draw', type: 'system', player: null, text: 'Jogo iniciado' },
      { id: 1, turn: 1, phase: 'draw', type: 'phase', player: null, text: 'Turno 1 - Fase de Compra' },
    ],
  };
}
