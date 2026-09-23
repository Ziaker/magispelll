/**
 * monsterEffectHandlers.ts - efeitos simples da Zona Monstro.
 *
 * Concentra todos os efeitos da Zona Monstro, inclusive a Ilusão Arcana
 * do Mago, sem depender de gameEngine.ts.
 */
import { getEffectiveCardValue, isPlainNumeralCard } from './cardUtils';
import { applyStatus, removeStatusFromField } from './statusEffects';
import type { PlayerNumber } from './gameTypes';
import { appendLog } from './gameLog';
import { playerKeyOf, characterOf } from './gameSelectors';
import { canActivateMonsterEffect } from './monsterLifecycle';
import { getFireballCap } from './piromanteRules';
import type { FieldSlot, GameState } from './gameStateTypes';
/**
 * Besta (Fúria Selvagem) ativa escolhendo um slot alvo E uma carta
 * específica dentro dele. Anjo (Proteção Divina) escolhe só um slot alvo.
 *
 * FIX (pedido do usuário): a Besta precisa de `targetCardId` - o efeito
 * dobra o valor de UMA carta específica do slot escolhido (a principal ou
 * uma horizontal), não mais "a soma de todas as horizontais do slot" (que
 * não fazia nada se o slot não tivesse nenhuma).
 *
 * FIX (pedido do usuário: "o monstro do anjo agora só protege 1 slot
 * selecionado do campo ao invés dos 3, mas pode ser ativado múltiplas vezes
 * no mesmo turno ao invés de 1 vez só") - reversão de um FIX anterior que
 * tinha feito a Proteção Divina proteger o campo inteiro de uma vez, sem
 * escolha de slot. Agora volta a exigir `targetSlotIndex` (mesmo padrão da
 * Besta) E, diferente de todo o resto desta função, NUNCA marca
 * `monsterUsed: true` pro Anjo - só `monsterUseCount` (o orçamento vitalício
 * de 3 usos, via `canActivateMonsterEffect`) limita quantas vezes ele pode
 * ativar, inclusive várias vezes no MESMO turno, cada uma protegendo um slot
 * diferente (acumulado em `monsterProtectedSlots`, nunca sobrescrito).
 */
