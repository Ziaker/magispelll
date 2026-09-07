/**
 * scripts/exhaustiveness-test.ts - teste de EXAUSTIVIDADE DE UI: varre o
 * produto cartesiano personagem × habilidade e confirma que GameBoard.tsx
 * tem código correspondente pra cada combinação, segundo o que
 * activationModes.ts (fonte única de verdade) diz que deveria existir.
 *
 * POR QUE ESTE ARQUIVO EXISTE: nenhum outro mecanismo de verificação deste
 * projeto (sanity-test.ts, o fuzzer de actionSpace.ts, window.__debug) chega
 * perto de GameBoard.tsx - todos montam um GameAction e chamam gameReducer
 * direto, sem nunca renderizar React nem simular um clique. Isso deixou 3
 * bugs REAIS em produção (achados nesta mesma sessão + auditoria em fork
 * separado) invisíveis para 1440+ testes: Glacial K abria um diálogo vazio
 * (Confirmar sempre habilitado, sempre um no-op), Glacial J/Q tinham o MESMO
 * problema até serem corrigidos, e a Recarga Rápida do Mosqueteiro nunca
 * despachava NADA ao clicar na Zona Monstro - em todos os 3 casos, o motor
 * e a IA sempre estiveram 100% corretos.
 *
 * O QUE ESTE TESTE NÃO É: não renderiza React, não simula clique (isso
 * exigiria jsdom + Testing Library - ver o item 5, mais avançado, do plano
 * de auditoria; deliberadamente adiado por enquanto). Em vez disso, lê
 * GameBoard.tsx como TEXTO e confirma que o branch/condição esperado existe
 * no código-fonte pra cada combinação. É um teste ESTRUTURAL, não
 * comportamental - não prova que o diálogo funciona de ponta a ponta (só um
 * clique real na tela real prova isso), mas prova que ALGUÉM escreveu
 * ALGUMA coisa pra esta combinação específica, o que já teria pego os 3
 * bugs acima (nenhum deles tinha ABSOLUTAMENTE NENHUMA menção ao personagem
 * no branch relevante - não era um bug sutil de lógica, era ausência total).
 *
 * COMO ISSO FECHA A CLASSE DE BUG PRA SEMPRE: `MONSTER_ACTIVATION_MODE` e
 * `MAGIC_ACTIVATION_MODE` (activationModes.ts) são `Record<CharacterId, ...>`
 * - adicionar um personagem novo ao union `CharacterId` sem preencher a
 * entrada correspondente já é um ERRO DE COMPILAÇÃO. Esquecer de também
 * escrever o branch/diálogo em GameBoard.tsx depois disso é o que ESTE
 * arquivo pega - rode `npx tsx scripts/exhaustiveness-test.ts` (ou deixe
 * fazer parte da rotina normal de `npx tsx scripts/sanity-test.ts`, ver
 * package.json) antes de considerar qualquer personagem/habilidade nova
 * pronta.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_CHARACTER_IDS } from '../src/app/lib/gameEngine';
import { MONSTER_ACTIVATION_MODE, MAGIC_ACTIVATION_MODE } from '../src/app/lib/activationModes';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
    console.log(`  OK  ${message}`);
  } else {
    failed++;
    console.log(`  FALHOU  ${message}`);
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gameBoardPath = path.resolve(__dirname, '../src/app/components/GameBoard.tsx');
const source = fs.readFileSync(gameBoardPath, 'utf-8');

/**
 * Extrai o corpo de uma função `const nome = (...) => { ... }` a partir do
 * texto-fonte, contando chaves a partir da PRIMEIRA `{` depois do marcador
 * até ela fechar - só funciona bem pra funções TypeScript simples (sem JSX
 * misturado, cujas chaves de interpolação confundiriam a contagem), por
 * isso só é usado abaixo para handleMonsterZoneClick/handleFieldSlotClick
 * (nenhuma das duas retorna JSX). Os diálogos de magia SÃO JSX - pra esses,
 * o teste abaixo procura a condição em todo o arquivo em vez de isolar uma
 * região (as condições checadas são específicas o bastante pra não colidir
 * por acaso em outro lugar).
 */
function extractFunctionBody(src: string, marker: string): string {
  const markerIndex = src.indexOf(marker);
  if (markerIndex === -1) throw new Error(`Marcador não encontrado em GameBoard.tsx: "${marker}" - o código foi reorganizado? Atualize este teste.`);
  const braceStart = src.indexOf('{', markerIndex);
  let depth = 0;
  for (let i = braceStart; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(braceStart, i + 1);
    }
  }
  throw new Error(`Chave de fechamento não encontrada pra "${marker}"`);
}

