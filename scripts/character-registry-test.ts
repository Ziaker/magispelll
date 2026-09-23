import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
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

/**
 * Fronteira arquitetural: CharacterId nasce no registry. O gameEngine ainda
 * reexporta o tipo por compatibilidade, mas novos consumidores em src/app não
 * devem criar dependência do monólito só para obter a identidade do personagem.
 */
const sourceRoot = join(process.cwd(), 'src', 'app');
const characterIdViaEngine = /import\s+(?:type\s+)?\{[^}]*\b(?:type\s+)?CharacterId\b[^}]*\}\s+from\s+['"][^'"]*gameEngine['"];/gs;
const violations: string[] = [];

function scanDirectory(directory: string): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      scanDirectory(path);
      continue;
    }
    if (!entry.isFile() || (!entry.name.endsWith('.ts') && !entry.name.endsWith('.tsx'))) continue;
    const source = readFileSync(path, 'utf8');
    if (characterIdViaEngine.test(source)) violations.push(path.replace(`${process.cwd()}/`, ''));
    characterIdViaEngine.lastIndex = 0;
  }
}

scanDirectory(sourceRoot);
assert.deepEqual(
  violations,
  [],
  `CharacterId deve ser importado de characterRegistry, não de gameEngine. Violações: ${violations.join(', ')}`
);

console.log(`✓ characterRegistry: ${ALL_CHARACTER_IDS.length} personagens canônicos, dados válidos e fronteira de imports íntegra`);
