/**
 * phaseHandlers.ts - orquestração das transições entre fases.
 *
 * Mantém no domínio de fase os resets/lifecycles executados quando a
 * partida avança de Compra -> Estratégia -> Combate -> Compra.
 */
import type { Card } from './cardUtils';
import { pushToDiscard } from './deckLifecycle';
import { keepPersistentFieldSlots, nonPersistentFieldCards } from './fieldLifecycle';
import { appendLog } from './gameLog';
import { opponentKeyOf, playerKeyOf } from './gameSelectors';
import type { GameState } from './gameStateTypes';
import type { PlayerNumber } from './gameTypes';
import { resolveMonsterCardAtTurnEnd } from './monsterLifecycle';
import { expireNumeralSpells } from './numeralSpellLifecycle';
import { getNextPhaseTransition } from './phaseRules';
import { resetPlayerForPhaseTransition } from './playerPhaseLifecycle';
import { rollSpotlight } from './spotlight';
import { computeLoneTowerForCombat } from './towerRules';
/**
 * Avança draw → strategy → combat → draw (novo turno).
 *
 * LÓGICA DE TURNO: cada ciclo completo draw→strategy→combat→draw é UM turno
 * (ver design original em PHASE_SYSTEM_UPDATES.md: "Turno 1 - Jogador 1",
 * "Turno 2 - Jogador 2", ...) - `turn` incrementa toda vez que se entra de
 * novo na fase de Compra, não importa quem vira primeiro.
 *
 * FIX (pedido do usuário: "a contagem de turnos não funciona corretamente, é
 * para um turno acabar no momento que uma magia numeral for ativada ou
 * quando ambos jogadores empatarem também") - antes, `turn` só incrementava
 * quando `firstToFlip` voltava a 1 (cada "rodada" contava como 2 turnos sem
 * o contador mudar no meio), o que não batia com o design acima nem com a
 * expectativa do jogador: ativar uma Magia Numeral (que já pula direto pra
 * fase de Compra do turno seguinte, ver handleFinalizeNumeralSpell) ou
 * esgotar a fase de Combate num empate (que já força o avanço de turno via
 * `combatRoundsThisPhase >= 3`, ver handleFinalizeCombat) fazia a fase mudar
 * de verdade, mas o número "Turno N" exibido na tela podia ficar parado -
 * parecia que o turno "não tinha acabado". Os dois casos citados pelo
 * usuário já passam por esta mesma função (`advancePhaseState`) pra
 * avançar de fase; a correção é só remover a condição de paridade e
 * incrementar sempre.
 *
 * Isso também simplifica a expiração da Visão Arcana do Mago
 * (`expiresAtTurn`, ver o comentário completo mais abaixo): como agora
 * `turn` avança em toda entrada na fase de Compra (1 por turno real), o
 * efeito ativado no turno T (expiresAtTurn = T+1) cobre exatamente o turno
 * seguinte inteiro e expira quando o turno T+2 começa - sem precisar mais
 * pensar em paridade de `firstToFlip`.
 *
 * Ao entrar de novo na fase de compra: campos são limpos (com rede de
 * segurança que descarta qualquer carta remanescente), limite de mão volta
 * ao valor base + bônus permanente, contadores de descarte zeram, e a zona
 * própria do Monstro de cada jogador (ver PlayerState.monsterCard) é
 * resolvida - FIX (pedido do usuário): ela NÃO se esvazia incondicionalmente
 * a cada turno como antes (isso descartava a carta depois do 1º uso, ou até
 * sem nenhum uso). Agora ela só se descarta depois do 3º uso no total (ver
 * resolveMonsterCardAtTurnEnd) - caso contrário permanece na zona para o
 * turno seguinte, só com `monsterUsed` resetado para poder ativar de novo.
 */
