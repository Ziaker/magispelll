import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Contrato arquitetural dos tipos já extraídos do gameEngine.
 *
 * O motor continua reexportando estes símbolos por compatibilidade histórica,
 * mas o código da aplicação deve depender das fontes leves/canônicas:
 * - CharacterId -> characterRegistry.ts
 * - Phase/PlayerNumber/PlayerKey -> gameTypes.ts
 * - LogEntry/LogEventType -> gameLogTypes.ts
 *
 * Assim uma mudança futura não volta a transformar gameEngine.ts em hub de
 * tipos por acidente.
 */
const EXTRACTED_TYPES = new Set([
  'CharacterId',
  'Phase',
  'PlayerNumber',
  'PlayerKey',
  'LogEntry',
  'LogEventType',
]);

const sourceRoot = join(process.cwd(), 'src', 'app');
const engineImport = /import\s+(?:type\s+)?\{(?<body>[^}]*)\}\s+from\s+['"][^'"]*gameEngine['"];/gs;
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
    engineImport.lastIndex = 0;
    for (const match of source.matchAll(engineImport)) {
      const body = match.groups?.body ?? '';
      for (const rawSpecifier of body.split(',')) {
        const specifier = rawSpecifier.trim().replace(/^type\s+/, '');
        const importedName = specifier.split(/\s+as\s+/)[0]?.trim();
        if (importedName && EXTRACTED_TYPES.has(importedName)) {
          violations.push(`${relative(process.cwd(), path)}: ${importedName}`);
        }
      }
    }
  }
}

scanDirectory(sourceRoot);
assert.deepEqual(
  violations,
  [],
  [
    'Tipos extraídos não devem ser importados através de gameEngine.ts.',
    'Use characterRegistry.ts, gameTypes.ts ou gameLogTypes.ts conforme o tipo.',
    `Violações: ${violations.join(', ')}`,
  ].join(' ')
);

console.log(`✓ import boundaries: ${EXTRACTED_TYPES.size} tipos extraídos protegidos contra reacoplamento ao gameEngine`);
