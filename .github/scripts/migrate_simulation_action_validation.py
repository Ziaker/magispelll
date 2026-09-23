from pathlib import Path

path = Path('src/app/lib/simulateGame.ts')
source = path.read_text()

import_anchor = "import { enumerateAcceptedActions, enumerateLegalActions } from './actionSpace';"
if source.count(import_anchor) != 1:
    raise SystemExit('actionSpace import anchor not found')
source = source.replace(import_anchor, import_anchor + "\nimport { evaluateAction } from './actionValidation';")

old_ai = '''      if (decision.type === 'action') {
        const prevState = current;
        current = gameReducer(current, decision.action);
        if (current === prevState) {
          rejectedActions.push({ step: steps, player: p, action: decision.action });
        }
        actedThisStep = true;
        break;
      } else if (decision.type === 'ready') {
        if (!current[playerKeyOf(p)].readyForNextPhase) {
          const prevState = current;
          current = gameReducer(current, { type: 'TOGGLE_READY', player: p });
          if (current === prevState) {
            rejectedActions.push({ step: steps, player: p, action: { type: 'TOGGLE_READY', player: p } });
          }
          actedThisStep = true;
          break;
        }
      }
'''
new_ai = '''      if (decision.type === 'action') {
        const evaluation = evaluateAction(current, decision.action);
        current = evaluation.nextState;
        if (!evaluation.accepted) {
          rejectedActions.push({ step: steps, player: p, action: decision.action });
        }
        actedThisStep = true;
        break;
      } else if (decision.type === 'ready') {
        if (!current[playerKeyOf(p)].readyForNextPhase) {
          const action: GameAction = { type: 'TOGGLE_READY', player: p };
          const evaluation = evaluateAction(current, action);
          current = evaluation.nextState;
          if (!evaluation.accepted) {
            rejectedActions.push({ step: steps, player: p, action });
          }
          actedThisStep = true;
          break;
        }
      }
'''
if source.count(old_ai) != 1:
    raise SystemExit('simulateSteps AI block anchor not found')
source = source.replace(old_ai, new_ai)

old_dispatch = '''  const dispatchAndCheck = (action: GameAction, precomputedNextState?: GameState): boolean => {
    const prevState = current;
    current = precomputedNextState ?? gameReducer(current, action);
    if (current === prevState) return false;
'''
new_dispatch = '''  const dispatchAndCheck = (
    action: GameAction,
    precomputedNextState?: GameState
  ): { accepted: boolean; violated: boolean } => {
    const evaluation = precomputedNextState
      ? { accepted: true, nextState: precomputedNextState }
      : evaluateAction(current, action);
    current = evaluation.nextState;
    if (!evaluation.accepted) return { accepted: false, violated: false };
'''
if source.count(old_dispatch) != 1:
    raise SystemExit('dispatchAndCheck start anchor not found')
source = source.replace(old_dispatch, new_dispatch)

old_violation_return = '''      violation = { step: steps, action, violations: found };
      return true;
    }
    return false;
  };
'''
new_violation_return = '''      violation = { step: steps, action, violations: found };
      return { accepted: true, violated: true };
    }
    return { accepted: true, violated: false };
  };
'''
if source.count(old_violation_return) != 1:
    raise SystemExit('dispatchAndCheck return anchor not found')
source = source.replace(old_violation_return, new_violation_return)

# Automatic transitions: only the invariant-violation bit controls break.
for action in ['FINALIZE_NUMERAL_SPELL', 'FINALIZE_COMBAT', 'RESOLVE_COMBAT']:
    old = f"if (dispatchAndCheck({{ type: '{action}' }})) break;"
    new = f"if (dispatchAndCheck({{ type: '{action}' }}).violated) break;"
    if source.count(old) != 1:
        raise SystemExit(f'automatic {action} anchor not found')
    source = source.replace(old, new)

old_reaction = "if (dispatchAndCheck(reaction ?? { type: 'RESOLVE_PENDING_REACTION' })) break;"
new_reaction = "if (dispatchAndCheck(reaction ?? { type: 'RESOLVE_PENDING_REACTION' }).violated) break;"
if source.count(old_reaction) != 1:
    raise SystemExit('reaction dispatch anchor not found')
source = source.replace(old_reaction, new_reaction)

old_action_result = '''        const prevState = current;
        if (dispatchAndCheck(action, precomputedNextState)) { actedThisStep = true; break; }
        if (current === prevState) rejectedActions.push({ step: steps, player: p, action, source });
        actedThisStep = true;
'''
new_action_result = '''        const outcome = dispatchAndCheck(action, precomputedNextState);
        if (!outcome.accepted) rejectedActions.push({ step: steps, player: p, action, source });
        if (outcome.violated) { actedThisStep = true; break; }
        actedThisStep = true;
'''
if source.count(old_action_result) != 1:
    raise SystemExit('fuzz action outcome anchor not found')
source = source.replace(old_action_result, new_action_result)

old_ready = '''        if (!current[playerKeyOf(p)].readyForNextPhase) {
          if (dispatchAndCheck({ type: 'TOGGLE_READY', player: p })) { actedThisStep = true; break; }
          actedThisStep = true;
          break;
        }
'''
new_ready = '''        if (!current[playerKeyOf(p)].readyForNextPhase) {
          const action: GameAction = { type: 'TOGGLE_READY', player: p };
          const outcome = dispatchAndCheck(action);
          if (!outcome.accepted) rejectedActions.push({ step: steps, player: p, action, source: 'ai' });
          if (outcome.violated) { actedThisStep = true; break; }
          actedThisStep = true;
          break;
        }
'''
if source.count(old_ready) != 1:
    raise SystemExit('fuzz ready block anchor not found')
source = source.replace(old_ready, new_ready)

# Update module documentation near rejected actions.
source = source.replace(
    " * como falha.\n   */",
    " * como falha. A classificação de aceitação usa `evaluateAction`, então\n   * uma rejeição que só acrescenta texto ao log continua sendo rejeição.\n   */",
    1,
)

path.write_text(source)
