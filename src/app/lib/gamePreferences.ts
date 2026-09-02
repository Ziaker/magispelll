import { DEFAULT_GAME_CONFIG, type GameConfig } from './gameConfig';

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
