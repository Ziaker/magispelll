/**
 * strategyFieldHandlers.ts - reposicionamento reversível de campo na Estratégia.
 *
 * Estes handlers cuidam apenas de desfazer/trocar posicionamentos antes
 * do combate. Regras de magia e resolução de combate ficam fora daqui.
 */
import { revealCard } from './cardUtils';
import { isBrotoSlot, isTowerSlot } from './fieldLifecycle';
import { returnSlotToHand, updateFieldSlot } from './fieldOperations';
import { appendLog } from './gameLog';
import { characterOf, playerKeyOf } from './gameSelectors';
import { hasStatus } from './statusEffects';
import type { GameState } from './gameStateTypes';
import type { PlayerNumber } from './gameTypes';
export function handleReturnCardToHand(state: GameState, player: PlayerNumber, slotIndex: number): GameState {
  if (state.phase !== 'strategy') return state;
  const playerKey = playerKeyOf(player);
  const playerState = state[playerKey];
  const slot = playerState.field[slotIndex];
  if (!slot.faceDownCard) return state;

  // FIX (pedido do usuário, QoL: "desfazer posicionamento - qualquer carta
  // que não recebeu ou foi alvo de efeito no campo") - antes esta ação
  // devolvia QUALQUER slot pra mão, mesmo já revelado ou com um
  // StatusEffect aplicado por um efeito do oponente (ex.: `frozen`,
  // `magicLocked`, `combatModifier` de Simbiose/Urtiga/Crioescudo/Tiro
  // Certeiro/escudo do Valete) - deixava desfazer um posicionamento DEPOIS
  // de algo já ter reagido a ele, escapando de graça de uma interação real
  // do oponente. Agora só permite quando o slot inteiro (principal + toda
  // horizontal empilhada, se houver) nunca foi revelado nem recebeu nenhum
  // StatusEffect - `isTowerSlot`/`isBrotoSlot` também ficam de fora (reserva
  // empilhada complexa demais pra desfazer com segurança).
  if (
    slot.revealed ||
    isTowerSlot(slot) ||
    isBrotoSlot(slot) ||
    (slot.faceDownCard.statusEffects?.length ?? 0) > 0 ||
    slot.horizontalCards.some((c) => c.revealed || (c.statusEffects?.length ?? 0) > 0)
  ) {
    return { ...state, log: appendLog(state, state.log, 'warning', `Esta carta já foi revelada ou recebeu um efeito - não é mais possível desfazer o posicionamento.`) };
  }

  // FIX: ao devolver a carta principal do slot para a mão, quaisquer cartas
  // horizontais empilhadas nele também precisam voltar - antes elas ficavam
  // "orfãs" no slot (sem carta principal, mas ainda com horizontalCards),
  // um estado inconsistente que nenhuma outra parte do motor esperava.
  // FIX (Modo Towers, pedido do usuário): idem para a reserva da torre - sem
  // isso, devolver o topo de uma torre pra mão perderia as cartas empilhadas
  // por baixo para sempre (nunca voltariam pra lugar nenhum).
  // Druida: a reserva do Broto (se este slot for um) volta pra mão junto,
  // mesmo motivo/padrão já usado pela reserva de torre logo abaixo.
  const { hand: newHand, clearedSlot } = returnSlotToHand(playerState.hand, slot);
  const newField = updateFieldSlot(playerState.field, slotIndex, clearedSlot);

  const log = appendLog(state, state.log, 'field', `Jogador ${player} retornou carta do slot ${slotIndex + 1} para a mão`, { player });

  return {
    ...state,
    log,
    [playerKey]: {
      ...playerState,
      hand: newHand,
      field: newField,
    },
  };
}

/**
 * FIX (item 9 da 6ª rodada): "adicione a opção de remover a carta horizontal
 * de cima de outra carta, clicando onde normalmente sua indicação visual é
 * posicionada" - diferente de handleReturnCardToHand (acima), que devolve o
 * slot INTEIRO, esta remove só a carta horizontal identificada por `cardId`,
 * preservando a carta principal do slot e a outra carta horizontal, se
 * houver 2 empilhadas (Reforço Angelical do Anjo). Mesma janela de
 * permissão que as outras ações de reposicionamento em campo: só durante a
 * fase de Estratégia, antes do combate revelar tudo publicamente.
 */
export function handleReturnHorizontalCardToHand(state: GameState, player: PlayerNumber, slotIndex: number, cardId: string): GameState {
  if (state.phase !== 'strategy') return state;
  const playerKey = playerKeyOf(player);
  const playerState = state[playerKey];
  const slot = playerState.field[slotIndex];
  const card = slot.horizontalCards.find((c) => c.id === cardId);
  if (!card) return state;
  // FIX (pedido do usuário, QoL: "desfazer posicionamento - qualquer carta
  // que não recebeu ou foi alvo de efeito no campo") - mesma regra aplicada
  // em handleReturnCardToHand acima, só pra ESTA carta horizontal específica
  // (as outras cartas do mesmo slot não importam aqui - cada horizontal é
  // independente).
  if (card.revealed || (card.statusEffects?.length ?? 0) > 0) {
    return { ...state, log: appendLog(state, state.log, 'warning', `Esta carta já foi revelada ou recebeu um efeito - não é mais possível desfazer o posicionamento.`) };
  }

  const newHand = [...playerState.hand, card];
  const newField = updateFieldSlot(playerState.field, slotIndex, (s) => ({ horizontalCards: s.horizontalCards.filter((c) => c.id !== cardId) }));

  const log = appendLog(state, state.log, 'field', `Jogador ${player} retornou a carta horizontal do slot ${slotIndex + 1} para a mão`, { player });

  return { ...state, log, [playerKey]: { ...playerState, hand: newHand, field: newField } };
}

