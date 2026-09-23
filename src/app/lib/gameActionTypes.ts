/**
 * gameActionTypes.ts - contrato tipado das ações aceitas pelo reducer.
 *
 * Mantém o shape das ações separado da implementação do motor para que
 * UI, IA, action-space e ferramentas possam depender do protocolo sem
 * usar gameEngine.ts como hub de tipos.
 */
import type { PlayerNumber } from './gameTypes';
import type { CharacterId } from './characterRegistry';
import type { MagicCardType } from './magicCards';
import type { GameState } from './gameEngine';
/** Seleção feita pelo jogador no assistente de ativação de magia (ver GameBoard.tsx) */
export interface MagicSelection {
  selectedCards?: string[];
  selectedSlot?: number;
  selectedTargetPlayer?: PlayerNumber;
  selectedTargetSlot?: number;
  /**
   * Mosqueteiro - Rainha (Rajada Reveladora): ids das cartas do OPONENTE
   * (mão ou campo, escolhidas às cegas por posição) reveladas pelo efeito -
   * separado de `selectedCards` acima, que aqui guarda as cartas
   * DESCARTADAS (da própria mão, ou da mão do oponente se a Recarga Rápida
   * estiver ativa - ver mosqueteiroRedirectNextDiscard).
   */
  selectedRevealCardIds?: string[];
  /**
   * Piromante (personagem novo) - as 3 magias (J/Q/K) sempre têm duas formas
   * de ativar (efeito próprio de alimentar a Bola de Fogo, OU lançá-la já
   * acumulada contra o campo do oponente) - `true` quando o jogador escolheu
   * a 2ª opção nesta ativação. Quando `true`, `selectedTargetSlot` (já
   * existe acima) é o slot do oponente mirado; `selectedCards`/`selectedSlot`
   * são ignorados. Quando `false`/ausente, a magia faz seu efeito próprio de
   * sempre (Valete não precisa de seleção nenhuma; Rainha/Rei usam
   * `selectedCards` com a carta do oponente a queimar).
   */
  fireballLaunch?: boolean;
}

