/**
 * scripts/generate-replay-fixture.ts - promove um replay bruto ({initialState,
 * actions}, o MESMO formato que window.__debug.getReplayLog()/o botão
 * "exportar replay" da UI já produzem - ver GameBoard.tsx) a um fixture de
 * regressão em replays/ (item 7 do roadmap arquitetural, "Bug Capsule": todo
 * bug corrigido vira automaticamente um teste de regressão de replay).
 *
 * Reproduz o replay pelo motor ATUAL (gameReducer) e calcula `expectedOutcome`
 * a partir do resultado - ou seja, o fixture sempre trava o comportamento
 * CORRETO no momento em que foi salvo (idealmente: depois de corrigir o bug
 * que motivou a exportação, não antes).
 *
 * USO:
 *   # promove um replay exportado da UI (achou um bug ao vivo, corrigiu,
 *   # quer travar o resultado certo como regressão pra sempre)
 *   npx tsx scripts/generate-replay-fixture.ts \
 *     --from ~/Downloads/magispelll-replay-5-123.json \
 *     --description "Coringa: Valete armadilha não dissipava em fumaça ao ser alvejado 2x seguidas" \
 *     --out replays/coringa-valete-alvo-duplo.json
 *
 *   # gera um fixture SINTÉTICO (partida IA vs IA qualquer, sem bug nenhum
 *   # por trás) - útil como smoke-test de que o replay em si é determinístico
 *   npx tsx scripts/generate-replay-fixture.ts \
 *     --matchup mago:besta --steps 60 \
 *     --description "smoke test: replay determinístico de uma partida comum" \
 *     --out replays/smoke-mago-besta.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { createInitialState } from '../src/app/lib/gameStateFactory';
import { gameReducer } from '../src/app/lib/gameEngine';
import type { GameAction } from '../src/app/lib/gameActionTypes';
import type { GameState } from '../src/app/lib/gameStateTypes';
import { DEFAULT_GAME_CONFIG } from '../src/app/lib/gameConfig';
import type { CharacterId } from '../src/app/lib/characterRegistry';
import { simulateSteps } from '../src/app/lib/simulateGame';
import { checkInvariants } from '../src/app/lib/invariants';

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };
  return {
    from: get('--from'),
    matchup: get('--matchup') ?? 'mago:besta',
    steps: Number(get('--steps') ?? '60'),
    description: get('--description'),
    out: get('--out'),
  };
}

function main() {
  const opts = parseArgs();
  if (!opts.description) {
    console.error('--description é obrigatório (o que este fixture documenta/protege).');
    process.exitCode = 1;
    return;
  }
  if (!opts.out) {
    console.error('--out é obrigatório (caminho do fixture, ex.: replays/algum-nome.json).');
    process.exitCode = 1;
    return;
  }

  let initialState: GameState;
  let actions: GameAction[];

  if (opts.from) {
    const raw = JSON.parse(fs.readFileSync(opts.from, 'utf-8'));
    initialState = raw.initialState;
    actions = raw.actions;
  } else {
    const [c1, c2] = opts.matchup.split(':') as [CharacterId, CharacterId];
    initialState = createInitialState(c1, c2, DEFAULT_GAME_CONFIG);
    const result = simulateSteps(initialState, { maxSteps: opts.steps, recordActions: true });
    actions = result.actions ?? [];
  }

  let state = initialState;
  for (const action of actions) {
    state = gameReducer(state, action);
    const violations = checkInvariants(state);
    if (violations.length > 0) {
      console.error(`Replay viola invariantes ao reproduzir - fixture NÃO gerado: ${violations.join('; ')}`);
      process.exitCode = 1;
      return;
    }
  }

  const fixture = {
    description: opts.description,
    initialState,
    actions,
    expectedOutcome: {
      turn: state.turn,
      gameOver: state.gameOver,
      player1Lives: state.player1.lives,
      player2Lives: state.player2.lives,
    },
  };

  fs.mkdirSync(path.dirname(opts.out), { recursive: true });
  fs.writeFileSync(opts.out, JSON.stringify(fixture, null, 2));
  console.log(`✓ Fixture salvo em ${opts.out} (${actions.length} ações, ${state.turn} turno(s), expectedOutcome calculado a partir do motor atual)`);
}

main();
