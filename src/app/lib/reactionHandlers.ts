/**
 * reactionHandlers.ts - anúncio e negação do Modo Reações.
 *
 * A resolução da janela também vive aqui: quando o prazo expira, a ação
 * original é reexecutada pelos handlers de magia já modularizados.
 */
import { pushToDiscard } from './deckLifecycle';
import { appendLog, backfillLogChainMetadata } from './gameLog';
import type { GameAction } from './gameActionTypes';
import { handleActivateSimpleMagic, handleExecuteMagic } from './magicHandlers';
import { characterOf, opponentOf, playerKeyOf } from './gameSelectors';
import { isSameGameplayState } from './gameplayState';
import type { GameState } from './gameStateTypes';
import type { PlayerNumber } from './gameTypes';
// ---------------------------------------------------------------------------
// Modo Reações (pedido do usuário)
//
// Toda vez que uma magia (J/Q/K) é ativada com o modo ligado, se o oponente
// tiver uma carta mágica do MESMO valor na mão (e ainda não tiver estourado
// `reactionsLimit` reações NESTA fase), a ativação não se aplica na hora -
// ela fica ANUNCIADA (`state.pendingReaction`) por até 3s (o timer real vive
// em GameBoard.tsx), esperando a decisão do oponente:
// - Reage (REACT_TO_MAGIC): as duas cartas mágicas vão pro descarte, o
//   efeito NUNCA se aplica.
// - Não reage a tempo (RESOLVE_PENDING_REACTION, disparado pelo timer): o
//   efeito se aplica de verdade, exatamente como aplicaria sem o modo ligado.
//
// Quando o oponente NÃO tem carta elegível (ou já esgotou o limite da fase),
// a ativação segue direto pro efeito de verdade, sem nenhum anúncio/pausa -
// "alerta de reação só é invocado caso o jogador oponente tenha uma carta
// capaz de ser utilizada para reação em mãos" (pedido do usuário).
// ---------------------------------------------------------------------------

/**
 * Intercepta o RESULTADO já calculado (`resultState`) de uma ativação de
 * magia (ACTIVATE_SIMPLE_MAGIC/EXECUTE_MAGIC) pra decidir se ela deve ser
 * ANUNCIADA (Modo Reações) em vez de aplicada na hora. Reaproveita
 * `resultState` só pra saber SE a ativação teria sucesso (comparação por
 * referência - `resultState === state` é a mesma convenção de "rejeitado em
 * silêncio" usada em todo o resto do motor) - nunca duplica a validação de
 * cada handler de magia. Quando decide anunciar, DESCARTA `resultState`
 * (ainda não aplicado) e guarda a ação original inteira em
 * `pendingReaction.originalAction` pra ser re-executada de verdade depois
 * (ver handleResolvePendingReaction) - assim nenhuma lógica de nenhuma magia
 * precisa saber que o Modo Reações existe.
 */
/**
 * Verdadeiro se ativar `cardId` (do jogador `player`) AGORA resultaria num
 * ANÚNCIO (Modo Reações) em vez de aplicação imediata - a MESMA checagem que
 * `maybeDeferForReaction` usa internamente pra decidir isso, extraída aqui
 * pra ser reaproveitada pela UI (GameBoard.tsx).
 *
 * FIX (checagem extensa por bugs - achado independente, não relacionado ao
 * Piromante): a apresentação visual/sonora de UMA ativação de magia
 * (`applyMagicEffectPresentation`) sempre disparava ANTES do dispatch,
 * incondicionalmente - inclusive quando o Modo Reações estava ligado e a
 * ativação na verdade seria só ANUNCIADA (efeito real represado em
 * `pendingReaction`, sem aplicar nada ainda). Isso causava dois sintomas: (1)
 * se o oponente reagia (negava), o burst já tinha tocado à toa, pra um
 * efeito que nunca aconteceu; (2) se ninguém reagia a tempo, o burst tocava
 * DE NOVO quando RESOLVE_PENDING_REACTION finalmente aplicava o efeito de
 * verdade (ver o timer de 3s em GameBoard.tsx, que corretamente dispara a
 * apresentação nesse momento - o bug era o disparo ANTECIPADO extra, não a
 * apresentação em si). GameBoard.tsx agora chama esta função ANTES de
 * disparar a apresentação: se ela retornar `true`, a apresentação é adiada
 * pro mesmo caminho que já trata a resolução da reação (nega -> nenhum burst
 * toca, correto; expira sem reação -> `triggerAiActionEffects` já dispara a
 * apresentação exatamente uma vez).
 */
