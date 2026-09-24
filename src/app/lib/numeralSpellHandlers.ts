/**
 * numeralSpellHandlers.ts - transições de ativação/finalização das Magias Numerais.
 *
 * As definições/consultas puras continuam em numeralSpells.ts; este módulo
 * aplica as mudanças de estado sem depender de gameEngine.ts.
 */
import { drawCards, getDisplayValue, getDisplaySuit, type Card } from './cardUtils';
import { pushToDiscard, ensureDeckHasAtLeast } from './deckLifecycle';
import { fieldCards } from './fieldQueries';
import { appendLog } from './gameLog';
import { opponentKeyOf, opponentOf, playerKeyOf, characterOf } from './gameSelectors';
import { emptyField } from './gameStateFactory';
import type { FieldSlot, GameState, NumeralSpellCardSnapshot, PlayerState } from './gameStateTypes';
import type { PlayerNumber } from './gameTypes';
import { resolveMonsterCardAtTurnEnd } from './monsterLifecycle';
import { canActivateNumeralSpell, formatNumeralRequirement, getMatchingNumeralCards, getNumeralSpellInfo } from './numeralSpells';
import { advancePhaseState } from './phaseHandlers';
import { applyStatus } from './statusEffects';
// ---------------------------------------------------------------------------
// Magia Numeral
// ---------------------------------------------------------------------------

