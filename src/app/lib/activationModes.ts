import type { CharacterId } from './gameEngine';
import type { MagicCardType } from './magicCards';

/**
 * Fonte única de verdade de COMO cada personagem ativa sua carta Monstro e
 * cada uma de suas 3 magias (J/Q/K) - nasceu de uma auditoria real (fork
 * separado + esta sessão) que achou 3 casos da MESMA classe de bug: motor e
 * IA corretos, mas o clique da UI (GameBoard.tsx) nunca despachava nada
 * porque o personagem não batia em NENHUM `if` dos if/else hardcoded que
 * decidiam "ativa direto" vs "abre diálogo" vs "some do next click" (Glacial
 * K, Glacial J/Q sem conteúdo de diálogo, Mosqueteiro na Zona Monstro).
 *
 * Estes dois `Record<CharacterId, ...>` são o que fecha essa classe de bug
 * PRA SEMPRE, não só os casos já achados: como `Record` sobre um union
 * literal EXIGE todas as chaves, adicionar um personagem novo (ou mudar o
 * union `CharacterId`) sem preencher a entrada correspondente aqui é um ERRO
 * DE COMPILAÇÃO, não um bug que só aparece quando alguém clica na tela real.
 * `scripts/exhaustiveness-test.ts` consome estas mesmas tabelas pra
 * confirmar, além disso, que GameBoard.tsx de fato tem o código
 * correspondente pra cada modo (uma tabela sozinha não garante que o
 * diálogo/branch existe de verdade - só que ALGUÉM decidiu conscientemente
 * qual deveria ser o comportamento).
 *
 * NÃO reflete aqui a lógica de CADA modo (o que fazer com o slot escolhido
 * de Mago/Besta/Anjo, o conteúdo de cada diálogo) - isso continua vivendo em
 * GameBoard.tsx, propositalmente: são interações bem diferentes entre si
 * (Mago precisa de uma carta-fonte além do slot; Besta as vezes abre um
 * 2º diálogo pra escolher entre principal/horizontal...) e forçar tudo isso
 * num formato de dado único traria mais risco de regressão do que valor.
 */

export type MonsterActivationMode =
  /** Ativa no próprio clique da Zona Monstro, sem escolher slot nenhum (ver handleMonsterZoneClick em GameBoard.tsx). */
  | 'direct'
  /** Clique na Zona Monstro só ARMA a escolha; um clique seguinte num slot do próprio campo decide o alvo (ver pendingMonsterTarget/handleFieldSlotClick em GameBoard.tsx). */
  | 'target-slot'
  /** A carta Monstro deste personagem nunca ocupa a Zona Monstro - é jogada no campo normal como uma carta numeral (ver handlePlaceMonsterCard em gameEngine.ts). `canActivateMonsterEffect` nunca é true pra ele. */
  | 'not-applicable';

export const MONSTER_ACTIVATION_MODE: Record<CharacterId, MonsterActivationMode> = {
  mago: 'target-slot',
  besta: 'target-slot',
  anjo: 'target-slot',
  mosqueteiro: 'direct',
  coringa: 'not-applicable',
  piromante: 'direct',
  druida: 'not-applicable',
  glacial: 'not-applicable',
};

export type MagicActivationMode =
  /** Ativa no próprio clique do ícone ✨ na carta, sem seleção nenhuma (ACTIVATE_SIMPLE_MAGIC ou EXECUTE_MAGIC com selection vazia - ver handleActivateMagicClick em GameBoard.tsx). */
  | 'direct'
  /** Abre o diálogo "Ativar Magia" (pendingMagic) pra escolher 1+ alvo antes de Confirmar despachar EXECUTE_MAGIC. */
  | 'dialog'
  /** Este personagem não tem esta carta como magia ativável por J/Q/K (hoje só o Coringa - as 3 são cartas-armadilha posicionadas no campo, nunca ativadas por clique - e o Valete do Druida, que é o Broto plantado via PLAY_CARD, não uma magia). */
  | 'not-applicable';

export const MAGIC_ACTIVATION_MODE: Record<CharacterId, Record<MagicCardType, MagicActivationMode>> = {
  mago: { J: 'dialog', Q: 'dialog', K: 'dialog' },
  besta: { J: 'dialog', Q: 'dialog', K: 'dialog' },
  anjo: { J: 'direct', Q: 'dialog', K: 'direct' },
  mosqueteiro: { J: 'dialog', Q: 'dialog', K: 'dialog' },
  coringa: { J: 'not-applicable', Q: 'not-applicable', K: 'not-applicable' },
  piromante: { J: 'dialog', Q: 'dialog', K: 'dialog' },
  druida: { J: 'not-applicable', Q: 'dialog', K: 'dialog' },
  glacial: { J: 'dialog', Q: 'dialog', K: 'direct' },
};