/**
 * FIX (item 9): antes, uma carta já posicionada no campo não podia ser
 * trocada por outra da mão - a única forma de "consertar" uma jogada era
 * RETURN_CARD_TO_HAND seguido de PLAY_CARD, duas ações separadas (e visíveis
 * no log como duas jogadas distintas). Esta ação troca a carta PRINCIPAL de
 * um slot atomicamente: a carta antiga volta para a mão (não é descartada -
 * o jogador não perde a carta, só a reposiciona), e a nova carta da mão
 * ocupa o lugar dela, seguindo a mesma regra de revelação que uma jogada
 * normal (PLAY_CARD). Só é permitido enquanto o slot ainda não foi revelado
 * - depois de revelado, a carta já está em jogo publicamente e não faz
 * sentido mais poder trocá-la.
 */
export function handleSwapFieldCard(state: GameState, player: PlayerNumber, cardId: string, slotIndex: number): GameState {
  if (state.phase !== 'strategy') return state;
  const playerKey = playerKeyOf(player);
  const playerState = state[playerKey];
  const card = playerState.hand.find((c) => c.id === cardId);
  if (!card) return state;
  const character = characterOf(state, player);
  // Coringa (redesenho completo): SWAP_FIELD_CARD só cria carta PRINCIPAL
  // (nunca horizontal), então só aceita Rainha/Rei/Monstro (posicionáveis
  // como principal) - o Valete continua rejeitado aqui mesmo pro Coringa,
  // já que ele só pode ir como horizontal (ver PLAY_CARD).
  const isCoringaMainSlotTrap = character === 'coringa' && (card.value === 'Q' || card.value === 'K' || card.isMonster);
  if (!isCoringaMainSlotTrap) {
    if (card.value === 'J' || card.value === 'Q' || card.value === 'K') {
      return { ...state, log: appendLog(state, state.log, 'warning', `Cartas mágicas só podem ser usadas ativando sua magia, não posicionadas no campo!`) };
    }
    // FIX (checagem extensa por bugs, sweep de consolidação de regras
    // duplicadas - ver isFieldEligible em cardUtils.ts): faltava aqui - a
    // troca aceitava silenciosamente um Coringa da mão, colocando a carta
    // Monstro direto num slot de combate normal (handlePlayCard já bloqueava
    // isso desde o item 4/7 da 3ª rodada, mas este caminho irmão nunca ganhou
    // a mesma guarda).
    if (card.isMonster) {
      return { ...state, log: appendLog(state, state.log, 'warning', `Cartas Monstro só podem ser posicionadas na sua zona própria, não em um slot de combate!`) };
    }
    // FIX (pedido do usuário: "o Ás está podendo ser posicionado como carta
    // no campo/horizontal, corrija isso, não permita, em TODOS modos de
    // jogo") - mesma guarda de handlePlayCard acima, pro caminho irmão de
    // troca (SWAP_FIELD_CARD): um Ás CRU precisa ser transformado primeiro.
    if (card.value === 'A' && card.transformedValue === undefined) {
      return { ...state, log: appendLog(state, state.log, 'warning', `Um Ás precisa ser transformado (arraste sobre outra carta) antes de ser posicionado!`) };
    }
  }

  // FIX (item 5 da 2ª rodada): a troca também precisa funcionar quando a
  // carta já posicionada está revelada (por alguma magia, ou um Ás
  // transformado) - antes `slot.revealed` bloqueava incondicionalmente,
  // sem motivo: a carta ainda está na fase de Estratégia, ainda não foi
  // para o combate, então trocá-la por outra da mão continua uma jogada
  // válida mesmo já revelada.
  const slot = playerState.field[slotIndex];
  if (!slot.faceDownCard) return state;
  // FIX (Modo Towers, pedido do usuário): trocar só o topo de uma torre por
  // esta ação não é uma interação prevista no design (a torre só cresce via
  // FORM_OR_REINFORCE_TOWER, ou encolhe via uma magia de troca do oponente) -
  // bloqueado aqui pra nunca perder silenciosamente as cartas da reserva.
  // Druida: mesmo bloqueio para um Broto - ele só cresce/empilha via
  // PLAY_CARD (plantar/empilhar) ou encolhe via Simbiose/Urtiga, nunca por
  // esta troca genérica.
  if (isTowerSlot(slot) || isBrotoSlot(slot)) return state;
  // FIX (mudança de regra pedida pelo usuário - ver isFrozenPlayBlocked): a
  // carta DA MÃO entrando aqui pode estar congelada agora (mesma liberação
  // de PLAY_CARD, "jogar carta congelada" não é mais bloqueado pra ninguém).
  // A carta JÁ no slot, porém, continua protegida - não pode ser
  // removida/substituída se estiver congelada, mesma regra "não recebe
  // efeitos transformadores de terceiros" já aplicada à Substituição Arcana
  // do Mago (Q); isso é sobre PROTEGER a carta congelada existente, não
  // sobre bloquear a que está sendo jogada.
  if (hasStatus(slot.faceDownCard, 'frozen')) return state;

  const oldCard = slot.faceDownCard;
  const newHand = [...playerState.hand.filter((c) => c.id !== cardId), oldCard];

  const shouldReveal = card.transformedValue !== undefined || card.revealed === true;
  const newField = updateFieldSlot(playerState.field, slotIndex, {
    faceDownCard: shouldReveal ? revealCard(card) : card,
    revealed: shouldReveal,
  });

  const log = appendLog(
    state,
    state.log,
    'field',
    `Jogador ${player} trocou a carta do slot ${slotIndex + 1} por outra da mão`,
    { player }
  );

  return { ...state, log, [playerKey]: { ...playerState, hand: newHand, field: newField } };
}