export function handleActivateNumeralSpell(state: GameState, player: PlayerNumber): GameState {
  if (state.phase !== 'strategy') return state;
  const playerKey = playerKeyOf(player);
  const opponentKey = opponentKeyOf(player);
  const opponent = opponentOf(player);
  const character = characterOf(state, player);
  const playerState = state[playerKey];
  const opponentState = state[opponentKey];

  // FIX (item 8 da 2ª rodada): "a Magia Numeral não funciona mais" - antes a
  // flag de "já tem uma ativa" era GLOBAL (sem distinção de dono), mas só o
  // Mago a deixa "pendurada" durante o turno inteiro do oponente (Besta e
  // Anjo aplicam o efeito na hora, sem deixar nada pendente - ver
  // handleFinalizeNumeralSpell). Isso significa que, depois do Mago ativar a
  // dele, o jogador OPONENTE ficava impedido de ativar a SUA PRÓPRIA Magia
  // Numeral (completamente independente) durante todo aquele turno - um bug
  // real, confirmado reproduzindo o cenário via o motor de regras
  // isoladamente. A regra pretendida (ver item 17 da 1ª rodada: "não pode
  // reativar a PRÓPRIA Magia Numeral") sempre foi por jogador, nunca global -
  // a checagem agora só bloqueia quando é o MESMO jogador tentando reativar a
  // que ele mesmo já tem ativa (ver `activeNumeralSpells`, mapa por jogador,
  // FIX item 12 da 5ª rodada).
  const hasOwnActiveNumeralSpell = state.activeNumeralSpells[player] !== undefined;
  if (!canActivateNumeralSpell(character, playerState.hand, playerState.field, hasOwnActiveNumeralSpell, state.spotlight)) {
    return state;
  }

  const matchingCards = getMatchingNumeralCards(character, playerState.hand, state.spotlight).slice(0, 3);
  if (matchingCards.length !== 3) return state;
  const requiredNumberLabel = formatNumeralRequirement(getNumeralSpellInfo(character));

  // Cartas do campo do oponente voltam para a mão dele (a magia numeral "limpa" o combate deste turno)
  const opponentFieldCards = fieldCards(opponentState.field);
  // FIX (itens 4 e 7 da 3ª rodada): a carta Monstro do oponente, se estiver
  // posicionada na zona própria dele, também é uma carta "em jogo neste
  // turno" e deveria voltar para a mão junto com o resto do campo, pelo
  // mesmo motivo - senão ela ficaria presa na zona indefinidamente enquanto
  // o resto do campo já foi limpo pela magia numeral.
  // FIX (checagem extensa por bugs - softlock parcial real encontrado, depois
  // agravado por uma correção anterior incompleta): esta carta Monstro volta
  // direto pra MÃO do oponente, fora do fluxo normal de fim de turno
  // (`resolveMonsterCardAtTurnEnd`, a ÚNICA função que decide corretamente
  // entre "reseta `monsterUsed` e mantém" ou "já esgotou os usos, descarta de
  // vez"). Uma 1ª correção aqui só zerava `monsterUsed` incondicionalmente
  // (resolvendo o softlock de 1 turno extra) mas esqueceu de checar
  // `monsterUseCount` - um Monstro JÁ esgotado (monsterUseCount >=
  // MAX_MONSTER_USES) ia pra mão "como novo" (`monsterUsed: false`) sem
  // NUNCA passar pela checagem de descarte, e sem a zona própria pra
  // `resolveMonsterCardAtTurnEnd` alcançar depois - o oponente podia
  // reposicioná-lo (`handlePlaceMonsterCard` não confere `monsterUseCount`)
  // como um Coringa PERMANENTEMENTE morto na zona (toda ativação seria
  // rejeitada pra sempre pela guarda de segurança de handleActivateMonster
  // EffectSimple/handleExecuteMagoMonsterEffect) - a IA descoberto propondo
  // essa ativação repetidamente via o novo teste de propriedade "a IA nunca
  // propõe uma ação que o motor rejeita em silêncio" (script/sanity-test.ts).
  // Reutiliza `resolveMonsterCardAtTurnEnd` (a mesma decisão de sempre) em
  // vez de reimplementar a regra uma 3ª vez - se esgotado, vai pro DESCARTE
  // de verdade (via `pushToDiscard`, que também já zera `monsterUsed`;
  // `monsterUseCount` nunca reseta, por design); senão, mantém e zera
  // `monsterUsed` do jeito de sempre.
  const opponentMonsterResolution = resolveMonsterCardAtTurnEnd(opponentState.monsterCard);
  const opponentMonsterCards = opponentMonsterResolution.kept ? [opponentMonsterResolution.kept] : [];
  const newOpponentHand = [...opponentState.hand, ...opponentFieldCards, ...opponentMonsterCards];
  const { deck: deckAfterMonsterDiscard, discardPile: discardPileAfterMonsterDiscard } = pushToDiscard(
    state,
    opponentMonsterResolution.discarded ? [opponentMonsterResolution.discarded] : []
  );

  const matchingIds = new Set(matchingCards.map((c) => c.id));
  const newHand = playerState.hand.filter((c) => !matchingIds.has(c.id));
  const newField: [FieldSlot, FieldSlot, FieldSlot] = [
    { faceDownCard: matchingCards[0], revealed: true, horizontalCards: [] },
    { faceDownCard: matchingCards[1], revealed: true, horizontalCards: [] },
    { faceDownCard: matchingCards[2], revealed: true, horizontalCards: [] },
  ];

  // FIX: `cardValue` aqui não serve pra destacar token nenhum (a UI não
  // busca nome de Magia Numeral por cardValue, só de magia J/Q/K) - serve só
  // como MARCADOR estrutural pra GameBoard.tsx saber que esta é
  // especificamente a linha de ATIVAÇÃO (não qualquer entrada 'numeral-spell'
  // genérica, como "efeito terminou" ou a Fúria Sanguinária) e disparar a
  // notificação toast só nela, sem precisar inspecionar o texto da mensagem.
  let log = appendLog(
    state,
    state.log,
    'numeral-spell',
    // FIX (Druida, personagem novo): antes repetia `requiredNumberLabel` 3x
    // manualmente (assumindo os 3 números sempre iguais) - `formatNumeralRequirement`
    // já devolve a lista formatada inteira agora ("9, 9, 9" ou "A, 3, 7").
    `Jogador ${player} ativou ${getNumeralSpellInfo(character).name} (${requiredNumberLabel})!`,
    { player, cardValue: requiredNumberLabel }
  );
  if (opponentFieldCards.length > 0 || opponentMonsterCards.length > 0) {
    log = appendLog(state, log, 'numeral-spell', `Cartas de Jogador ${opponent} retornaram para a mão`);
  }
  if (opponentMonsterResolution.discarded) {
    log = appendLog(state, log, 'monster', `Carta Monstro de Jogador ${opponent} já esgotou os usos e foi descartada`);
  }

  // Fase 0.2 do roadmap de overhaul de animações - snapshot das 3 cartas
  // ANTES de saírem da mão (matchingCards ainda são as cartas físicas reais
  // aqui), na mesma ordem de `requiredNumbers` (getMatchingNumeralCards
  // empurra na ordem do `for` sobre requiredNumbers, numeralSpells.ts) -
  // sem isto a UI não teria como montar as cartas de verdade (ver comentário
  // de NumeralSpellCardSnapshot, gameStateTypes.ts). `chainId` reusa o id da
  // entrada de ativação que acabou de ser criada acima.
  const chainId = log[log.length - 1].id;
  const [snapshot0, snapshot1, snapshot2] = matchingCards.map(
    (card): NumeralSpellCardSnapshot => ({
      id: card.id,
      suit: getDisplaySuit(card),
      displayValue: getDisplayValue(card),
      revealed: card.revealed ?? false,
      owner: player,
    })
  );

  return {
    ...state,
    log,
    deck: deckAfterMonsterDiscard,
    discardPile: discardPileAfterMonsterDiscard,
    numeralSpellPending: { playerNumber: player, character, chainId, cardSnapshots: [snapshot0, snapshot1, snapshot2] },
    [playerKey]: { ...playerState, hand: newHand, field: newField },
    [opponentKey]: {
      ...opponentState,
      hand: newOpponentHand,
      field: emptyField(),
      monsterCard: undefined,
      monsterTargetSlot: undefined,
      // FIX (pedido do usuário: Proteção Divina agora protege por slot) - o
      // campo inteiro está sendo esvaziado aqui, então nenhuma proteção
      // antiga faz sentido sobreviver a isso.
      monsterProtectedSlots: [],
    },
  };
}

