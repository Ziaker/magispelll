/**
 * statusEffects.ts - Sistema genérico de Status Effects (buffs/debuffs/condições)
 *
 * Overhaul pedido pelo usuário antes de implementar o personagem Glacial:
 * até aqui, toda mecânica do tipo "efeito com origem e duração" (trava de
 * magia do Anjo, marcador de combate da Besta/Mosqueteiro/Druida, janelas de
 * turno do Mosqueteiro/Coringa/Besta/Piromante) era um campo solto e ad-hoc,
 * duplicando o mesmo padrão manualmente em cada handler. Este arquivo
 * centraliza isso, seguindo o mesmo espírito de `appendLog`/`pushToDiscard`
 * em gameEngine.ts (assinatura pura, recebe só o mínimo necessário, devolve
 * objeto novo).
 *
 * Onde o array vive: `Card.statusEffects` (efeitos ligados a UMA carta -
 * magicLocked, combatModifier, futuro frozen do Glacial) e
 * `PlayerState.statusEffects` (contadores/janelas do jogador inteiro, não
 * ligados a uma carta específica - redirectNextDiscard, transformWindow,
 * handLimitBonus, bloodRage, spreadArmed). Os helpers abaixo são genéricos
 * sobre `WithStatusEffects`, então funcionam para os dois sem duplicação.
 */
import type { Card } from './cardUtils';
import type { CharacterId, FieldSlot, Phase } from './gameEngine';

/**
 * União fechada dos kinds já conhecidos + trapdoor de string literal
 * (`(string & {})`) - um personagem futuro (ex.: Glacial: 'frozen') pode
 * introduzir um kind novo sem editar este arquivo central, e ainda ganha
 * autocomplete dos literais já catalogados aqui.
 */
export type StatusEffectKind =
  | 'magicLocked' // Anjo - Visão Celestial
  | 'combatModifier' // migração de CombatModifier (Besta/Mosqueteiro/Druida)
  | 'redirectNextDiscard' // Mosqueteiro - Recarga Rápida
  | 'transformWindow' // Coringa - Mão de Ferro
  | 'handLimitBonus' // Mosqueteiro - Munição Infinita
  | 'bloodRage' // Besta - Fúria Sanguinária
  | 'spreadArmed' // Piromante - Chama Repartida
  | (string & {});

export type StatusEffectDuration =
  /** Só removida manualmente via `removeStatus` - ex.: spreadArmed (consumida no próximo lançamento), futuro frozen do Glacial (removido pela ação de descongelar). */
  | { type: 'permanent' }
  /** Ativo enquanto `newTurn <= turn` - mesmo teste já usado hoje por coringaTransformWindowUntilTurn/mosqueteiroHandLimitBonusUntilTurn/bestaBloodRageUntilTurn. */
  | { type: 'untilTurn'; turn: number }
  /** Removido na PRÓXIMA vez que o jogo ENTRAR nesta fase, não importa o turno - mesmo teste já usado hoje por magicLocked/combatModifiers (`newPhase === 'draw'`). */
  | { type: 'untilPhase'; phase: Phase };

export interface StatusEffect {
  kind: StatusEffectKind;
  source: CharacterId;
  /** Rótulo curto pra log/tooltip (mesmo papel do `label` que já existia em CombatModifier). */
  label: string;
  duration: StatusEffectDuration;
  /** Valor numérico quando aplicável (marcadores de combate, bônus de limite de mão). `undefined` para efeitos puramente booleanos (magicLocked, redirectNextDiscard, spreadArmed). */
  magnitude?: number;
  /** Só relevante para `kind === 'combatModifier'` - substitui o `kind: 'multiply'|'add'` de CombatModifier (renomeado pra `mode` aqui pra não colidir com o `kind` de StatusEffect). */
  mode?: 'add' | 'multiply';
  /**
   * Pedido do usuário, interface de inspeção: "cada buff e debuff... ao
   * invés de agrupar tudo em um só caso tenha ocorrido em fases diferentes" -
   * `turn`/`phase` no instante em que este registro foi criado OU somado pela
   * última vez (ver `applyTimedCombatModifier` abaixo). Opcional porque só
   * `combatModifier` usa isto hoje - os outros kinds nunca precisaram
   * distinguir "reativação imediata" de "reativação depois de algo
   * acontecer no meio".
   */
  appliedAt?: { turn: number; phase: Phase };
}

