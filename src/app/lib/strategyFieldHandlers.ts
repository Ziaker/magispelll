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
import { isSlotProtected } from './anjoRules';
import { isCoringaRawTrapCard } from './coringaRules';
import { opponentKeyOf, opponentOf } from './gameSelectors';
import type { FieldSlot } from './gameStateTypes';
import { getGlacialGolemValue, isFrozenPlayBlocked } from './glacialRules';
import { applyTimedCombatModifier } from './statusEffects';
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
    return { ...state, log: appendLog(state, state.log, 'warning', `Esta carta já foi revelada ou recebeu um efeito - não é mais possível desfazer o posicionamento.`, { animationPolicy: 'suppress' }) };
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
    return { ...state, log: appendLog(state, state.log, 'warning', `Esta carta já foi revelada ou recebeu um efeito - não é mais possível desfazer o posicionamento.`, { animationPolicy: 'suppress' }) };
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
      return { ...state, log: appendLog(state, state.log, 'warning', `Cartas mágicas só podem ser usadas ativando sua magia, não posicionadas no campo!`, { animationPolicy: 'suppress' }) };
    }
    // FIX (checagem extensa por bugs, sweep de consolidação de regras
    // duplicadas - ver isFieldEligible em cardUtils.ts): faltava aqui - a
    // troca aceitava silenciosamente um Coringa da mão, colocando a carta
    // Monstro direto num slot de combate normal (handlePlayCard já bloqueava
    // isso desde o item 4/7 da 3ª rodada, mas este caminho irmão nunca ganhou
    // a mesma guarda).
    if (card.isMonster) {
      return { ...state, log: appendLog(state, state.log, 'warning', `Cartas Monstro só podem ser posicionadas na sua zona própria, não em um slot de combate!`, { animationPolicy: 'suppress' }) };
    }
    // FIX (pedido do usuário: "o Ás está podendo ser posicionado como carta
    // no campo/horizontal, corrija isso, não permita, em TODOS modos de
    // jogo") - mesma guarda de handlePlayCard acima, pro caminho irmão de
    // troca (SWAP_FIELD_CARD): um Ás CRU precisa ser transformado primeiro.
    if (card.value === 'A' && card.transformedValue === undefined) {
      return { ...state, log: appendLog(state, state.log, 'warning', `Um Ás precisa ser transformado (arraste sobre outra carta) antes de ser posicionado!`, { animationPolicy: 'suppress' }) };
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

export function handlePlayCard(state: GameState, player: PlayerNumber, cardId: string, slotIndex: number, asHorizontal: boolean): GameState {
  const playerKey = playerKeyOf(player);
  const playerState = state[playerKey];
  const card = playerState.hand.find((c) => c.id === cardId);
  if (!card) return state;
  const character = characterOf(state, player);
  // Glacial (personagem novo) - o Criogolem também nunca usa a Zona Monstro
  // (ver handlePlaceMonsterCard) - mesmo padrão do Monstro-15 do Coringa e
  // do Broto Espelhado do Druida. Calculado aqui em cima (antes só existia
  // mais abaixo) porque o guard de fase logo a seguir também depende dele.
  const isGlacialMonsterCard = character === 'glacial' && Boolean(card.isMonster);
  // FIX (pedido do usuário: "o monstro do glacial só pode ser posicionado
  // da mão para o campo na fase de combate quando ele tiver um campo
  // livre, a ideia é ser uma surpresa") - o Criogolem agora é a ÚNICA
  // carta jogável FORA da Estratégia: só pode ser posicionado durante o
  // COMBATE (nunca mais na Estratégia, onde denunciaria de antemão qual
  // slot esconde uma carta extra antes mesmo do oponente escolher os
  // confrontos daquela rodada - "a ideia é ser uma surpresa"). Qualquer
  // outra carta (de qualquer personagem) continua exigindo a Estratégia
  // como sempre. `decideGlacialMonster`/`decideCombatPhase` (aiPlayer.ts)
  // espelham esta mesma regra pra IA.
  if (isGlacialMonsterCard) {
    if (state.phase !== 'combat') return state;
  } else if (state.phase !== 'strategy') {
    return state;
  }

  if (isFrozenPlayBlocked(character, card)) {
    return { ...state, log: appendLog(state, state.log, 'warning', `Esta carta está congelada e não pode ser jogada!`, { animationPolicy: 'suppress' }) };
  }

  // FIX (pedido do usuário: "as correntes do anjo também devem proibir a
  // utilização/posicionamento da carta monstro do oponente") - Visão
  // Celestial agora também tranca (StatusEffect 'magicLocked') a carta
  // Monstro do oponente quando é ELA a revelada (ver o branch 'anjo'+'Q'
  // mais abaixo, mesmo padrão já usado pra J/Q/K). Coringa/Druida/Glacial
  // jogam a própria carta Monstro como substituto de numeral direto por
  // PLAY_CARD (nunca por PLACE_MONSTER_CARD - ver isCoringaTrapCard/
  // isDruidaMonsterCard/isGlacialMonsterCard mais abaixo), então o guard
  // certo pra eles é aqui; os outros 5 personagens usam a Zona Monstro
  // (handlePlaceMonsterCard, guard irmão deste logo abaixo no arquivo).
  if (card.isMonster && hasStatus(card, 'magicLocked')) {
    return { ...state, log: appendLog(state, state.log, 'warning', `Esta carta Monstro está trancada pela Visão Celestial e não pode ser jogada!`, { animationPolicy: 'suppress' }) };
  }

  // Coringa (redesenho completo, pedido do usuário): diferente de todos os
  // outros personagens, suas cartas de magia (J/Q/K) e Monstro NÃO ativam
  // efeito nenhum "na mão" - elas são POSICIONADAS no campo como armadilhas,
  // cada uma numa posição fixa (Valete só horizontal, Rainha/Rei só
  // principal, Monstro em qualquer uma - ver comentário completo em
  // isCoringaTrapCard/coringaFieldPlacementSlotKind, cardUtils.ts) e só
  // revelam seu efeito de verdade quando reveladas de fato (na Estratégia
  // por um efeito do oponente, ou no Combate ao serem selecionadas - ver
  // triggerCoringaStrategyRevealTrap/handleResolveCombat).
  // FIX (pedido do usuário: "o valete transformado do coringa não está
  // podendo ser posicionado") - faltava excluir cartas já transformadas pela
  // Magia Numeral "Mão de Ferro" (`coringaTransformedToNumeral`) daqui. Uma
  // vez transformada, a carta LARGA o comportamento de armadilha por
  // completo (ver comentário no topo desta seção) e passa a valer como uma
  // carta numeral comum (11/12/13) - devia poder ser posicionada como
  // QUALQUER carta numeral normal (principal OU horizontal, sem a restrição
  // de posição fixa da armadilha crua). Sem esta exclusão, `isCoringaTrapCard`
  // continuava `true` só por causa do `card.value` ainda ser 'J'/'Q'/'K'
  // (a transformação nunca muda `.value`, só adiciona `.transformedValue` -
  // mesmo padrão do Ás transformado), então a carta já transformada
  // continuava presa às regras de posição fixa da armadilha (Valete só
  // horizontal, Rainha/Rei só principal) - rejeitada ao tentar posicionar do
  // jeito "normal" que um número transformado deveria aceitar.
  const isCoringaTransformedCard = character === 'coringa' && card.coringaTransformedToNumeral;
  const isCoringaTrapCard = character === 'coringa' && !isCoringaTransformedCard && (card.value === 'J' || card.value === 'Q' || card.value === 'K' || card.isMonster);
  // Druida (personagem novo) - o Broto (Valete) nunca "ativa" como as outras
  // magias: é POSICIONADO no campo (plantado ou empilhado sobre um Broto já
  // existente - ver mais abaixo), igual à Rainha/Rei do Coringa serem
  // posicionadas em vez de ativadas. O Monstro dele também nunca usa a Zona
  // Monstro (ver handlePlaceMonsterCard) - é jogado como carta numeral comum,
  // valendo o valor atual do Broto - mesmo padrão do Monstro-15 do Coringa.
  //
  // FIX (pedido do usuário: "faça o druida ser capaz de plantar brotos com
  // as outras magias também... permitindo que o Q, K e J sejam posicionados
  // encima de um Q, K ou J também no campo") - Rainha (Simbiose) e Rei
  // (Urtiga) agora TAMBÉM podem ser plantados/empilhados como o Broto,
  // funcionando exatamente como o Valete pra esse fim - uma segunda forma de
  // usar a mesma carta física, independente de EXECUTE_MAGIC (Simbiose/
  // Urtiga continuam existindo normalmente como magias de verdade; o
  // jogador escolhe, pra cada carta em mãos, qual das duas ações tomar com
  // ela).
  const isDruidaBrotoCard = character === 'druida' && (card.value === 'J' || card.value === 'Q' || card.value === 'K');
  const isDruidaMonsterCard = character === 'druida' && Boolean(card.isMonster);
  // isGlacialMonsterCard já foi calculado no topo da função (o guard de fase
  // depende dele antes de chegarmos aqui).
  if (!isCoringaTrapCard && !isDruidaBrotoCard && !isDruidaMonsterCard && !isGlacialMonsterCard) {
    // FIX: Cartas mágicas (J, Q, K) de qualquer OUTRO personagem nunca podem
    // ser posicionadas no campo como carta comum - elas só saem da mão
    // ativando seu efeito de magia. Não se aplica a uma carta do Coringa já
    // transformada (`isCoringaTransformedCard`) - mesmo com `.value` ainda
    // 'J'/'Q'/'K', ela já é uma carta numeral de verdade agora.
    if (!isCoringaTransformedCard && (card.value === 'J' || card.value === 'Q' || card.value === 'K')) {
      return { ...state, log: appendLog(state, state.log, 'warning', `Cartas mágicas só podem ser usadas ativando sua magia, não posicionadas no campo!`, { animationPolicy: 'suppress' }) };
    }

    // FIX (itens 4 e 7 da 3ª rodada): cartas Monstro de qualquer OUTRO
    // personagem não podem ocupar um dos 3 slots de combate como se fossem
    // uma carta comum - esse era exatamente o bug do item 4 (a IA, e a
    // interface em geral, tratava o Monstro como uma carta Normal/Ás,
    // lutando em combate com valor 0). Elas só podem ir para sua zona
    // própria (ver PLACE_MONSTER_CARD).
    if (card.isMonster) {
      return { ...state, log: appendLog(state, state.log, 'warning', `Cartas Monstro só podem ser posicionadas na sua zona própria, não em um slot de combate!`, { animationPolicy: 'suppress' }) };
    }

    // FIX (pedido do usuário: "o Ás está podendo ser posicionado como carta
    // no campo/horizontal, corrija isso, não permita, em TODOS modos de
    // jogo") - um Ás CRU (sem `transformedValue`) nunca pode ser posicionado,
    // nem como principal nem como horizontal - precisa ser transformado
    // primeiro (TRANSFORM_ACE, ainda na mão - ver handleTransformAce) pra
    // virar uma carta numeral de verdade. Reverte o mecanismo antigo ("Ás cru
    // vale 14 e pode ser jogado direto"; ver isFieldEligible, cardUtils.ts,
    // pra mesma regra usada pela IA/UI).
    if (card.value === 'A' && card.transformedValue === undefined) {
      return { ...state, log: appendLog(state, state.log, 'warning', `Um Ás precisa ser transformado (arraste sobre outra carta) antes de ser posicionado!`, { animationPolicy: 'suppress' }) };
    }
  } else if (isCoringaTrapCard) {
    // Valete: SÓ pode ir como horizontal ("Esta carta pode ser posicionada
    // como horizontal em uma carta sua"). Rainha/Rei: SÓ como carta
    // principal ("posicionada como uma carta normal"/"virada no seu
    // campo"). Monstro (tratado como um "15"): qualquer uma das duas,
    // igual a uma carta numeral comum.
    if (card.value === 'J' && !asHorizontal) {
      return { ...state, log: appendLog(state, state.log, 'warning', `O Valete do Palhaço só pode ser posicionado como carta horizontal!`, { animationPolicy: 'suppress' }) };
    }
    if ((card.value === 'Q' || card.value === 'K') && asHorizontal) {
      return { ...state, log: appendLog(state, state.log, 'warning', `Esta carta do Palhaço só pode ser posicionada como carta principal, não horizontal!`, { animationPolicy: 'suppress' }) };
    }
  } else if (isDruidaBrotoCard) {
    // "Não pode receber horizontais" também vale pra ele MESMO ser
    // posicionado como horizontal - o Broto só existe como carta principal
    // de um slot (plantado ou empilhado - ver mais abaixo).
    if (asHorizontal) {
      return { ...state, log: appendLog(state, state.log, 'warning', `O Broto do Druida só pode ser plantado como carta principal, não horizontal!`, { animationPolicy: 'suppress' }) };
    }
  } else if (isDruidaMonsterCard) {
    // "Pode ser jogada no campo como uma carta numeral" (sem restrição de
    // posição, igual ao Monstro-15 do Coringa) - mas só com um Broto ativo
    // em algum slot do próprio campo (decisão confirmada com o usuário: sem
    // Broto, a carta fica bloqueada na mão).
    if (!playerState.field.some(isBrotoSlot)) {
      return { ...state, log: appendLog(state, state.log, 'warning', `O Monstro do Druida só pode ser jogado com um Broto ativo no campo!`, { animationPolicy: 'suppress' }) };
    }
  }

  const newHand = playerState.hand.filter((c) => c.id !== cardId);
  const newField = [...playerState.field] as [FieldSlot, FieldSlot, FieldSlot];
  let log = state.log;

  if (asHorizontal) {
    if (!newField[slotIndex].faceDownCard) {
      return { ...state, log: appendLog(state, log, 'warning', `Não é possível posicionar carta horizontal sem carta no campo!`) };
    }
    // FIX (Modo Towers, pedido do usuário: "sem carta horizontal em cima de
    // torre") - uma torre nunca recebe reforço horizontal.
    if (isTowerSlot(newField[slotIndex])) {
      return { ...state, log: appendLog(state, log, 'warning', `Não é possível posicionar carta horizontal sobre uma torre!`) };
    }
    // Druida (personagem novo, "não pode receber horizontais"): mesma regra
    // acima, aplicada ao Broto.
    if (isBrotoSlot(newField[slotIndex])) {
      return { ...state, log: appendLog(state, log, 'warning', `Não é possível posicionar carta horizontal sobre o Broto!`) };
    }
    // FIX (item 1, revisado): o limite de cartas horizontais é por TURNO
    // (contando o campo inteiro do jogador), não por slot - "Reforço
    // Angelical" do Rei do Anjo é descrito como "permite empilhar uma carta
    // horizontal EXTRA NESTE TURNO", ou seja, sem a magia o jogador só pode
    // posicionar UMA carta horizontal no turno inteiro (em qualquer slot que
    // escolher). Uma correção anterior somava a carta ao array em vez de
    // sobrescrever (o que já estava certo), mas checava o limite só dentro do
    // slot alvo - isso deixava um jogador colocar 1 carta horizontal em CADA
    // um dos 3 slots do próprio campo no mesmo turno (3 no total) sem nenhuma
    // magia, o que é exatamente o bug relatado: cartas horizontais sendo
    // colocadas mais de uma vez por turno mesmo fora do caso de magia que
    // permita. Agora o total já colocado em TODO o campo do jogador é que é
    // comparado ao limite.
    //
    // FIX (pedido do usuário, rodada seguinte): `horizontalStackBonus` agora
    // é cumulativo (cada ativação do Rei do Anjo soma +1, sem teto) - ver
    // comentário completo em PlayerState.
    //
    // FIX (pedido do usuário: "é pra vc conseguir colocar um valete mesmo
    // já tendo colocado um horizontal" - o comportamento ORIGINALMENTE
    // pedido, que eu tinha entendido ao contrário): o Valete armadilha CRU
    // do Coringa (`isCoringaTrapCard`) NÃO é um reforço horizontal de
    // verdade - é um disfarce (a carta só vale 1 fixo em combate, ver
    // applyCoringaTrapCombatValue, nunca soma ao total do slot como um
    // reforço de qualquer outro personagem soma) - por isso ele fica de
    // fora deste limite por completo, tanto na CONTAGEM (um Valete já
    // posicionado não consome a cota de reforço "de verdade" de outra
    // carta) quanto na CHECAGEM (posicionar outro Valete nunca esbarra
    // nela, não importa quantos horizontais - de qualquer tipo - o jogador
    // já tenha). Uma carta já TRANSFORMADA em numeral pela Mão de Ferro
    // (`isCoringaTrapCard` já é `false` pra ela, ver início da função) volta
    // a valer como reforço de verdade e ENTRA nesta conta normalmente.
    const maxHorizontal = 1 + playerState.horizontalStackBonus;
    const horizontalPlacedThisTurn = newField.reduce(
      (n, s) => n + s.horizontalCards.filter((c) => !isCoringaRawTrapCard(state, player, c)).length,
      0
    );
    if (!isCoringaTrapCard && horizontalPlacedThisTurn >= maxHorizontal) {
      return { ...state, log: appendLog(state, log, 'warning', `Limite de cartas horizontais deste turno já foi atingido!`) };
    }
    // FIX: cartas já reveladas (por alguma magia, ou um Ás transformado -
    // que fica sempre revelado) podiam ser posicionadas como carta principal
    // mas eram rejeitadas ao tentar posicionar como horizontal, sem motivo -
    // agora elas são aceitas normalmente e continuam mostrando a face para
    // cima (ver BattleField.tsx, que respeita o `revealed` de cada carta
    // individualmente, não só o do slot).
    newField[slotIndex] = { ...newField[slotIndex], horizontalCards: [...newField[slotIndex].horizontalCards, { ...card, placedOnTurn: state.turn }] };
    log = appendLog(state, log, 'field', `Jogador ${player} posicionou uma carta ${card.revealed ? 'revelada ' : ''}horizontal no slot ${slotIndex + 1}`, { player });
  } else if (isDruidaBrotoCard) {
    // Druida - plantar (sem Broto ativo em nenhum slot do próprio campo
    // ainda) ou empilhar (já existe um Broto - "só 1 por vez", decisão
    // confirmada: plantar de novo SEMPRE empilha no já existente, nunca cria
    // um segundo Broto independente em outro slot).
    const existingBrotoIndex = playerState.field.findIndex(isBrotoSlot);
    if (existingBrotoIndex !== -1) {
      if (slotIndex !== existingBrotoIndex) {
        return { ...state, log: appendLog(state, log, 'warning', `Já existe um Broto plantado - a próxima carta precisa empilhar no mesmo slot!`) };
      }
      const brotoSlot = newField[slotIndex];
      const oldTop = brotoSlot.faceDownCard!;
      const newValue = (oldTop.transformedValue ?? 1) + 1;
      newField[slotIndex] = {
        ...brotoSlot,
        faceDownCard: { ...card, revealed: true, transformedValue: newValue, placedOnTurn: state.turn },
        brotoReserve: [...(brotoSlot.brotoReserve ?? []), { ...oldTop, revealed: true }],
        revealed: true,
      };
      log = appendLog(state, log, 'field', `Jogador ${player} empilhou o Broto no slot ${slotIndex + 1} (agora vale ${newValue})`, { player, slotIndex, trigger: 'druida-broto-planted' });
    } else {
      if (newField[slotIndex].faceDownCard) return state;
      newField[slotIndex] = {
        ...newField[slotIndex],
        faceDownCard: { ...card, revealed: true, transformedValue: 1, placedOnTurn: state.turn },
        brotoReserve: [],
        revealed: true,
      };
      log = appendLog(state, log, 'field', `Jogador ${player} plantou um Broto no slot ${slotIndex + 1}`, { player, slotIndex, trigger: 'druida-broto-planted' });
    }
  } else if (isDruidaMonsterCard) {
    // Druida - Monstro travado no valor ATUAL do Broto no instante em que é
    // jogado (snapshot, decisão confirmada - não sincroniza depois se o
    // Broto continuar crescendo). `playerState.field.some(isBrotoSlot)` já
    // foi validado acima (guard de posicionamento), então sempre existe um
    // Broto aqui.
    if (newField[slotIndex].faceDownCard) return state;
    const brotoTop = playerState.field.find(isBrotoSlot)?.faceDownCard;
    const brotoValue = brotoTop?.transformedValue ?? 1;
    newField[slotIndex] = {
      ...newField[slotIndex],
      faceDownCard: { ...card, revealed: true, transformedValue: brotoValue, placedOnTurn: state.turn },
      revealed: true,
    };
    log = appendLog(state, log, 'monster', `Jogador ${player} posicionou o Monstro no slot ${slotIndex + 1} (valendo ${brotoValue}, como o Broto)`, { player, cardValue: '🃏', trigger: 'druida-monster-placed' });
  } else if (isGlacialMonsterCard) {
    // Glacial - Criogolem travado (snapshot) no valor 8 + 1 por carta
    // congelada em jogo NESTE instante (mão e campo dos DOIS jogadores) -
    // não recalcula depois se mais cartas forem congeladas/descongeladas.
    if (newField[slotIndex].faceDownCard) return state;
    const golemValue = getGlacialGolemValue(state);
    // FIX (feature nova, pedido do usuário: "ao ser jogado congelado, ele
    // adiciona um marcador -2 para as cartas do oponente em campo") - lido
    // ANTES de sobrescrever `newField[slotIndex]` abaixo (que preserva os
    // statusEffects da carta original, incluindo 'frozen' - jogar uma carta
    // congelada nunca "descongela" ela sozinho, ver isFrozenPlayBlocked
    // acima). Só é alcançável de verdade se o próprio Criogolem foi
    // congelado (por Criogenar, de qualquer um dos dois jogadores) enquanto
    // ainda estava na mão - a exceção de handlePlayCard que permite ao
    // Glacial jogar sua própria carta congelada é o que torna isto possível.
    const wasFrozen = hasStatus(card, 'frozen');
    newField[slotIndex] = {
      ...newField[slotIndex],
      faceDownCard: { ...card, revealed: true, transformedValue: golemValue, placedOnTurn: state.turn },
      revealed: true,
    };
    // FIX (pedido do usuário: "efeitos... para o golem") - `slotIndex` no
    // metadata do log (mesmo padrão do Broto do Druida, gameEngine.ts acima)
    // é o que permite GameBoard.tsx disparar o burst visual no slot exato
    // onde o Criogolem caiu - sem isso, `entry.slotIndex` chegaria sempre
    // `undefined` e o burst nunca dispararia (só o som).
    log = appendLog(state, log, 'monster', `Jogador ${player} posicionou o Criogolem no slot ${slotIndex + 1} (valendo ${golemValue})`, { player, cardValue: '🃏', slotIndex, trigger: 'glacial-golem-placed' });

    if (wasFrozen) {
      // "As cartas do oponente em campo" - carta principal E horizontais de
      // TODO o campo do oponente, de uma vez, sem seleção de alvo (mesmo
      // padrão de alcance total do efeito de Combate do Crioescudo, ver
      // applyCrioescudoMarker acima) - exceto slots protegidos pela Proteção
      // Divina do Anjo (`isSlotProtected`), mesma exceção de toda magia que
      // mira o campo do oponente (Crioespinho, Urtiga, Tiro Certeiro).
      const opponentKey = opponentKeyOf(player);
      const opponent = opponentOf(player);
      const opponentState = state[opponentKey];
      const newOpponentField = opponentState.field.map((slot, i) => {
        if (isSlotProtected(state, opponent, i)) return slot;
        return {
          ...slot,
          faceDownCard: slot.faceDownCard
            ? applyTimedCombatModifier(
                slot.faceDownCard,
                { kind: 'combatModifier', source: 'glacial', label: 'Criogolem Congelado', mode: 'add', magnitude: -2, duration: { type: 'untilPhase', phase: 'draw' } },
                { turn: state.turn, phase: state.phase },
                (existing, incoming) => ({ ...incoming, magnitude: (existing.magnitude ?? 0) + (incoming.magnitude ?? 0) }),
                { isOwnBuff: false } // Sempre mira o campo do OPONENTE (debuff -2, nunca bloqueado por congelamento mesmo assim).
              )
            : slot.faceDownCard,
          horizontalCards: slot.horizontalCards.map((c) =>
            applyTimedCombatModifier(
              c,
              { kind: 'combatModifier', source: 'glacial', label: 'Criogolem Congelado', mode: 'add', magnitude: -2, duration: { type: 'untilPhase', phase: 'draw' } },
              { turn: state.turn, phase: state.phase },
              (existing, incoming) => ({ ...incoming, magnitude: (existing.magnitude ?? 0) + (incoming.magnitude ?? 0) }),
              { isOwnBuff: false }
            )
          ),
        };
      }) as [FieldSlot, FieldSlot, FieldSlot];
      log = appendLog(
        state,
        log,
        'monster',
        `O Criogolem chegou congelado: -2 de marcador em toda carta de Jogador ${opponent} no campo`,
        { player }
      );
      return {
        ...state,
        log,
        [playerKey]: { ...playerState, hand: newHand, field: newField },
        [opponentKey]: { ...opponentState, field: newOpponentField },
      };
    }
  } else {
    if (newField[slotIndex].faceDownCard) return state;

    const shouldReveal = card.transformedValue !== undefined || card.revealed === true;
    newField[slotIndex] = {
      ...newField[slotIndex],
      faceDownCard: { ...(shouldReveal ? revealCard(card) : card), placedOnTurn: state.turn },
      revealed: shouldReveal,
    };
    log = appendLog(state, log, 'field', `Jogador ${player} posicionou uma carta ${shouldReveal ? 'revelada ' : ''}no slot ${slotIndex + 1}`, { player });
  }

  return { ...state, log, [playerKey]: { ...playerState, hand: newHand, field: newField } };
}