/**
 * Segunda etapa da Magia Numeral, despachada pela UI depois de exibir o popup
 * de ativação por alguns segundos: descarta as 3 cartas, aplica o efeito
 * (permanente e imediato para o Anjo; imediato e único para a Besta - ver
 * FIX do item 16 abaixo; marca `expiresAtTurn: turn + 1` para o Mago, cujo
 * efeito dura o turno seguinte inteiro - ver FIX item 1 da 4ª rodada no
 * comentário do campo `activeNumeralSpells`), pula a fase de combate e já
 * inicia o próximo turno na fase de compra.
 */
export function handleFinalizeNumeralSpell(state: GameState): GameState {
  if (!state.numeralSpellPending) return state;
  const { playerNumber: player, character } = state.numeralSpellPending;
  const playerKey = playerKeyOf(player);
  const opponentKey = opponentKeyOf(player);
  const opponent = opponentOf(player);
  const playerState = state[playerKey];

  const cardsToDiscard = fieldCards(playerState.field);
  let { deck, discardPile } = pushToDiscard(state, cardsToDiscard);

  let updatedPlayer: PlayerState = { ...playerState, field: emptyField() };
  let updatedOpponent: PlayerState = state[opponentKey];
  // Fase 0.3 do roadmap de overhaul de animações - `chainId` explícito aqui
  // (o mesmo id gravado em `numeralSpellPending` na ativação) linka esta
  // metade da cadeia (finalização, um dispatch SEPARADO de FINALIZE_NUMERAL_SPELL)
  // de volta à ativação original; o backfill automático do wrapper `gameReducer`
  // propaga o MESMO chainId pro resto das entradas que este dispatch ainda
  // vai criar abaixo (nenhuma delas precisa passar `chainId` de novo).
  let log = appendLog(state, state.log, 'numeral-spell', `Cartas da Magia Numeral foram descartadas`, { chainId: state.numeralSpellPending.chainId });

  if (character === 'anjo') {
    updatedPlayer = {
      ...updatedPlayer,
      permanentDrawBonus: playerState.permanentDrawBonus + 1,
      handLimit: playerState.handLimit + 1,
    };
    log = appendLog(state, log, 'numeral-spell', `Jogador ${player} agora compra ${1 + updatedPlayer.permanentDrawBonus} carta(s) adicional(is) permanentemente`, { player });
  } else if (character === 'besta') {
    // FIX (item 16): a Fúria Sanguinária da Besta era praticamente
    // imperceptível (só filtrava cartas >6 dentre as recém-compradas pelo
    // oponente, no turno seguinte). Reescrita como um efeito imediato e
    // único, aplicado agora mesmo: o oponente descarta a mão inteira e
    // compra de volta mais de 6 cartas (o maior entre o limite de mão real
    // dele e 7), reembaralhando o descarte de volta ao baralho se necessário
    // para ter cartas suficientes para essa compra forçada.
    //
    // NOTA (auditoria completa da Besta): "mais de 6" é uma garantia PRÁTICA,
    // não absoluta - `actualDrawCount` abaixo já limita a compra ao que
    // realmente existe (`ensured.deck.length`), então numa partida extrema
    // onde baralho+descarte somados (já incluindo a própria mão do oponente,
    // devolvida ao pool 2 linhas acima) tiverem menos cartas físicas do que
    // o alvo, a compra fica menor que 6 - não há forma melhor de lidar com
    // isso (não dá pra comprar cartas que não existem no jogo).
    const opponentState = state[opponentKey];
    const handDiscard = pushToDiscard({ deck, discardPile, gameConfig: state.gameConfig }, opponentState.hand);
    deck = handDiscard.deck;
    discardPile = handDiscard.discardPile;

    const targetDrawCount = Math.max(opponentState.handLimit, 7);
    const ensured = ensureDeckHasAtLeast({ deck, discardPile, gameConfig: state.gameConfig }, targetDrawCount);
    const actualDrawCount = Math.min(targetDrawCount, ensured.deck.length);
    const { drawn, remaining } = drawCards(ensured.deck, actualDrawCount);
    deck = remaining;
    discardPile = ensured.discardPile;
    // FIX (achado montando a fixture "Fase 0.4/0.5" - Besta: Fúria
    // Sanguinária com baralho insuficiente pra recompra forçada): esta
    // sequência tem DUAS fontes possíveis de reembaralhamento de verdade -
    // o "shuffle automático" DENTRO de pushToDiscard (`handDiscard`, quando
    // descartar a mão inteira do oponente por si só já empurra o descarte
    // pra 20+) e `ensureDeckHasAtLeast` logo abaixo (quando ainda faltam
    // cartas pra completar a recompra forçada). Nenhuma das duas emitia
    // NENHUM sinal estrutural antes disto (nem log, nem trigger) - o
    // reembaralhamento acontecia (jogo correto), só invisível pra UI. Sem
    // isto, a animação de reembaralhar (Fase 1) nunca dispararia pra esta
    // cadeia, mesmo com o baralho realmente voltando do descarte.
    if (handDiscard.reshuffled || ensured.reshuffled) {
      log = appendLog(state, log, 'system', `O baralho esgotou - a pilha de descarte foi reembaralhada de volta`, { trigger: 'deck-reshuffled' });
    }

    // FIX (pedido do usuário: "a magia numeral da besta devia forçar pelo
    // resto do turno, o descarte de toda carta maior que 6, não só quando é
    // ativado") - além do descarte/recompra imediatos acima, a pressão agora
    // DURA: enquanto o turno não virar, toda carta numeral de valor > 6 que
    // cair na mão do oponente é descartada na hora (ver
    // applyBestaBloodRageSweep, que roda depois de qualquer ação). Isso vale
    // inclusive para as cartas recém-compradas logo acima - a varredura roda
    // no fim deste mesmo dispatch.
    // `state.turn + 1` (e não `state.turn`) pelo mesmo motivo da Visão Arcana
    // do Mago logo abaixo: ativar uma Magia Numeral PULA a fase de Combate e
    // já vira o turno (ver o final desta função), então "o resto do turno"
    // que o jogador enxerga é justamente o turno seguinte - onde o oponente
    // de fato compra e joga. Marcar o turno atual faria o efeito expirar no
    // mesmo instante em que foi criado.
    updatedOpponent = applyStatus(
      { ...opponentState, hand: drawn },
      { kind: 'bloodRage', source: 'besta', label: 'Fúria Sanguinária', duration: { type: 'untilTurn', turn: state.turn + 1 } }
    );
    log = appendLog(
      state,
      log,
      'numeral-spell',
      `Fúria Sanguinária: Jogador ${opponent} descartou a mão inteira (${opponentState.hand.length} carta(s)) e comprou ${drawn.length} carta(s) de volta - e não consegue segurar cartas acima de 6 pelo resto do turno`,
      { player: opponent }
    );
  } else if (character === 'mosqueteiro') {
    // Munição Infinita. FIX (pedido do usuário: "Aumente o limite da sua mão
    // no próximo turno pelo número de cartas descartadas nos últimos 3
    // turnos") - antes concedia uma COMPRA bônus (mosqueteiroBonusDrawNextTurn,
    // campo removido) igual só ao turno ANTERIOR; agora concede um bônus
    // TEMPORÁRIO de LIMITE DE MÃO, do mesmo tamanho da janela de 3 turnos já
    // mostrada na UI (este turno + os 2 anteriores - ver comentário completo
    // em `mosqueteiroDiscardsThisTurn`), válido só durante o turno seguinte
    // (`mosqueteiroHandLimitBonusUntilTurn = turn + 1`, mesmo padrão de
    // expiração de `coringaTempHandLimitBonus`, aplicado/expirado em
    // resetForNewTurn).
    const bonus = playerState.mosqueteiroDiscardsThisTurn + playerState.mosqueteiroDiscardsTurnMinus1 + playerState.mosqueteiroDiscardsTurnMinus2;
    updatedPlayer = applyStatus(updatedPlayer, {
      kind: 'handLimitBonus',
      source: 'mosqueteiro',
      label: 'Munição Infinita',
      magnitude: bonus,
      duration: { type: 'untilTurn', turn: state.turn + 1 },
    });
    log =
      bonus > 0
        ? appendLog(state, log, 'numeral-spell', `Jogador ${player} terá o limite de mão aumentado em ${bonus} no próximo turno`, { player })
        : appendLog(state, log, 'numeral-spell', `Jogador ${player} não descartou nenhuma carta com magias nos últimos turnos - sem bônus desta vez`, { player });
  } else if (character === 'coringa') {
    // Mão de Ferro (redesenho completo, pedido do usuário: "No próximo
    // turno, as cartas de magia podem ser jogadas como se fossem cartas de
    // número 11, 12 e 13") - abre a janela de transformação (ver
    // `coringaTransformWindowUntilTurn`, aplicada/expirada em
    // resetForNewTurn, mesmo padrão de `mosqueteiroHandLimitBonusUntilTurn`
    // acima) que libera o botão de transformar um Valete/Rainha/Rei da mão
    // em carta de número 11/12/13 (ver TRANSFORM_CORINGA_MAGIC_CARD). Não
    // faz mais nada sozinho - a transformação em si é uma ação separada,
    // escolhida pelo jogador carta a carta.
    updatedPlayer = applyStatus(updatedPlayer, {
      kind: 'transformWindow',
      source: 'coringa',
      label: 'Mão de Ferro',
      duration: { type: 'untilTurn', turn: state.turn + 1 },
    });
    log = appendLog(state, log, 'numeral-spell', `Pulando fase de combate - indo direto para o próximo turno`);
    log = appendLog(
      state,
      log,
      'numeral-spell',
      `Mão de Ferro: no próximo turno, Jogador ${player} pode transformar cartas de magia em cartas de número 11, 12 ou 13`,
      { player }
    );
  } else if (character === 'piromante') {
    // Chama Repartida (personagem novo) - não altera a Bola de Fogo em si,
    // só ARMA o PRÓXIMO lançamento dela pra se propagar aos 3 slots do
    // oponente de uma vez (valor dividido, não total) - sem prazo por
    // turno, ao contrário de coringaTransformWindowUntilTurn acima (fica
    // armado até realmente ser consumido por um lançamento, não importa
    // quantos turnos demore - ver executeFireballLaunch).
    updatedPlayer = applyStatus(updatedPlayer, {
      kind: 'spreadArmed',
      source: 'piromante',
      label: 'Chama Repartida',
      duration: { type: 'permanent' },
    });
    log = appendLog(state, log, 'numeral-spell', `Chama Repartida: o próximo lançamento da Bola de Fogo de Jogador ${player} vai atingir os 3 slots do oponente`, { player });
  } else if (character === 'mago') {
    // FIX (endurecimento pedido pelo usuário: "está pronto para mais um
    // personagem?") - este bloco era o `else` final implícito da cadeia
    // (anjo/besta/mosqueteiro/coringa/piromante já são `else if` acima) -
    // um personagem NOVO esquecido aqui revelaria a mão inteira do
    // oponente por engano, em vez de simplesmente não ganhar o bônus.
    // Explicitado como `else if (character === 'mago')`; sem `else` final -
    // um personagem não reconhecido só perde o efeito bônus (o descarte
    // genérico do campo, linhas antes deste bloco, já roda incondicional).
    //
    // FIX (pedido do usuário): a Visão Arcana do Mago documenta "todas as
    // cartas do oponente estarão reveladas" (inclui as que ele comprar) - mas
    // só a parte "vai comprar" estava implementada (ver o check de
    // `activeNumeralSpells[...]?.character === 'mago'` em handleDrawCards,
    // que só marca `revealed: true` em cartas COMPRADAS depois da ativação).
    // As cartas que já estavam na mão do oponente no momento da ativação
    // nunca eram marcadas como reveladas - de fora, parecia que a magia
    // simplesmente não revelava a mão do oponente. Corrigido revelando agora
    // mesmo (ao finalizar a ativação) toda a mão atual do oponente; a
    // revelação das compras futuras continua funcionando à parte, sem
    // mudança, em handleDrawCards.
    const opponentState = state[opponentKey];
    log = appendLog(state, log, 'numeral-spell', `Pulando fase de combate - indo direto para o próximo turno`);
    log = appendLog(state, log, 'numeral-spell', `Efeito da Magia Numeral estará ativo no próximo turno`);
    updatedOpponent = { ...opponentState, hand: opponentState.hand.map((c) => ({ ...c, revealed: true })) };
    log = appendLog(state, log, 'numeral-spell', `Cartas de Jogador ${opponent} foram reveladas pela Magia Numeral`, { player: opponent });
  } else if (character === 'druida') {
    // Fotossíntese - permanente e REATIVÁVEL (decisão confirmada com o
    // usuário): cada ativação soma +1 no nível, sem teto, empilhando o
    // bônus em todo efeito relacionado ao Broto (crescimento de turno,
    // marcador da Rainha/Rei - ver handlePlayCard/handleExecuteMagic). Não
    // precisa de `activeNumeralSpells` (não é um efeito com prazo, ao
    // contrário da Visão Arcana do Mago acima).
    const newLevel = playerState.druidaPhotosynthesisLevel + 1;
    updatedPlayer = { ...updatedPlayer, druidaPhotosynthesisLevel: newLevel };
    log = appendLog(
      state,
      log,
      'numeral-spell',
      `Fotossíntese: todos os efeitos relacionados ao Broto de Jogador ${player} estão aprimorados em +${newLevel}`,
      { player }
    );
  } else if (character === 'glacial') {
    // Criogênese (A, A, A) - congela toda carta de magia (J/Q/K) já na mão
    // dos DOIS jogadores agora, e também a próxima que cada um comprar
    // durante o turno seguinte inteiro (StatusEffect 'freezeUpcomingMagicDraws',
    // consumido pelo hook em handleDrawCards). `state.turn + 1` pelo mesmo
    // motivo da Fúria Sanguinária da Besta acima: a Magia Numeral pula a
    // fase de Combate e já vira o turno, então "o turno seguinte" que o
    // jogador enxerga é o que vem logo depois desta ativação.
    const freezeMagicInHand = (hand: Card[]): Card[] =>
      hand.map((c) =>
        c.value === 'J' || c.value === 'Q' || c.value === 'K'
          ? applyStatus(c, { kind: 'frozen', source: 'glacial', label: 'Criogênese', duration: { type: 'permanent' } })
          : c
      );
    const withDrawFreeze = (p: PlayerState): PlayerState =>
      applyStatus(p, { kind: 'freezeUpcomingMagicDraws', source: 'glacial', label: 'Criogênese', duration: { type: 'untilTurn', turn: state.turn + 1 } });
    updatedPlayer = withDrawFreeze({ ...updatedPlayer, hand: freezeMagicInHand(playerState.hand) });
    updatedOpponent = withDrawFreeze({ ...updatedOpponent, hand: freezeMagicInHand(updatedOpponent.hand) });
    log = appendLog(
      state,
      log,
      'numeral-spell',
      `Criogênese: toda carta de magia na mão dos dois jogadores foi congelada, e a próxima comprada no turno seguinte também será`,
      { player }
    );
  }

  const midState: GameState = {
    ...state,
    deck,
    discardPile,
    log,
    numeralSpellPending: null,
    // FIX (item 16): a Besta não deixa mais um "activeNumeralSpells[player]"
    // pendurado - seu efeito já foi todo aplicado acima, imediatamente. Só o
    // Mago precisa da flag lingering (seu efeito se aplica às compras do
    // oponente ao longo do turno inteiro dele).
    // FIX (item 1 da 4ª rodada): `expiresAtTurn = turn + 1` em vez de um
    // contador de "meios-turnos" - ver o comentário do campo
    // `activeNumeralSpells` em GameState para a explicação completa do bug e
    // por que isso é independente de qual jogador está virando primeiro.
    // FIX (item 12 da 5ª rodada): grava no slot do PRÓPRIO jogador (mapa por
    // jogador), sem mexer no slot do oponente - antes, um único slot global
    // fazia a ativação de um jogador apagar silenciosamente a do outro no
    // caso Mago vs Mago (os dois com Visão Arcana ativa ao mesmo tempo).
    activeNumeralSpells:
      character === 'mago'
        ? { ...state.activeNumeralSpells, [player]: { character, expiresAtTurn: state.turn + 1 } }
        : state.activeNumeralSpells,
    [playerKey]: updatedPlayer,
    [opponentKey]: updatedOpponent,
  };

  // Pula a fase de combate: vai direto para a fase de compra do próximo turno,
  // reaproveitando exatamente a mesma lógica de troca de turno usada em
  // advancePhaseState (alterna firstToFlip, incrementa turn quando necessário,
  // reseta mãos/campos). A expiração da Magia Numeral do Mago agora é
  // calculada por número de turno (`expiresAtTurn`, ver acima), não por um
  // contador de meios-turnos - por isso não precisa mais de nenhum tratamento
  // especial aqui, `advancePhaseState` já checa `newTurn > expiresAtTurn` do
  // jeito normal em toda transição para a fase de Compra.
  return advancePhaseState({ ...midState, phase: 'combat' });
}