export function handleActivateMonsterEffectSimple(state: GameState, player: PlayerNumber, targetSlotIndex?: number, targetCardId?: string): GameState {
  const playerKey = playerKeyOf(player);
  const playerState = state[playerKey];
  const character = characterOf(state, player);
  if (!canActivateMonsterEffect(state, player)) return state;
  const monster = playerState.monsterCard!;
  if (character === 'mago') return state; // Mago usa EXECUTE_MAGO_MONSTER_EFFECT (precisa escolher também a carta-fonte)
  // Coringa (redesenho completo) nunca chega aqui - handlePlaceMonsterCard
  // já bloqueia por completo a carta Monstro dele de entrar na Zona Monstro
  // (ela vai pro campo normal via PLAY_CARD/SWAP_FIELD_CARD).

  // FIX (item 2 da 4ª rodada, reescrito na reformulação do log): antes o
  // nome+tooltip do efeito de Monstro (ex.: "Fúria Selvagem") era montado
  // manualmente aqui como HTML (nameSpan) - a UI (LogPanel.tsx) agora busca
  // esse nome/descrição sozinha via getMonsterEffect(personagem), a partir
  // só de `type: 'monster'` + `player` (o personagem de cada jogador é fixo
  // pela partida inteira), então o motor só precisa registrar o texto puro.
  if (character === 'anjo') {
    if (targetSlotIndex === undefined) return state;
    if (playerState.monsterProtectedSlots.includes(targetSlotIndex)) return state; // já protegido, nada a fazer
    const log = appendLog(
      state,
      state.log,
      'monster',
      `Jogador ${player} ativou - slot ${targetSlotIndex + 1} protegido contra magias até o fim do turno`,
      { player }
    );
    return {
      ...state,
      log,
      [playerKey]: {
        ...playerState,
        // FIX: `monsterUsed` fica false de propósito - o Anjo pode reativar
        // no mesmo turno (ver comentário completo acima); só o orçamento
        // vitalício (`monsterUseCount`) limita.
        monsterCard: { ...monster, monsterUsed: false, monsterUseCount: (monster.monsterUseCount ?? 0) + 1 },
        monsterTargetSlot: targetSlotIndex,
        monsterProtectedSlots: [...playerState.monsterProtectedSlots, targetSlotIndex],
      },
    };
  }

  // Mosqueteiro (Recarga Rápida): também ativa direto, sem slot alvo - só
  // liga a flag que redireciona o PRÓXIMO descarte do Valete/Rainha para a
  // mão do oponente (ver mosqueteiroRedirectNextDiscard/handleExecuteMagic).
  if (character === 'mosqueteiro') {
    const log = appendLog(state, state.log, 'monster', `Jogador ${player} ativou - o próximo descarte de suas magias será da mão do oponente`, { player });
    return {
      ...state,
      log,
      [playerKey]: applyStatus(
        {
          ...playerState,
          monsterCard: { ...monster, monsterUsed: true, monsterUseCount: (monster.monsterUseCount ?? 0) + 1 },
          monsterTargetSlot: undefined,
        },
        { kind: 'redirectNextDiscard', source: 'mosqueteiro', label: 'Recarga Rápida', duration: { type: 'untilPhase', phase: 'draw' } }
      ),
    };
  }

  // Piromante (Brasa): também ativa direto, sem slot alvo - só soma um
  // valor fixo à Bola de Fogo, até o teto atual.
  if (character === 'piromante') {
    const cap = getFireballCap(state.gameConfig);
    const newFireball = Math.min(cap, playerState.fireballValue + 5);
    const log = appendLog(state, state.log, 'monster', `Jogador ${player} ativou - +5 na Bola de Fogo (agora ${newFireball})`, { player });
    return {
      ...state,
      log,
      [playerKey]: {
        ...playerState,
        monsterCard: { ...monster, monsterUsed: true, monsterUseCount: (monster.monsterUseCount ?? 0) + 1 },
        monsterTargetSlot: undefined,
        fireballValue: newFireball,
      },
    };
  }

  // FIX (endurecimento pedido pelo usuário: "está pronto para mais um
  // personagem?") - este trecho ("Besta a partir daqui") rodava
  // incondicionalmente pra qualquer personagem que chegasse até aqui sem
  // ter sido interceptado acima (mago/anjo/mosqueteiro/piromante retornam
  // cedo; coringa nunca chega aqui - ver comentário no início da função) -
  // hoje só sobra a Besta de verdade, mas um personagem NOVO esquecido
  // aqui executaria a Fúria Selvagem por engano em vez de simplesmente não
  // fazer nada. Guard explícito: precisa de um slot válido (0-2) e de uma
  // carta específica dentro dele.
  if (character !== 'besta') return state;
  if (targetSlotIndex === undefined || targetSlotIndex < 0 || targetSlotIndex > 2) return state;
  const slot = playerState.field[targetSlotIndex];
  // FIX (checagem extensa por bugs - interação Piromante x Besta): exclui
  // cartas-token de Bola de Fogo (`isFireToken`) dos alvos válidos - Fúria
  // Selvagem foi desenhada pra dobrar uma carta numeral de verdade no
  // combate, e um token nunca deveria ser um alvo "de verdade" (cosmético,
  // mas inconsistente com a identidade visual/temática do efeito).
  const candidateIds = [slot.faceDownCard, ...slot.horizontalCards]
    .filter((c) => c && !c.isFireToken)
    .map((c) => c!.id);
  if (!targetCardId || !candidateIds.includes(targetCardId)) return state; // precisa apontar pra uma carta que realmente está neste slot

  const log = appendLog(state, state.log, 'monster', `Jogador ${player} ativou no slot ${targetSlotIndex + 1} - carta selecionada será dobrada no combate`, { player });

  // FIX (pedido da Besta): reativar Fúria Selvagem limpa o marcador antigo do
  // CAMPO INTEIRO (não só do slot alvo, já que a carta anterior pode ter
  // saído do slot que a hospedava) antes de marcar a nova carta escolhida.
  const fieldWithoutOldMarker = removeStatusFromField(playerState.field, 'combatModifier', 'besta');
  const targetSlot = fieldWithoutOldMarker[targetSlotIndex];
  const targetCard = (targetSlot.faceDownCard?.id === targetCardId ? targetSlot.faceDownCard : targetSlot.horizontalCards.find((c) => c.id === targetCardId))!;
  const markedCard = applyStatus(targetCard, {
    kind: 'combatModifier',
    source: 'besta',
    label: 'Fúria Selvagem',
    mode: 'multiply',
    magnitude: 2,
    duration: { type: 'untilPhase', phase: 'draw' },
  });
  const newField = fieldWithoutOldMarker.map((slot, i) =>
    i !== targetSlotIndex
      ? slot
      : slot.faceDownCard?.id === targetCardId
      ? { ...slot, faceDownCard: markedCard }
      : { ...slot, horizontalCards: slot.horizontalCards.map((c) => (c.id === targetCardId ? markedCard : c)) }
  ) as [FieldSlot, FieldSlot, FieldSlot];

  return {
    ...state,
    log,
    [playerKey]: {
      ...playerState,
      monsterCard: { ...monster, monsterUsed: true, monsterUseCount: (monster.monsterUseCount ?? 0) + 1 },
      monsterTargetSlot: targetSlotIndex,
      field: newField,
    },
  };
}

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
