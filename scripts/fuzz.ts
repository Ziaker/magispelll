/**
 * scripts/fuzz.ts - harness de stress-test headless (item 6 do plano de
 * melhoria do debug mode).
 *
 * Combina os itens 1/2/3/4: `enumerateLegalActions` (actionSpace.ts) como
 * fonte de ações "estranhas" que a IA heurística sozinha nunca tentaria,
 * `random()` com seed (rng.ts) pra qualquer corrida ser reproduzível byte a
 * byte, `simulateSteps`/`fuzzSteps` (simulateGame.ts) como o laço em si, e
 * `checkInvariants` (invariants.ts) rodando a cada passo despachado.
 *
 * USO:
 *   npm run fuzz                              -- 50 partidas, varrendo personagens/config
 *   npm run fuzz -- --games 500 --steps 800
 *   npm run fuzz -- --substitute 0.3
 *   npm run fuzz -- --check-divergence         -- roda checkActionDivergence 1x por partida também
 *   npm run fuzz -- --bench                    -- só mede partidas/segundo (decide se vale a pena paralelizar - item 7)
 *   npm run fuzz -- --seed 12345 --p1 coringa --p2 piromante --config towers+fusion
 *                                              -- reproduz UMA partida exata (é exatamente o comando
 *                                                 impresso automaticamente quando uma falha é encontrada -
 *                                                 nunca depende de índice de loop, só desses 4 valores).
 */
import { createInitialState, type CharacterId } from '../src/app/lib/gameEngine';
import { DEFAULT_GAME_CONFIG, type GameConfig } from '../src/app/lib/gameConfig';
import { fuzzSteps } from '../src/app/lib/simulateGame';
import { checkActionDivergence } from '../src/app/lib/actionSpace';
import { setSeed } from '../src/app/lib/rng';
import { countAllCards } from '../src/app/lib/invariants';

const ALL_CHARACTERS: CharacterId[] = ['mago', 'besta', 'anjo', 'mosqueteiro', 'coringa', 'piromante'];

const CONFIGS: Record<string, GameConfig> = {
  base: { ...DEFAULT_GAME_CONFIG, monsterCards: true },
  fusion: { ...DEFAULT_GAME_CONFIG, monsterCards: true, fusion: true, fusionLimit: 4 },
  towers: { ...DEFAULT_GAME_CONFIG, monsterCards: true, towersMode: true },
  'towers+fusion': { ...DEFAULT_GAME_CONFIG, monsterCards: true, towersMode: true, fusion: true, fusionLimit: 4 },
  spotlight: { ...DEFAULT_GAME_CONFIG, monsterCards: true, spotlightMode: true, spotlightPositive: true, spotlightNegative: true },
  reactions: { ...DEFAULT_GAME_CONFIG, monsterCards: true, reactionsMode: true, reactionsLimit: 3 },
};
const CONFIG_NAMES = Object.keys(CONFIGS);

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string, fallback: string): string => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] !== undefined ? args[idx + 1] : fallback;
  };
  const p1 = args.includes('--p1') ? (get('--p1', '') as CharacterId) : undefined;
  const p2 = args.includes('--p2') ? (get('--p2', '') as CharacterId) : undefined;
  const configName = args.includes('--config') ? get('--config', 'base') : undefined;
  return {
    games: Number(get('--games', '50')),
    steps: Number(get('--steps', '500')),
    seed: args.includes('--seed') ? Number(get('--seed', '0')) : undefined,
    substitute: Number(get('--substitute', '0.15')),
    checkDivergence: args.includes('--check-divergence'),
    bench: args.includes('--bench'),
    // Quando os 3 (p1/p2/config) são dados, roda só ESSA partida exata -
    // é exatamente o formato do comando de reprodução impresso abaixo, pra
    // nunca depender de índice de loop (bug real do 1º rascunho deste
    // script: o comando de reprodução original reusava só `--seed`, mas
    // matchup/config vinham do índice `i` do loop de varredura - reproduzir
    // com `--games 1` recriava o índice 0, quase nunca a partida que
    // realmente falhou).
    single: p1 && p2 && configName ? { p1, p2, configName } : undefined,
  };
}