export interface WithStatusEffects {
  statusEffects?: StatusEffect[];
}

export function hasStatus<T extends WithStatusEffects>(
  entity: T | undefined,
  kind: StatusEffectKind,
  opts?: { source?: CharacterId }
): boolean {
  return Boolean(entity?.statusEffects?.some((e) => e.kind === kind && (!opts?.source || e.source === opts.source)));
}

export function getStatus<T extends WithStatusEffects>(
  entity: T | undefined,
  kind: StatusEffectKind,
  opts?: { source?: CharacterId }
): StatusEffect | undefined {
  return entity?.statusEffects?.find((e) => e.kind === kind && (!opts?.source || e.source === opts.source));
}

export function getStatusMagnitude<T extends WithStatusEffects>(
  entity: T | undefined,
  kind: StatusEffectKind,
  opts?: { source?: CharacterId }
): number {
  return getStatus(entity, kind, opts)?.magnitude ?? 0;
}

export type StatusMergeStrategy = 'replace' | 'stack' | ((existing: StatusEffect, incoming: StatusEffect) => StatusEffect);

/**
 * Adiciona `effect` a `entity`. Unifica os dois padrões de dedup que já
 * coexistiam em CombatModifier antes deste overhaul:
 * - 'replace' (default): remove qualquer status existente do mesmo
 *   kind+source NESTA entidade antes de inserir o novo (ex.: Fúria Selvagem
 *   da Besta - reativar substitui o marcador antigo).
 * - função de merge customizada: reativar sobre a MESMA entidade combina com
 *   o efeito já existente em vez de substituir (ex.: Tiro Certeiro do
 *   Mosqueteiro - reativações somam magnitude).
 * - 'stack': permite 2+ instâncias independentes do mesmo kind+source lado a
 *   lado (nenhum caso usa isso hoje, mas fecha o leque pra personagens futuros).
 */
export function applyStatus<T extends WithStatusEffects>(
  entity: T,
  effect: StatusEffect,
  merge: StatusMergeStrategy = 'replace'
): T {
  const existing = entity.statusEffects ?? [];
  const matchIndex = merge === 'stack' ? -1 : existing.findIndex((e) => e.kind === effect.kind && e.source === effect.source);
  if (matchIndex === -1) return { ...entity, statusEffects: [...existing, effect] };
  const merged = typeof merge === 'function' ? merge(existing[matchIndex], effect) : effect;
  return { ...entity, statusEffects: [...existing.slice(0, matchIndex), merged, ...existing.slice(matchIndex + 1)] };
}

