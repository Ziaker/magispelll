import assert from 'node:assert/strict';
import { evaluateAction, isSameGameplayState } from '../src/app/lib/actionValidation';
import { createInitialState } from '../src/app/lib/gameEngine';
import { DEFAULT_GAME_CONFIG } from '../src/app/lib/gameConfig';

/**
 * Teste focado no contrato do Legal Actions Overhaul:
 * - uma rejeição que só escreve no log NÃO conta como mudança de gameplay;
 * - o motivo produzido pelo próprio reducer fica disponível ao consumidor;
 * - uma ação válida continua sendo classificada como aceita e reaproveita o
 *   estado já reduzido, sem executar o reducer uma segunda vez.
 */
const initial = createInitialState('mago', 'besta', DEFAULT_GAME_CONFIG);

// A mão inicial já nasce no limite. Tentar comprar antes de abrir espaço é
// rejeitado pelo motor com um aviso no log, mas não deve contar como ação
// aceita só porque o array de log mudou.
const rejectedDraw = evaluateAction(initial, { type: 'DRAW_CARDS', player: 1, count: 1 });
assert.equal(rejectedDraw.accepted, false, 'compra acima do limite não pode ser aceita');
assert.equal(isSameGameplayState(initial, rejectedDraw.nextState), true, 'rejeição deve alterar no máximo o log');
assert.ok(rejectedDraw.rejectionReason, 'rejeição com aviso deve expor o motivo vindo do reducer');

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

console.log('✓ actionValidation: rejeição/log e ação aceita classificados corretamente');
