/**
 * monsterLifecycle.ts - regras de duração da carta Monstro entre turnos.
 *
 * Mantém num ponto único o orçamento total de usos e a decisão de manter
 * ou descartar a carta ao terminar um turno. Não conhece fase, UI nem IA.
 */
import type { Card } from './cardUtils';
import type { PlayerNumber } from './gameTypes';
import type { GameState } from './gameStateTypes';
import { playerKeyOf } from './gameSelectors';
// ---------------------------------------------------------------------------
// Efeito de Monstro (Coringa)
//
// FIX (itens 4 e 7 da 3ª rodada, redesenho completo): o Monstro deixou de ser
// posicionado como carta comum em um dos 3 slots de combate (arquitetura
// antiga, onde ele lutava com valor 0 e por isso a IA - e a interface em
// geral - acabava tratando-o como uma carta Normal/Ás, o bug do item 4).
// Agora ele vive em uma ZONA PRÓPRIA e separada por jogador
// (PlayerState.monsterCard) e NUNCA entra em disputa de combate sozinho - só
// fica ali para ativar sua habilidade, escolhendo um dos 3 slots de combate
// do PRÓPRIO campo como alvo (PlayerState.monsterTargetSlot). Essa é a opção
// que o usuário escolheu explicitamente ("Zona própria e separada") entre as
// alternativas apresentadas para corrigir o item 7.
// ---------------------------------------------------------------------------

/**
 * FIX (pedido do usuário, "o maior erro seu até o momento"): a carta Monstro
 * NÃO se descarta depois do 1º uso - ela pode ser ativada 1 vez POR TURNO
 * (isso já estava certo, ver `monsterUsed`, resetado a cada turno), mas
 * continua na zona própria do jogador entre turnos. Ela só se descarta de
 * vez depois do 3º uso NO TOTAL (contado em `monsterUseCount`, que nunca
 * reseta). Ver resolveMonsterCardAtTurnEnd, chamado sempre que um turno
 * termina de verdade (advancePhaseState / disputa fechada em
 * handleFinalizeCombat / "Pronto" dos dois em handleToggleReady).
 */
export const MAX_MONSTER_USES = 3;

/**
 * Decide o destino da carta Monstro de um jogador ao final de um turno: se
 * ela já atingiu o total de usos permitido, é descartada (some da zona); caso
 * contrário, permanece na zona própria para o turno seguinte, só com
 * `monsterUsed` resetado para false (pronta para ativar de novo) -
 * `monsterUseCount` nunca é resetado, é cumulativo entre turnos.
 */
export function resolveMonsterCardAtTurnEnd(monster: Card | undefined): { kept: Card | undefined; discarded: Card | undefined } {
  if (!monster) return { kept: undefined, discarded: undefined };
  if ((monster.monsterUseCount ?? 0) >= MAX_MONSTER_USES) return { kept: undefined, discarded: monster };
  return { kept: { ...monster, monsterUsed: false }, discarded: undefined };
}

/**
 * Verdadeiro se `player` tem um Monstro pronto pra ativar AGORA - existe,
 * ainda não foi usado neste turno, e ainda não esgotou MAX_MONSTER_USES no
 * total. Não checa personagem (Mago usa EXECUTE_MAGO_MONSTER_EFFECT, que
 * exige também uma carta-fonte; Besta/Anjo usam ACTIVATE_MONSTER_EFFECT_SIMPLE)
 * nem alvo específico - só se existe carga disponível pra gastar.
 *
 * FIX (checagem extensa por bugs, pedido do usuário: "consolide as regras
 * duplicadas... 2 por 2") - esta MESMA checagem (`!monster || monsterUsed`
 * seguido de `monsterUseCount >= MAX_MONSTER_USES`) estava copiada à mão em
 * 4 lugares independentes: handleActivateMonsterEffectSimple e
 * handleExecuteMagoMonsterEffect aqui no motor (2 cópias idênticas lado a
 * lado), decideMonsterEffect em aiPlayer.ts (só a metade `!monsterUsed`, sem
 * o `monsterUseCount` - seguro hoje porque handlePlaceMonsterCard e
 * resolveMonsterCardAtTurnEnd já impedem essa combinação de existir na zona,
 * mas essa garantia vive em OUTRAS 2 funções, não é óbvia lendo só
 * decideMonsterEffect), e handleMonsterZoneClick em GameBoard.tsx (mesma
 * metade incompleta). Consolidado numa função só - qualquer mudança futura
 * na regra (ex.: MAX_MONSTER_USES virar variável por personagem) só precisa
 * mudar aqui.
 */
export function canActivateMonsterEffect(state: GameState, player: PlayerNumber): boolean {
  const monster = state[playerKeyOf(player)].monsterCard;
  if (!monster || monster.monsterUsed) return false;
  return (monster.monsterUseCount ?? 0) < MAX_MONSTER_USES;
}