console.log('=== Exaustividade de UI: Zona Monstro ===\n');

const monsterZoneClickBody = extractFunctionBody(source, 'const handleMonsterZoneClick = ');
const fieldSlotClickBody = extractFunctionBody(source, 'const handleFieldSlotClick = ');

// FIX: 'direct' não precisa de checagem por personagem aqui - diferente do
// diálogo de magia (ainda se-por-se hardcoded), handleMonsterZoneClick JÁ
// consulta MONSTER_ACTIVATION_MODE[character] diretamente (ver GameBoard.tsx),
// então a exaustividade desse lado é garantida pelo PRÓPRIO COMPILADOR
// (Record<CharacterId, ...> exige toda chave) - não há mais um literal
// `'mosqueteiro'`/`'piromante'` no código pra grepar. Só confirma que o
// handler de fato usa a tabela (protege contra alguém reverter pra um
// if/else hardcoded no futuro, perdendo essa garantia sem perceber).
assert(
  monsterZoneClickBody.includes('MONSTER_ACTIVATION_MODE'),
  `handleMonsterZoneClick consulta MONSTER_ACTIVATION_MODE (não um if/else hardcoded) - garante exaustividade em tempo de compilação`
);

for (const character of ALL_CHARACTER_IDS) {
  const mode = MONSTER_ACTIVATION_MODE[character];
  if (mode === 'target-slot') {
    assert(
      fieldSlotClickBody.includes(`character === '${character}'`),
      `Monstro de ${character} (modo 'target-slot'): handleFieldSlotClick tem um branch dedicado`
    );
  }
  // 'not-applicable': a carta Monstro deste personagem nunca ocupa a Zona
  // Monstro (é jogada no campo normal) - nada pra checar aqui.
}

console.log('\n=== Exaustividade de UI: Ativação de Magia (J/Q/K) ===\n');

// Handler de clique da carta de magia (✨ na mão) - decide "ativa direto"
// vs "abre o diálogo pendingMagic" pra cada combinação. Sem JSX dentro,
// seguro pra extrair como bloco (mesma técnica do bloco de Monstro acima).
const activateMagicClickBody = extractFunctionBody(source, 'const handleActivateMagicClick = ');

// Piromante e Druida compartilham UM diálogo cobrindo várias/todas as 3
// magias (escolha "efeito próprio vs lançar" / "reduzir vs crescer"), então
// a condição no código-fonte é só `pendingMagic.character === 'X'`, sem
// `&& pendingMagic.type === 'Y'` - checar por tipo individual nesses 2
// casos sempre falharia por um motivo que não é o bug que este teste existe
// pra pegar.
const SHARED_DIALOG_CHARACTERS = new Set(['piromante', 'druida']);

for (const character of ALL_CHARACTER_IDS) {
  for (const magicType of ['J', 'Q', 'K'] as const) {
    const mode = MAGIC_ACTIVATION_MODE[character][magicType];
    if (mode === 'not-applicable') continue; // Coringa (as 3) e Druida J (Broto, plantado via PLAY_CARD) - não são magias ativáveis por clique.

    if (mode === 'direct') {
      // Hoje só Anjo J/K (ACTIVATE_SIMPLE_MAGIC) e Glacial K (EXECUTE_MAGIC
      // com selection vazia) - mecanismos de despacho DIFERENTES entre si
      // de propósito (ver o comentário em activationModes.ts), então aqui
      // só confirmamos que o personagem+tipo aparecem juntos em ALGUM lugar
      // do handler de clique de magia, sem exigir uma condição exata
      // compartilhada entre os dois mecanismos.
      assert(
        activateMagicClickBody.includes(`character === '${character}'`) && activateMagicClickBody.includes(`magicType === '${magicType}'`),
        `Magia ${character}-${magicType} (modo 'direct'): handleActivateMagicClick tem uma condição pra este personagem+tipo`
      );
      continue;
    }

    // mode === 'dialog'
    if (SHARED_DIALOG_CHARACTERS.has(character)) {
      assert(
        source.includes(`pendingMagic.character === '${character}'`),
        `Magia ${character}-${magicType} (modo 'dialog', diálogo compartilhado entre J/Q/K): existe conteúdo de diálogo pra ${character}`
      );
    } else {
      assert(
        source.includes(`pendingMagic.character === '${character}' && pendingMagic.type === '${magicType}'`),
        `Magia ${character}-${magicType} (modo 'dialog'): existe um bloco de conteúdo dedicado no diálogo "Ativar Magia"`
      );
    }
  }
}

console.log(`\n${passed} passaram, ${failed} falharam.`);
if (failed > 0) process.exit(1);