function runOneGame(seed: number, c1: CharacterId, c2: CharacterId, configName: string, maxSteps: number, substituteProbability: number, checkDivergence: boolean) {
  setSeed(seed);
  const state = createInitialState(c1, c2, CONFIGS[configName]);
  const expectedTotal = countAllCards(state);
  const result = fuzzSteps(state, { maxSteps, substituteProbability, expectedCardTotal: expectedTotal });

  const failures: string[] = [];
  if (result.violation) {
    failures.push(`Violação de invariante no passo ${result.violation.step}: ${result.violation.violations.join('; ')} (ação: ${JSON.stringify(result.violation.action)})`);
  }
  if (result.stuck) {
    failures.push(`Travou (nenhum lado tinha ação disponível) no passo ${result.steps}`);
  }
  // FIX (bug real no próprio script, achado testando-o): `rejectedActions`
  // mistura rejeições da IA HEURÍSTICA (decideAiAction - SEMPRE um sinal de
  // bug real, ela nunca deveria propor algo inválido) com rejeições da
  // SUBSTITUIÇÃO aleatória (enumerateLegalActions - esperado às vezes, o
  // modo "legal" do enumerador não é 100% preciso por design, ver o
  // comentário de `source` em simulateGame.ts). Só a primeira categoria
  // conta como falha aqui - contar as duas juntas (como a 1ª versão deste
  // script fazia) gerava "falhas" toda vez que `--substitute` estava > 0,
  // mesmo sem nenhum bug real.
  const aiRejections = result.rejectedActions.filter((r) => r.source !== 'substitute');
  if (aiRejections.length > 0) {
    failures.push(`${aiRejections.length} ação(ões) da IA heurística rejeitada(s) em silêncio pelo motor (passo(s): ${aiRejections.map((r) => r.step).join(', ')})`);
  }
  if (checkDivergence) {
    const divergence = checkActionDivergence(result.state, 1).concat(checkActionDivergence(result.state, 2));
    if (divergence.length > 0) {
      failures.push(`${divergence.length} divergência(s) predicado×motor no estado final: ${JSON.stringify(divergence.slice(0, 3))}`);
    }
  }

  return { failures, steps: result.steps, gameOver: result.state.gameOver };
}

function main() {
  const opts = parseArgs();

  if (opts.bench) {
    const games = opts.games || 200;
    console.log(`--bench: rodando ${games} partidas (single-thread) pra medir partidas/segundo...`);
    const start = Date.now();
    for (let i = 0; i < games; i++) {
      const c1 = ALL_CHARACTERS[i % ALL_CHARACTERS.length];
      const c2 = ALL_CHARACTERS[(i + 1) % ALL_CHARACTERS.length];
      const configName = CONFIG_NAMES[i % CONFIG_NAMES.length];
      runOneGame(opts.seed !== undefined ? opts.seed + i : i, c1, c2, configName, opts.steps, opts.substitute, false);
    }
    const elapsedS = (Date.now() - start) / 1000;
    console.log(`${games} partidas em ${elapsedS.toFixed(2)}s -> ${(games / elapsedS).toFixed(1)} partidas/segundo (single-thread)`);
    console.log('Item 7 do plano (paralelismo via worker_threads) só vale a pena construir se este número for baixo demais pro fluxo real de caça a bugs - ver a nota "NÃO construir agora" no plano aprovado.');
    return;
  }

  if (opts.single) {
    const { p1, p2, configName } = opts.single;
    if (!CONFIGS[configName]) {
      console.error(`Config desconhecida: "${configName}". Opções: ${CONFIG_NAMES.join(', ')}`);
      process.exitCode = 1;
      return;
    }
    const seed = opts.seed ?? 0;
    const { failures, steps, gameOver } = runOneGame(seed, p1, p2, configName, opts.steps, opts.substitute, opts.checkDivergence);
    console.log(`Partida única: seed=${seed} ${p1} vs ${p2} config=${configName} passos=${steps} gameOver=${JSON.stringify(gameOver)}`);
    if (failures.length > 0) {
      console.error('FALHAS:');
      for (const f of failures) console.error(`  - ${f}`);
      process.exitCode = 1;
    } else {
      console.log('Nenhuma falha.');
    }
    return;
  }

  console.log(`Rodando ${opts.games} partidas, até ${opts.steps} passos cada, substituição=${opts.substitute}${opts.seed !== undefined ? `, seed base=${opts.seed}` : ' (sem seed fixa)'}...`);
  let failCount = 0;
  for (let i = 0; i < opts.games; i++) {
    const seed = opts.seed !== undefined ? opts.seed + i : Math.floor(Math.random() * 2 ** 31);
    const c1 = ALL_CHARACTERS[i % ALL_CHARACTERS.length];
    const c2 = ALL_CHARACTERS[(i + 7) % ALL_CHARACTERS.length];
    const configName = CONFIG_NAMES[i % CONFIG_NAMES.length];
    const { failures, steps } = runOneGame(seed, c1, c2, configName, opts.steps, opts.substitute, opts.checkDivergence);
    if (failures.length > 0) {
      failCount++;
      console.error(`\nFALHA (partida ${i + 1}/${opts.games}): seed=${seed} matchup=${c1} vs ${c2} config=${configName} passos=${steps}`);
      for (const f of failures) console.error(`  - ${f}`);
      console.error(`  Reproduza com: npm run fuzz -- --seed ${seed} --p1 ${c1} --p2 ${c2} --config "${configName}" --steps ${opts.steps} --substitute ${opts.substitute}`);
    }
  }
  console.log(`\n${opts.games - failCount}/${opts.games} partidas limpas, ${failCount} falha(s) encontrada(s).`);
  process.exitCode = failCount > 0 ? 1 : 0;
}

main();