export function canMagicTriggerReactionAnnouncement(state: GameState, player: PlayerNumber, cardId: string): boolean {
  if (!state.gameConfig.reactionsMode) return false;

  const card = state[playerKeyOf(player)].hand.find((c) => c.id === cardId);
  if (!card || (card.value !== 'J' && card.value !== 'Q' && card.value !== 'K')) return false;

  const opponent = opponentOf(player);
  const opponentKey = playerKeyOf(opponent);
  const opponentState = state[opponentKey];
  const reactionsUsed = state.reactionsUsedThisPhase[opponent] ?? 0;
  return reactionsUsed < state.gameConfig.reactionsLimit && opponentState.hand.some((c) => c.value === card.value);
}

/**
 * Compara dois estados IGNORANDO o campo `log` - "esta ação realmente mudou
 * alguma coisa relevante pro jogo, ou só um aviso foi anexado?".
 *
 * FIX (bug real encontrado rodando `scripts/fuzz.ts` - item 6 do plano de
 * melhoria do debug mode - contra o Modo Reações): o motor tem um padrão
 * DELIBERADO e generalizado (13+ pontos, ex.: "Esse slot está protegido por
 * Proteção Divina!", "Essa magia não pode ser ativada agora") de rejeição
 * "com aviso" - devolve `{ ...state, log: appendLog(...) }`, uma referência
 * NOVA só pra anexar um toast explicando por quê, mesmo sem mudar nada além
 * do log (contraste com a maioria das rejeições, que devolvem a MESMA
 * referência, `return state;`, sem nenhum aviso). `maybeDeferForReaction`
 * (Modo Reações) comparava por referência crua (`resultState === state`)
 * pra decidir "essa ativação teria funcionado, vale anunciar?" - mas o gate
 * de `canActivateMagic` dentro de `handleExecuteMagic` usa o padrão "com
 * aviso", então uma magia ativada na fase ERRADA (ilegal de verdade, nunca
 * deveria fazer nada) ainda produzia uma referência DIFERENTE de `state` -
 * `maybeDeferForReaction` achava que a ativação "teria funcionado" e
 * anunciava uma reação pra um efeito que NUNCA ia acontecer de verdade
 * (mesmo sem o oponente reagir, `handleResolvePendingReaction` só bateria
 * no mesmo gate de novo e não faria nada - mas o anúncio, a revelação da
 * carta, e a janela de 3s de reação já teriam acontecido à toa).
 */