export function advancePhaseState(state: GameState): GameState {
  const transition = getNextPhaseTransition(state);
  const newPhase = transition.phase;
  const newFirstToFlip = transition.firstToFlip;
  const newTurn = transition.turn;
  let log = state.log;
  let deck = state.deck;
  let newCombatLoneTower: GameState['combatLoneTower'] = null;
  let discardPile = state.discardPile;
  let p1Monster: { kept: Card | undefined; discarded: Card | undefined } = { kept: state.player1.monsterCard, discarded: undefined };
  let p2Monster: { kept: Card | undefined; discarded: Card | undefined } = { kept: state.player2.monsterCard, discarded: undefined };
  let newSpotlight = state.spotlight;

  if (state.phase === 'draw') {
    log = appendLog(state, log, 'phase', `Turno ${state.turn} - Fase de Estratégia`, { phaseOverride: 'strategy' });
  } else if (state.phase === 'strategy') {
    newCombatLoneTower = computeLoneTowerForCombat(state);
    log = appendLog(
      state,
      log,
      'phase',
      newCombatLoneTower ? `Turno ${state.turn} - Ataque à Torre!` : `Turno ${state.turn} - Fase de Combate`,
      { phaseOverride: 'combat' }
    );
  } else {
    log = appendLog(state, log, 'phase', `Turno ${newTurn} - Jogador ${newFirstToFlip} vira primeiro - Fase de Compra`, {
      turnOverride: newTurn,
      phaseOverride: 'draw',
    });

    p1Monster = resolveMonsterCardAtTurnEnd(state.player1.monsterCard);
    p2Monster = resolveMonsterCardAtTurnEnd(state.player2.monsterCard);

    // FIX (pedido do usuário, Modo Spotlight): sorteado de novo a cada
    // entrada na fase de Compra (uma vez por turno cheio, não por fase) - ver
    // rollSpotlight em spotlight.ts. Mensagem no log anuncia publicamente
    // cada número + polaridade sorteados (GameBoard.tsx também mostra isso
    // como notificação visual na transição de fase - ver PhaseTransition.tsx).
    newSpotlight = rollSpotlight(state.gameConfig);
    if (newSpotlight) {
      const parts = newSpotlight.numbers.map((n) =>
        n.polarity === 'positive' ? `${n.value} (positivo, valor x3)` : `${n.value} (negativo, valor fixo em 1)`
      );
      log = appendLog(state, log, 'spotlight', `Spotlight deste turno: ${parts.join(', ')}`, {
        turnOverride: newTurn,
        phaseOverride: 'draw',
      });
    }

    // FIX (pedido do usuário, Modo Towers): esta varredura de "sobras" precisa
    // usar EXATAMENTE o mesmo critério de `keepPersistentFieldSlots` (aplicado ao campo
    // logo abaixo) - `fieldCards` inclui a reserva da torre, então descartar
    // por ele enquanto o campo preserva a torre deixava as MESMAS cartas em
    // campo e no descarte ao mesmo tempo (duplicação real, pega pelo teste de
    // conservação de cartas da suíte).
    const leftover = [
      ...nonPersistentFieldCards(state.player1.field),
      ...nonPersistentFieldCards(state.player2.field),
      ...(p1Monster.discarded ? [p1Monster.discarded] : []),
      ...(p2Monster.discarded ? [p2Monster.discarded] : []),
    ];
    if (leftover.length > 0) {
      const pushed = pushToDiscard({ deck, discardPile, gameConfig: state.gameConfig }, leftover);
      deck = pushed.deck;
      discardPile = pushed.discardPile;
      if (pushed.reshuffled) log = appendLog(state, log, 'system', `O baralho esgotou - a pilha de descarte foi reembaralhada de volta`, { trigger: 'deck-reshuffled' });
      log = appendLog(state, log, 'combat', `Todas as cartas do campo foram descartadas`);
    }
  }

  // FIX (item 1 da 4ª rodada): expiração por número de turno (`expiresAtTurn`,
  // definido no momento da ativação como `turn + 1`) em vez de um contador de
  // "meios-turnos" decrementado a cada transição para a fase de Compra.
  // Desde o FIX de contagem de turno (comentário no topo desta função),
  // `turn` avança em toda entrada na fase de Compra - o efeito ativado no
  // turno T (expiresAtTurn = T+1) cobre o turno T+1 inteiro e só expira
  // quando `newTurn` ultrapassa `expiresAtTurn` (ou seja, ao entrar no
  // turno T+2).
  //
  // FIX (item 12 da 5ª rodada): checa e expira o slot de CADA jogador
  // independentemente (mapa por jogador) - ver comentário completo em
  // `activeNumeralSpells` no GameState sobre o bug de um jogador sobrescrever
  // o efeito ativo do outro quando os dois são Mago.
  const numeralSpellExpiration = expireNumeralSpells(state.activeNumeralSpells, { newTurn, newPhase });
const activeNumeralSpells = numeralSpellExpiration.activeNumeralSpells;
for (const player of numeralSpellExpiration.expiredPlayers) {
  log = appendLog(state, log, 'numeral-spell', `Efeito da Magia Numeral de Jogador ${player} terminou`, { player });
}

  const playerTransitionContext = { newTurn, newPhase, towersMode: state.gameConfig.towersMode };
  const player1Result = resetPlayerForPhaseTransition(state.player1, p1Monster.kept, playerTransitionContext);
  const player2Result = resetPlayerForPhaseTransition(state.player2, p2Monster.kept, playerTransitionContext);

  return {
    ...state,
    phase: newPhase,
    firstToFlip: newFirstToFlip,
    turn: newTurn,
    combatSelection: {},
    // Mesmo motivo do reset de `combatWins` logo acima (resetForNewTurn):
    // só faz sentido dentro de UMA fase de Combate, nunca precisa
    // atravessar uma transição de fase.
    combatRoundsThisPhase: 0,
    combatLoneTower: newCombatLoneTower,
    activeNumeralSpells,
    deck,
    discardPile,
    log,
    spotlight: newSpotlight,
    // FIX (pedido do usuário, Modo Reações): "só pode haver uma reação por
    // FASE" - zerado em TODA transição (draw->strategy, strategy->combat,
    // combat->draw), não só na volta pra Compra - mesmo padrão de
    // `combatRoundsThisPhase` alguns campos acima.
    reactionsUsedThisPhase: {},
    player1: player1Result,
    player2: player2Result,
  };
}