/**
 * Aplica um StatusEffect `kind: 'combatModifier'` decidindo, ele mesmo, entre
 * SOMAR no registro já existente da MESMA fonte+carta (reativação
 * verdadeiramente IMEDIATA - mesmo turno, mesma fase, nada mudou desde a
 * última vez) ou EMPILHAR como um registro independente ao lado (qualquer
 * outra coisa - turno diferente, fase diferente) - pedido do usuário,
 * interface de inspeção: "cada buff e debuff adicionado... ao invés de
 * agrupar tudo em um só caso tenha ocorrido em fases diferentes ou após
 * efeitos causados antes de serem ativados novamente".
 *
 * `sumMerge` é a MESMA função de soma que cada efeito (Tiro Certeiro,
 * Crioescudo, Criogolem, Valete-Escudo do Coringa, Simbiose/Urtiga do
 * Druida) já usava sozinho antes desta função existir - só a DECISÃO de
 * quando usá-la (em vez de empilhar) é nova, centralizada aqui em vez de
 * repetida em cada chamador.
 *
 * NOTA DE ESCOPO (decisão confirmada com o usuário): "algo aconteceu no
 * meio" é aproximado por turno+fase, não por um contador de ações exato -
 * uma reativação da MESMA fonte que acontece na mesma fase que a anterior
 * (ex.: os dois jogadores agindo na mesma fase de Estratégia) ainda soma.
 * Cobre os casos citados (mudança de fase, novo turno) sem precisar de um
 * contador de sequência global novo no GameState inteiro.
 *
 * `ownership.isOwnBuff` (pedido do usuário, mecânica do Glacial: "faça com
 * que uma carta congelada destrua todo buff que receber também, com a ideia
 * de que seu valor está congelado e não pode aumentar") - um AUMENTO
 * (`mode: 'add'` com `magnitude > 0`, ou `mode: 'multiply'` com
 * `magnitude > 1`) num alvo já congelado só é aplicado quando vem do PRÓPRIO
 * dono da carta (`isOwnBuff: true`) - decisão confirmada com o usuário
 * (AskUserQuestion: "Só bloqueia buffs de OUTRO jogador"), justamente para
 * preservar o combo do próprio Crioescudo/Crioespinho do Glacial (+N nas
 * cartas que ele mesmo congelou). Uma REDUÇÃO (debuff) sempre passa, congelada
 * ou não, já que reduzir não viola "não pode aumentar".
 */
export function applyTimedCombatModifier<T extends WithStatusEffects>(
  entity: T,
  effect: Omit<StatusEffect, 'appliedAt'>,
  now: { turn: number; phase: Phase },
  sumMerge: (existing: StatusEffect, incoming: StatusEffect) => StatusEffect,
  ownership: { isOwnBuff: boolean }
): T {
  if (!ownership.isOwnBuff && effect.kind === 'combatModifier' && hasStatus(entity, 'frozen')) {
    const isIncrease = effect.mode === 'multiply' ? (effect.magnitude ?? 1) > 1 : (effect.magnitude ?? 0) > 0;
    if (isIncrease) return entity;
  }
  const existing = getStatus(entity, effect.kind, { source: effect.source });
  const isImmediateReactivation = Boolean(
    existing?.appliedAt && existing.appliedAt.turn === now.turn && existing.appliedAt.phase === now.phase
  );
  const stamped: StatusEffect = { ...effect, appliedAt: now };
  if (isImmediateReactivation) {
    return applyStatus(entity, stamped, (ex, inc) => ({ ...sumMerge(ex, inc), appliedAt: now }));
  }
  return applyStatus(entity, stamped, 'stack');
}

export function removeStatus<T extends WithStatusEffects>(
  entity: T,
  kind: StatusEffectKind,
  opts?: { source?: CharacterId }
): T {
  if (!entity.statusEffects?.length) return entity;
  const next = entity.statusEffects.filter((e) => !(e.kind === kind && (!opts?.source || e.source === opts.source)));
  return next.length === entity.statusEffects.length ? entity : { ...entity, statusEffects: next };
}

/**
 * Remove um kind+source de TODA carta de um campo (principal + horizontais)
 * - necessário pra efeitos que hoje limpam o modificador antigo não importa
 * em QUAL carta ele estava antes de marcar um alvo novo (ex.: Fúria Selvagem
 * da Besta, que hoje filtra o array plano do jogador inteiro; sem esse array
 * plano, precisa varrer o campo carta por carta).
 */
export function removeStatusFromField(
  field: [FieldSlot, FieldSlot, FieldSlot],
  kind: StatusEffectKind,
  source?: CharacterId
): [FieldSlot, FieldSlot, FieldSlot] {
  return field.map((slot) => ({
    ...slot,
    faceDownCard: slot.faceDownCard ? removeStatus(slot.faceDownCard, kind, { source }) : slot.faceDownCard,
    horizontalCards: slot.horizontalCards.map((c) => removeStatus(c, kind, { source })),
  })) as [FieldSlot, FieldSlot, FieldSlot];
}