export function maybeDeferForReaction(
  state: GameState,
  originalAction: GameAction,
  player: PlayerNumber,
  cardId: string,
  resultState: GameState
): GameState {
  if (resultState === state) return state; // a ativação seria rejeitada de qualquer forma - Reações não muda isso
  if (!canMagicTriggerReactionAnnouncement(state, player, cardId)) return resultState;
  // FIX (bug real encontrado rodando scripts/fuzz.ts - Modo Reações): a
  // checagem ACIMA (`resultState === state`) só pega o caso "nem tentou
  // fazer nada" - mas `handleExecuteMagic` tem seu próprio gate de
  // `canActivateMagic` no topo que, ao rejeitar, devolve `{ ...state, log:
  // ... }` (uma referência NOVA, só com um aviso anexado - mesmo padrão
  // documentado em `isSameGameplayState`), não `state` puro. Chegando até
  // aqui (`canMagicTriggerReactionAnnouncement` já confirmou Reações ligado
  // + oponente com carta pra reagir), uma ativação de magia numa fase ERRADA
  // (ilegal de verdade, nunca teria efeito nenhum) ainda parecia "teria
  // funcionado" e abria uma janela de reação pra um efeito que JAMAIS ia
  // acontecer - o oponente podia "reagir" (gastando a própria carta à toa)
  // a algo que nunca era real pra começar. `isSameGameplayState` aqui pega
  // exatamente esse caso (só diferem no log) sem tocar em NADA do caminho
  // acima (`resultState === state` continua a mesma checagem de sempre, e
  // esta função só chega até aqui quando Reações está ligado - um jogo SEM
  // Reações nunca passa da linha anterior, então o aviso de log continua
  // aparecendo normalmente pra ele, sem nenhuma mudança de comportamento).
  if (isSameGameplayState(resultState, state)) return resultState;

  const card = state[playerKeyOf(player)].hand.find((c) => c.id === cardId);
  if (!card || (card.value !== 'J' && card.value !== 'Q' && card.value !== 'K')) return resultState; // sempre verdadeiro aqui (já checado acima) - só pra estreitar o tipo de card.value
  const opponent = opponentOf(player);

  const playerKey = playerKeyOf(player);
  const playerState = state[playerKey];
  // FIX (pedido do usuário: "magias são reveladas ao serem anunciadas") -
  // mesmo mecanismo de `revealed` já usado em cartas de campo/mão
  // reveladas por outros efeitos neste motor (ex.: Revelação Forçada do
  // Mago) - permanente, nunca "esconde de novo" depois.
  const newHand = playerState.hand.map((c) => (c.id === cardId ? { ...c, revealed: true } : c));
  const character = characterOf(state, player);
  const log = appendLog(
    state,
    state.log,
    'magic',
    `Jogador ${player} anunciou uma magia (${card.value}) - Jogador ${opponent} pode reagir!`,
    {
      player,
      cardValue: card.value,
      cardSuit: card.suit,
      // Fase 0.2 do roadmap de overhaul de animações - marcador estrutural
      // pro estado "anunciado, pode ser negado" (ver LogTrigger,
      // gameLogTypes.ts), em vez de casar a string "anunciou" no texto.
      trigger: 'reaction-announced',
      source: { kind: 'special-mode', mode: 'reactions' },
      target: opponent,
      // A carta É revelada nesta função (newHand acima) - o valor pode
      // aparecer com a face pra cima numa animação a partir deste instante.
      visibility: 'public',
    }
  );
  // `chainId` reusa o id desta entrada - liga o anúncio à confirmação/negação
  // que vem depois (ver PendingReaction.chainId, gameStateTypes.ts).
  const chainId = log[log.length - 1].id;

  return {
    ...state,
    log,
    [playerKey]: { ...playerState, hand: newHand },
    pendingReaction: { casterPlayer: player, character, cardValue: card.value, cardId, originalAction, chainId },
  };
}

/**
 * `player` (precisa ser o oponente de quem anunciou - ver
 * state.pendingReaction) usa `cardId` (uma carta mágica própria do MESMO
 * valor da anunciada) pra reagir: nega o efeito por completo e descarta as
 * DUAS cartas (a anunciada e a usada pra reagir) - nenhuma delas é ativada.
 */
