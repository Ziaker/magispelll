/**
 * glacialHandlers.ts - transições de estado próprias do Glacial.
 *
 * Começa pela mecânica de descongelamento paga; magias continuam
 * separadas até que possam ser extraídas sem acoplamento ao reducer.
 */
import type { Card } from './cardUtils';
import { pushToDiscard } from './deckLifecycle';
import { updateFieldSlot } from './fieldOperations';
import { appendLog } from './gameLog';
import { playerKeyOf } from './gameSelectors';
import { hasStatus, removeStatus } from './statusEffects';
import type { FieldSlot, GameState, PlayerState } from './gameStateTypes';
import type { PlayerNumber } from './gameTypes';
/**
 * Glacial (personagem novo) - única via de remover o StatusEffect 'frozen'
 * de uma carta: descarta `paymentCardId` (qualquer carta da PRÓPRIA mão de
 * quem ativa) como pagamento pra descongelar `targetCardId` (mão ou campo,
 * de QUALQUER jogador - "qualquer alvo possível"). A carta-alvo NÃO é
 * descartada, só perde o status; a carta de pagamento vai pro descarte
 * normalmente. Só na fase de Estratégia.
 */
export function handlePayToUnfreeze(state: GameState, player: PlayerNumber, paymentCardId: string, targetCardId: string): GameState {
  if (state.phase !== 'strategy') return state;
  const playerKey = playerKeyOf(player);
  const playerState = state[playerKey];
  const paymentCard = playerState.hand.find((c) => c.id === paymentCardId);
  if (!paymentCard || paymentCardId === targetCardId || hasStatus(paymentCard, 'frozen')) return state;

  // Acha a carta-alvo CONGELADA na PRÓPRIA mão ou campo de quem está pagando
  // - nunca na do oponente (FIX: pedido do usuário, "a opção de descongelar
  // aparece e é funcional quando você congela uma carta do oponente, remova
  // isso" - a intenção sempre foi deixar um jogador NÃO-Glacial descongelar
  // a PRÓPRIA carta congelada pelo Glacial adversário, ver comentário em
  // aiPlayer.ts logo acima de decidePayToUnfreeze - nunca ajudar o oponente
  // removendo um status que ELE aplicou nele).
  let found = false;
  let newHand = playerState.hand;
  let newField = playerState.field;
  const handCard = playerState.hand.find((c) => c.id === targetCardId);
  if (handCard && hasStatus(handCard, 'frozen')) {
    found = true;
    newHand = playerState.hand.map((c) => (c.id === targetCardId ? removeStatus(c, 'frozen') : c));
  } else {
    // FIX (bug real achado por auditoria de cobertura - a expansão da matriz
    // de matchups IA-vs-IA pra incluir Glacial, em testAiVsAiFullGames*,
    // achou uma partida real em Modo Towers onde a IA propunha um
    // PAY_TO_UNFREEZE que o motor rejeitava em silêncio): esta varredura só
    // olhava `faceDownCard`/`horizontalCards`, mas uma carta congelada pode
    // ficar SOTERRADA em `towerReserve` (cartas empilhadas abaixo do topo
    // visível de uma Torre) ou `brotoReserve` (Druida) depois de congelada -
    // `fieldCards()` (usada tanto pela IA em decidePayToUnfreeze quanto pelo
    // diálogo "Descongelar" em GameBoard.tsx) já inclui as duas reservas,
    // então os dois ACHAVAM um alvo válido que o motor não sabia procurar,
    // rejeitando uma ação que deveria ter funcionado.
    const cardsInSlot = (s: FieldSlot): Card[] => [...(s.faceDownCard ? [s.faceDownCard] : []), ...s.horizontalCards, ...(s.towerReserve ?? []), ...(s.brotoReserve ?? [])];
    const slotIndex = playerState.field.findIndex((s) => cardsInSlot(s).some((c) => c.id === targetCardId && hasStatus(c, 'frozen')));
    if (slotIndex !== -1) {
      found = true;
      newField = updateFieldSlot(playerState.field, slotIndex, (s) => {
        if (s.faceDownCard?.id === targetCardId) return { faceDownCard: removeStatus(s.faceDownCard, 'frozen') };
        if (s.horizontalCards.some((c) => c.id === targetCardId)) {
          return { horizontalCards: s.horizontalCards.map((c) => (c.id === targetCardId ? removeStatus(c, 'frozen') : c)) };
        }
        if (s.towerReserve?.some((c) => c.id === targetCardId)) {
          return { towerReserve: s.towerReserve!.map((c) => (c.id === targetCardId ? removeStatus(c, 'frozen') : c)) };
        }
        return { brotoReserve: s.brotoReserve!.map((c) => (c.id === targetCardId ? removeStatus(c, 'frozen') : c)) };
      });
    }
  }
  if (!found) return state;

  // Remove a carta de pagamento da mão de quem ativou - a partir do estado
  // JÁ ACUMULADO (newHand), essencial quando o alvo congelado estava na
  // mesma mão da carta de pagamento.
  newHand = newHand.filter((c) => c.id !== paymentCardId);
  const newPlayerState: PlayerState = { ...playerState, hand: newHand, field: newField };
  const newPlayer1 = playerKey === 'player1' ? newPlayerState : state.player1;
  const newPlayer2 = playerKey === 'player2' ? newPlayerState : state.player2;

  const { deck, discardPile, reshuffled } = pushToDiscard(state, [paymentCard]);
  let log = state.log;
  if (reshuffled) log = appendLog(state, log, 'system', `O baralho esgotou - a pilha de descarte foi reembaralhada de volta`, { trigger: 'deck-reshuffled' });
  log = appendLog(
    state,
    log,
    'field',
    `Jogador ${player} descartou uma carta para descongelar outra`,
    { player }
  );
  return { ...state, deck, discardPile, log, player1: newPlayer1, player2: newPlayer2 };
}
