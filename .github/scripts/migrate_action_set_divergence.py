from pathlib import Path

path = Path('src/app/lib/actionSpace.ts')
test_path = Path('scripts/action-validation-test.ts')
source = path.read_text()
test = test_path.read_text()

marker = "/** Um item do relatório de `checkActionDivergence` - ver comentário do módulo. */"
if source.count(marker) != 1:
    raise SystemExit('divergence marker not found exactly once')

block = '''/**
 * Serialização determinística de uma ação para comparação de conjuntos.
 * Objetos são ordenados por chave recursivamente; arrays preservam ordem
 * porque, em GameAction, a ordem enviada faz parte do payload observado pelo
 * reducer (mesmo quando uma regra específica trate o conjunto como simétrico).
 */
function stableActionKey(action: GameAction): string {
  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(normalize);
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, nested]) => [key, normalize(nested)])
      );
    }
    return value;
  };
  return JSON.stringify(normalize(action));
}

export interface ActionSetDivergenceReport {
  action: GameAction;
  /** A ação apareceu no fast path preditivo `enumerateLegalActions`. */
  predictedLegal: boolean;
  /** O reducer real aceitou a ação como mudança de gameplay. */
  reducerAccepted: boolean;
}

/**
 * Compara o conjunto predito pelo fast path com o conjunto reducer-backed.
 *
 * Falsos positivos do fast path são sempre verificáveis: cada ação prevista
 * é executada diretamente no reducer, mesmo se o gerador bounded de
 * candidatos não tiver produzido o mesmo payload.
 *
 * Falsos negativos continuam limitados à cobertura de
 * `enumerateCandidateActions`: só podemos descobrir uma ação aceita que o
 * fast path omitiu se o gerador sintático tiver construído essa ação.
 */
export function checkActionSetDivergence(state: GameState, player: PlayerNumber): ActionSetDivergenceReport[] {
  const predicted = enumerateLegalActions(state, player);
  const evaluatedCandidates = enumerateEvaluatedCandidateActions(state, player);
  const candidateByKey = new Map<string, EvaluatedCandidateAction>();
  for (const evaluated of evaluatedCandidates) candidateByKey.set(stableActionKey(evaluated.action), evaluated);

  const predictedByKey = new Map<string, GameAction>();
  const reports = new Map<string, ActionSetDivergenceReport>();

  for (const action of predicted) {
    const key = stableActionKey(action);
    predictedByKey.set(key, action);
    const reducerAccepted = (candidateByKey.get(key) ?? { action, ...evaluateAction(state, action) }).accepted;
    if (!reducerAccepted) reports.set(key, { action, predictedLegal: true, reducerAccepted: false });
  }

  for (const evaluated of evaluatedCandidates) {
    if (!evaluated.accepted) continue;
    const key = stableActionKey(evaluated.action);
    if (!predictedByKey.has(key)) {
      reports.set(key, { action: evaluated.action, predictedLegal: false, reducerAccepted: true });
    }
  }

  return [...reports.values()];
}

'''
source = source.replace(marker, block + marker)

import_anchor = "import { enumerateAcceptedActions } from '../src/app/lib/actionSpace';"
if test.count(import_anchor) != 1:
    raise SystemExit('actionSpace test import anchor not found')
test = test.replace(import_anchor, "import { checkActionSetDivergence, enumerateAcceptedActions } from '../src/app/lib/actionSpace';")

console_anchor = "console.log('✓ actionValidation: rejeição/log e ação aceita classificados corretamente');"
if test.count(console_anchor) != 1:
    raise SystemExit('console anchor not found')
extra = '''// O fast path e o reducer-backed devem concordar no estado inicial padrão.
// Se este assert quebrar no futuro, o relatório contém exatamente os payloads
// em que a previsão e o motor passaram a discordar.
const initialSetDivergence = checkActionSetDivergence(initial, 1);
assert.deepEqual(
  initialSetDivergence,
  [],
  `fast path e reducer divergiram no estado inicial: ${JSON.stringify(initialSetDivergence)}`
);

'''
test = test.replace(console_anchor, extra + console_anchor)

path.write_text(source)
test_path.write_text(test)
