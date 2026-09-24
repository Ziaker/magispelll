/**
 * scripts/replay-regression-test.ts - suíte de regressão via Replay/Bug
 * Capsule (item 7 do roadmap arquitetural: "todo bug corrigido vira
 * automaticamente um teste de regressão de replay... a suíte vai acumulando
 * partidas que no passado quebraram Magispelll").
 *
 * Cada arquivo em replays/*.json é um fixture {description, initialState,
 * actions, expectedOutcome} - ver scripts/generate-replay-fixture.ts pra como
 * gerar um novo (a partir de um replay exportado da UI/window.__debug depois
 * de corrigir um bug, ou sintético). Este script reproduz `actions` a partir
 * de `initialState` pelo MESMO gameReducer puro, checando invariantes a cada
 * passo, e compara o resultado final com `expectedOutcome` - qualquer
 * divergência é uma regressão real (o motor passou a se comportar diferente
 * de quando o fixture foi salvo).
 *
 * A suíte começa vazia e cresce com o tempo - replays/ ainda sem nenhum
 * fixture não é falha, é só o estado inicial esperado.
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gameReducer } from '../src/app/lib/gameEngine';
import { checkInvariants } from '../src/app/lib/invariants';

interface ReplayFixture {
  description: string;
  initialState: unknown;
  actions: Parameters<typeof gameReducer>[1][];
  expectedOutcome: {
    turn: number;
    gameOver: unknown;
    player1Lives: number;
    player2Lives: number;
  };
}

const REPLAYS_DIR = path.join(process.cwd(), 'replays');

const files = fs.existsSync(REPLAYS_DIR) ? fs.readdirSync(REPLAYS_DIR).filter((f) => f.endsWith('.json')).sort() : [];

if (files.length === 0) {
  console.log('✓ replay-regression: replays/ vazio por enquanto (suíte cresce conforme bugs forem capturados)');
} else {
  for (const file of files) {
    const fixture: ReplayFixture = JSON.parse(fs.readFileSync(path.join(REPLAYS_DIR, file), 'utf-8'));
    let state = fixture.initialState as Parameters<typeof gameReducer>[0];
    for (const action of fixture.actions) {
      state = gameReducer(state, action);
      const violations = checkInvariants(state);
      assert.equal(violations.length, 0, `${file}: violação de invariante ao reproduzir - ${violations.join('; ')}`);
    }
    assert.equal(state.turn, fixture.expectedOutcome.turn, `${file}: turno final divergiu do fixture (o motor mudou de comportamento?)`);
    assert.deepEqual(state.gameOver, fixture.expectedOutcome.gameOver, `${file}: resultado final (gameOver) divergiu do fixture`);
    assert.equal(state.player1.lives, fixture.expectedOutcome.player1Lives, `${file}: vidas do jogador 1 divergiram do fixture`);
    assert.equal(state.player2.lives, fixture.expectedOutcome.player2Lives, `${file}: vidas do jogador 2 divergiram do fixture`);
  }
  console.log(`✓ replay-regression: ${files.length} fixture(s) reproduzido(s) sem divergência (${files.join(', ')})`);
}