export function handleReactToMagic(state: GameState, player: PlayerNumber, cardId: string): GameState {
  const pending = state.pendingReaction;
  if (!pending) return state;
  if (player !== opponentOf(pending.casterPlayer)) return state;

  const playerKey = playerKeyOf(player);
  const playerState = state[playerKey];
  const reactingCard = playerState.hand.find((c) => c.id === cardId);
  if (!reactingCard || reactingCard.value !== pending.cardValue) return state;

  const reactionsUsed = state.reactionsUsedThisPhase[player] ?? 0;
  if (reactionsUsed >= state.gameConfig.reactionsLimit) return state; // nunca confiar só na UI

  const casterKey = playerKeyOf(pending.casterPlayer);
  const casterState = state[casterKey];
  const announcedCard = casterState.hand.find((c) => c.id === pending.cardId);
  if (!announcedCard) return state; // nunca deveria acontecer - a carta anunciada some da mão só quando resolvida

  const newCasterHand = casterState.hand.filter((c) => c.id !== pending.cardId);
  const newReactingHand = playerState.hand.filter((c) => c.id !== cardId);
  const { deck, discardPile, reshuffled } = pushToDiscard(state, [announcedCard, reactingCard]);
  let log = state.log;
  if (reshuffled) log = appendLog(state, log, 'system', `O baralho esgotou - a pilha de descarte foi reembaralhada de volta`, { trigger: 'deck-reshuffled' });
  log = appendLog(
    state,
    log,
    'magic',
    `Jogador ${player} REAGIU com ${reactingCard.value}${reactingCard.suit} - a magia de Jogador ${pending.casterPlayer} foi negada! Ambas as cartas foram descartadas.`,
    {
      player,
      cardValue: reactingCard.value,
      trigger: 'reaction-denied',
      source: { kind: 'special-mode', mode: 'reactions' },
      target: pending.casterPlayer,
      chainId: pending.chainId,
    }
  );

  return {
    ...state,
    log,
    deck,
    discardPile,
    pendingReaction: null,
    reactionsUsedThisPhase: { ...state.reactionsUsedThisPhase, [player]: reactionsUsed + 1 },
    [casterKey]: { ...casterState, hand: newCasterHand },
    [playerKey]: { ...playerState, hand: newReactingHand },
  };
}

/**
 * A janela de 3s expirou sem reação (timer real em GameBoard.tsx) - aplica
 * de verdade a magia anunciada, re-executando o handler original guardado em
 * `pendingReaction.originalAction` sobre o estado já sem `pendingReaction`
 * (senão o guard de bloqueio total no topo de gameReducer rejeitaria a
 * própria re-execução). O estado não muda em mais nada além disso entre o
 * anúncio e agora (a pausa total garante isso), então o resultado é
 * idêntico ao que seria se a magia tivesse aplicado na hora, sem o modo
 * ligado.
 */
export function handleResolvePendingReaction(state: GameState): GameState {
  const pending = state.pendingReaction;
  if (!pending) return state;
  const stateWithoutPending: GameState = { ...state, pendingReaction: null };

  const result = ((): GameState => {
    switch (pending.originalAction.type) {
      case 'ACTIVATE_SIMPLE_MAGIC':
        return handleActivateSimpleMagic(stateWithoutPending, pending.originalAction.player, pending.originalAction.cardId);
      case 'EXECUTE_MAGIC':
        return handleExecuteMagic(stateWithoutPending, pending.originalAction);
      default:
        return stateWithoutPending;
    }
  })();

  // Fase 0.3 do roadmap de overhaul de animações - `handleActivateSimpleMagic`/
  // `handleExecuteMagic` não sabem nada sobre Reações (são os MESMOS handlers
  // usados numa ativação normal, sem o modo ligado) e por isso nunca marcam
  // `chainId` nas entradas que criam. Em vez de mudar a assinatura deles (~46
  // call sites de appendLog, fora do escopo desta correção pontual), o link
  // com o anúncio original acontece aqui de fora: mesmo `backfillLogChainMetadata`
  // que o wrapper `gameReducer` usa, mas com o `chainId` já conhecido
  // (`pending.chainId`, gravado no anúncio) forçado no lote inteiro de
  // entradas novas que este dispatch está prestes a produzir.
  if (result.log === stateWithoutPending.log) return result;
  const log = backfillLogChainMetadata(stateWithoutPending.log, result.log, pending.chainId);
  return log === result.log ? result : { ...result, log };
}
