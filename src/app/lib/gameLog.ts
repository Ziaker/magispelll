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
