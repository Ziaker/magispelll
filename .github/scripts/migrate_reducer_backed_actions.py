from pathlib import Path

action_space_path = Path('src/app/lib/actionSpace.ts')
test_path = Path('scripts/action-validation-test.ts')

source = action_space_path.read_text()
test = test_path.read_text()

old_import = "import { evaluateAction } from './actionValidation';"
new_import = "import { evaluateAction, type ActionEvaluation } from './actionValidation';"
if source.count(old_import) != 1:
    raise SystemExit('actionValidation import anchor not found exactly once')
source = source.replace(old_import, new_import)

marker = "/** Um item do relatório de `checkActionDivergence` - ver comentário do módulo. */"
if source.count(marker) != 1:
    raise SystemExit('DivergenceReport marker not found exactly once')

helper = '''/**
 * Candidato sintaticamente plausível já avaliado pelo reducer real.
 * `nextState` é preservado para consumidores (debug/IA/simulação) não
 * precisarem executar a mesma ação uma segunda vez só para inspecionar o
 * resultado.
 */
export interface EvaluatedCandidateAction extends ActionEvaluation {
  action: GameAction;
}

/**
 * Avalia, uma única vez cada, os candidatos bounded gerados por
 * `enumerateCandidateActions`. Esta é a fronteira reducer-backed do espaço de
 * ações: completude continua limitada pelo gerador de candidatos, mas
 * LEGALIDADE nunca é inferida por `canX` aqui.
 */
export function enumerateEvaluatedCandidateActions(state: GameState, player: PlayerNumber): EvaluatedCandidateAction[] {
  return enumerateCandidateActions(state, player).map((action) => ({ action, ...evaluateAction(state, action) }));
}

/**
 * Subconjunto realmente aceito pelo reducer entre os candidatos gerados.
 * Use esta função quando correção/autoridade for mais importante que o fast
 * path preditivo de `enumerateLegalActions`.
 */
export function enumerateAcceptedActions(state: GameState, player: PlayerNumber): EvaluatedCandidateAction[] {
  return enumerateEvaluatedCandidateActions(state, player).filter(({ accepted }) => accepted);
}

'''
source = source.replace(marker, helper + marker)

old_decl = "  const otherCandidates: GameAction[] = [];"
new_decl = "  const otherCandidates: EvaluatedCandidateAction[] = [];"
if source.count(old_decl) != 1:
    raise SystemExit('otherCandidates declaration anchor not found')
source = source.replace(old_decl, new_decl)

old_loop = "  for (const action of enumerateCandidateActions(state, player)) {\n    if (action.type === 'EXECUTE_MAGIC' || action.type === 'ACTIVATE_SIMPLE_MAGIC') {"
new_loop = "  for (const evaluated of enumerateEvaluatedCandidateActions(state, player)) {\n    const { action, accepted } = evaluated;\n    if (action.type === 'EXECUTE_MAGIC' || action.type === 'ACTIVATE_SIMPLE_MAGIC') {"
if source.count(old_loop) != 1:
    raise SystemExit('candidate loop anchor not found')
source = source.replace(old_loop, new_loop)

old_eval = "      const accepted = evaluateAction(state, action).accepted;\n"
if source.count(old_eval) != 1:
    raise SystemExit('inline magic evaluation anchor not found exactly once')
source = source.replace(old_eval, '')

old_else = "    } else {\n      otherCandidates.push(action);\n    }"
new_else = "    } else {\n      otherCandidates.push(evaluated);\n    }"
if source.count(old_else) != 1:
    raise SystemExit('otherCandidates push anchor not found')
source = source.replace(old_else, new_else)

old_other_loop = "  for (const action of otherCandidates) {\n    const reducerAccepted = evaluateAction(state, action).accepted;\n"
new_other_loop = "  for (const { action, accepted: reducerAccepted } of otherCandidates) {\n"
if source.count(old_other_loop) != 1:
    raise SystemExit('other candidate evaluation loop anchor not found')
source = source.replace(old_other_loop, new_other_loop)

test_import_anchor = "import { evaluateAction, isSameGameplayState } from '../src/app/lib/actionValidation';"
if test.count(test_import_anchor) != 1:
    raise SystemExit('action validation test import anchor not found')
test = test.replace(
    test_import_anchor,
    test_import_anchor + "\nimport { enumerateAcceptedActions } from '../src/app/lib/actionSpace';"
)

console_anchor = "console.log('✓ actionValidation: rejeição/log e ação aceita classificados corretamente');"
if test.count(console_anchor) != 1:
    raise SystemExit('action validation console anchor not found')
extra_tests = '''// O enumerador reducer-backed deve excluir candidatos recusados e preservar
// o estado já reduzido das ações aceitas.
const acceptedActions = enumerateAcceptedActions(initial, 1);
assert.ok(acceptedActions.length > 0, 'estado inicial deve expor ao menos uma ação aceita entre os candidatos');
assert.ok(acceptedActions.every(({ accepted }) => accepted), 'enumerateAcceptedActions nunca deve devolver rejeições');

const enumeratedDiscard = acceptedActions.find(({ action }) =>
  action.type === 'DISCARD_CARDS' && action.cardIds.length === 1 && action.cardIds[0] === discardable.id
);
assert.ok(enumeratedDiscard, 'descarte válido conhecido deve aparecer entre ações reducer-backed aceitas');
assert.equal(
  isSameGameplayState(acceptedDiscard.nextState, enumeratedDiscard.nextState),
  true,
  'enumerador deve preservar o mesmo nextState produzido por evaluateAction'
);

const acceptedFromRejectionState = enumerateAcceptedActions(rejectionState, 1);
assert.equal(
  acceptedFromRejectionState.some(({ action }) => action.type === 'DRAW_CARDS' && action.player === 1 && action.count === 1),
  false,
  'compra rejeitada pelo reducer não pode aparecer entre ações aceitas'
);

'''
test = test.replace(console_anchor, extra_tests + console_anchor)

action_space_path.write_text(source)
test_path.write_text(test)
