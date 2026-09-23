import { createInitialState } from '../src/app/lib/gameStateFactory';
import assert from 'node:assert/strict';
import { evaluateAction, isSameGameplayState } from '../src/app/lib/actionValidation';
import { checkActionSetDivergence, enumerateAcceptedActions } from '../src/app/lib/actionSpace';

import { DEFAULT_GAME_CONFIG } from '../src/app/lib/gameConfig';

/**
 * Teste focado no contrato do Legal Actions Overhaul:
 * - uma rejeição que só escreve no log NÃO conta como mudança de gameplay;
 * - o motivo produzido pelo próprio reducer fica disponível ao consumidor;
 * - uma ação válida continua sendo classificada como aceita e reaproveita o
 *   estado já reduzido, sem executar o reducer uma segunda vez.
 */
const initial = createInitialState('mago', 'besta', DEFAULT_GAME_CONFIG);

// O limite opcional de compra tem um caminho de rejeição COM aviso no log.
// Abrimos um espaço na mão para não cair antes na guarda silenciosa de
// `handLimit`, e marcamos o limite como já consumido neste turno.
const limitedConfig = { ...DEFAULT_GAME_CONFIG, drawLimitEnabled: true, drawLimit: 1 };
const limitedInitial = createInitialState('mago', 'besta', limitedConfig);
const rejectionState = {
  ...limitedInitial,
  player1: {
    ...limitedInitial.player1,
    hand: limitedInitial.player1.hand.slice(0, -1),
    drawsThisTurn: 1,
  },
};
const rejectedDraw = evaluateAction(rejectionState, { type: 'DRAW_CARDS', player: 1, count: 1 });
assert.equal(rejectedDraw.accepted, false, 'compra acima do limite por turno não pode ser aceita');
assert.equal(isSameGameplayState(rejectionState, rejectedDraw.nextState), true, 'rejeição deve alterar no máximo o log');
assert.ok(rejectedDraw.rejectionReason, 'rejeição com aviso deve expor o motivo vindo do reducer');
assert.match(rejectedDraw.rejectionReason, /Limite de .*compra/i, 'motivo deve vir do aviso real de limite do motor');

// Descartar uma carta oculta na Fase de Compra é uma mudança real de gameplay.
const discardable = initial.player1.hand.find((card) => !card.revealed);
assert.ok(discardable, 'a mão inicial precisa ter ao menos uma carta descartável');

const acceptedDiscard = evaluateAction(initial, {
  type: 'DISCARD_CARDS',
  player: 1,
  cardIds: [discardable.id],
});
assert.equal(acceptedDiscard.accepted, true, 'descarte válido deve ser aceito');
assert.equal(acceptedDiscard.rejectionReason, undefined, 'ação aceita não deve carregar motivo de rejeição');
assert.equal(acceptedDiscard.nextState.player1.hand.length, initial.player1.hand.length - 1, 'estado reduzido deve refletir o descarte');

// O enumerador reducer-backed deve excluir candidatos recusados e preservar
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

// O fast path e o reducer-backed devem concordar no estado inicial padrão.
// Se este assert quebrar no futuro, o relatório contém exatamente os payloads
// em que a previsão e o motor passaram a discordar.
const initialSetDivergence = checkActionSetDivergence(initial, 1);
assert.deepEqual(
  initialSetDivergence,
  [],
  `fast path e reducer divergiram no estado inicial: ${JSON.stringify(initialSetDivergence)}`
);

console.log('✓ actionValidation: rejeição/log e ação aceita classificados corretamente');
