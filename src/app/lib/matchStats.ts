import type { CharacterId } from './gameEngine';

/**
 * matchStats.ts - QoL (pedido do usuário: "histórico/estatísticas entre
 * partidas - tela nova no menu principal") - `localStorage` puro, mesmo
 * padrão try/catch silencioso de gamePreferences.ts (nunca crítico o
 * bastante pra quebrar o fim de uma partida ou a tela inicial por causa
 * disso). Só grava resultados de partidas jogadas por um HUMANO de verdade
 * (nunca Modo Espectador, os dois lados são IA ali - "suas estatísticas"
 * não faria sentido nenhum) - ver o `useEffect` que chama
 * `recordMatchResult` em GameBoard.tsx, ao `gameState.gameOver` ser
 * definido pela 1ª vez.
 */
export interface MatchRecord {
  /** Personagem do jogador humano nesta partida. */
  character: CharacterId;
  /** Personagem do oponente (IA, ou o outro humano no Hotseat). */
  opponentCharacter: CharacterId;
  won: boolean;
  timestamp: number;
}

const MATCH_HISTORY_KEY = 'magispelll:matchHistory';
/** Teto de partidas guardadas - evita o localStorage crescer sem limite numa sessão de uso muito longa. Mais antigas caem fora primeiro. */
const MAX_MATCH_HISTORY = 500;

export function recordMatchResult(record: MatchRecord): void {
  try {
    const existing = loadMatchHistory();
    const next = [...existing, record].slice(-MAX_MATCH_HISTORY);
    localStorage.setItem(MATCH_HISTORY_KEY, JSON.stringify(next));
  } catch {
    // localStorage pode falhar (modo privado, quota cheia) - nunca crítico.
  }
}

export function loadMatchHistory(): MatchRecord[] {
  try {
    const raw = localStorage.getItem(MATCH_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is MatchRecord =>
        typeof r === 'object' && r !== null && typeof r.character === 'string' && typeof r.opponentCharacter === 'string' && typeof r.won === 'boolean'
    );
  } catch {
    return [];
  }
}

export function clearMatchHistory(): void {
  try {
    localStorage.removeItem(MATCH_HISTORY_KEY);
  } catch {
    // idem acima.
  }
}

export interface CharacterStats {
  wins: number;
  losses: number;
  total: number;
  winRate: number;
}

/** Agrega o histórico bruto por personagem jogado pelo humano - recalculado sempre a partir de loadMatchHistory(), nunca guardado pré-agregado (fonte única de verdade). */
export function getStatsByCharacter(history: MatchRecord[]): Partial<Record<CharacterId, CharacterStats>> {
  const stats: Partial<Record<CharacterId, CharacterStats>> = {};
  for (const record of history) {
    const current = stats[record.character] ?? { wins: 0, losses: 0, total: 0, winRate: 0 };
    current.total += 1;
    if (record.won) current.wins += 1;
    else current.losses += 1;
    current.winRate = current.wins / current.total;
    stats[record.character] = current;
  }
  return stats;
}