// ---------------------------------------------------------------------------
// Pronto / avanço de fase
// ---------------------------------------------------------------------------

export function handleToggleReady(state: GameState, player: PlayerNumber): GameState {
  // FIX (pedido do usuário: "a magia numeral às vezes causa softlock e o
  // próximo turno não é chamado, mais com a da Besta") - esta função nunca
  // checava `numeralSpellPending`. A UI mostra um popup modal por ~3s entre
  // ativar uma Magia Numeral e handleFinalizeNumeralSpell rodar de fato (ver
  // GameBoard.tsx), e normalmente isso bloqueia qualquer clique por baixo -
  // mas se ALGO disparasse TOGGLE_READY nessa janela mesmo assim (ex.: o
  // popup fechando cedo, um evento de teclado, uma corrida entre efeitos),
  // esta função avançava a fase NORMALMENTE por cima de um estado que já
  // tinha sido alterado por handleActivateNumeralSpell (campo substituído
  // pelas 3 cartas da magia, mão do oponente já mesclada de volta) mas
  // ainda NÃO tinha sido finalizado - aí, quando o timer de 3s finalmente
  // chamasse FINALIZE_NUMERAL_SPELL, ele operaria em cima de um turno que já
  // tinha avançado por outro caminho, produzindo um estado inconsistente que
  // trava o avanço de turno. A Fúria Sanguinária da Besta (que também troca
  // a mão INTEIRA do oponente) tem a janela de efeitos colaterais mais
  // ampla dentre as 3, por isso o relato de que acontece mais com ela -
  // mas a causa raiz (esta função não conhecer `numeralSpellPending`) não é
  // específica de personagem nenhum. Nunca confiar só na UI: bloqueado aqui
  // também, no motor, na mesma linha dos outros guards de fase inválida.
  if (state.gameOver || state.combatResolution || state.numeralSpellPending) return state;
  const playerKey = playerKeyOf(player);
  const otherKey = opponentKeyOf(player);
  const newReady = !state[playerKey].readyForNextPhase;

  let next: GameState = {
    ...state,
    [playerKey]: { ...state[playerKey], readyForNextPhase: newReady },
  };
  // Fase 3 do overhaul de animações ("selo de Pronto") - `trigger` distingue
  // esta entrada das demais `type: 'system'` (ex.: aviso de reembaralhamento)
  // sem precisar casar o texto "está pronto"/"não está mais pronto" - ver
  // ReadyStamp.tsx/BothReadyPulse.tsx sobre o consumo visual (hoje ainda por
  // diff do próprio booleano `readyForNextPhase`, não por este campo - ver
  // comentário lá sobre o porquê, mesmo raciocínio do life-lost em
  // combatHandlers.ts).
  next = {
    ...next,
    log: appendLog(state, state.log, 'system', `Jogador ${player} ${newReady ? 'está pronto' : 'não está mais pronto'} para avançar`, {
      player,
      source: { kind: 'phase-rule' },
      trigger: newReady ? 'player-ready' : 'player-unready',
    }),
  };

  if (!(newReady && next[otherKey].readyForNextPhase)) {
    return next;
  }

  // Ambos prontos
  if (state.phase === 'combat') {
    // FIX (itens 4 e 7 da 3ª rodada): idem ao branch de disputa fechada em
    // handleFinalizeCombat - o campo normal de cada jogador é descartado
    // aqui. FIX (pedido do usuário, rodada seguinte): a zona própria do
    // Monstro NÃO é mais descartada incondicionalmente aqui - ela só se
    // descarta depois do 3º uso, decidido por advancePhaseState logo abaixo
    // (chamado sempre no final desta função, inclusive daqui).
    // FIX (pedido do usuário, Modo Towers): uma torre permanece no campo -
    // ela só é destruída batalhando (contra outra torre) ou erodindo até a
    // última carta (ver resolveCombatSlot). Encerrar a fase de Combate com os
    // dois "Prontos" não é combate nenhum, então os slots de torre são
    // preservados aqui em vez de descartados junto com o resto do campo -
    // `keepPersistentFieldSlots` e a lista de descarte abaixo usam o MESMO critério
    // (slot de torre ou não), pra nenhuma carta ficar em campo E no descarte.
    const cardsToDiscard = [...nonPersistentFieldCards(next.player1.field), ...nonPersistentFieldCards(next.player2.field)];
    const { deck, discardPile, reshuffled } = pushToDiscard(next, cardsToDiscard);
    next = {
      ...next,
      deck,
      discardPile,
      player1: { ...next.player1, field: keepPersistentFieldSlots(next.player1.field), readyForNextPhase: false },
      player2: { ...next.player2, field: keepPersistentFieldSlots(next.player2.field), readyForNextPhase: false },
    };
    if (reshuffled) {
      next = { ...next, log: appendLog(state, next.log, 'system', `O baralho esgotou - a pilha de descarte foi reembaralhada de volta`, { trigger: 'deck-reshuffled' }) };
    }
    if (cardsToDiscard.length > 0) {
      next = { ...next, log: appendLog(state, next.log, 'combat', `Todas as cartas do campo foram descartadas`) };
    }
  } else {
    next = {
      ...next,
      player1: { ...next.player1, readyForNextPhase: false },
      player2: { ...next.player2, readyForNextPhase: false },
    };
  }

  return advancePhaseState(next);
}