/** Pura - decide quais StatusEffect sobrevivem a uma transição pra `ctx.newPhase`/`ctx.newTurn`. */
export function tickStatuses(effects: StatusEffect[], ctx: { newTurn: number; newPhase: Phase }): StatusEffect[] {
  return effects.filter((effect) => {
    switch (effect.duration.type) {
      case 'permanent':
        return true;
      case 'untilTurn':
        return ctx.newTurn <= effect.duration.turn;
      case 'untilPhase':
        return effect.duration.phase !== ctx.newPhase;
    }
  });
}

/** Aplica `tickStatuses` a qualquer entidade com `statusEffects` (Card ou PlayerState), preservando referência quando nada muda. */
export function tickEntityStatuses<T extends WithStatusEffects>(entity: T, ctx: { newTurn: number; newPhase: Phase }): T {
  if (!entity.statusEffects?.length) return entity;
  const next = tickStatuses(entity.statusEffects, ctx);
  return next.length === entity.statusEffects.length ? entity : { ...entity, statusEffects: next };
}

/**
 * Aplica `tickEntityStatuses` a toda carta de um campo (principal,
 * horizontais, reserva de Torre e reserva de Broto de cada slot) - usado por
 * `resetForNewTurn` (gameEngine.ts) pra expirar de uma vez qualquer
 * StatusEffect ligado a uma carta específica (ex.: `combatModifier`) em toda
 * transição de fase/turno, sem cada handler precisar lembrar de fazer isso
 * manualmente.
 */
export function tickFieldStatuses(field: [FieldSlot, FieldSlot, FieldSlot], ctx: { newTurn: number; newPhase: Phase }): [FieldSlot, FieldSlot, FieldSlot] {
  return field.map((slot) => ({
    ...slot,
    faceDownCard: slot.faceDownCard ? tickEntityStatuses(slot.faceDownCard, ctx) : slot.faceDownCard,
    horizontalCards: slot.horizontalCards.map((c) => tickEntityStatuses(c, ctx)),
    towerReserve: slot.towerReserve?.map((c) => tickEntityStatuses(c, ctx)),
    brotoReserve: slot.brotoReserve?.map((c) => tickEntityStatuses(c, ctx)),
  })) as [FieldSlot, FieldSlot, FieldSlot];
}

/** Todos os StatusEffect de `kind: 'combatModifier'` presentes na carta. */
export function getCombatModifierStatuses(card: Card | undefined): StatusEffect[] {
  return (card?.statusEffects ?? []).filter((e) => e.kind === 'combatModifier');
}

/**
 * Acha, em todo o campo (principal + horizontais de cada slot), a primeira
 * carta que carrega um StatusEffect com este `kind`/`opts` - usado pela UI
 * pra descobrir QUAL carta destacar visualmente (ex.: o selo de "dobrada"/
 * "reforçada" de um marcador de combate), já que o efeito mora na carta e
 * não existe mais um array plano do jogador pra varrer por `cardId`.
 */
export function findFieldCardWithStatus(
  field: [FieldSlot, FieldSlot, FieldSlot],
  kind: StatusEffectKind,
  opts?: { source?: CharacterId; mode?: 'add' | 'multiply' }
): { card: Card; status: StatusEffect } | undefined {
  for (const slot of field) {
    const candidates = [...(slot.faceDownCard ? [slot.faceDownCard] : []), ...slot.horizontalCards];
    for (const card of candidates) {
      const status = (card.statusEffects ?? []).find(
        (e) => e.kind === kind && (!opts?.source || e.source === opts.source) && (!opts?.mode || e.mode === opts.mode)
      );
      if (status) return { card, status };
    }
  }
  return undefined;
}

/**
 * Substitui `applyCombatModifiers` (antigo array plano `CombatModifier[]` em
 * `PlayerState`) - aplica todo modificador de combate JÁ PRESENTE NA CARTA,
 * em ordem, sobre `baseValue`.
 */
export function applyCombatModifierStatuses(baseValue: number, card: Card): number {
  return getCombatModifierStatuses(card).reduce(
    (value, m) => (m.mode === 'multiply' ? value * (m.magnitude ?? 1) : value + (m.magnitude ?? 0)),
    baseValue
  );
}
