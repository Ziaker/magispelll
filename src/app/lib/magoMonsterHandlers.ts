/**
 * magoMonsterHandlers.ts - efeito de Zona Monstro específico do Mago.
 *
 * Mantém o fluxo dedicado de seleção do Mago fora do reducer e sem
 * depender de gameEngine.ts.
 */
import { getEffectiveCardValue, isPlainNumeralCard } from './cardUtils';
import type { PlayerNumber } from './gameTypes';
import { appendLog } from './gameLog';
import { playerKeyOf, characterOf } from './gameSelectors';
import { canActivateMonsterEffect } from './monsterLifecycle';
import type { FieldSlot, GameState } from './gameStateTypes';
/**
 * Mago (Ilusão Arcana): copia o valor de qualquer carta revelada (sua ou do
 * oponente) para uma carta numeral já posicionada no PRÓPRIO campo
 * (`targetSlotIndex`). FIX (item 7): antes o valor era copiado para o
 * próprio Coringa (que então lutava em campo com esse valor) - como o
 * Monstro nunca mais entra em combate, o valor agora reforça uma carta que
 * já está de fato em disputa. Não pode mirar A/J/Q/K nem outro Monstro (mesma
 * restrição já usada pela transformação do Ás - ver handleTransformAce).
 */
export function handleExecuteMagoMonsterEffect(state: GameState, player: PlayerNumber, targetSlotIndex: number, targetCardId: string): GameState {
  const playerKey = playerKeyOf(player);
  const playerState = state[playerKey];
  if (characterOf(state, player) !== 'mago') return state;
  if (!canActivateMonsterEffect(state, player)) return state;
  const monster = playerState.monsterCard!;
  if (targetSlotIndex < 0 || targetSlotIndex > 2) return state;

  const targetSlot = playerState.field[targetSlotIndex];
  const targetFieldCard = targetSlot.faceDownCard;
  // FIX (auditoria completa do Mago - simplificação): esta cadeia era
  // exatamente o corpo de isPlainNumeralCard reescrito à mão (J/Q/K/Coringa
  // já ficam fora do intervalo 2-10 que isNumeralCard exige, tornando a
  // checagem .isMonster redundante por cima disso) - duas definições
  // independentes da mesma regra podiam divergir silenciosamente no futuro.
  if (!targetFieldCard || !isPlainNumeralCard(targetFieldCard)) {
    return state;
  }

  let sourceValue: number | null = null;
  for (const field of [state.player1.field, state.player2.field]) {
    for (const s of field) {
      if (s.faceDownCard?.id === targetCardId && s.revealed) {
        sourceValue = getEffectiveCardValue(s.faceDownCard);
      }
    }
  }
  if (sourceValue === null) return state;

  const newField = [...playerState.field] as [FieldSlot, FieldSlot, FieldSlot];
  newField[targetSlotIndex] = { ...targetSlot, faceDownCard: { ...targetFieldCard, transformedValue: sourceValue } };

  // FIX (item 4 da 4ª rodada): o log também menciona o valor ORIGINAL da
  // carta do próprio campo que recebeu o valor copiado (targetFieldCard.value),
  // não só o valor copiado - o tooltip da própria carta (ver PlayingCard.tsx,
  // `hasTransformedValue`) mostra a mesma informação ao passar o mouse nela.
  // Nome+tooltip do efeito ("Ilusão Arcana") vêm da UI agora - ver comentário
  // em handleActivateMonsterEffectSimple, mesma reformulação do log.
  const log = appendLog(
    state,
    state.log,
    'monster',
    `Jogador ${player} copiou o valor ${sourceValue} para o slot ${targetSlotIndex + 1} (era ${targetFieldCard.value})`,
    { player }
  );

  return {
    ...state,
    log,
    [playerKey]: {
      ...playerState,
      field: newField,
      monsterCard: { ...monster, monsterUsed: true, monsterUseCount: (monster.monsterUseCount ?? 0) + 1 },
      monsterTargetSlot: targetSlotIndex,
    },
  };
}
