/**
 * gameLog.ts - construção pura do log estruturado da partida.
 *
 * Centraliza nomes dos personagens, metadados e retenção das entradas
 * sem depender do reducer, UI ou efeitos colaterais.
 */
import { getCharacterTheme } from './characterThemes';
import type { Phase, PlayerNumber } from './gameTypes';
import type { AnimationPolicy, LogEntry, LogEventType, LogSource, LogTrigger, LogVisibility } from './gameLogTypes';
import type { GameState } from './gameStateTypes';
interface LogOptions {
  player?: PlayerNumber;
  cardValue?: string;
  /** Ver LogEntry.cardSuit acima. */
  cardSuit?: string;
  slotIndex?: number;
  /**
   * Só usado pelas 3 mensagens de transição de fase em advancePhaseState:
   * quando o `state` recebido ainda é o de ANTES da transição (turno/fase de
   * ORIGEM), mas a mensagem já anuncia o turno/fase de DESTINO, este override
   * garante que a entrada seja agrupada no turno certo pela UI (senão o
   * anúncio "Turno 2 - Fase de Compra" ficaria etiquetado como pertencente
   * ao Turno 1, já que é ali que o dispatch acontece).
   */
  turnOverride?: number;
  phaseOverride?: Phase;
  /** Ver LogEntry.burnedCardIds acima. */
  burnedCardIds?: string[];
  /** Ver LogEntry.trigger/LogTrigger acima. */
  trigger?: LogTrigger;
  /** Ver LogEntry.chainId (gameLogTypes.ts). */
  chainId?: number;
  /** Ver LogEntry.sequence (gameLogTypes.ts). */
  sequence?: number;
  /** Ver LogSource (gameLogTypes.ts). */
  source?: LogSource;
  /** Ver LogEntry.target (gameLogTypes.ts). */
  target?: PlayerNumber | 'both';
  /** Ver LogVisibility (gameLogTypes.ts). */
  visibility?: LogVisibility;
  /** Ver AnimationPolicy (gameLogTypes.ts). */
  animationPolicy?: AnimationPolicy;
}

/**
 * FIX (pedido do usuário: "reformule completamente o sistema de log de
 * jogo... a lógica do jogo pare de conhecer cores/formatação") - registra
 * uma linha de log como DADO estruturado puro (turno, fase, tipo, jogador,
 * texto plano) - nenhuma cor, ícone, nome de magia ou tooltip é decidido
 * aqui; tudo isso agora é responsabilidade da UI (ver lib/logFormat.ts),
 * lendo os mesmos campos estruturados. Mantém o teto de 30 entradas (mesmo
 * comportamento de antes - pedido do usuário ao confirmar a reformulação).
 */
/**
 * FIX (pedido do usuário: "ao invés de falar jogador 1 e jogador 2, troque
 * para os respectivos nomes dos personagens em questão, em todos os
 * lugares no jogo") - as 60+ chamadas de `appendLog` espalhadas por este
 * arquivo montam a mensagem como uma frase pronta ("Jogador 1 comprou uma
 * carta", "Jogador 2 revelou X de Jogador 1"...) - em vez de editar cada
 * uma individualmente (risco real de esquecer alguma), a troca acontece
 * aqui, um único lugar: qualquer "Jogador 1"/"Jogador 2" literal no texto
 * final vira o NOME do personagem daquele jogador (ex.: "CORINGA comprou
 * uma carta"). Sempre os dois de uma vez, já que uma mensagem pode citar
 * os dois jogadores na mesma frase.
 */
function withPlayerCharacterNames(state: GameState, text: string): string {
  const p1Name = getCharacterTheme(state.player1Character).name;
  const p2Name = getCharacterTheme(state.player2Character).name;
  return text.replace(/Jogador 1/g, p1Name).replace(/Jogador 2/g, p2Name);
}

