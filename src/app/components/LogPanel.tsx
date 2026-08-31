import { Fragment, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { ScrollArea } from './ui/scroll-area';
import { getCharacterTheme } from '../lib/characterThemes';
import { getLogColor, getLogEffectInfo, getLogIcon, LOG_FILTER_BUCKETS } from '../lib/logFormat';
import type { CharacterId, LogEntry, PlayerNumber } from '../lib/gameEngine';

interface LogPanelProps {
  log: LogEntry[];
  player1Character: CharacterId;
  player2Character: CharacterId;
  screenReaderMode?: boolean;
}

/**
 * LogPanel.tsx - Painel de Log de Ações reformulado
 *
 * FIX (pedido do usuário: "reformule completamente o sistema de log de
 * jogo") - extraído de dentro de GameBoard.tsx (antes era uma lista plana
 * injetando HTML cru vindo do motor via `dangerouslySetInnerHTML`). Agora:
 * - Cada entrada é dado estruturado puro (ver LogEntry em gameEngine.ts) -
 *   ícone, cor e nome/descrição de efeito são resolvidos aqui (lib/
 *   logFormat.ts), nunca no motor.
 * - Agrupado por turno, com cada grupo recolhível - só o turno mais recente
 *   começa expandido, os outros começam recolhidos (o jogador expande os
 *   que quiser revisitar).
 * - Filtros por jogador (Todos/J1/J2) e por categoria de evento (6 grupos -
 *   ver LOG_FILTER_BUCKETS), combináveis.
 * - Mantém o teto de 30 entradas guardadas (decisão do usuário ao confirmar
 *   a reformulação - a organização nova é o que resolve a sensação de
 *   "perder histórico", não um teto maior).
 */
export function LogPanel({ log, player1Character, player2Character, screenReaderMode }: LogPanelProps) {
  const characterOfPlayer = (player: PlayerNumber): CharacterId => (player === 1 ? player1Character : player2Character);

  const [playerFilter, setPlayerFilter] = useState<'all' | PlayerNumber>('all');
  const [activeBucketIds, setActiveBucketIds] = useState<Set<string>>(() => new Set(LOG_FILTER_BUCKETS.map((b) => b.id)));
  // Turnos que o jogador já mexeu manualmente (expandiu ou recolheu) - sem
  // entrada aqui, o estado padrão vale: só o turno mais recente vem expandido.
  const [manualTurnOverrides, setManualTurnOverrides] = useState<Map<number, boolean>>(new Map());

  const toggleBucket = (id: string) => {
    setActiveBucketIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filtered = useMemo(() => {
    return log.filter((entry) => {
      if (playerFilter !== 'all' && entry.player !== null && entry.player !== playerFilter) return false;
      const bucket = LOG_FILTER_BUCKETS.find((b) => b.types.includes(entry.type));
      if (bucket && !activeBucketIds.has(bucket.id)) return false;
      return true;
    });
  }, [log, playerFilter, activeBucketIds]);

  const turnGroups = useMemo(() => {
    const byTurn = new Map<number, LogEntry[]>();
    for (const entry of filtered) {
      const bucket = byTurn.get(entry.turn) ?? [];
      bucket.push(entry);
      byTurn.set(entry.turn, bucket);
    }
    return [...byTurn.entries()].sort((a, b) => b[0] - a[0]); // turno mais recente primeiro
  }, [filtered]);

  const latestTurn = turnGroups[0]?.[0];

  const toggleTurn = (turn: number, currentlyExpanded: boolean) => {
    setManualTurnOverrides((prev) => new Map(prev).set(turn, !currentlyExpanded));
  };

  // FIX: destaca o NOME DO PERSONAGEM IN LOCO (onde quer que apareça na
  // frase), em vez de remover o trecho e prefixar de volta - várias
  // mensagens mencionam o jogador no MEIO da frase (ex.: "Cartas de MAGO
  // retornaram para a mão"), então mover pra frente quebraria a gramática
  // da mensagem.
  //
  // FIX (pedido do usuário: "ao invés de falar jogador 1 e jogador 2,
  // troque para os respectivos nomes dos personagens") - appendLog
  // (gameEngine.ts) agora já substitui "Jogador N" pelo nome do
  // personagem no próprio texto ANTES dele chegar aqui - o marcador que
  // este destaque procura precisou acompanhar essa troca (senão nunca
  // mais encontrava nada pra destacar, já que "Jogador N" não existe mais
  // dentro de `entry.text`).
  const renderText = (entry: LogEntry, color: string | undefined) => {
    if (entry.player === null) return entry.text;
    const marker = getCharacterTheme(characterOfPlayer(entry.player)).name;
    const idx = entry.text.indexOf(marker);
    if (idx === -1) return entry.text;
    return (
      <Fragment>
        {entry.text.slice(0, idx)}
        <span style={{ color, fontWeight: 600 }}>{marker}</span>
        {entry.text.slice(idx + marker.length)}
      </Fragment>
    );
  };

  return (
    <div className="bg-[#1E1A16]/80 border border-[#C59E4F]/20 rounded-lg p-4 sticky top-0">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-2 h-2 bg-[#C59E4F] rounded-full animate-pulse" />
        <p className="text-[12px] text-[#C59E4F] uppercase tracking-wider">Log de Ações</p>
      </div>

      {/* Filtro por jogador */}
      <div className="flex gap-1 mb-2">
        {(['all', 1, 2] as const).map((option) => {
          const isActive = playerFilter === option;
          const color = option === 'all' ? '#C59E4F' : getCharacterTheme(characterOfPlayer(option)).primary;
          return (
            <button
              key={option}
              onClick={() => setPlayerFilter(option)}
              className="px-2 py-0.5 rounded text-[10px] transition-all"
              style={{
                backgroundColor: isActive ? `${color}30` : 'transparent',
                border: `1px solid ${isActive ? color : '#BFB6A630'}`,
                color: isActive ? color : '#BFB6A6',
              }}
            >
              {option === 'all' ? 'Todos' : getCharacterTheme(characterOfPlayer(option)).name}
            </button>
          );
        })}
      </div>

      {/* Filtro por categoria de evento */}
      <div className="flex flex-wrap gap-1 mb-3">
        {LOG_FILTER_BUCKETS.map((bucket) => {
          const isActive = activeBucketIds.has(bucket.id);
          return (
            <button
              key={bucket.id}
              onClick={() => toggleBucket(bucket.id)}
              className="px-1.5 py-0.5 rounded text-[9px] transition-all"
              style={{
                backgroundColor: isActive ? '#C59E4F20' : 'transparent',
                border: `1px solid ${isActive ? '#C59E4F80' : '#BFB6A625'}`,
                color: isActive ? '#EFE7D6' : '#BFB6A660',
              }}
              title={bucket.label}
            >
              {bucket.icon} {bucket.label}
            </button>
          );
        })}
      </div>

      <ScrollArea className="h-[520px]" aria-live={screenReaderMode ? 'polite' : undefined}>
        <div className="space-y-2">
          {turnGroups.length === 0 && <p className="text-[11px] text-[#BFB6A6]/60 pl-1">Nada por aqui com esses filtros.</p>}
          {turnGroups.map(([turn, entries]) => {
            const expanded = manualTurnOverrides.get(turn) ?? turn === latestTurn;
            return (
              <div key={turn}>
                <button
                  onClick={() => toggleTurn(turn, expanded)}
                  className="w-full flex items-center gap-1.5 px-1 py-1 rounded hover:bg-[#C59E4F]/10 transition-colors"
                >
                  <ChevronDown
                    className="w-3 h-3 text-[#C59E4F] transition-transform"
                    style={{ transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}
                  />
                  <span className="text-[11px] text-[#C59E4F] font-semibold">Turno {turn}</span>
                  <span className="text-[9px] text-[#BFB6A6]/60">({entries.length})</span>
                </button>
                {expanded && (
                  <div className="space-y-1 pl-2">
                    {entries.map((entry) => {
                      const color = getLogColor(entry, characterOfPlayer);
                      const effectInfo = getLogEffectInfo(entry, characterOfPlayer);
                      return (
                        <div
                          key={entry.id}
                          className="text-[11px] text-[#BFB6A6] opacity-80 pl-2 border-l-2"
                          style={{ borderLeftColor: color ?? '#BFB6A625' }}
                        >
                          <span className="mr-1">{getLogIcon(entry)}</span>
                          {effectInfo && (
                            <>
                              <span
                                className="underline decoration-dotted cursor-help font-semibold"
                                style={{ color: color ?? '#C59E4F' }}
                                title={effectInfo.description}
                              >
                                {effectInfo.name}
                              </span>
                              {': '}
                            </>
                          )}
                          {effectInfo ? entry.text : renderText(entry, color)}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
