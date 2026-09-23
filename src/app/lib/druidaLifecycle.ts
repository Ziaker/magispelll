/**
 * druidaLifecycle.ts - regras puras de evolução do Broto do Druida.
 *
 * Este módulo não conhece reducer, fase global, UI ou IA; recebe o campo e
 * devolve o campo atualizado para uma única transição de fase.
 */
import { isBrotoSlot } from './fieldLifecycle';
import type { FieldSlot } from './gameStateTypes';
/**
 * Druida (personagem novo) - crescimento do Broto a cada TROCA DE FASE.
 *
 * FIX (pedido do usuário: "volte atrás com a ideia de ser um acúmulo por
 * turno, é pra ser um acúmulo por fase") - reversão de uma decisão anterior
 * (1x por turno, só na virada Combate->Compra) - agora cresce nas 3
 * transições de fase do turno (Compra->Estratégia, Estratégia->Combate,
 * Combate->Compra), chamada de `resetForNewTurn` a cada uma delas (dentro de
 * advancePhaseState) - aqui só ajusta o VALOR do topo (`transformedValue`),
 * nunca move nenhuma carta.
 *
 * `taxa` = 1 (o Broto sozinho) + 1 por Valete extra empilhado em
 * `brotoReserve` - um Broto de 3 Valetes (1 topo + 2 na reserva) cresce +3
 * por FASE, não +1. Fotossíntese soma seu nível diretamente por cima,
 * empilhando a cada reativação (ver handleFinalizeNumeralSpell).
 */
export function growDruidaBrotoField(field: [FieldSlot, FieldSlot, FieldSlot], photosynthesisLevel: number): [FieldSlot, FieldSlot, FieldSlot] {
  const brotoIndex = field.findIndex(isBrotoSlot);
  if (brotoIndex === -1) return field;
  const slot = field[brotoIndex];
  const top = slot.faceDownCard;
  if (!top) return field;
  const growthRate = 1 + (slot.brotoReserve?.length ?? 0);
  const newValue = (top.transformedValue ?? 1) + growthRate + photosynthesisLevel;
  const newField = [...field] as [FieldSlot, FieldSlot, FieldSlot];
  newField[brotoIndex] = { ...slot, faceDownCard: { ...top, transformedValue: newValue } };
  return newField;
}
