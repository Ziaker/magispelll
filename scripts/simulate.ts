/**
 * scripts/simulate.ts - harness de ESTATÍSTICAS de comportamento (item 36 da
 * lista de afazeres, Grupo J: "harness de simulação permanente, não script
 * descartável... npm run simulate -- --matchup druida:mago --games 200").
 *
 * COMPLEMENTA scripts/fuzz.ts, não duplica: fuzz.ts já é um harness
 * permanente e reproduzível, mas mira CAÇA A BUGS (violação de invariante,
 * travamento) - não responde perguntas como "com que frequência a IA do
 * Druida usa Simbiose/Urtiga contra X personagens?", que é exatamente o
 * tipo de pergunta que motivou escrever scripts de diagnóstico descartáveis
 * (`diag1.ts`...`diag7.ts`, escritos e apagados repetidas vezes nesta mesma
 * sessão investigando a IA do Druida). Este script fica no repo de propósito
 * pra nunca precisar reescrever esse tipo de investigação do zero de novo.
 *
 * USO:
 *   npm run simulate -- --matchup druida:mago --games 100
 *   npm run simulate -- --matchup druida:all --games 30      -- druida contra os 7 personagens, 30 cada
 *   npm run simulate -- --matchup all:all --games 10         -- toda combinação 7x7 (ver item 37)
 *   npm run simulate -- --matchup druida:mago --games 50 --config towers
 *
 * SAÍDA: por matchup, quantas partidas rodaram, passos médios, quem venceu
 * quantas vezes, e - o mais útil pra investigar um personagem específico -
 * quantas vezes CADA combinação personagem+magia (J/Q/K) foi de fato
 * ATIVADA (EXECUTE_MAGIC aceito pelo motor) ao longo de todas as partidas.
 */
import { createInitialState, gameReducer, type CharacterId, type GameAction, type PlayerNumber } from '../src/app/lib/gameEngine';
import { DEFAULT_GAME_CONFIG, type GameConfig } from '../src/app/lib/gameConfig';
import { decideAiAction } from '../src/app/lib/aiPlayer';
import { opponentOf, playerKeyOf } from '../src/app/lib/gameEngine';

const ALL_CHARACTERS: CharacterId[] = ['mago', 'besta', 'anjo', 'mosqueteiro', 'coringa', 'piromante', 'druida'];

const CONFIGS: Record<string, GameConfig> = {
  base: { ...DEFAULT_GAME_CONFIG, monsterCards: true },
  fusion: { ...DEFAULT_GAME_CONFIG, monsterCards: true, fusion: true, fusionLimit: 4 },
  towers: { ...DEFAULT_GAME_CONFIG, monsterCards: true, towersMode: true },
  spotlight: { ...DEFAULT_GAME_CONFIG, monsterCards: true, spotlightMode: true, spotlightPositive: true, spotlightNegative: true },
  reactions: { ...DEFAULT_GAME_CONFIG, monsterCards: true, reactionsMode: true, reactionsLimit: 3 },
};

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string, fallback: string): string => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] !== undefined ? args[idx + 1] : fallback;
  };
  const [p1raw, p2raw] = get('--matchup', 'all:all').split(':');
  const p1List = p1raw === 'all' ? ALL_CHARACTERS : [p1raw as CharacterId];
  const p2List = p2raw === 'all' ? ALL_CHARACTERS : [p2raw as CharacterId];
  return {
    p1List,
    p2List,
    games: Number(get('--games', '30')),
    maxSteps: Number(get('--steps', '3000')),
    configName: get('--config', 'base'),
  };
}

interface MagicUsage {
  attempts: number;
  accepted: number;
}

function runOneGame(c1: CharacterId, c2: CharacterId, config: GameConfig, maxSteps: number, magicUsage: Map<string, MagicUsage>) {
  let current = createInitialState(c1, c2, config);
  let steps = 0;
  while (!current.gameOver && steps < maxSteps) {
    steps++;
    if (current.numeralSpellPending) {
      current = gameReducer(current, { type: 'FINALIZE_NUMERAL_SPELL' });
      continue;
    }
    if (current.pendingReaction) {
      current = gameReducer(current, { type: 'RESOLVE_PENDING_REACTION' });
      continue;
    }
    if (current.combatResolution) {
      current = gameReducer(current, { type: 'FINALIZE_COMBAT' });
      continue;
    }
    if (current.combatSelection.player1 !== undefined && current.combatSelection.player2 !== undefined) {
      current = gameReducer(current, { type: 'RESOLVE_COMBAT' });
      continue;
    }
    const order: PlayerNumber[] = steps % 2 === 0 ? [1, 2] : [2, 1];
    let acted = false;
    for (const p of order) {
      const decision = decideAiAction(current, p);
      if (decision.type === 'action') {
        const action = decision.action as GameAction;
        const isMagic = action.type === 'EXECUTE_MAGIC';
        const key = isMagic ? `${(action as any).character}-${(action as any).magicType}` : null;
        if (key) {
          const usage = magicUsage.get(key) ?? { attempts: 0, accepted: 0 };
          usage.attempts++;
          magicUsage.set(key, usage);
        }
        const prev = current;
        current = gameReducer(current, action);
        if (key && current !== prev) magicUsage.get(key)!.accepted++;
        acted = true;
        break;
      } else if (decision.type === 'ready') {
        if (!current[playerKeyOf(p)].readyForNextPhase) {
          current = gameReducer(current, { type: 'TOGGLE_READY', player: p });
          acted = true;
          break;
        }
      }
    }
    if (!acted) break;
  }
  const winner = current.gameOver ? (current.player1.lives <= 0 ? 2 : current.player2.lives <= 0 ? 1 : null) : null;
  return { steps, winner, finished: Boolean(current.gameOver) };
}

function main() {
  const opts = parseArgs();
  const config = CONFIGS[opts.configName];
  if (!config) {
    console.error(`Config desconhecida: "${opts.configName}". Opções: ${Object.keys(CONFIGS).join(', ')}`);
    process.exitCode = 1;
    return;
  }

  for (const c1 of opts.p1List) {
    for (const c2 of opts.p2List) {
      const magicUsage = new Map<string, MagicUsage>();
      let totalSteps = 0;
      let p1Wins = 0;
      let p2Wins = 0;
      let unfinished = 0;

      for (let i = 0; i < opts.games; i++) {
        const { steps, winner, finished } = runOneGame(c1, c2, config, opts.maxSteps, magicUsage);
        totalSteps += steps;
        if (!finished) unfinished++;
        else if (winner === 1) p1Wins++;
        else if (winner === 2) p2Wins++;
      }

      console.log(`\n=== ${c1} vs ${c2} (${opts.games} partidas, config=${opts.configName}) ===`);
      console.log(`Passos médios: ${(totalSteps / opts.games).toFixed(1)} | ${c1} venceu: ${p1Wins} | ${c2} venceu: ${p2Wins} | não terminou: ${unfinished}`);
      if (magicUsage.size > 0) {
        console.log('Uso de magias (tentativas aceitas pelo motor / tentativas propostas pela IA):');
        for (const [key, usage] of [...magicUsage.entries()].sort()) {
          const rejected = usage.attempts - usage.accepted;
          const warn = rejected > 0 ? `  <-- ${rejected} REJEITADA(S) PELO MOTOR (bug?)` : '';
          console.log(`  ${key}: ${usage.accepted}/${usage.attempts}${warn}`);
        }
      } else {
        console.log('Nenhuma magia foi ativada em nenhuma das partidas.');
      }
    }
  }
}

main();