export function appendLog(state: GameState, log: LogEntry[], type: LogEventType, message: string, opts: LogOptions = {}): LogEntry[] {
  const nextId = log.length > 0 ? log[log.length - 1].id + 1 : 0;
  const entry: LogEntry = {
    id: nextId,
    turn: opts.turnOverride ?? state.turn,
    phase: opts.phaseOverride ?? state.phase,
    type,
    player: opts.player ?? null,
    text: withPlayerCharacterNames(state, message),
    cardValue: opts.cardValue,
    cardSuit: opts.cardSuit,
    slotIndex: opts.slotIndex,
    burnedCardIds: opts.burnedCardIds,
    trigger: opts.trigger,
    chainId: opts.chainId,
    sequence: opts.sequence,
    source: opts.source,
    target: opts.target,
    visibility: opts.visibility,
    animationPolicy: opts.animationPolicy,
  };
  return [...log, entry].slice(-30);
}

/**
 * Fase 0.3 do roadmap de overhaul de animações ("arbitragem de cadeias
 * visuais") - preenche `chainId`/`sequence` automaticamente pra toda entrada
 * NOVA (nascida entre `previousLog` e `nextLog`) que ainda não os tem,
 * centralizado aqui em vez de espalhar por cada um dos ~60 call sites de
 * `appendLog` - nenhum handler precisa saber que `chainId` existe. Chamado
 * pelo wrapper `gameReducer` (gameEngine.ts) depois de cada dispatch.
 *
 * Semântica de `chainId`: "quais entradas nasceram do MESMO dispatch de
 * gameReducer", nada mais - não tenta capturar "de quem é a causa" (isso é
 * papel de `source`, por entrada). Reusa o espaço de `LogEntry.id` (sempre
 * monotônico, nunca colide, sobrevive ao corte de 30 entradas) como o
 * próprio identificador da cadeia: por padrão, `chainId` = id da PRIMEIRA
 * entrada nova deste dispatch.
 *
 * `forcedChainId` cobre o único caso real onde uma cadeia atravessa 2
 * dispatches (Magia Numeral ativar->finalizar, Modo Reações anunciar-
 * >confirmar/negar): o handler do 2º dispatch (que já tem acesso ao
 * `chainId` gravado em `numeralSpellPending`/`pendingReaction` ANTES de
 * limpar o pending) passa esse valor aqui em vez de deixar mintar um novo -
 * documentado nos 2 únicos call sites que usam este parâmetro
 * (handleFinalizeNumeralSpell via `appendLog` direto, handleResolvePendingReaction
 * via este backfill local). Sem esse fio, as 2 metades da mesma cadeia
 * ficariam sem nenhum jeito estruturado de se correlacionar.
 *
 * `sequence` é a ordem LOCAL a este lote (0, 1, 2...) - nunca um contador
 * global entre dispatches diferentes (uma cadeia que atravessa 2 dispatches
 * tem 2 lotes de `sequence` começando em 0 cada); quem precisar da ordem
 * causal completa de uma cadeia inteira deve ordenar por `id` (sempre
 * monotônico), não por `sequence`.
 */
export function backfillLogChainMetadata(previousLog: LogEntry[], nextLog: LogEntry[], forcedChainId?: number): LogEntry[] {
  const lastPreviousId = previousLog.length > 0 ? previousLog[previousLog.length - 1].id : -1;
  const newEntries = nextLog.filter((entry) => entry.id > lastPreviousId);
  if (newEntries.length === 0) return nextLog;

  const sharedChainId = forcedChainId ?? newEntries.find((entry) => entry.chainId !== undefined)?.chainId ?? newEntries[0].id;

  const patchedById = new Map<number, LogEntry>();
  newEntries.forEach((entry, index) => {
    const needsChainId = entry.chainId === undefined;
    const needsSequence = entry.sequence === undefined;
    if (!needsChainId && !needsSequence) return;
    patchedById.set(entry.id, {
      ...entry,
      chainId: needsChainId ? sharedChainId : entry.chainId,
      sequence: needsSequence ? index : entry.sequence,
    });
  });
  if (patchedById.size === 0) return nextLog;

  return nextLog.map((entry) => patchedById.get(entry.id) ?? entry);
}
