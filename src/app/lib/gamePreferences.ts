import { DEFAULT_GAME_CONFIG, type GameConfig } from './gameConfig';
import type { CharacterId } from './gameEngine';

/**
 * gamePreferences.ts - lembra a última configuração de partida escolhida
 * (pedido do usuário: "lembrar a última configuração") - `localStorage`
 * puro, sem back-end nenhum, só pra `GameConfig.tsx` pré-preencher a tela
 * com o que o jogador escolheu da última vez, em vez de sempre voltar pro
 * `DEFAULT_GAME_CONFIG` fixo.
 */
const LAST_CONFIG_KEY = 'magispelll:lastGameConfig';

/**
 * Salva a config atual como "última usada" - chamado no momento de
 * "Iniciar Partida" (GameConfig.tsx), nunca a cada troca de campo (evitar
 * escrever no localStorage a cada clique de switch/select).
 */
export function saveLastGameConfig(config: GameConfig): void {
  try {
    localStorage.setItem(LAST_CONFIG_KEY, JSON.stringify(config));
  } catch {
    // localStorage pode falhar (modo privado, quota cheia, ambiente sem
    // storage) - nunca crítico o suficiente pra quebrar o fluxo de início
    // de partida por causa disso.
  }
}

/**
 * Lê a última config salva, já com todo campo ausente/extra saneado contra
 * `DEFAULT_GAME_CONFIG` - protege contra JSON corrompido E contra uma
 * versão mais antiga do jogo ter salvo uma config sem um campo que só
 * passou a existir depois (ex.: `reactionsMode` numa config salva antes da
 * variante Reações existir). `null` quando não há nada salvo ainda ou o
 * JSON é inválido - quem chama decide o fallback (sempre
 * `DEFAULT_GAME_CONFIG`, ver GameConfig.tsx).
 */
export function loadLastGameConfig(): GameConfig | null {
  try {
    const raw = localStorage.getItem(LAST_CONFIG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    return { ...DEFAULT_GAME_CONFIG, ...parsed };
  } catch {
    return null;
  }
}

/**
 * FIX (pedido do usuário, QoL: "lembrar personagem(ns) usados recentemente
 * pra escolha rápida") - só o personagem do JOGADOR 1 (o humano - ver
 * comentário completo em CharacterSelection.tsx, onde isso vira botões de
 * atalho "Recentes"). Mesmo padrão try/catch silencioso de
 * saveLastGameConfig/loadLastGameConfig acima - nunca crítico o bastante
 * pra quebrar a tela de seleção.
 */
const RECENT_CHARACTERS_KEY = 'magispelll:recentCharacters';
const MAX_RECENT_CHARACTERS = 3;

/** Adiciona `characterId` ao topo do histórico (mais recente primeiro), sem duplicar, truncado em MAX_RECENT_CHARACTERS. Chamado ao "Iniciar Partida", junto de saveLastGameConfig. */
export function saveRecentCharacter(characterId: CharacterId): void {
  try {
    const existing = loadRecentCharacters();
    const next = [characterId, ...existing.filter((id) => id !== characterId)].slice(0, MAX_RECENT_CHARACTERS);
    localStorage.setItem(RECENT_CHARACTERS_KEY, JSON.stringify(next));
  } catch {
    // idem saveLastGameConfig - localStorage pode falhar, nunca crítico.
  }
}

/** Lê o histórico salvo (mais recente primeiro). Array vazio quando não há nada salvo ainda ou o JSON é inválido. */
export function loadRecentCharacters(): CharacterId[] {
  try {
    const raw = localStorage.getItem(RECENT_CHARACTERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is CharacterId => typeof id === 'string');
  } catch {
    return [];
  }
}