export type GameAction =
  | { type: 'DRAW_CARDS'; player: PlayerNumber; count: number }
  | { type: 'DISCARD_CARDS'; player: PlayerNumber; cardIds: string[] }
  // FIX (pedido do usuário: variante "Fusão") - junta 2 cartas numerais
  // PURAS (2-10, nunca Ás/magia/Coringa - ver canFuseCards em fusion.ts) da
  // mão em 1 carta nova, valendo a SOMA das duas - só na fase de Compra, uma
  // vez por turno (ver fusesThisTurn em PlayerState). Ver handleFuseCards.
  | { type: 'FUSE_CARDS'; player: PlayerNumber; cardId1: string; cardId2: string }
  | { type: 'PLAY_CARD'; player: PlayerNumber; cardId: string; slotIndex: number; asHorizontal: boolean }
  | { type: 'RETURN_CARD_TO_HAND'; player: PlayerNumber; slotIndex: number }
  // FIX (item 9 da 6ª rodada): "adicione a opção de remover a carta
  // horizontal de cima de outra carta, clicando onde normalmente sua
  // indicação visual é posicionada" - RETURN_CARD_TO_HAND (acima) devolve o
  // slot INTEIRO (carta principal + toda(s) horizontal(is)) para a mão; não
  // havia nenhuma forma de devolver só UMA carta horizontal, mantendo a
  // principal (e a outra horizontal, se houver 2 empilhadas via Reforço
  // Angelical do Anjo) no lugar. `cardId` identifica qual das (até 2) cartas
  // horizontais do slot remover - ver handleReturnHorizontalCardToHand.
  | { type: 'RETURN_HORIZONTAL_CARD_TO_HAND'; player: PlayerNumber; slotIndex: number; cardId: string }
  // FIX (item 9): antes trocar a carta principal de um slot exigia duas ações
  // separadas (RETURN_CARD_TO_HAND depois PLAY_CARD) - esta ação faz a troca
  // atômica: a carta antiga do slot volta para a mão, a nova carta da mão
  // (`cardId`) ocupa o lugar dela. Só permitido enquanto o slot ainda não foi
  // revelado (ver handleSwapFieldCard).
  | { type: 'SWAP_FIELD_CARD'; player: PlayerNumber; cardId: string; slotIndex: number }
  // Glacial (personagem novo) - única via de remover o StatusEffect 'frozen'
  // de uma carta: descarta `paymentCardId` (qualquer carta da PRÓPRIA mão)
  // como pagamento pra descongelar `targetCardId` (mão ou campo, de
  // QUALQUER jogador - a carta-alvo não é descartada, só perde o status).
  // Só na fase de Estratégia - ver handlePayToUnfreeze.
  | { type: 'PAY_TO_UNFREEZE'; player: PlayerNumber; paymentCardId: string; targetCardId: string }
  // Modo Towers (pedido do usuário): empilha `cardIds` (2+ cartas numerais
  // de mesmo valor efetivo da mão pra CRIAR uma torre nova, ou 1+ pra
  // REFORÇAR uma torre já formada neste turno pelo mesmo jogador) no
  // `slotIndex` escolhido - vazio, com uma carta comum de valor igual
  // (absorvida na torre), ou já uma torre própria deste turno. Ver
  // handleFormOrReinforceTower/FieldSlot.towerReserve.
  | { type: 'FORM_OR_REINFORCE_TOWER'; player: PlayerNumber; slotIndex: number; cardIds: string[] }
  | { type: 'TRANSFORM_ACE'; player: PlayerNumber; aceCardId: string; targetCardId: string }
  | { type: 'ACTIVATE_SIMPLE_MAGIC'; player: PlayerNumber; cardId: string }
  | { type: 'EXECUTE_MAGIC'; player: PlayerNumber; cardId: string; character: CharacterId; magicType: MagicCardType; selection: MagicSelection }
  // Modo Reações (pedido do usuário): `player` (o OPONENTE de quem anunciou -
  // ver state.pendingReaction) usa `cardId` (uma carta mágica própria do
  // MESMO valor da anunciada) pra negar o efeito - as duas cartas vão pro
  // descarte, o efeito nunca se aplica. Ver handleReactToMagic.
  | { type: 'REACT_TO_MAGIC'; player: PlayerNumber; cardId: string }
  // Modo Reações: a janela de 3s expirou sem reação (disparado por um timer
  // real em GameBoard.tsx) - aplica de verdade a magia que estava anunciada
  // em state.pendingReaction (re-executa o handler original guardado ali).
  // Ver handleResolvePendingReaction.
  | { type: 'RESOLVE_PENDING_REACTION' }
  // FIX (itens 4 e 7 da 3ª rodada): posiciona uma carta Monstro (Coringa) da
  // mão na zona própria do jogador (PlayerState.monsterCard) - NUNCA em um
  // dos 3 slots de combate normais (ver handlePlayCard, que agora rejeita
  // isMonster). Só permitido enquanto a zona estiver vazia.
  | { type: 'PLACE_MONSTER_CARD'; player: PlayerNumber; cardId: string }
  // FIX (itens 4 e 7): `targetSlotIndex` agora é o slot de COMBATE (0-2)
  // escolhido como alvo do efeito - antes `slotIndex` era o slot onde o
  // próprio Coringa estava fisicamente posicionado (arquitetura antiga, onde
  // o Monstro ocupava um slot de combate como uma carta comum).
  // `targetCardId` (opcional): só usado pela Besta - identifica qual carta
  // específica dentro do slot (a principal ou uma horizontal) deve ser
  // dobrada.
  // FIX (pedido do usuário): `targetSlotIndex` agora é OPCIONAL - o Anjo
  // (Proteção Divina) passou a proteger TODO o campo de uma vez ao ativar,
  // então não precisa mais escolher nenhum slot (Besta continua exigindo).
  | { type: 'ACTIVATE_MONSTER_EFFECT_SIMPLE'; player: PlayerNumber; targetSlotIndex?: number; targetCardId?: string }
  | { type: 'EXECUTE_MAGO_MONSTER_EFFECT'; player: PlayerNumber; targetSlotIndex: number; targetCardId: string }
  // Coringa (redesenho completo, pedido do usuário) - Magia Numeral "Mão de
  // Ferro" (7,7,7): transforma uma carta de magia (J/Q/K) da MÃO em carta de
  // número 11/12/13 (permanente) - só aceito enquanto a janela
  // `coringaTransformWindowUntilTurn` estiver ativa - ver
  // canTransformCoringaMagicCard/handleTransformCoringaMagicCard.
  | { type: 'TRANSFORM_CORINGA_MAGIC_CARD'; player: PlayerNumber; cardId: string }
  | { type: 'ACTIVATE_NUMERAL_SPELL'; player: PlayerNumber }
  | { type: 'FINALIZE_NUMERAL_SPELL' }
  | { type: 'SELECT_COMBAT_SLOT'; player: PlayerNumber; slotIndex: number }
  // Coringa (redesenho completo) - Rainha armadilha revelada em combate:
  // "seu valor se torna o mesmo de uma carta revelada do oponente (o
  // jogador escolhe no momento que é revelada)" - `coringaQCopyTargetId` é
  // o id dessa carta (do CAMPO do oponente, já revelada), escolhida pela UI
  // (ou pela IA) ANTES de despachar RESOLVE_COMBAT, quando um dos 2 slots
  // selecionados contém uma Rainha armadilha ainda não transformada - ver
  // handleResolveCombat. `undefined` no caso comum (nenhuma Rainha
  // envolvida nesta disputa).
  | { type: 'RESOLVE_COMBAT'; coringaQCopyTargetId?: string }
  | { type: 'FINALIZE_COMBAT' }
  | { type: 'TOGGLE_READY'; player: PlayerNumber }
  | { type: 'TOGGLE_PAUSE' }
  | { type: 'REMATCH' }
  // Modo de debug/playtest (pedido do usuário: "debug mode melhor pra você
  // testar as coisas mais rápido") - substitui o estado INTEIRO pelo
  // fornecido, sem passar por nenhum handler/validação (é um passthrough
  // puro, ver o topo de gameReducer). Nunca despachada pela UI normal nem
  // pela IA - só existe pra `window.__debug.forceState(...)` (ver GameBoard.tsx,
  // exposto apenas em dev) montar cenários exatos (ex.: mão cheia de
  // armadilhas do Coringa, combate prestes a fechar disputa) sem precisar
  // clicar/jogar até chegar lá manualmente.
  | { type: 'DEBUG_FORCE_STATE'; state: GameState };
