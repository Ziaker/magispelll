/**
 * scripts/ai-score-vs-heuristic.ts - valida a IA 2.0 (aiScoring.ts,
 * `decideActionByScore`) SEM ligá-la a nenhuma partida de verdade: simula
 * partidas onde um lado usa a pontuação nova e o outro a árvore heurística
 * de sempre (aiPlayer.ts, `decideAiAction`), alternando qual LADO usa qual
 * (evita confundir "IA 2.0 é melhor" com "quem joga primeiro é melhor" - o
 * mesmo tipo de viés que o Balance Lab achou de verdade em tierlist.ts), e
 * reporta quem venceu mais.
 *
 * Também reporta ações rejeitadas pelo motor especificamente do lado da IA
 * 2.0 - esperado ser SEMPRE ZERO por construção (`decideActionByScore` só
 * escolhe entre candidatas que `enumerateAcceptedActions` já confirmou como
 * aceitas pelo reducer) - um valor > 0 aqui seria um bug real na própria
 * `decideActionByScore`, não uma característica esperada.
 *
 * USO:
 *   npx tsx scripts/ai-score-vs-heuristic.ts --games 20
 *   npx tsx scripts/ai-score-vs-heuristic.ts --matchup druida:mago --games 50
 */
import { createInitialState } from '../src/app/lib/gameStateFactory';
import { ALL_CHARACTER_IDS, type CharacterId } from '../src/app/lib/characterRegistry';
import { DEFAULT_GAME_CONFIG } from '../src/app/lib/gameConfig';
import { simulateSteps } from '../src/app/lib/simulateGame';
import { decideActionByScore } from '../src/app/lib/aiScoring';

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string, fallback: string): string => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] !== undefined ? args[idx + 1] : fallback;
  };
  const [p1raw, p2raw] = get('--matchup', 'all:all').split(':');
  const p1List = p1raw === 'all' ? ALL_CHARACTER_IDS : [p1raw as CharacterId];
  const p2List = p2raw === 'all' ? ALL_CHARACTER_IDS : [p2raw as CharacterId];
  return {
    p1List,
    p2List,
    games: Number(get('--games', '20')),
    maxSteps: Number(get('--steps', '3000')),
  };
}

function main() {
  const opts = parseArgs();
  let scoreWins = 0;
  let heuristicWins = 0;
  let unfinished = 0;
  let stuckGames = 0;
  let scoreRejections = 0;
  let totalGames = 0;

  for (const c1 of opts.p1List) {
    for (const c2 of opts.p2List) {
      for (let i = 0; i < opts.games; i++) {
        const scoreIsP1 = i % 2 === 0;
        const initial = createInitialState(c1, c2, DEFAULT_GAME_CONFIG);
        const result = simulateSteps(initial, {
          maxSteps: opts.maxSteps,
          decisionFns: scoreIsP1 ? { player1: decideActionByScore } : { player2: decideActionByScore },
        });
        totalGames++;
        if (result.stuck) stuckGames++;
        const scoreSeat = scoreIsP1 ? 1 : 2;
        scoreRejections += result.rejectedActions.filter((r) => r.player === scoreSeat).length;
        if (!result.state.gameOver) {
          unfinished++;
          continue;
        }
        if (result.state.gameOver.winner === scoreSeat) scoreWins++;
        else heuristicWins++;
      }
    }
  }

  const decided = scoreWins + heuristicWins;
  console.log(`\n=== IA 2.0 (pontuação) vs heurística - ${totalGames} partidas ===`);
  console.log(
    `IA 2.0 venceu: ${scoreWins} (${decided > 0 ? ((scoreWins / decided) * 100).toFixed(1) : '0.0'}%) | Heurística venceu: ${heuristicWins} | não terminou: ${unfinished} | travou: ${stuckGames}`
  );
  console.log(`Ações da IA 2.0 rejeitadas pelo motor: ${scoreRejections} (esperado: 0 - só escolhe entre candidatas já aceitas)`);
}

main();
