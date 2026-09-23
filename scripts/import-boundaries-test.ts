import assert from 'node:assert/strict';
import ts from 'typescript';
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
 * - createInitialState -> gameStateFactory.ts
 * - playerKeyOf/opponentKeyOf/opponentOf/characterOf -> gameSelectors.ts
 * - MAX_MONSTER_USES/canActivateMonsterEffect -> monsterLifecycle.ts
 * - isTowerSlot/isBrotoSlot -> fieldLifecycle.ts
 * - fieldCards/wasEverTowerSlot/getUnbattledHorizontalSlots/getDestroyableReinforcementSlots/getUnrevealedFieldSlots/getFilledFieldSlots -> fieldQueries.ts
 * - getGlacialGolemValue/isFrozenPlayBlocked/isFrozenMagicActivationBlocked -> glacialRules.ts
 * - isSlotProtected -> anjoRules.ts
 * - canSelectCombatSlot -> combatRules.ts
 * - getFireballCap -> piromanteRules.ts
 * - isCoringaRawTrapCard -> coringaRules.ts
 * - getMagicActivationContext -> magicActivationContext.ts
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
  'createInitialState',
  'playerKeyOf',
  'opponentKeyOf',
  'opponentOf',
  'characterOf',
  'MAX_MONSTER_USES',
  'canActivateMonsterEffect',
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
  'isSlotProtected',
  'canSelectCombatSlot',
  'getFireballCap',
  'isCoringaRawTrapCard',
  'getMagicActivationContext',
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
    'Use characterRegistry.ts, gameTypes.ts, gameLogTypes.ts, gameActionTypes.ts, gameStateTypes.ts, gameStateFactory.ts, gameSelectors.ts, monsterLifecycle.ts, fieldLifecycle.ts, fieldQueries.ts, glacialRules.ts, anjoRules.ts, combatRules.ts, piromanteRules.ts, coringaRules.ts, magicActivationContext.ts, towerRules.ts ou gameLimits.ts conforme o símbolo.',
    `Violações: ${violations.join(', ')}`,
  ].join(' ')
);

console.log(`✓ import boundaries: ${EXTRACTED_SYMBOLS.size} símbolos extraídos protegidos contra reacoplamento ao gameEngine`);

// gameEngine coordinator boundary: depois da decomposição do motor, o arquivo
// principal só pode declarar o reducer público e seu dispatcher privado.
// Regras/handlers novos devem nascer no módulo de domínio correspondente.
const enginePathForBoundary = join(process.cwd(), 'src', 'app', 'lib', 'gameEngine.ts');
const engineSourceForBoundary = readFileSync(enginePathForBoundary, 'utf8');
const engineAstForBoundary = ts.createSourceFile(
  enginePathForBoundary,
  engineSourceForBoundary,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS
);
const allowedEngineFunctions = new Set(['gameReducer', 'reduceGameAction']);
const unexpectedEngineFunctions = engineAstForBoundary.statements
  .filter(ts.isFunctionDeclaration)
  .map((statement) => statement.name?.text ?? '<anonymous>')
  .filter((name) => !allowedEngineFunctions.has(name));
assert.deepEqual(
  unexpectedEngineFunctions,
  [],
  [
    'gameEngine.ts deve permanecer um coordenador fino.',
    'Mova novos handlers/regras para módulos de domínio e apenas faça o dispatch pelo reducer.',
    `Funções top-level inesperadas: ${unexpectedEngineFunctions.join(', ')}`,
  ].join(' ')
);
console.log('✓ gameEngine coordinator boundary: apenas gameReducer/reduceGameAction permanecem como funções top-level');
