import assert from 'node:assert/strict';
import { ALL_CHARACTER_IDS, CHARACTER_DEFINITIONS, isCharacterId } from '../src/app/lib/characterRegistry';
import { ALL_CHARACTER_IDS as ENGINE_CHARACTER_IDS } from '../src/app/lib/gameEngine';

/** Contrato de compatibilidade durante a migração para o Character Registry. */
assert.ok(ALL_CHARACTER_IDS.length > 0, 'o roster canônico não pode ser vazio');
assert.equal(new Set(ALL_CHARACTER_IDS).size, ALL_CHARACTER_IDS.length, 'ids de personagem não podem se repetir');
assert.deepEqual(
  CHARACTER_DEFINITIONS.map(({ id }) => id),
  [...ALL_CHARACTER_IDS],
  'CHARACTER_DEFINITIONS deve ser derivado exatamente do roster canônico'
);

for (const id of ALL_CHARACTER_IDS) {
  assert.equal(isCharacterId(id), true, `isCharacterId deve aceitar ${id}`);
}
assert.equal(isCharacterId(''), false, 'string vazia não é CharacterId');
assert.equal(isCharacterId('personagem-inexistente'), false, 'id desconhecido não é CharacterId');

assert.deepEqual(
  [...ENGINE_CHARACTER_IDS],
  [...ALL_CHARACTER_IDS],
  'gameEngine e Character Registry não podem divergir durante a migração'
);

console.log(`✓ characterRegistry: ${ALL_CHARACTER_IDS.length} personagens canônicos e contrato íntegro`);
