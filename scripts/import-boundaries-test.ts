import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Contrato arquitetural dos símbolos já extraídos do gameEngine.
 *
 * O motor continua reexportando estes símbolos por compatibilidade histórica,
 * mas o código da aplicação deve depender das fontes leves/canônicas:
 * - CharacterId -> characterRegistry.ts
 * - Phase/PlayerNumber/PlayerKey -> gameTypes.ts
 * - LogEntry/LogEventType -> gameLogTypes.ts
 * - GameAction/MagicSelection -> gameActionTypes.ts
 * - FieldSlot/PlayerState/CombatResolution/NumeralSpellPending/PendingReaction/GameState -> gameStateTypes.ts
 * - playerKeyOf/opponentKeyOf/opponentOf/characterOf -> gameSelectors.ts
 * - MAX_MONSTER_USES -> monsterLifecycle.ts
 * - isTowerSlot/isBrotoSlot -> fieldLifecycle.ts
 * - fieldCards/wasEverTowerSlot/getUnbattledHorizontalSlots/getDestroyableReinforcementSlots/getUnrevealedFieldSlots/getFilledFieldSlots -> fieldQueries.ts
 * - getGlacialGolemValue/isFrozenPlayBlocked/isFrozenMagicActivationBlocked -> glacialRules.ts
 * - towerEligibleValue/canFormOrReinforceTower -> towerRules.ts
 * - getEffectiveDrawLimit/getEffectiveDiscardLimit -> gameLimits.ts
 *
 * Assim uma mudança futura não volta a transformar gameEngine.ts em hub de
 * tipos por acidente.
 */
const EXTRACTED_SYMBOLS = new Set([
  'CharacterId',
  'Phase',
  'PlayerNumber',
  'PlayerKey',
  'LogEntry',
  'LogEventType',
  'GameAction',
  'MagicSelection',
  'FieldSlot',
  'PlayerState',
  'CombatResolution',
  'NumeralSpellPending',
  'PendingReaction',
  'GameState',
  'playerKeyOf',
  'opponentKeyOf',
  'opponentOf',
  'characterOf',
  'MAX_MONSTER_USES',
  'isTowerSlot',
  'isBrotoSlot',
  'fieldCards',
  'wasEverTowerSlot',
  'getUnbattledHorizontalSlots',
  'getDestroyableReinforcementSlots',
  'getUnrevealedFieldSlots',
  'getFilledFieldSlots',
  'getGlacialGolemValue',
  'isFrozenPlayBlocked',
  'isFrozenMagicActivationBlocked',
  'towerEligibleValue',
  'canFormOrReinforceTower',
  'getEffectiveDrawLimit',
  'getEffectiveDiscardLimit',
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
        if (importedName && EXTRACTED_SYMBOLS.has(importedName)) {
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
    'Símbolos extraídos não devem ser importados através de gameEngine.ts.',
    'Use characterRegistry.ts, gameTypes.ts, gameLogTypes.ts, gameActionTypes.ts, gameStateTypes.ts, gameSelectors.ts, monsterLifecycle.ts, fieldLifecycle.ts, fieldQueries.ts, glacialRules.ts, towerRules.ts ou gameLimits.ts conforme o símbolo.',
    `Violações: ${violations.join(', ')}`,
  ].join(' ')
);

console.log(`✓ import boundaries: ${EXTRACTED_SYMBOLS.size} símbolos extraídos protegidos contra reacoplamento ao gameEngine`);
