from pathlib import Path

sim_path = Path('src/app/lib/simulateGame.ts')
fuzz_path = Path('scripts/fuzz.ts')
sim = sim_path.read_text()
fuzz = fuzz_path.read_text()

# simulateGame imports
old = "import { enumerateLegalActions } from './actionSpace';"
new = "import { enumerateAcceptedActions, enumerateLegalActions } from './actionSpace';"
if sim.count(old) != 1:
    raise SystemExit('simulateGame actionSpace import anchor not found')
sim = sim.replace(old, new)

# Export authority type before FuzzStepsResult.
marker = "export interface FuzzStepsResult {"
if sim.count(marker) != 1:
    raise SystemExit('FuzzStepsResult marker not found')
sim = sim.replace(marker, "export type SubstituteAuthority = 'predicted' | 'reducer';\n\n" + marker)

# Update source docs.
sim = sim.replace(
    " * (só em `fuzzSteps`) = a ação veio de `enumerateLegalActions` no lugar da\n   * escolha da IA - rejeição aqui é ESPERADA às vezes (o modo \"legal\" do\n   * enumerador não é 100% preciso por design, ver actionSpace.ts), nunca por\n   * si só um sinal de bug.",
    " * (só em `fuzzSteps`) = a ação veio do enumerador no lugar da escolha da\n   * IA. No modo `predicted`, rejeição ainda pode acontecer porque o fast path\n   * não é autoridade. No modo `reducer`, a substituição já foi aceita por\n   * `evaluateAction`, então uma rejeição seria um bug do próprio harness."
)

old_sig = "  opts: { maxSteps?: number; substituteProbability?: number; expectedCardTotal?: number } = {}"
new_sig = "  opts: { maxSteps?: number; substituteProbability?: number; expectedCardTotal?: number; substituteAuthority?: SubstituteAuthority } = {}"
if sim.count(old_sig) != 1:
    raise SystemExit('fuzzSteps opts signature anchor not found')
sim = sim.replace(old_sig, new_sig)

old_prob = "  const substituteProbability = Math.min(1, Math.max(0, opts.substituteProbability ?? 0.15));"
new_prob = old_prob + "\n  const substituteAuthority: SubstituteAuthority = opts.substituteAuthority ?? 'predicted';"
if sim.count(old_prob) != 1:
    raise SystemExit('substituteProbability anchor not found')
sim = sim.replace(old_prob, new_prob)

old_dispatch = "  const dispatchAndCheck = (action: GameAction): boolean => {\n    const prevState = current;\n    current = gameReducer(current, action);"
new_dispatch = "  const dispatchAndCheck = (action: GameAction, precomputedNextState?: GameState): boolean => {\n    const prevState = current;\n    current = precomputedNextState ?? gameReducer(current, action);"
if sim.count(old_dispatch) != 1:
    raise SystemExit('dispatchAndCheck anchor not found')
sim = sim.replace(old_dispatch, new_dispatch)

old_sub = """        let action = decision.action;
        let source: 'ai' | 'substitute' = 'ai';
        if (random() < substituteProbability) {
          const legal = enumerateLegalActions(current, p);
          if (legal.length > 0) {
            action = legal[Math.floor(random() * legal.length)];
            source = 'substitute';
          }
        }
        const prevState = current;
        if (dispatchAndCheck(action)) { actedThisStep = true; break; }
"""
new_sub = """        let action = decision.action;
        let source: 'ai' | 'substitute' = 'ai';
        let precomputedNextState: GameState | undefined;
        if (random() < substituteProbability) {
          if (substituteAuthority === 'reducer') {
            const accepted = enumerateAcceptedActions(current, p);
            if (accepted.length > 0) {
              const chosen = accepted[Math.floor(random() * accepted.length)];
              action = chosen.action;
              precomputedNextState = chosen.nextState;
              source = 'substitute';
            }
          } else {
            const legal = enumerateLegalActions(current, p);
            if (legal.length > 0) {
              action = legal[Math.floor(random() * legal.length)];
              source = 'substitute';
            }
          }
        }
        const prevState = current;
        if (dispatchAndCheck(action, precomputedNextState)) { actedThisStep = true; break; }
"""
if sim.count(old_sub) != 1:
    raise SystemExit('fuzz substitution block anchor not found')
sim = sim.replace(old_sub, new_sub)

# Refresh fuzzSteps doc wording.
sim = sim.replace(
    " * da IA heurística por uma ação ALEATÓRIA de `enumerateLegalActions` (modo\n * \"legal\", rápido - ver actionSpace.ts) - explora estado que a IA heurística\n * sozinha nunca visitaria.",
    " * da IA heurística por uma ação ALEATÓRIA. `substituteAuthority='predicted'`\n * usa `enumerateLegalActions` (rápido); `'reducer'` usa\n * `enumerateAcceptedActions` (mais caro, mas a substituição é realmente legal).\n * Ambos exploram estados que a IA heurística sozinha nunca visitaria."
)

