/**
 * scripts/tierlist.ts - roda um round-robin completo IA vs IA entre TODOS os
 * 8 personagens (ambos os lados de cada matchup, pra anular vantagem de
 * quem joga primeiro) e agrega: winrate geral por personagem, winrate por
 * matchup específico, e uso de magia (tentativas aceitas pelo motor) por
 * personagem - a base de dados pra montar uma tierlist e explicar POR QUE
 * cada um é forte/fraco (ex.: uma magia que quase nunca é aceita pelo motor
 * é um sinal forte de heurística de IA ruim, não só de personagem fraco).
 *
 * USO:
 *   npx tsx scripts/tierlist.ts --games 40 --config base
 */
import { createInitialState, gameReducer, type CharacterId, type GameAction, type PlayerNumber } from '../src/app/lib/gameEngine';
import { DEFAULT_GAME_CONFIG, type GameConfig } from '../src/app/lib/gameConfig';
import { decideAiAction } from '../src/app/lib/aiPlayer';
import { playerKeyOf } from '../src/app/lib/gameEngine';

const ALL_CHARACTERS: CharacterId[] = ['mago', 'besta', 'anjo', 'mosqueteiro', 'coringa', 'piromante', 'druida', 'glacial'];

const CONFIGS: Record<string, GameConfig> = {
  base: { ...DEFAULT_GAME_CONFIG, monsterCards: true },
};

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string, fallback: string): string => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] !== undefined ? args[idx + 1] : fallback;
  };
  return {
    games: Number(get('--games', '40')),
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
        const isSimple = action.type === 'ACTIVATE_SIMPLE_MAGIC';
        const character = p === 1 ? c1 : c2;
        const key = isMagic ? `${character}-${(action as any).magicType}` : isSimple ? `${character}-simple` : null;
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

interface CharStats {
  wins: number;
  losses: number;
  unfinished: number;
  games: number;
}

function main() {
  const opts = parseArgs();
  const config = CONFIGS[opts.configName];
  const overall = new Map<CharacterId, CharStats>(ALL_CHARACTERS.map((c) => [c, { wins: 0, losses: 0, unfinished: 0, games: 0 }]));
  const perMagicUsage = new Map<string, MagicUsage>();
  const matchupResults: { c1: CharacterId; c2: CharacterId; p1Wins: number; p2Wins: number; unfinished: number }[] = [];

  const startedAt = Date.now();
  let totalGames = 0;

  for (const c1 of ALL_CHARACTERS) {
    for (const c2 of ALL_CHARACTERS) {
      if (c1 === c2) continue; // sem espelho por ora - foco em winrate entre personagens diferentes
      let p1Wins = 0;
      let p2Wins = 0;
      let unfinished = 0;
      for (let i = 0; i < opts.games; i++) {
        const { winner, finished } = runOneGame(c1, c2, config, opts.maxSteps, perMagicUsage);
        totalGames++;
        if (!finished) unfinished++;
        else if (winner === 1) p1Wins++;
        else if (winner === 2) p2Wins++;
      }
      matchupResults.push({ c1, c2, p1Wins, p2Wins, unfinished });

      const s1 = overall.get(c1)!;
      s1.wins += p1Wins;
      s1.losses += p2Wins;
      s1.unfinished += unfinished;
      s1.games += opts.games;
    }
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\n=== ${totalGames} partidas simuladas em ${elapsed}s (${opts.games} por matchup, config=${opts.configName}) ===\n`);

  console.log('--- TIERLIST GERAL (winrate agregado contra todos os outros 7) ---');
  const ranked = [...overall.entries()].sort((a, b) => b[1].wins / b[1].games - a[1].wins / a[1].games);
  ranked.forEach(([char, s], i) => {
    const winrate = ((s.wins / s.games) * 100).toFixed(1);
    console.log(`${i + 1}. ${char.toUpperCase()}: ${winrate}% (${s.wins}V / ${s.losses}D / ${s.unfinished} não terminou, ${s.games} partidas)`);
  });

  console.log('\n--- USO DE MAGIA POR PERSONAGEM (aceitas / tentadas) ---');
  for (const char of ALL_CHARACTERS) {
    console.log(`${char.toUpperCase()}:`);
    for (const type of ['J', 'Q', 'K', 'simple']) {
      const usage = perMagicUsage.get(`${char}-${type}`);
      if (!usage) {
        console.log(`  ${type}: NUNCA TENTADA`);
      } else {
        const rejected = usage.attempts - usage.accepted;
        const warn = rejected > 0 ? `  <-- ${rejected} rejeitada(s) pelo motor` : '';
        console.log(`  ${type}: ${usage.accepted}/${usage.attempts}${warn}`);
      }
    }
  }

  console.log('\n--- MATCHUPS DETALHADOS ---');
  for (const m of matchupResults) {
    console.log(`${m.c1} vs ${m.c2}: ${m.p1Wins}V / ${m.p2Wins}D / ${m.unfinished} não terminou`);
  }
}

main();