# scripts/fuzz imports and CLI.
fuzz = fuzz.replace(
    "import { fuzzSteps } from '../src/app/lib/simulateGame';",
    "import { fuzzSteps, type SubstituteAuthority } from '../src/app/lib/simulateGame';"
)
fuzz = fuzz.replace(
    "import { checkActionDivergence } from '../src/app/lib/actionSpace';",
    "import { checkActionSetDivergence } from '../src/app/lib/actionSpace';"
)
fuzz = fuzz.replace(
    " *   npm run fuzz -- --substitute 0.3\n",
    " *   npm run fuzz -- --substitute 0.3\n *   npm run fuzz -- --authority reducer         -- substituições validadas pelo reducer\n"
)

parse_anchor = "    substitute: Number(get('--substitute', '0.15')),"
if fuzz.count(parse_anchor) != 1:
    raise SystemExit('parse substitute anchor not found')
fuzz = fuzz.replace(parse_anchor, parse_anchor + "\n    authority: get('--authority', 'predicted') as SubstituteAuthority,")

old_run_sig = "function runOneGame(seed: number, c1: CharacterId, c2: CharacterId, configName: string, maxSteps: number, substituteProbability: number, checkDivergence: boolean) {"
new_run_sig = "function runOneGame(seed: number, c1: CharacterId, c2: CharacterId, configName: string, maxSteps: number, substituteProbability: number, checkDivergence: boolean, substituteAuthority: SubstituteAuthority) {"
if fuzz.count(old_run_sig) != 1:
    raise SystemExit('runOneGame signature anchor not found')
fuzz = fuzz.replace(old_run_sig, new_run_sig)

old_call = "  const result = fuzzSteps(state, { maxSteps, substituteProbability, expectedCardTotal: expectedTotal });"
new_call = "  const result = fuzzSteps(state, { maxSteps, substituteProbability, expectedCardTotal: expectedTotal, substituteAuthority });"
if fuzz.count(old_call) != 1:
    raise SystemExit('fuzzSteps call anchor not found')
fuzz = fuzz.replace(old_call, new_call)

old_div = "    const divergence = checkActionDivergence(result.state, 1).concat(checkActionDivergence(result.state, 2));\n    if (divergence.length > 0) {\n      failures.push(`${divergence.length} divergência(s) predicado×motor no estado final: ${JSON.stringify(divergence.slice(0, 3))}`);\n    }"
new_div = "    const divergence = checkActionSetDivergence(result.state, 1).concat(checkActionSetDivergence(result.state, 2));\n    if (divergence.length > 0) {\n      failures.push(`${divergence.length} divergência(s) fast-path×reducer no estado final: ${JSON.stringify(divergence.slice(0, 3))}`);\n    }"
if fuzz.count(old_div) != 1:
    raise SystemExit('divergence call anchor not found')
fuzz = fuzz.replace(old_div, new_div)

# Reducer-backed substitutes must never be rejected.
anchor = "  const aiRejections = result.rejectedActions.filter((r) => r.source !== 'substitute');"
if fuzz.count(anchor) != 1:
    raise SystemExit('aiRejections anchor not found')
addition = anchor + "\n  const substituteRejections = result.rejectedActions.filter((r) => r.source === 'substitute');\n  if (substituteAuthority === 'reducer' && substituteRejections.length > 0) {\n    failures.push(`${substituteRejections.length} substituição(ões) reducer-backed foram rejeitadas - isso viola o contrato do harness`);\n  }"
fuzz = fuzz.replace(anchor, addition)

# Validate authority early in main.
main_anchor = "function main() {\n  const opts = parseArgs();"
if fuzz.count(main_anchor) != 1:
    raise SystemExit('main anchor not found')
fuzz = fuzz.replace(main_anchor, main_anchor + "\n  if (opts.authority !== 'predicted' && opts.authority !== 'reducer') {\n    console.error(`Authority desconhecida: ${opts.authority}. Use predicted ou reducer.`);\n    process.exitCode = 1;\n    return;\n  }")

# Add authority argument to all runOneGame calls.
fuzz = fuzz.replace(
    "runOneGame(opts.seed !== undefined ? opts.seed + i : i, c1, c2, configName, opts.steps, opts.substitute, false);",
    "runOneGame(opts.seed !== undefined ? opts.seed + i : i, c1, c2, configName, opts.steps, opts.substitute, false, opts.authority);"
)
fuzz = fuzz.replace(
    "runOneGame(seed, p1, p2, configName, opts.steps, opts.substitute, opts.checkDivergence);",
    "runOneGame(seed, p1, p2, configName, opts.steps, opts.substitute, opts.checkDivergence, opts.authority);"
)
fuzz = fuzz.replace(
    "runOneGame(seed, c1, c2, configName, opts.steps, opts.substitute, opts.checkDivergence);",
    "runOneGame(seed, c1, c2, configName, opts.steps, opts.substitute, opts.checkDivergence, opts.authority);"
)

fuzz = fuzz.replace(
    "substituição=${opts.substitute}${opts.seed !== undefined",
    "substituição=${opts.substitute}, authority=${opts.authority}${opts.seed !== undefined"
)
fuzz = fuzz.replace(
    "--steps ${opts.steps} --substitute ${opts.substitute}`);",
    "--steps ${opts.steps} --substitute ${opts.substitute} --authority ${opts.authority}`);"
)

sim_path.write_text(sim)
fuzz_path.write_text(fuzz)
