/**
 * gameEngine.ts - Motor de regras do Magispelll
 *
 * Toda a lógica de jogo mora aqui, como um reducer puro: (GameState, GameAction) => GameState.
 * Nenhuma função neste arquivo chama setTimeout, lê o relógio, ou tem qualquer
 * efeito colateral - dado o mesmo estado e a mesma ação, sempre produz o mesmo
 * resultado. Isso existe para eliminar uma classe inteira de bugs de estado
 * que existia na versão anterior do jogo, em que a lógica ficava misturada
 * com timers e chamadas de setState aninhadas dentro do próprio componente
 * React (o que causava, por exemplo, cartas sendo simultaneamente "no campo"
 * e "na pilha de descarte" depois de vencer uma disputa de combate).
 *
 * GameBoard.tsx (a camada de UI) é responsável apenas por:
 * - despachar ações em resposta a cliques
 * - decidir QUANDO mostrar popups/animações e agendar a próxima ação depois
 *   de um tempo (ex.: mostrar o resultado do combate por 2.5s antes de
 *   despachar FINALIZE_COMBAT)
 * - renderizar o estado atual
 *
 * O estado em si (quem tem quantas vidas, quais cartas estão em qual mão ou
 * campo, etc.) é sempre 100% consistente logo após qualquer dispatch - nunca
 * existe uma janela onde o estado está "temporariamente errado" esperando um
 * timer terminar.
 */

import {
  drawCards,
  expandFusedCards,
  generateDeck,
  getDisplaySuit,
  getDisplayValue,
  getEffectiveCardValue,
  isNumeralCard,
  isPlainNumeralCard,
  isValidAceTransformTarget,
  reshuffleDiscardIntoDeck,
  resetCardsForDiscard,
  shuffle,
  type Card,
} from './cardUtils';
import { DEFAULT_GAME_CONFIG, type GameConfig } from './gameConfig';
import { canActivateMagic, type MagicActivationContext, type MagicCardType } from './magicCards';
import { canActivateNumeralSpell, formatNumeralRequirement, getMatchingNumeralCards, getNumeralSpellInfo } from './numeralSpells';
import { canFuseCards, computeFusionResult } from './fusion';
import { getSpotlightAdjustedValue, rollSpotlight, type SpotlightState } from './spotlight';
import { getCharacterTheme } from './characterThemes';

export type Phase = 'draw' | 'strategy' | 'combat';
export type PlayerNumber = 1 | 2;
export type PlayerKey = 'player1' | 'player2';
export type CharacterId = 'mago' | 'besta' | 'anjo' | 'mosqueteiro' | 'coringa' | 'piromante';

export type FieldSlot = {
  faceDownCard?: Card;
  /**
   * Cartas de reforço horizontal deste slot. Normalmente no máximo 1 no
   * campo INTEIRO por turno; o Rei do Anjo (Reforço Angelical) permite
   * empilhar mais uma a cada ativação, até o fim do turno (ver
   * `horizontalStackBonus` em PlayerState) - por isso é sempre um array
   * (nunca um único campo opcional), para que cada carta extra realmente se
   * some às anteriores em vez de sobrescrever.
   */
  horizontalCards: Card[];
  revealed: boolean;
  /**
   * Modo Towers (pedido do usuário, `gameConfig.towersMode`): cartas
   * numerais de mesmo valor efetivo empilhadas neste slot, ABAIXO da carta
   * atualmente exibida em `faceDownCard` (que representa o TOPO da torre -
   * qualquer efeito que só conhece "a carta deste slot", como magias de
   * troca/reforço do Monstro, sempre enxerga e afeta só o topo, nunca
   * precisa saber que existe uma pilha por baixo). O valor de combate do
   * slot soma o topo + toda a reserva (ver handleResolveCombat); ao
   * descartar o campo inteiro, a reserva também vai junto (ver fieldCards).
   * `undefined`/`[]` = slot normal, sem torre. Ver FORM_OR_REINFORCE_TOWER.
   */
  towerReserve?: Card[];
};

export interface PlayerState {
  hand: Card[];
  field: [FieldSlot, FieldSlot, FieldSlot];
  readyForNextPhase: boolean;
  lives: number;
  combatWins: number;
  handLimit: number;
  /**
   * Quantas cartas horizontais A MAIS (além da 1 normal) o jogador pode
   * posicionar neste turno, no campo inteiro - cada ativação do Rei do Anjo
   * (Reforço Angelical) soma +1 aqui, então ativar 2x permite 3 horizontais
   * no total, 3x permite 4, e assim por diante (sem teto).
   *
   * FIX (pedido do usuário): antes era um boolean (`canStackHorizontal`) que
   * só permitia UMA carta horizontal extra (total 2) não importa quantas
   * vezes a magia fosse ativada no mesmo turno - ativar de novo (com um 2º,
   * 3º... Rei na mão) não tinha nenhum efeito a mais. Zerado a cada turno
   * (ver `resetForNewTurn` abaixo), igual ao boolean antigo.
   */
  horizontalStackBonus: number;
  permanentDrawBonus: number;
  discardsThisTurn: number;
  /**
   * FIX (pedido do usuário: "opção no pré-jogo de limite de compra de
   * cartas... funcionando de forma similar a de descarte") - quantas cartas
   * o jogador já comprou (DRAW_CARDS, a compra normal da fase de Compra)
   * NESTE turno - só é checado contra `gameConfig.drawLimit` quando
   * `gameConfig.drawLimitEnabled` está ligado (ver handleDrawCards). NUNCA
   * incrementado por cartas ganhas via efeito de magia (ex.: Recuperação
   * Selvagem da Besta) - só pela compra manual de verdade. Zerado a cada
   * turno junto com `discardsThisTurn` (mesmo padrão, ver `resetForNewTurn`).
   */
  drawsThisTurn: number;
  /**
   * FIX (pedido do usuário: variante "Fusão") - quantas vezes o jogador já
   * fundiu 2 cartas numerais em 1 NESTE turno (ver FUSE_CARDS/handleFuseCards
   * abaixo) - a regra é "uma vez por turno", então o limite real é 1, mas
   * fica como contador (não boolean) pelo mesmo motivo de
   * `horizontalStackBonus`: mais fácil de estender no futuro se o limite
   * mudar. Zerado a cada turno junto com `discardsThisTurn` (mesmo padrão,
   * ver `resetForNewTurn`).
   */
  fusesThisTurn: number;
  /**
   * FIX (itens 4 e 7 da 3ª rodada): a carta Monstro (Coringa) deste jogador,
   * posicionada em uma ZONA PRÓPRIA e separada (ao lado do Slot 3) - decisão
   * confirmada com o usuário entre as opções apresentadas. Diferente da
   * versão anterior (onde o Monstro ocupava um dos 3 slots de combate como
   * se fosse uma carta normal, e por isso lutava com valor 0, sendo tratado
   * incorretamente como uma carta Normal/Ás - o bug relatado no item 4), o
   * Monstro nesta zona NUNCA entra em disputa de combate sozinho: ele só
   * fica aqui para ativar sua habilidade (ver ACTIVATE_MONSTER_EFFECT_SIMPLE
   * e EXECUTE_MAGO_MONSTER_EFFECT), escolhendo um dos 3 slots de combate
   * como alvo (`monsterTargetSlot` abaixo). undefined = zona vazia.
   */
  monsterCard?: Card;
  /**
   * Slot do PRÓPRIO campo de combate (0-2) escolhido como alvo da última
   * ativação do efeito de Monstro: para a Besta, o slot da carta escolhida
   * para dobrar (ver monsterTargetCardId abaixo - a carta pode ser a
   * principal do slot OU uma horizontal); para o Anjo, o slot protegido
   * contra magias; para o Mago, o slot cuja carta recebeu o valor copiado.
   * undefined enquanto o efeito não foi ativado neste turno (ver
   * monsterCard.monsterUsed).
   */
  monsterTargetSlot?: number;
  /**
   * FIX (pedido do usuário): a Fúria Selvagem da Besta dobrava a SOMA de
   * todas as cartas horizontais do slot escolhido (e não fazia nada se o
   * slot não tivesse nenhuma) - o pedido era poder escolher QUALQUER carta
   * do slot (a principal ou uma horizontal específica) para dobrar. Este
   * campo guarda o id dessa carta específica (só relevante para a Besta -
   * Mago e Anjo nunca usam isto). undefined enquanto o efeito não foi
   * ativado neste turno.
   */
  monsterTargetCardId?: string;
  /**
   * Modo Towers: qual slot (0-2) do PRÓPRIO campo este jogador já escolheu
   * como sua torre NESTE turno - só um slot pode virar torre por turno
   * (pedido do usuário), mas pode ser reforçado quantas vezes o jogador
   * quiser dentro do mesmo turno (ver FORM_OR_REINFORCE_TOWER). undefined =
   * ainda não formou nenhuma torre neste turno. Zerado a cada turno junto
   * com `discardsThisTurn` (ver `resetForNewTurn`) - o campo inteiro é
   * descartado a cada fim de turno de qualquer forma, então uma torre nunca
   * sobrevive de um turno pro outro.
   */
  towerSlotThisTurn?: number;
  /**
   * Mosqueteiro (personagem novo, foco em descarte) - contador PRÓPRIO de
   * quantas cartas suas magias (Valete/Rainha) descartaram NESTE turno (só a
   * carta EXTRA que cada uma descarta, nunca a própria carta de magia J/Q se
   * descartando - toda magia já faz isso, não é específico do Mosqueteiro).
   * Sempre 0 para os outros 3 personagens. Zerado a cada turno (ver
   * `resetForNewTurn`, que também desliza os 2 campos abaixo).
   *
   * FIX (pedido do usuário: "ao invés de ter 2 contadores de descarte, faça
   * ter apenas um só que diz o número de cartas descartadas nos últimos 3
   * turnos") - a UI agora mostra só UM número (`mosqueteiroDiscardsThisTurn +
   * mosqueteiroDiscardsTurnMinus1 + mosqueteiroDiscardsTurnMinus2`, uma
   * janela deslizante de 3 turnos), mas o motor continua precisando dos 3
   * valores SEPARADOS por baixo: o Rei (Tiro Certeiro) usa uma janela de só
   * 2 turnos (este + o anterior - "o valor extra também conta o turno
   * anterior", pedido do usuário) e a Magia Numeral (Munição Infinita) usa a
   * janela cheia de 3 - sem guardar os 3 separadamente não daria pra
   * calcular as duas janelas diferentes a partir de só uma soma.
   */
  mosqueteiroDiscardsThisTurn: number;
  /** Snapshot de `mosqueteiroDiscardsThisTurn` tirado no INÍCIO deste turno (ou seja, o valor final do turno ANTERIOR, T-1) - ver comentário completo em `mosqueteiroDiscardsThisTurn`. */
  mosqueteiroDiscardsTurnMinus1: number;
  /** Snapshot de `mosqueteiroDiscardsTurnMinus1` tirado no INÍCIO deste turno (ou seja, o valor final de DOIS turnos atrás, T-2) - só usado pela janela de 3 turnos da Magia Numeral, não pelo Rei. */
  mosqueteiroDiscardsTurnMinus2: number;
  /**
   * Mosqueteiro - Recarga Rápida (Monstro) liga esta flag; o PRÓXIMO efeito
   * de descarte do Valete ou da Rainha (o que ativar primeiro) descarta da
   * mão do OPONENTE em vez da própria, e a flag é consumida (volta a false)
   * nesse instante. Também expira no fim do turno se não for usada.
   */
  mosqueteiroRedirectNextDiscard: boolean;
  /**
   * Mosqueteiro - Munição Infinita (Magia Numeral). FIX (pedido do usuário:
   * "Aumente o limite da sua mão no próximo turno pelo número de cartas
   * descartadas nos últimos 3 turnos") - o efeito deixou de conceder uma
   * COMPRA bônus única (campo antigo removido) e agora concede um bônus
   * TEMPORÁRIO de limite de mão, válido só durante o turno seguinte -
   * calculado e congelado no instante da ativação (soma dos 3 contadores
   * acima), igual ao mesmo padrão já usado por `coringaTransformWindowUntilTurn`
   * (ver PlayerState). `undefined` = sem bônus ativo agora.
   */
  mosqueteiroHandLimitBonusUntilTurn?: number;
  /** Valor do bônus temporário de limite de mão concedido pela Munição Infinita, válido enquanto `mosqueteiroHandLimitBonusUntilTurn` ainda não expirou - ver comentário completo acima. */
  mosqueteiroHandLimitBonusAmount: number;
  /** Mosqueteiro - id da carta do PRÓPRIO campo escolhida pelo Rei (Tiro Certeiro) para receber `mosqueteiroBoostAmount` de valor extra no combate deste turno. undefined = nenhuma ativação ainda neste turno. */
  mosqueteiroBoostedCardId?: string;
  /** Valor extra (fixo, calculado no instante da ativação do Rei) aplicado à carta `mosqueteiroBoostedCardId` durante a resolução de combate. */
  mosqueteiroBoostAmount: number;
  /**
   * Coringa (redesenho completo, pedido do usuário) - Magia Numeral "Mão de
   * Ferro" (7,7,7): turno até o qual (inclusive) o botão de transformar uma
   * carta de magia (J/Q/K) da mão em carta de número 11/12/13 fica
   * disponível - mesmo padrão de `expiresAtTurn`/`mosqueteiroHandLimitBonusUntilTurn`
   * (calculado como `turn + 1` no instante da ativação, cobre o turno
   * seguinte inteiro, expira sozinho - ver resetForNewTurn/
   * canTransformCoringaMagicCard). `undefined` = janela fechada agora. Uma
   * vez transformada, a carta marca `coringaTransformedToNumeral: true`
   * (ver Card em cardUtils.ts) PERMANENTEMENTE - a janela só controla
   * quando o botão pode ser apertado, nunca desfaz uma transformação já
   * feita mesmo depois de fechar.
   */
  coringaTransformWindowUntilTurn?: number;
  /**
   * Piromante (personagem novo, "momento game design") - a Bola de Fogo:
   * combustível visível no campo do próprio jogador, formado somando o
   * valor de cartas queimadas (próprias ou do oponente, ver as 3 magias em
   * magicCards.ts) até um teto (`FIREBALL_CAP`/`FIREBALL_CAP_TOWERS`, ver
   * getFireballCap). Lançada contra um slot do oponente através de
   * qualquer uma das 3 magias (Valete/Rainha/Rei, escolhendo "lançar" em
   * vez do efeito próprio de alimentar) - ver executeFireballLaunch.
   * Reseta pra 0 depois de lançada.
   */
  fireballValue: number;
  /**
   * Piromante - Magia Numeral "Chama Repartida" (6,6,6): `true` enquanto o
   * PRÓXIMO lançamento da Bola de Fogo (não importa quantos turnos até lá)
   * deve se propagar pros 3 slots do oponente de uma vez, com o valor
   * dividido entre eles, em vez de mirar 1 slot só com o valor total -
   * consumido (volta a `false`) assim que esse próximo lançamento acontece,
   * sem nenhum prazo por turno (diferente de `coringaTransformWindowUntilTurn`
   * acima) - ver executeFireballLaunch.
   */
  piromanteSpreadArmed: boolean;
}

/**
 * FIX (pedido do usuário: "reformule completamente o sistema de log de
 * jogo") - categoria de cada linha do log, usada pela UI (GameBoard.tsx/
 * LogPanel.tsx) pra escolher ícone/cor e pra alimentar os filtros por tipo
 * de evento. Nenhuma dessas categorias muda regra de jogo nenhuma - são
 * puramente informativas, o motor só rotula, quem decide o que fazer visualmente é a UI.
 */
export type LogEventType =
  | 'system'
  | 'phase'
  | 'draw'
  | 'discard'
  | 'fusion'
  | 'ace'
  | 'magic'
  | 'numeral-spell'
  | 'monster'
  | 'field'
  | 'combat'
  | 'warning'
  | 'spotlight';

/**
 * FIX (pedido do usuário: "reformule completamente o sistema de log de
 * jogo... a lógica do jogo pare de conhecer cores/formatação") - antes cada
 * entrada já vinha com HTML pronto (cores, spans, tooltips) montado dentro
 * do PRÓPRIO motor (ver a antiga função appendLog, que fazia regex sobre a
 * mensagem pra colorir trechos) e a UI só injetava esse HTML cru via
 * `dangerouslySetInnerHTML`. Agora uma entrada é 100% dado estruturado e
 * texto plano (`text`, sem HTML nenhum) - toda apresentação (ícone, cor por
 * jogador/personagem, nome+tooltip de magia/efeito de Monstro/Magia
 * Numeral) é resolvida pela UI a partir de `type`/`player`/`cardValue`, ver
 * lib/logFormat.ts.
 */
export interface LogEntry {
  id: number;
  /** Turno em que o evento ocorreu - usado pela UI pra agrupar o log por turno. */
  turn: number;
  /** Fase em que o evento ocorreu. */
  phase: Phase;
  type: LogEventType;
  /** Jogador a quem este evento se refere - null para eventos globais/sistêmicos (sem dono único, ex.: mudança de turno, resultado de combate envolvendo os dois lados). */
  player: PlayerNumber | null;
  /** Texto plano da mensagem, sem nenhuma marcação. */
  text: string;
  /**
   * Valor de carta em destaque nesta linha (opcional) - ex.: 'J'/'Q'/'K'
   * pra saber qual magia foi ativada (a UI busca nome+descrição em
   * magicCards.ts usando isso + o personagem do jogador), '9' num evento de
   * Magia Numeral, 'A' numa transformação de Ás, '🃏' ao posicionar o
   * Monstro. A UI usa isso pra destacar o valor no texto.
   */
  cardValue?: string;
  /**
   * Coringa (redesenho completo, "armadilhas") - slot de campo (do jogador
   * `player` acima) onde um Valete/Rei armadilha acabou de se dissipar em
   * fumaça na fase de Estratégia (ver applyCoringaTrapReaction). GameBoard.tsx
   * usa isso pra saber ONDE disparar o CoringaSmokeBurst.tsx - sem isso, a UI
   * só saberia QUE algo aconteceu (pelo texto do log), nunca em qual dos 3
   * slots. Nunca setado por nenhum outro tipo de entrada.
   */
  slotIndex?: number;
}

export interface CombatResolution {
  p1SlotIndex: number;
  p2SlotIndex: number;
  winner: PlayerNumber | 'tie';
  p1Value: number;
  p2Value: number;
  disputeWinner: PlayerNumber | null;
  /**
   * Coringa (redesenho completo, pedido do usuário) - Rei armadilha
   * revelado em Combate: "a carta explode... jogando a carta selecionada
   * para combate do oponente de volta pra mão dele... A disputa é tratada
   * como um empate. No modo Towers, este efeito apenas remove a carta do
   * topo da torre do oponente." `koPlayer` é o dono do Rei; a disposição de
   * verdade (devolver carta(s) pra mão em vez de descartar) acontece em
   * handleFinalizeCombat, o único lugar que já move cartas de campo pro
   * destino final - `winner`/`disputeWinner` acima já vêm forçados como
   * empate quando isto está presente (ver handleResolveCombat).
   */
  coringaKForcedTie?: { koPlayer: PlayerNumber };
}

export interface NumeralSpellPending {
  playerNumber: PlayerNumber;
  character: CharacterId;
}

/**
 * Modo Reações (pedido do usuário) - uma magia (J/Q/K) recém ativada por
 * `casterPlayer`, ainda NÃO aplicada de verdade, aguardando a janela de 3s em
 * que `opponentOf(casterPlayer)` pode reagir (ver handleReactToMagic) com uma
 * carta mágica própria do MESMO `cardValue`. `originalAction` é a ação
 * EXECUTE_MAGIC/ACTIVATE_SIMPLE_MAGIC original, guardada pra ser re-executada
 * de verdade (handleResolvePendingReaction) se a janela expirar sem reação -
 * evita duplicar a lógica de cada handler de magia num 2º lugar. Mesmo padrão
 * de "estado pendente que bloqueia tudo mais" já usado por
 * `numeralSpellPending` (ver o guard no topo de gameReducer).
 */
export interface PendingReaction {
  casterPlayer: PlayerNumber;
  character: CharacterId;
  cardValue: 'J' | 'Q' | 'K';
  /** Id da carta mágica anunciada (já revelada na mão de `casterPlayer`, mas ainda não consumida). */
  cardId: string;
  originalAction: GameAction;
}

export interface GameState {
  turn: number;
  phase: Phase;
  firstToFlip: PlayerNumber;
  paused: boolean;
  player1: PlayerState;
  player2: PlayerState;
  player1Character: CharacterId;
  player2Character: CharacterId;
  gameConfig: GameConfig;
  deck: Card[];
  discardPile: Card[];
  combatSelection: { player1?: number; player2?: number };
  /**
   * FIX (pedido do usuário: "turnos aparentemente só acabam caso um jogador
   * vença um combate, ao invés de acabar... quando ocorre um empate") -
   * quantos pares de slot já foram resolvidos (handleResolveCombat) NESTA
   * fase de Combate - existem no máximo 3 pares possíveis (um por slot).
   * Antes, `handleFinalizeCombat` só avançava automaticamente para o
   * próximo turno quando uma DISPUTA fechava (2 vitórias de um lado) -
   * um empate, ou uma vitória comum que esgotasse os 3 pares sem ninguém
   * chegar a 2 vitórias, deixava a fase de Combate "presa", exigindo que os
   * dois jogadores cliquem "Pronto" manualmente mesmo sem mais nenhum par
   * de slot pra batalhar. Agora, ao chegar em 3 combates resolvidos nesta
   * fase (`>= 3`), o turno avança automaticamente também nesses casos - ver
   * handleFinalizeCombat. Zerado a cada transição de fase em
   * advancePhaseState (mesmo padrão de `combatWins`, que já é resetado ali
   * pelo mesmo motivo: só faz sentido dentro de UMA fase de Combate).
   */
  combatRoundsThisPhase: number;
  // FIX (item 1 da 4ª rodada): antes era `turnsRemaining: number`, decrementado
  // a cada "meio-turno" (cada vez que a fase volta para Compra - ver
  // `advancePhaseState`). O problema é que o `turn` exibido na interface só
  // avança a cada 2 "meios-turnos" (1 com cada jogador virando primeiro - ver
  // o comentário de `advancePhaseState`), então um contador de 1 "meio-turno"
  // podia expirar ainda DENTRO do turno exibido em que foi ativado (nunca
  // chegando a ficar ativo durante o turno seguinte de verdade) dependendo de
  // qual jogador estava virando primeiro no momento da ativação - exatamente
  // o bug relatado ("ativa no turno anterior, desliga no turno que devia
  // estar ativo"). Agora o efeito guarda o número do turno (exibido) até o
  // qual ele deve permanecer ativo, calculado como `turn + 1` no momento da
  // ativação - isso cobre o turno seguinte inteiro (os 2 meios-turnos dele),
  // não importa qual jogador estava virando primeiro na hora da ativação.
  //
  // FIX (item 12 da 5ª rodada, "NOVAMENTE o mesmo problema"): reproduzi a
  // fundo achando que o bug do parágrafo acima teria voltado, mas não - o
  // bug real era outro, mais grave: até aqui esse campo guardava só UM
  // efeito ativo por vez (um único objeto, sem chave de jogador), mesmo
  // depois do FIX item 8 da 2ª rodada ter tornado o bloqueio de reativação
  // por jogador (não mais global) - ou seja, o código já permitia os DOIS
  // jogadores terem sua própria Visão Arcana ativa ao mesmo tempo (caso
  // Mago vs Mago), mas só existia UM slot pra guardar isso. Resultado: se o
  // Jogador 1 ativava a dele e, antes de expirar, o Jogador 2 (também Mago)
  // ativava a sua, a ativação do Jogador 2 SOBRESCREVIA silenciosamente a do
  // Jogador 1 - fazendo o efeito dele "morrer" sem nenhum aviso, exatamente
  // como "só ativa no turno que é ativada". Reproduzido e confirmado via
  // teste automatizado (ver sanity-test.ts) forçando os dois jogadores como
  // Mago. Agora é um mapa por jogador, então cada um tem seu próprio slot
  // independente.
  activeNumeralSpells: Partial<Record<PlayerNumber, { character: CharacterId; expiresAtTurn: number }>>;
  combatResolution: CombatResolution | null;
  numeralSpellPending: NumeralSpellPending | null;
  gameOver: { winner: PlayerNumber } | null;
  /**
   * Modo Spotlight (pedido do usuário) - números em destaque neste turno,
   * sorteados de novo a cada entrada na fase de Compra (ver
   * advancePhaseState/rollSpotlight em spotlight.ts). `null` quando o modo
   * está desligado nesta partida (`gameConfig.spotlightMode`).
   */
  spotlight: SpotlightState | null;
  /** Modo Reações (pedido do usuário) - ver PendingReaction acima. `null` na maior parte do tempo (nenhuma magia aguardando reação agora). */
  pendingReaction: PendingReaction | null;
  /**
   * Modo Reações - quantas vezes CADA jogador já reagiu NESTA fase (contra o
   * limite `gameConfig.reactionsLimit`, 1-3). Mapa por jogador (mesmo padrão
   * de `activeNumeralSpells`) - zerado a cada transição de fase (TODAS as 3,
   * não só a volta pra Compra - mesmo padrão de `combatRoundsThisPhase`, que
   * só faz sentido dentro de UMA fase, nunca precisa atravessar uma
   * transição).
   */
  reactionsUsedThisPhase: Partial<Record<PlayerNumber, number>>;
  /**
   * Modo Towers - "torre solitária" (pedido do usuário: "quando um jogador
   * posiciona uma torre sem nenhuma carta nos outros campos, então a cada
   * disputa, o jogador oponente deve selecionar a torre novamente para
   * combatê-la, com a torre perdendo a última carta de cima a cada
   * disputa"). Calculado UMA VEZ ao entrar na fase de Combate (ver
   * advancePhaseState) e congelado até o fim dela - nunca recalculado
   * round a round, porque a própria torre vai encolhendo a cada disputa
   * (ver handleFinalizeCombat), e recalcular do zero identificaria menos e
   * menos cartas na reserva, arriscando "desligar" a mecânica no meio da
   * fase por engano. `null` = mecânica não está ativa neste combate (ou
   * nenhum jogador tem torre, ou os dois têm, ou a torre não é o ÚNICO
   * conteúdo do campo de quem a tem - regras exatas em
   * computeLoneTowerForCombat).
   */
  combatLoneTower: { towerOwner: PlayerNumber; slotIndex: number } | null;
  log: LogEntry[];
}

/** Seleção feita pelo jogador no assistente de ativação de magia (ver GameBoard.tsx) */
export interface MagicSelection {
  selectedCards?: string[];
  selectedSlot?: number;
  selectedTargetPlayer?: PlayerNumber;
  selectedTargetSlot?: number;
  /**
   * Mosqueteiro - Rainha (Rajada Reveladora): ids das cartas do OPONENTE
   * (mão ou campo, escolhidas às cegas por posição) reveladas pelo efeito -
   * separado de `selectedCards` acima, que aqui guarda as cartas
   * DESCARTADAS (da própria mão, ou da mão do oponente se a Recarga Rápida
   * estiver ativa - ver mosqueteiroRedirectNextDiscard).
   */
  selectedRevealCardIds?: string[];
  /**
   * Piromante (personagem novo) - as 3 magias (J/Q/K) sempre têm duas formas
   * de ativar (efeito próprio de alimentar a Bola de Fogo, OU lançá-la já
   * acumulada contra o campo do oponente) - `true` quando o jogador escolheu
   * a 2ª opção nesta ativação. Quando `true`, `selectedTargetSlot` (já
   * existe acima) é o slot do oponente mirado; `selectedCards`/`selectedSlot`
   * são ignorados. Quando `false`/ausente, a magia faz seu efeito próprio de
   * sempre (Valete não precisa de seleção nenhuma; Rainha/Rei usam
   * `selectedCards` com a carta do oponente a queimar).
   */
  fireballLaunch?: boolean;
}

export type GameAction =
  | { type: 'DRAW_CARDS'; player: PlayerNumber; count: number }
  | { type: 'DISCARD_CARDS'; player: PlayerNumber; cardIds: string[] }
  // FIX (pedido do usuário: variante "Fusão") - junta 2 cartas numerais
  // PURAS (2-10, nunca Ás/magia/Coringa - ver canFuseCards em fusion.ts) da
  // mão em 1 carta nova, valendo a SOMA das duas - só na fase de Compra, uma
  // vez por turno (ver fusesThisTurn em PlayerState). Ver handleFuseCards.
  | { type: 'FUSE_CARDS'; player: PlayerNumber; cardId1: string; cardId2: string }
  | { type: 'PLAY_CARD'; player: PlayerNumber; cardId: string; slotIndex: number; asHorizontal: boolean }
  | { type: 'RETURN_CARD_TO_HAND'; player: PlayerNumber; slotIndex: number }
  // FIX (item 9 da 6ª rodada): "adicione a opção de remover a carta
  // horizontal de cima de outra carta, clicando onde normalmente sua
  // indicação visual é posicionada" - RETURN_CARD_TO_HAND (acima) devolve o
  // slot INTEIRO (carta principal + toda(s) horizontal(is)) para a mão; não
  // havia nenhuma forma de devolver só UMA carta horizontal, mantendo a
  // principal (e a outra horizontal, se houver 2 empilhadas via Reforço
  // Angelical do Anjo) no lugar. `cardId` identifica qual das (até 2) cartas
  // horizontais do slot remover - ver handleReturnHorizontalCardToHand.
  | { type: 'RETURN_HORIZONTAL_CARD_TO_HAND'; player: PlayerNumber; slotIndex: number; cardId: string }
  // FIX (item 9): antes trocar a carta principal de um slot exigia duas ações
  // separadas (RETURN_CARD_TO_HAND depois PLAY_CARD) - esta ação faz a troca
  // atômica: a carta antiga do slot volta para a mão, a nova carta da mão
  // (`cardId`) ocupa o lugar dela. Só permitido enquanto o slot ainda não foi
  // revelado (ver handleSwapFieldCard).
  | { type: 'SWAP_FIELD_CARD'; player: PlayerNumber; cardId: string; slotIndex: number }
  // Modo Towers (pedido do usuário): empilha `cardIds` (2+ cartas numerais
  // de mesmo valor efetivo da mão pra CRIAR uma torre nova, ou 1+ pra
  // REFORÇAR uma torre já formada neste turno pelo mesmo jogador) no
  // `slotIndex` escolhido - vazio, com uma carta comum de valor igual
  // (absorvida na torre), ou já uma torre própria deste turno. Ver
  // handleFormOrReinforceTower/FieldSlot.towerReserve.
  | { type: 'FORM_OR_REINFORCE_TOWER'; player: PlayerNumber; slotIndex: number; cardIds: string[] }
  | { type: 'TRANSFORM_ACE'; player: PlayerNumber; aceCardId: string; targetCardId: string }
  | { type: 'ACTIVATE_SIMPLE_MAGIC'; player: PlayerNumber; cardId: string }
  | { type: 'EXECUTE_MAGIC'; player: PlayerNumber; cardId: string; character: CharacterId; magicType: MagicCardType; selection: MagicSelection }
  // Modo Reações (pedido do usuário): `player` (o OPONENTE de quem anunciou -
  // ver state.pendingReaction) usa `cardId` (uma carta mágica própria do
  // MESMO valor da anunciada) pra negar o efeito - as duas cartas vão pro
  // descarte, o efeito nunca se aplica. Ver handleReactToMagic.
  | { type: 'REACT_TO_MAGIC'; player: PlayerNumber; cardId: string }
  // Modo Reações: a janela de 3s expirou sem reação (disparado por um timer
  // real em GameBoard.tsx) - aplica de verdade a magia que estava anunciada
  // em state.pendingReaction (re-executa o handler original guardado ali).
  // Ver handleResolvePendingReaction.
  | { type: 'RESOLVE_PENDING_REACTION' }
  // FIX (itens 4 e 7 da 3ª rodada): posiciona uma carta Monstro (Coringa) da
  // mão na zona própria do jogador (PlayerState.monsterCard) - NUNCA em um
  // dos 3 slots de combate normais (ver handlePlayCard, que agora rejeita
  // isMonster). Só permitido enquanto a zona estiver vazia.
  | { type: 'PLACE_MONSTER_CARD'; player: PlayerNumber; cardId: string }
  // FIX (itens 4 e 7): `targetSlotIndex` agora é o slot de COMBATE (0-2)
  // escolhido como alvo do efeito - antes `slotIndex` era o slot onde o
  // próprio Coringa estava fisicamente posicionado (arquitetura antiga, onde
  // o Monstro ocupava um slot de combate como uma carta comum).
  // `targetCardId` (opcional): só usado pela Besta - identifica qual carta
  // específica dentro do slot (a principal ou uma horizontal) deve ser
  // dobrada.
  // FIX (pedido do usuário): `targetSlotIndex` agora é OPCIONAL - o Anjo
  // (Proteção Divina) passou a proteger TODO o campo de uma vez ao ativar,
  // então não precisa mais escolher nenhum slot (Besta continua exigindo).
  | { type: 'ACTIVATE_MONSTER_EFFECT_SIMPLE'; player: PlayerNumber; targetSlotIndex?: number; targetCardId?: string }
  | { type: 'EXECUTE_MAGO_MONSTER_EFFECT'; player: PlayerNumber; targetSlotIndex: number; targetCardId: string }
  // Coringa (redesenho completo, pedido do usuário) - Magia Numeral "Mão de
  // Ferro" (7,7,7): transforma uma carta de magia (J/Q/K) da MÃO em carta de
  // número 11/12/13 (permanente) - só aceito enquanto a janela
  // `coringaTransformWindowUntilTurn` estiver ativa - ver
  // canTransformCoringaMagicCard/handleTransformCoringaMagicCard.
  | { type: 'TRANSFORM_CORINGA_MAGIC_CARD'; player: PlayerNumber; cardId: string }
  | { type: 'ACTIVATE_NUMERAL_SPELL'; player: PlayerNumber }
  | { type: 'FINALIZE_NUMERAL_SPELL' }
  | { type: 'SELECT_COMBAT_SLOT'; player: PlayerNumber; slotIndex: number }
  // Coringa (redesenho completo) - Rainha armadilha revelada em combate:
  // "seu valor se torna o mesmo de uma carta revelada do oponente (o
  // jogador escolhe no momento que é revelada)" - `coringaQCopyTargetId` é
  // o id dessa carta (do CAMPO do oponente, já revelada), escolhida pela UI
  // (ou pela IA) ANTES de despachar RESOLVE_COMBAT, quando um dos 2 slots
  // selecionados contém uma Rainha armadilha ainda não transformada - ver
  // handleResolveCombat. `undefined` no caso comum (nenhuma Rainha
  // envolvida nesta disputa).
  | { type: 'RESOLVE_COMBAT'; coringaQCopyTargetId?: string }
  | { type: 'FINALIZE_COMBAT' }
  | { type: 'TOGGLE_READY'; player: PlayerNumber }
  | { type: 'TOGGLE_PAUSE' }
  | { type: 'REMATCH' }
  // Modo de debug/playtest (pedido do usuário: "debug mode melhor pra você
  // testar as coisas mais rápido") - substitui o estado INTEIRO pelo
  // fornecido, sem passar por nenhum handler/validação (é um passthrough
  // puro, ver o topo de gameReducer). Nunca despachada pela UI normal nem
  // pela IA - só existe pra `window.__debug.forceState(...)` (ver GameBoard.tsx,
  // exposto apenas em dev) montar cenários exatos (ex.: mão cheia de
  // armadilhas do Coringa, combate prestes a fechar disputa) sem precisar
  // clicar/jogar até chegar lá manualmente.
  | { type: 'DEBUG_FORCE_STATE'; state: GameState };

// ============================================================================
// Helpers puros
// ============================================================================

function emptyField(): [FieldSlot, FieldSlot, FieldSlot] {
  return [
    { revealed: false, horizontalCards: [] },
    { revealed: false, horizontalCards: [] },
    { revealed: false, horizontalCards: [] },
  ];
}

function createPlayerState(hand: Card[], handLimit: number): PlayerState {
  return {
    hand,
    field: emptyField(),
    readyForNextPhase: false,
    lives: 3,
    combatWins: 0,
    handLimit,
    horizontalStackBonus: 0,
    permanentDrawBonus: 0,
    discardsThisTurn: 0,
    drawsThisTurn: 0,
    fusesThisTurn: 0,
    monsterCard: undefined,
    monsterTargetSlot: undefined,
    monsterTargetCardId: undefined,
    towerSlotThisTurn: undefined,
    mosqueteiroDiscardsThisTurn: 0,
    mosqueteiroDiscardsTurnMinus1: 0,
    mosqueteiroDiscardsTurnMinus2: 0,
    mosqueteiroRedirectNextDiscard: false,
    mosqueteiroHandLimitBonusUntilTurn: undefined,
    mosqueteiroHandLimitBonusAmount: 0,
    mosqueteiroBoostedCardId: undefined,
    mosqueteiroBoostAmount: 0,
    coringaTransformWindowUntilTurn: undefined,
    fireballValue: 0,
    piromanteSpreadArmed: false,
  };
}

export function createInitialState(
  player1Character: CharacterId,
  player2Character: CharacterId,
  gameConfig: GameConfig
): GameState {
  const deck = generateDeck(gameConfig.monsterCards, gameConfig.deckType === 'thematic', gameConfig.towersMode);
  // FIX (Modo Towers, pedido do usuário): "mão aumentada em 1" - a mão
  // inicial também acompanha o novo limite base (9 em vez de 8), não só o
  // teto pra compras futuras.
  const baseHandLimit = 8 + (gameConfig.towersMode ? 1 : 0);
  const { drawn: p1Hand, remaining: afterP1 } = drawCards(deck, baseHandLimit);
  const { drawn: p2Hand, remaining: afterP2 } = drawCards(afterP1, baseHandLimit);

  return {
    turn: 1,
    phase: 'draw',
    firstToFlip: 1,
    paused: false,
    player1: createPlayerState(p1Hand, baseHandLimit),
    player2: createPlayerState(p2Hand, baseHandLimit),
    player1Character,
    player2Character,
    gameConfig,
    deck: afterP2,
    discardPile: [],
    combatSelection: {},
    combatRoundsThisPhase: 0,
    activeNumeralSpells: {},
    combatResolution: null,
    numeralSpellPending: null,
    gameOver: null,
    spotlight: rollSpotlight(gameConfig),
    pendingReaction: null,
    reactionsUsedThisPhase: {},
    combatLoneTower: null,
    log: [
      { id: 0, turn: 1, phase: 'draw', type: 'system', player: null, text: 'Jogo iniciado' },
      { id: 1, turn: 1, phase: 'draw', type: 'phase', player: null, text: 'Turno 1 - Fase de Compra' },
    ],
  };
}

export function playerKeyOf(player: PlayerNumber): PlayerKey {
  return player === 1 ? 'player1' : 'player2';
}
export function opponentKeyOf(player: PlayerNumber): PlayerKey {
  return player === 1 ? 'player2' : 'player1';
}
export function opponentOf(player: PlayerNumber): PlayerNumber {
  return player === 1 ? 2 : 1;
}
export function characterOf(state: GameState, player: PlayerNumber): CharacterId {
  return player === 1 ? state.player1Character : state.player2Character;
}

interface LogOptions {
  player?: PlayerNumber;
  cardValue?: string;
  slotIndex?: number;
  /**
   * Só usado pelas 3 mensagens de transição de fase em advancePhaseState:
   * quando o `state` recebido ainda é o de ANTES da transição (turno/fase de
   * ORIGEM), mas a mensagem já anuncia o turno/fase de DESTINO, este override
   * garante que a entrada seja agrupada no turno certo pela UI (senão o
   * anúncio "Turno 2 - Fase de Compra" ficaria etiquetado como pertencente
   * ao Turno 1, já que é ali que o dispatch acontece).
   */
  turnOverride?: number;
  phaseOverride?: Phase;
}

/**
 * FIX (pedido do usuário: "reformule completamente o sistema de log de
 * jogo... a lógica do jogo pare de conhecer cores/formatação") - registra
 * uma linha de log como DADO estruturado puro (turno, fase, tipo, jogador,
 * texto plano) - nenhuma cor, ícone, nome de magia ou tooltip é decidido
 * aqui; tudo isso agora é responsabilidade da UI (ver lib/logFormat.ts),
 * lendo os mesmos campos estruturados. Mantém o teto de 30 entradas (mesmo
 * comportamento de antes - pedido do usuário ao confirmar a reformulação).
 */
/**
 * FIX (pedido do usuário: "ao invés de falar jogador 1 e jogador 2, troque
 * para os respectivos nomes dos personagens em questão, em todos os
 * lugares no jogo") - as 60+ chamadas de `appendLog` espalhadas por este
 * arquivo montam a mensagem como uma frase pronta ("Jogador 1 comprou uma
 * carta", "Jogador 2 revelou X de Jogador 1"...) - em vez de editar cada
 * uma individualmente (risco real de esquecer alguma), a troca acontece
 * aqui, um único lugar: qualquer "Jogador 1"/"Jogador 2" literal no texto
 * final vira o NOME do personagem daquele jogador (ex.: "CORINGA comprou
 * uma carta"). Sempre os dois de uma vez, já que uma mensagem pode citar
 * os dois jogadores na mesma frase.
 */
function withPlayerCharacterNames(state: GameState, text: string): string {
  const p1Name = getCharacterTheme(state.player1Character).name;
  const p2Name = getCharacterTheme(state.player2Character).name;
  return text.replace(/Jogador 1/g, p1Name).replace(/Jogador 2/g, p2Name);
}

function appendLog(state: GameState, log: LogEntry[], type: LogEventType, message: string, opts: LogOptions = {}): LogEntry[] {
  const nextId = log.length > 0 ? log[log.length - 1].id + 1 : 0;
  const entry: LogEntry = {
    id: nextId,
    turn: opts.turnOverride ?? state.turn,
    phase: opts.phaseOverride ?? state.phase,
    type,
    player: opts.player ?? null,
    text: withPlayerCharacterNames(state, message),
    cardValue: opts.cardValue,
    slotIndex: opts.slotIndex,
  };
  return [...log, entry].slice(-30);
}

/**
 * Move cartas para a pilha de descarte, sempre resetando seus campos
 * transitórios (ver resetCardForDiscard) e aplicando o "shuffle automático"
 * configurável: quando o descarte atinge 20+ cartas, metade delas volta
 * aleatoriamente para o baralho.
 *
 * FIX (pedido do usuário: "quando uma carta fusionada é descartada... vai
 * pro discarte as duas... que foram utilizadas para a fusão") - toda carta
 * que passa por aqui é primeiro "desfundida" (expandFusedCards): uma carta
 * fundida nunca vai para o descarte como ela mesma, e sim como as 2+ cartas
 * originais que a compuseram - senão cada fusão bem-sucedida criava 1 carta
 * nova permanente fora da composição original do baralho (ex.: 2 numerais
 * virando 1 magia extra), inflando a proporção de magias/Áses a cada fusão
 * feita na partida.
 */
function pushToDiscard(state: Pick<GameState, 'deck' | 'discardPile' | 'gameConfig'>, cards: Card[]): { deck: Card[]; discardPile: Card[] } {
  if (cards.length === 0) return { deck: state.deck, discardPile: state.discardPile };

  // Piromante (personagem novo) - uma carta-token (`isFireToken`, ver
  // cardUtils.ts) nunca existiu no baralho original de 54 cartas - ela
  // simplesmente DESAPARECE ao sair de campo, em vez de entrar na pilha de
  // descarte (senão a conservação total de cartas do jogo, que todo o
  // resto do motor assume como invariante fixo, quebraria pra sempre a
  // cada Bola de Fogo lançada sem obliterar o alvo).
  const realCards = cards.filter((c) => !c.isFireToken);
  let discardPile = [...state.discardPile, ...resetCardsForDiscard(expandFusedCards(realCards))];
  let deck = state.deck;

  if (state.gameConfig.autoShuffle && discardPile.length >= 20) {
    const reshuffled = reshuffleDiscardIntoDeck(deck, discardPile, 'half');
    deck = reshuffled.deck;
    discardPile = reshuffled.discardPile;
  }

  return { deck, discardPile };
}

/**
 * Garante que o baralho tenha cartas antes de uma compra. Se estiver vazio e
 * houver cartas no descarte, reembaralha TODO o descarte de volta - sem essa
 * rede de segurança, o baralho podia esgotar e o jogo travava (compra
 * simplesmente parava de trazer cartas, sem forma de continuar).
 */
function ensureDeckHasCards(state: GameState): { deck: Card[]; discardPile: Card[]; reshuffled: boolean } {
  if (state.deck.length > 0 || state.discardPile.length === 0) {
    return { deck: state.deck, discardPile: state.discardPile, reshuffled: false };
  }
  const reshuffled = reshuffleDiscardIntoDeck(state.deck, state.discardPile, 'all');
  return { ...reshuffled, reshuffled: true };
}

/**
 * Como `ensureDeckHasCards`, mas garante um número MÍNIMO de cartas no
 * baralho (não só "não vazio") - usada pela Fúria Sanguinária da Besta
 * (item 16), que pode precisar comprar 7+ cartas de uma vez para o
 * oponente, mais do que o baralho sozinho costuma ter disponível.
 */
function ensureDeckHasAtLeast(
  deckState: { deck: Card[]; discardPile: Card[]; gameConfig: GameState['gameConfig'] },
  needed: number
): { deck: Card[]; discardPile: Card[] } {
  if (deckState.deck.length >= needed || deckState.discardPile.length === 0) {
    return { deck: deckState.deck, discardPile: deckState.discardPile };
  }
  return reshuffleDiscardIntoDeck(deckState.deck, deckState.discardPile, 'all');
}

function fieldCards(field: [FieldSlot, FieldSlot, FieldSlot]): Card[] {
  // FIX (Modo Towers, pedido do usuário): a reserva da torre (cartas
  // empilhadas ABAIXO do topo, ver FieldSlot.towerReserve) agora entra em
  // TODO lugar que já varria o campo inteiro pra descartar/mover cartas -
  // esta é a ÚNICA função usada por todos esses lugares (fim de combate,
  // limpeza do campo do oponente pela Magia Numeral, etc.), então uma
  // mudança aqui já basta para todos eles tratarem a torre inteira, não só o
  // topo visível.
  return field
    .flatMap((slot) => [slot.faceDownCard, ...(slot.towerReserve ?? []), ...slot.horizontalCards])
    .filter((c): c is Card => Boolean(c));
}

/** Verdadeiro quando este slot é uma torre do Modo Towers (tem reserva empilhada abaixo do topo). */
export function isTowerSlot(slot: FieldSlot): boolean {
  return Boolean(slot.towerReserve && slot.towerReserve.length > 0);
}

// ---------------------------------------------------------------------------
// Coringa (redesenho completo, pedido do usuário) - "cartas armadilha"
//
// Diferente de todos os outros personagens, o Valete/Rainha/Rei do Coringa
// nunca são "ativados" - são POSICIONADOS no campo (Valete só como
// horizontal, Rainha/Rei só como principal - ver handlePlayCard/
// handleSwapFieldCard) e reagem sozinhos quando revelados:
//   - Estratégia (por um efeito do OPONENTE): cada carta tem sua própria
//     reação - ver applyCoringaTrapReaction/resolveCoringaFieldTraps.
//   - Combate (a carta é selecionada e revelada normalmente): ver
//     handleResolveCombat (Rainha copia valor / Rei força empate e devolve
//     a carta do oponente).
// A carta Monstro dele também entra aqui, tratada como um "15" fixo -
// nunca usa a Zona Monstro (ver handlePlaceMonsterCard).
//
// A Magia Numeral "Mão de Ferro" (7,7,7) permite transformar uma dessas
// cartas (ainda na mão) numa carta de número 11/12/13 de verdade,
// PERMANENTEMENTE (`coringaTransformedToNumeral: true`) - a partir daí ela
// larga esse comportamento de armadilha por completo, mesmo já em campo.
// ---------------------------------------------------------------------------

/** Verdadeiro se `card` ainda é uma "armadilha" crua do Coringa (J/Q/K ou Monstro, nunca transformada em numeral pela Magia Numeral). */
export function isCoringaRawTrapCard(state: GameState, owner: PlayerNumber, card: Card): boolean {
  if (characterOf(state, owner) !== 'coringa') return false;
  if (card.coringaTransformedToNumeral) return false;
  return card.value === 'J' || card.value === 'Q' || card.value === 'K' || Boolean(card.isMonster);
}

/**
 * Reação de UMA carta-armadilha do Coringa ao ser revelada por um efeito do
 * OPONENTE durante a fase de ESTRATÉGIA (nunca chamado pra revelação normal
 * de combate, nem pra revelação causada pelo próprio Coringa):
 *   - Valete: descarta a carta (fumaça + riso) e o Coringa compra 1 carta.
 *   - Rainha/Monstro: volta pra mão do Coringa OCULTA, embaralhando a mão
 *     inteira (impede o oponente de rastrear qual carta da mão é aquela).
 *   - Rei: destrói a carta (descarte) e o Coringa compra um Ás específico
 *     (reembaralha o descarte de volta se precisar, mesma busca já usada
 *     pela Benção Divina do Anjo).
 */
function applyCoringaTrapReaction(
  state: GameState,
  owner: PlayerNumber,
  slotIndex: number,
  kind: 'main' | 'horizontal',
  card: Card
): GameState {
  const ownerKey = playerKeyOf(owner);
  const ownerState = state[ownerKey];
  const slot = ownerState.field[slotIndex];
  const newField = [...ownerState.field] as [FieldSlot, FieldSlot, FieldSlot];

  // FIX (bug real encontrado por simulação IA vs IA - conservação de cartas):
  // uma carta horizontal empilhada sobre a carta PRINCIPAL do slot (ex.: um
  // reforço qualquer colocado em cima da Rainha/Rei/Monstro armadilha do
  // Coringa) não tinha pra onde ir quando `kind === 'main'` - `removeFromField`
  // só limpava `faceDownCard`, deixando `horizontalCards` intacto no slot,
  // um slot "órfão" (mesmo estado inconsistente que o comentário de
  // handleReturnCardToHand já alertava). Como `canActivateNumeralSpell` só
  // olha `faceDownCard` pra decidir se o campo está "vazio", esse slot órfão
  // passava despercebido - e a Magia Numeral seguinte sobrescrevia o campo
  // inteiro (`field: newField`), descartando a carta horizontal órfã sem
  // nunca a mandar pra mão/descarte, sumindo do jogo de vez. Agora qualquer
  // horizontal presente é devolvida pra mão do dono junto com a reação
  // (mesmo destino de handleReturnCardToHand), nunca deixada pra trás.
  const orphanedHorizontal = kind === 'main' ? slot.horizontalCards : [];
  const removeFromField = (): FieldSlot => {
    if (kind === 'main') return { ...slot, faceDownCard: undefined, revealed: false, horizontalCards: [] };
    return { ...slot, horizontalCards: slot.horizontalCards.filter((c) => c.id !== card.id) };
  };

  if (card.value === 'J') {
    newField[slotIndex] = removeFromField();
    const { deck, discardPile } = pushToDiscard(state, [card]);
    let log = appendLog(
      state,
      state.log,
      'magic',
      `O Valete armadilha de Jogador ${owner} foi revelado e se dissipou em fumaça!`,
      { player: owner, slotIndex }
    );
    const { deck: ensuredDeck, discardPile: ensuredDiscard, reshuffled } = ensureDeckHasCards({ ...state, deck, discardPile });
    if (reshuffled) log = appendLog(state, log, 'system', `O baralho esgotou - a pilha de descarte foi reembaralhada de volta`);
    const maxCanDraw = ownerState.handLimit - ownerState.hand.length;
    const actualCount = Math.min(1, maxCanDraw, ensuredDeck.length);
    const { drawn, remaining } = actualCount > 0 ? drawCards(ensuredDeck, actualCount) : { drawn: [] as Card[], remaining: ensuredDeck };
    if (drawn.length > 0) {
      log = appendLog(state, log, 'draw', `Jogador ${owner} comprou 1 carta de reposição`, { player: owner });
    }
    return {
      ...state,
      deck: remaining,
      discardPile: ensuredDiscard,
      log,
      [ownerKey]: { ...ownerState, field: newField, hand: [...ownerState.hand, ...orphanedHorizontal, ...drawn] },
    };
  }

  if (card.value === 'Q' || card.isMonster) {
    newField[slotIndex] = removeFromField();
    const returnedCard: Card = { ...card, revealed: false };
    const newHand = shuffle([...ownerState.hand, returnedCard, ...orphanedHorizontal]);
    const label = card.value === 'Q' ? 'A Rainha armadilha' : 'O Monstro';
    const log = appendLog(
      state,
      state.log,
      'magic',
      `${label} de Jogador ${owner} foi revelado(a) e voltou oculto(a) pra mão - a mão foi embaralhada`,
      { player: owner }
    );
    return {
      ...state,
      log,
      [ownerKey]: { ...ownerState, field: newField, hand: newHand },
    };
  }

  if (card.value === 'K') {
    newField[slotIndex] = removeFromField();
    const { deck, discardPile } = pushToDiscard(state, [card]);
    let log = appendLog(
      state,
      state.log,
      'magic',
      `O Rei armadilha de Jogador ${owner} foi revelado e explodiu em fumaça e nuvens!`,
      { player: owner, slotIndex }
    );

    let aceDeck = deck;
    let aceDiscard = discardPile;
    let aceIndex = aceDeck.findIndex((c) => c.value === 'A');
    if (aceIndex === -1 && aceDiscard.length > 0) {
      const reshuffled = reshuffleDiscardIntoDeck(aceDeck, aceDiscard, 'all');
      aceDeck = reshuffled.deck;
      aceDiscard = reshuffled.discardPile;
      aceIndex = aceDeck.findIndex((c) => c.value === 'A');
    }
    if (aceIndex === -1 || ownerState.hand.length >= ownerState.handLimit) {
      return {
        ...state,
        deck: aceDeck,
        discardPile: aceDiscard,
        log,
        [ownerKey]: { ...ownerState, field: newField, hand: [...ownerState.hand, ...orphanedHorizontal] },
      };
    }
    const ace = aceDeck[aceIndex];
    const remainingDeck = [...aceDeck.slice(0, aceIndex), ...aceDeck.slice(aceIndex + 1)];
    log = appendLog(state, log, 'draw', `Jogador ${owner} comprou um Ás`, { player: owner });
    return {
      ...state,
      deck: remainingDeck,
      discardPile: aceDiscard,
      log,
      [ownerKey]: { ...ownerState, field: newField, hand: [...ownerState.hand, ...orphanedHorizontal, ace] },
    };
  }

  return state;
}

/**
 * Coringa (redesenho completo) - aplica o valor de combate especial de uma
 * carta-armadilha crua (nunca chamado pra cartas já transformadas em
 * numeral, nem pra cartas de outros personagens - ver isCoringaRawTrapCard):
 *   - Valete: fixo em 1 ("A carta horizontal vale 1 sob este efeito").
 *   - Monstro: fixo em 15 ("é tratado como uma carta de número 15").
 *   - Rainha: copia o valor de uma carta REVELADA do campo do oponente,
 *     escolhida pelo jogador no momento da revelação (`copyTargetId`) - sem
 *     alvo disponível ou escolhido, vale 1 (mesmo valor fixo do Valete,
 *     resposta do usuário confirmada).
 *   - Rei: nunca usa valor de combate de verdade (o resultado é forçado
 *     à parte - ver handleResolveCombat), devolvido sem alteração aqui.
 * Reaproveita `transformedValue` (mesmo campo do Transformar Ás) - todo o
 * resto do cálculo de combate já entende automaticamente, sem nenhuma
 * mudança extra.
 */
function applyCoringaTrapCombatValue(
  state: GameState,
  owner: PlayerNumber,
  card: Card,
  opponentField: [FieldSlot, FieldSlot, FieldSlot],
  copyTargetId: string | undefined
): Card {
  if (!isCoringaRawTrapCard(state, owner, card)) return card;
  if (card.value === 'J') return { ...card, transformedValue: 1 };
  if (card.isMonster) return { ...card, transformedValue: 15 };
  if (card.value === 'Q') {
    const revealedOpponentCards = opponentField.flatMap((slot) => [
      ...(slot.faceDownCard?.revealed ? [slot.faceDownCard] : []),
      ...slot.horizontalCards.filter((c) => c.revealed),
    ]);
    const target = copyTargetId ? revealedOpponentCards.find((c) => c.id === copyTargetId) : undefined;
    const copiedValue = target ? getSpotlightAdjustedValue(target, state.spotlight) : 1;
    return { ...card, transformedValue: copiedValue };
  }
  return card;
}

/**
 * Chamado depois de QUALQUER efeito que revele um slot do campo de um
 * jogador durante a fase de Estratégia (hoje: Visão Celestial do Anjo,
 * Rajada Reveladora do Mosqueteiro) - compara `oldState` (antes do efeito)
 * com `newState` (já com a revelação aplicada) pra achar exatamente quais
 * cartas passaram de oculta pra revelada NESTA ação, e processa só essas
 * (nunca re-dispara numa carta que já estava revelada de antes). Um no-op
 * completo (devolve `newState` sem tocar em nada) quando `targetPlayer` não
 * é Coringa, ou fora da fase de Estratégia.
 */
function resolveCoringaFieldTraps(oldState: GameState, newState: GameState, targetPlayer: PlayerNumber): GameState {
  if (newState.phase !== 'strategy') return newState;
  if (characterOf(newState, targetPlayer) !== 'coringa') return newState;
  const targetKey = playerKeyOf(targetPlayer);
  const oldField = oldState[targetKey].field;

  let result = newState;
  for (let i = 0; i < 3; i++) {
    const oldSlot = oldField[i];
    const currentSlot = result[targetKey].field[i];
    const mainCard = currentSlot.faceDownCard;
    if (mainCard && mainCard.revealed && !(oldSlot.faceDownCard && oldSlot.faceDownCard.revealed) && isCoringaRawTrapCard(result, targetPlayer, mainCard)) {
      result = applyCoringaTrapReaction(result, targetPlayer, i, 'main', mainCard);
      continue;
    }
    const horizontalTrap = currentSlot.horizontalCards.find((hCard, hIdx) => {
      const wasRevealed = oldSlot.horizontalCards[hIdx]?.revealed;
      return hCard.revealed && !wasRevealed && isCoringaRawTrapCard(result, targetPlayer, hCard);
    });
    if (horizontalTrap) {
      result = applyCoringaTrapReaction(result, targetPlayer, i, 'horizontal', horizontalTrap);
    }
  }
  return result;
}

/**
 * Modo Towers - "torre solitária" (pedido do usuário, ver comentário
 * completo de `combatLoneTower` em GameState): identifica se EXATAMENTE UM
 * dos dois jogadores tem uma torre, E ela é o ÚNICO conteúdo do campo dele
 * (os outros 2 slots totalmente vazios - sem carta principal nem
 * horizontal), E o oponente não tem NENHUMA torre em nenhum slot. Chamado
 * uma única vez, na entrada da fase de Combate (ver advancePhaseState) -
 * nunca recalculado depois, porque a própria torre encolhe a cada disputa.
 */
function computeLoneTowerForCombat(state: GameState): { towerOwner: PlayerNumber; slotIndex: number } | null {
  const findLoneTower = (field: [FieldSlot, FieldSlot, FieldSlot]): number | null => {
    const towerIndex = field.findIndex((slot) => isTowerSlot(slot));
    if (towerIndex === -1) return null;
    const othersEmpty = field.every((slot, i) => i === towerIndex || (!slot.faceDownCard && slot.horizontalCards.length === 0));
    return othersEmpty ? towerIndex : null;
  };
  const p1HasAnyTower = state.player1.field.some((slot) => isTowerSlot(slot));
  const p2HasAnyTower = state.player2.field.some((slot) => isTowerSlot(slot));
  if (p1HasAnyTower && !p2HasAnyTower) {
    const slotIndex = findLoneTower(state.player1.field);
    return slotIndex !== null ? { towerOwner: 1, slotIndex } : null;
  }
  if (p2HasAnyTower && !p1HasAnyTower) {
    const slotIndex = findLoneTower(state.player2.field);
    return slotIndex !== null ? { towerOwner: 2, slotIndex } : null;
  }
  return null;
}

/**
 * Um slot está protegido (Proteção Divina do Anjo) quando seu dono é o Anjo E
 * o Monstro dele (na zona própria - ver PlayerState.monsterCard) já foi
 * ativado (monsterUsed:true) neste turno. Slots protegidos não podem ser alvo
 * de magias (J/Q/K) do oponente.
 *
 * FIX (pedido do usuário): antes só o slot ESCOLHIDO ao ativar
 * (monsterTargetSlot === slotIndex) ficava protegido - agora o efeito
 * protege TODO O CAMPO do Anjo de uma vez (os 3 slots), então não depende
 * mais de qual slot foi "escolhido" (a ativação nem pede mais essa escolha -
 * ver handleActivateMonsterEffectSimple). O parâmetro `slotIndex` continua
 * aqui só para manter a mesma assinatura usada por todos os pontos que já
 * chamam esta função slot a slot (Besta/Mago continuam sem proteção nenhuma,
 * já que só o Anjo tem este efeito).
 *
 * FIX (itens 4 e 7 da 3ª rodada, histórico): antes checava
 * `slot.faceDownCard.isMonster` - válido só na arquitetura antiga, onde o
 * Monstro ocupava fisicamente um dos 3 slots de combate.
 */
export function isSlotProtected(state: GameState, ownerPlayer: PlayerNumber, _slotIndex: number): boolean {
  if (characterOf(state, ownerPlayer) !== 'anjo') return false;
  const playerState = state[playerKeyOf(ownerPlayer)];
  return Boolean(playerState.monsterCard?.monsterUsed);
}

/**
 * Índices de slots do campo com carta(s) horizontal(is) e NENHUMA delas já
 * batalhada (alvo válido de Mago K).
 *
 * FIX (softlock real encontrado - IA travava sozinha, relatado como "trava na
 * fase de estratégia/combate no modo Espectador"): esta função dizia "alvo
 * válido" bastando UMA carta não batalhada no slot (`.some`), mas
 * handleExecuteMagic (guarda real do motor, logo abaixo) rejeita a magia
 * inteira se QUALQUER carta do slot já tiver batalhado (`.some(c =>
 * c.battled)` → rejeita) - ou seja, um slot com pilha MISTA (1 carta já
 * batalhada + 1 ainda não, perfeitamente possível depois da 1ª disputa de um
 * turno com 2 rodadas) contava como alvo aqui mas era sempre silenciosamente
 * rejeitado pelo motor de verdade. A IA propunha essa mesma ação rejeitada
 * repetidamente (mesma família de bug já documentada e corrigida em outros
 * pontos deste arquivo), e como o estado nunca mudava, o efeito de decisão da
 * IA em GameBoard.tsx nunca tinha motivo pra rodar de novo - jogo travado de
 * vez. Também usada para destacar o alvo válido pro jogador HUMANO clicar
 * (GameBoard.tsx) e pela checagem de elegibilidade da magia
 * (`hasUnbattledHorizontalCardsInOpponentField` abaixo) - o mesmo mismatch
 * deixava um humano clicar num alvo que seria recusado em silêncio. Agora
 * exige que TODAS as cartas horizontais do slot estejam não batalhadas,
 * batendo exatamente com a regra real do motor.
 */
export function getUnbattledHorizontalSlots(field: [FieldSlot, FieldSlot, FieldSlot]): number[] {
  return field.reduce<number[]>((acc, slot, i) => {
    if (slot.horizontalCards.length > 0 && slot.horizontalCards.every((c) => !c.battled)) acc.push(i);
    return acc;
  }, []);
}

/** Índices de slots com carta virada ainda não revelada (alvo válido de Besta K - "antes de virar"). */
export function getUnrevealedFieldSlots(field: [FieldSlot, FieldSlot, FieldSlot]): number[] {
  return field.reduce<number[]>((acc, slot, i) => {
    if (slot.faceDownCard && !slot.revealed) acc.push(i);
    return acc;
  }, []);
}

/** Índices de qualquer slot com carta virada (revelada ou não). */
export function getFilledFieldSlots(field: [FieldSlot, FieldSlot, FieldSlot]): number[] {
  return field.reduce<number[]>((acc, slot, i) => {
    if (slot.faceDownCard) acc.push(i);
    return acc;
  }, []);
}

/** Contexto usado tanto pela UI (para habilitar/desabilitar botões) quanto pelo motor (para validar de novo ao executar). */
export function getMagicActivationContext(state: GameState, player: PlayerNumber): MagicActivationContext {
  const playerState = state[playerKeyOf(player)];
  const opponentState = state[opponentKeyOf(player)];
  const opponent = opponentOf(player);

  return {
    discardPileLength: state.discardPile.length,
    eligibleDiscardForBestaJ: state.discardPile.filter((c) => isPlainNumeralCard(c)).length,
    hasCardsInOwnField: getFilledFieldSlots(playerState.field).length > 0,
    hasCardsInField: getFilledFieldSlots(playerState.field).length > 0 || getFilledFieldSlots(opponentState.field).length > 0,
    hasRevealedCardsInOpponentField: opponentState.field.some((slot) => slot.faceDownCard && slot.revealed),
    // FIX (auditoria completa do Mago - bug real encontrado): diferente de
    // `hasRevealedCardsInOpponentField` acima, este exclui slots protegidos
    // por Proteção Divina - é o que o gate da Substituição Arcana (Rainha)
    // do Mago realmente precisa, já que handleExecuteMagic rejeita um slot
    // do oponente revelado mas protegido.
    hasRevealedUnprotectedCardInOpponentField: opponentState.field.some(
      (slot, i) => slot.faceDownCard && slot.revealed && !isSlotProtected(state, opponent, i)
    ),
    // FIX (auditoria completa do Mago - bug real encontrado): agora também
    // exclui slots protegidos - único consumidor deste campo é o gate da
    // Destruição de Reforço (Rei) do Mago, que precisa exatamente disso.
    hasUnbattledHorizontalCardsInOpponentField: getUnbattledHorizontalSlots(opponentState.field).some(
      (i) => !isSlotProtected(state, opponent, i)
    ),
    handSize: playerState.hand.length,
    handLimit: playerState.handLimit,
    hasNumeralCardsInHand: playerState.hand.some((c) => isNumeralCard(c)),
    hasRevealedNumeralCardsInOpponentHand: opponentState.hand.some((c) => isNumeralCard(c) && c.revealed),
    hasUnrevealedCardInOwnField: getUnrevealedFieldSlots(playerState.field).length > 0,
    // FIX (auditoria completa da Besta - bug real encontrado): agora também
    // exclui slots protegidos - único consumidor deste campo é o gate do
    // Roubo Brutal (Rei) da Besta, que precisa exatamente disso (o alvo do
    // oponente nunca pode estar protegido - ver handleExecuteMagic).
    hasUnrevealedCardInOpponentField: getUnrevealedFieldSlots(opponentState.field).some((i) => !isSlotProtected(state, opponent, i)),
    // FIX (pedido do usuário: "mude o efeito da valete do anjo para 'compre
    // um Ás'") - true quando há um Ás no baralho OU na pilha de descarte
    // (pública, reembaralhada de volta se precisar - ver handleActivateSimpleMagic).
    // Um Ás já em alguma mão/campo/zona de Monstro não conta.
    hasAceAvailableToDraw: state.deck.some((c) => c.value === 'A') || state.discardPile.some((c) => c.value === 'A'),
    // Mosqueteiro (personagem novo, foco em descarte) - ver comentário
    // completo em MagicActivationContext (magicCards.ts).
    mosqueteiroRedirectActive: playerState.mosqueteiroRedirectNextDiscard,
    hasOwnHandCardBeyondSelf: playerState.hand.length > 1,
    hasOpponentHandCards: opponentState.hand.length > 0,
    hasRevealableOpponentCards:
      opponentState.hand.some((c) => !c.revealed) ||
      opponentState.field.some((slot) => (slot.faceDownCard && !slot.faceDownCard.revealed) || slot.horizontalCards.some((h) => !h.revealed)),
    // Piromante (personagem novo) - ver comentário completo em
    // MagicActivationContext (magicCards.ts).
    hasFireFuelInHand: playerState.hand.some((c) => isPlainNumeralCard(c) && getEffectiveCardValue(c) < 5),
    hasRevealedBurnableOpponentCard:
      opponentState.hand.some((c) => c.revealed && isNumeralCard(c)) ||
      opponentState.field.some((slot) => slot.horizontalCards.some((h) => h.revealed && isNumeralCard(h))),
    hasUnbattledHorizontalCardsInOpponentFieldForBurn: getUnbattledHorizontalSlots(opponentState.field).some(
      (i) => !isSlotProtected(state, opponent, i)
    ),
    canLaunchFireball: playerState.fireballValue > 0 && opponentState.field.some((slot) => Boolean(slot.faceDownCard) || slot.horizontalCards.length > 0),
  };
}

// ============================================================================
// Reducer principal
// ============================================================================

export function gameReducer(state: GameState, action: GameAction): GameState {
  // Modo de debug - passthrough puro, ANTES de qualquer guard de fase/janela
  // pendente abaixo (numeralSpellPending, pendingReaction etc.) de propósito:
  // um cenário de debug precisa poder substituir o estado mesmo no meio de
  // uma dessas janelas, não só entre elas. Ver comentário completo no tipo
  // 'DEBUG_FORCE_STATE' (definição de GameAction, acima).
  if (action.type === 'DEBUG_FORCE_STATE') return action.state;
  // FIX (pedido do usuário: "re-corrija o problema da besta dar softlock no
  // jogo quando faz a Magia Numeral") - handleToggleReady já bloqueava a SI
  // MESMA durante a janela de ~3s entre ativar uma Magia Numeral e
  // handleFinalizeNumeralSpell rodar de fato (ver comentário lá), mas
  // QUALQUER outra ação que mexe em mão/campo durante essa janela corrompe o
  // estado pendente do mesmo jeito - inclusive ativar uma SEGUNDA Magia
  // Numeral (do OUTRO jogador): handleActivateNumeralSpell esvazia o campo
  // do oponente como parte da própria ativação, então é bem comum o
  // oponente também já ter 3 cartas iguais + campo vazio bem nesse instante
  // - se ele ativar a dele também, `numeralSpellPending` é sobrescrito com
  // os dados DELE, e quando o timer de 3s do PRIMEIRO jogador chamar
  // FINALIZE_NUMERAL_SPELL, ele finaliza o efeito ERRADO - o primeiro
  // jogador fica com as 3 cartas da própria ativação paradas no campo pra
  // sempre, sem nunca ser descartadas nem destravar o turno dele. A Fúria
  // Sanguinária da Besta (que sempre esvazia o campo do oponente, igual às
  // outras, mas é a que o usuário mais reproduziu) não é a causa raiz
  // específica - é só o gatilho mais fácil de bater nessa janela. Bloqueado
  // aqui, de uma vez por todas, pra TODA ação que não seja a própria
  // finalização ou pausar/despausar - nunca confiar só na UI (o popup já
  // deveria impedir cliques por baixo, mas isso protege mesmo se algo
  // escapar, como já documentado no comentário de handleToggleReady).
  if (state.numeralSpellPending && action.type !== 'FINALIZE_NUMERAL_SPELL' && action.type !== 'TOGGLE_PAUSE') {
    return state;
  }
  // FIX (pedido do usuário, Modo Reações): "o jogo é pausado" - mesmo padrão
  // do guard de numeralSpellPending acima (pausa TOTAL, nenhuma outra ação
  // acontece) enquanto uma magia está anunciada aguardando a janela de 3s -
  // só a reação em si, a expiração da janela, ou pausar/despausar passam.
  if (state.pendingReaction && action.type !== 'REACT_TO_MAGIC' && action.type !== 'RESOLVE_PENDING_REACTION' && action.type !== 'TOGGLE_PAUSE') {
    return state;
  }
  switch (action.type) {
    case 'DRAW_CARDS':
      return handleDrawCards(state, action.player, action.count);
    case 'DISCARD_CARDS':
      return handleDiscardCards(state, action.player, action.cardIds);
    case 'FUSE_CARDS':
      return handleFuseCards(state, action.player, action.cardId1, action.cardId2);
    case 'PLAY_CARD':
      return handlePlayCard(state, action.player, action.cardId, action.slotIndex, action.asHorizontal);
    case 'RETURN_CARD_TO_HAND':
      return handleReturnCardToHand(state, action.player, action.slotIndex);
    case 'RETURN_HORIZONTAL_CARD_TO_HAND':
      return handleReturnHorizontalCardToHand(state, action.player, action.slotIndex, action.cardId);
    case 'SWAP_FIELD_CARD':
      return handleSwapFieldCard(state, action.player, action.cardId, action.slotIndex);
    case 'FORM_OR_REINFORCE_TOWER':
      return handleFormOrReinforceTower(state, action.player, action.slotIndex, action.cardIds);
    case 'TRANSFORM_ACE':
      return handleTransformAce(state, action.player, action.aceCardId, action.targetCardId);
    case 'ACTIVATE_SIMPLE_MAGIC':
      return maybeDeferForReaction(state, action, action.player, action.cardId, handleActivateSimpleMagic(state, action.player, action.cardId));
    case 'EXECUTE_MAGIC':
      return maybeDeferForReaction(state, action, action.player, action.cardId, handleExecuteMagic(state, action));
    case 'REACT_TO_MAGIC':
      return handleReactToMagic(state, action.player, action.cardId);
    case 'RESOLVE_PENDING_REACTION':
      return handleResolvePendingReaction(state);
    case 'PLACE_MONSTER_CARD':
      return handlePlaceMonsterCard(state, action.player, action.cardId);
    case 'ACTIVATE_MONSTER_EFFECT_SIMPLE':
      return handleActivateMonsterEffectSimple(state, action.player, action.targetSlotIndex, action.targetCardId);
    case 'EXECUTE_MAGO_MONSTER_EFFECT':
      return handleExecuteMagoMonsterEffect(state, action.player, action.targetSlotIndex, action.targetCardId);
    case 'TRANSFORM_CORINGA_MAGIC_CARD':
      return handleTransformCoringaMagicCard(state, action.player, action.cardId);
    case 'ACTIVATE_NUMERAL_SPELL':
      return handleActivateNumeralSpell(state, action.player);
    case 'FINALIZE_NUMERAL_SPELL':
      return handleFinalizeNumeralSpell(state);
    case 'SELECT_COMBAT_SLOT':
      return handleSelectCombatSlot(state, action.player, action.slotIndex);
    case 'RESOLVE_COMBAT':
      return handleResolveCombat(state, action.coringaQCopyTargetId);
    case 'FINALIZE_COMBAT':
      return handleFinalizeCombat(state);
    case 'TOGGLE_READY':
      return handleToggleReady(state, action.player);
    case 'TOGGLE_PAUSE':
      return { ...state, paused: !state.paused };
    case 'REMATCH':
      return createInitialState(state.player1Character, state.player2Character, state.gameConfig);
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Compra e descarte
// ---------------------------------------------------------------------------

/**
 * FIX (checagem extensa por bugs - divergência real encontrada): "compram 1
 * carta a mais" no Modo Towers precisa valer nos TRÊS lugares que calculam
 * quantas compras ainda restam no turno (o próprio motor aqui, a decisão de
 * compra da IA em aiPlayer.ts, e o rótulo/limite do botão "Comprar" em
 * PlayerZone.tsx) - antes só o motor somava o bônus; a IA e a UI humana
 * calculavam `drawLimit` sem o `+1` de Towers, então a IA nunca comprava a
 * carta extra a que tinha direito (perdendo valor de graça, sem nenhum erro
 * visível) e o botão/rótulo "Comprar" do jogador humano também ficava 1
 * carta aquém do que o motor de fato permitiria. Só tem efeito prático
 * quando o limite de compra por turno está ligado (sem ele, a compra já é
 * livre até a mão encher, então +1 aqui seria um no-op).
 */
export function getEffectiveDrawLimit(gameConfig: Pick<GameConfig, 'drawLimit' | 'towersMode'>): number {
  return gameConfig.drawLimit + (gameConfig.towersMode ? 1 : 0);
}

function handleDrawCards(state: GameState, player: PlayerNumber, count: number): GameState {
  if (state.phase !== 'draw') return state;
  const playerKey = playerKeyOf(player);
  const playerState = state[playerKey];
  if (playerState.hand.length >= playerState.handLimit) return state;

  // FIX (pedido do usuário: "opção no pré-jogo de limite de compra de
  // cartas... funcionando de forma similar a de descarte") - quando
  // habilitado, a compra normal (esta função) nunca pode ultrapassar
  // `gameConfig.drawLimit` cartas somadas NESTE turno, além do limite de mão
  // já existente. Nunca afeta cartas ganhas por efeito de magia (esses
  // caminhos não passam por aqui - ver handleExecuteMagic/
  // handleActivateSimpleMagic).
  const effectiveDrawLimit = getEffectiveDrawLimit(state.gameConfig);
  const drawLimitRemaining = state.gameConfig.drawLimitEnabled
    ? Math.max(0, effectiveDrawLimit - playerState.drawsThisTurn)
    : Infinity;
  if (drawLimitRemaining <= 0) {
    return { ...state, log: appendLog(state, state.log, 'warning', `Limite de ${effectiveDrawLimit} compra(s) por turno atingido!`) };
  }

  const { deck: ensuredDeck, discardPile: ensuredDiscard, reshuffled } = ensureDeckHasCards(state);

  let log = state.log;
  if (reshuffled) {
    log = appendLog(state, log, 'system', `O baralho esgotou - a pilha de descarte foi reembaralhada de volta`);
  }

  const maxCanDraw = playerState.handLimit - playerState.hand.length;
  const actualCount = Math.min(count, maxCanDraw, ensuredDeck.length, drawLimitRemaining);
  if (actualCount <= 0) {
    return { ...state, deck: ensuredDeck, discardPile: ensuredDiscard, log };
  }

  let { drawn, remaining } = drawCards(ensuredDeck, actualCount);

  // Efeito da Magia Numeral do Mago: revela cartas compradas pelo oponente.
  // FIX (item 12 da 5ª rodada): checa o slot do OPONENTE especificamente no
  // mapa por jogador (ver comentário de `activeNumeralSpells` em GameState) -
  // antes, com um único slot global, isso já funcionava por acaso quando só
  // um dos dois jogadores era Mago, mas quebrava (efeito de um jogador
  // cancelando o do outro) no caso Mago vs Mago.
  if (state.activeNumeralSpells[opponentOf(player)]?.character === 'mago') {
    drawn = drawn.map((c) => ({ ...c, revealed: true }));
    log = appendLog(state, log, 'numeral-spell', `Cartas de Jogador ${player} foram reveladas pela Magia Numeral`, { player });
  }

  // FIX (item 16): a Fúria Sanguinária da Besta deixou de ser um filtro que
  // agia por cima de cada compra normal (o efeito antigo só descartava as
  // cartas >6 recém-compradas, algo fraco e raramente perceptível) e virou um
  // efeito único e imediato aplicado no momento em que a magia numeral é
  // ativada (ver handleFinalizeNumeralSpell): o oponente descarta a mão
  // inteira e compra de volta mais de 6 cartas de uma vez. Por isso não há
  // mais nenhum tratamento especial da Besta aqui em handleDrawCards.
  log = appendLog(state, log, 'draw', `Jogador ${player} comprou ${actualCount} carta(s)`, { player });

  return {
    ...state,
    deck: remaining,
    discardPile: ensuredDiscard,
    log,
    [playerKey]: {
      ...playerState,
      hand: [...playerState.hand, ...drawn],
      drawsThisTurn: playerState.drawsThisTurn + actualCount,
    },
  };
}

/**
 * FIX (checagem extensa por bugs - mesma divergência real do
 * getEffectiveDrawLimit acima, achada ao auditar este handler em seguida):
 * "podem descartar 1 carta a mais" no Modo Towers também precisava valer nos
 * TRÊS lugares (motor, decisão de descarte da IA em aiPlayer.ts, e o
 * botão/rótulo de descarte em PlayerZone.tsx) - só o motor somava o bônus, a
 * IA e a UI humana usavam `discardLimit` cru.
 */
export function getEffectiveDiscardLimit(gameConfig: Pick<GameConfig, 'discardLimit' | 'towersMode'>): number {
  return gameConfig.discardLimit + (gameConfig.towersMode ? 1 : 0);
}

function handleDiscardCards(state: GameState, player: PlayerNumber, cardIds: string[]): GameState {
  if (state.phase !== 'draw') return state;
  // FIX (pedido do usuário: "opção do pré-jogo para decidir o limite de
  // cartas que podem serem descartadas por turno... com o mínimo sendo 4
  // como no jogo normal") - `gameConfig.discardLimit` no lugar do antigo "4"
  // fixo (o próprio config já garante mínimo 4 - ver MIN_DISCARD_LIMIT em
  // gameConfig.ts e o clamp no seletor em GameConfig.tsx).
  const discardLimit = getEffectiveDiscardLimit(state.gameConfig);
  if (cardIds.length === 0 || cardIds.length > discardLimit) return state;

  const playerKey = playerKeyOf(player);
  const playerState = state[playerKey];

  if (playerState.discardsThisTurn + cardIds.length > discardLimit) {
    return { ...state, log: appendLog(state, state.log, 'warning', `Limite de ${discardLimit} descartes por turno atingido!`) };
  }

  // Cartas reveladas nunca podem ser descartadas, mesmo que o chamador tente.
  const idsSet = new Set(cardIds);
  const discardable = playerState.hand.filter((c) => idsSet.has(c.id) && !c.revealed);
  if (discardable.length === 0) return state;

  const discardableIds = new Set(discardable.map((c) => c.id));
  const newHand = playerState.hand.filter((c) => !discardableIds.has(c.id));

  const { deck, discardPile } = pushToDiscard(state, discardable);
  const log = appendLog(state, state.log, 'discard', `Jogador ${player} descartou ${discardable.length} carta(s)`, { player });

  return {
    ...state,
    deck,
    discardPile,
    log,
    [playerKey]: {
      ...playerState,
      hand: newHand,
      discardsThisTurn: playerState.discardsThisTurn + discardable.length,
    },
  };
}

/**
 * FIX (pedido do usuário: variante "Fusão") - junta 2 cartas numerais puras
 * da mão em 1 carta nova valendo a soma das duas (ver computeFusionResult em
 * fusion.ts para a tabela completa de valores). O id da carta nova é
 * determinístico (`fused-<id1>-<id2>`) - as duas cartas de origem deixam de
 * existir como candidatas a qualquer coisa assim que são consumidas aqui,
 * então esse par de ids nunca se repete na mesma partida, garantindo
 * unicidade sem precisar de um contador global à parte.
 */
function handleFuseCards(state: GameState, player: PlayerNumber, cardId1: string, cardId2: string): GameState {
  if (!state.gameConfig.fusion) return state;
  const playerKey = playerKeyOf(player);
  const playerState = state[playerKey];
  const card1 = playerState.hand.find((c) => c.id === cardId1);
  const card2 = playerState.hand.find((c) => c.id === cardId2);

  if (
    !canFuseCards(
      state.phase,
      state.gameConfig.fusion,
      playerState.fusesThisTurn,
      state.gameConfig.fusionLimit,
      state.gameConfig.monsterCards,
      card1,
      card2
    )
  ) {
    return state;
  }

  const result = computeFusionResult(card1!, card2!);
  // FIX (pedido do usuário: "quando uma carta fusionada é descartada... vai
  // pro discarte as duas... (ou mais caso tenha havido múltiplas fusões)")
  // - guarda as cartas ORIGINAIS (nunca fundidas) que compõem esta carta,
  // já achatadas: se card1/card2 já forem, elas mesmas, resultado de uma
  // fusão anterior, usa as folhas originais delas (fusionSources), nunca a
  // carta intermediária - assim uma refusão em cadeia sempre aponta direto
  // para as cartas físicas reais do baralho (ver expandFusedCard em
  // cardUtils.ts, usado no descarte).
  const fusionSources = [
    ...(card1!.fusionSources && card1!.fusionSources.length > 0 ? card1!.fusionSources : [card1!]),
    ...(card2!.fusionSources && card2!.fusionSources.length > 0 ? card2!.fusionSources : [card2!]),
  ];
  // FIX (pedido do usuário: "permita o jogador de fusionar 2 ÁS para obter
  // um monstro") - o resultado especial de 2 Áses é uma carta Monstro de
  // verdade (mesmos campos usados na criação do baralho - ver
  // createInitialDeck em cardUtils.ts), não uma carta numérica/de magia
  // normal.
  const fusedCard: Card = result.isMonster
    ? {
        id: `fused-${cardId1}-${cardId2}`,
        value: 'JOKER',
        suit: '🃏',
        isMonster: true,
        monsterUsed: false,
        revealed: true,
        fused: true,
        fusionSources,
      }
    : {
        id: `fused-${cardId1}-${cardId2}`,
        value: result.value,
        suit: card1!.suit,
        revealed: true,
        fused: true,
        fusionSources,
      };

  const consumedIds = new Set([cardId1, cardId2]);
  const newHand = [...playerState.hand.filter((c) => !consumedIds.has(c.id)), fusedCard];

  const resultLabel = result.isMonster
    ? 'Carta Monstro'
    : result.isMagic || result.value === 'A'
    ? fusedCard.value
    : `${fusedCard.value}${fusedCard.suit}`;
  const log = appendLog(
    state,
    state.log,
    'fusion',
    `Jogador ${player} fundiu ${card1!.value}${card1!.suit} + ${card2!.value}${card2!.suit} (${result.sum}) em ${resultLabel}`,
    { player }
  );

  return {
    ...state,
    log,
    [playerKey]: {
      ...playerState,
      hand: newHand,
      fusesThisTurn: playerState.fusesThisTurn + 1,
    },
  };
}

// ---------------------------------------------------------------------------
// Posicionar / recolher cartas do campo
// ---------------------------------------------------------------------------

function handlePlayCard(state: GameState, player: PlayerNumber, cardId: string, slotIndex: number, asHorizontal: boolean): GameState {
  if (state.phase !== 'strategy') return state;
  const playerKey = playerKeyOf(player);
  const playerState = state[playerKey];
  const card = playerState.hand.find((c) => c.id === cardId);
  if (!card) return state;

  // Coringa (redesenho completo, pedido do usuário): diferente de todos os
  // outros personagens, suas cartas de magia (J/Q/K) e Monstro NÃO ativam
  // efeito nenhum "na mão" - elas são POSICIONADAS no campo como armadilhas,
  // cada uma numa posição fixa (Valete só horizontal, Rainha/Rei só
  // principal, Monstro em qualquer uma - ver comentário completo em
  // isCoringaTrapCard/coringaFieldPlacementSlotKind, cardUtils.ts) e só
  // revelam seu efeito de verdade quando reveladas de fato (na Estratégia
  // por um efeito do oponente, ou no Combate ao serem selecionadas - ver
  // triggerCoringaStrategyRevealTrap/handleResolveCombat).
  const character = characterOf(state, player);
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
  if (!isCoringaTrapCard) {
    // FIX: Cartas mágicas (J, Q, K) de qualquer OUTRO personagem nunca podem
    // ser posicionadas no campo como carta comum - elas só saem da mão
    // ativando seu efeito de magia. Não se aplica a uma carta do Coringa já
    // transformada (`isCoringaTransformedCard`) - mesmo com `.value` ainda
    // 'J'/'Q'/'K', ela já é uma carta numeral de verdade agora.
    if (!isCoringaTransformedCard && (card.value === 'J' || card.value === 'Q' || card.value === 'K')) {
      return { ...state, log: appendLog(state, state.log, 'warning', `Cartas mágicas só podem ser usadas ativando sua magia, não posicionadas no campo!`) };
    }

    // FIX (itens 4 e 7 da 3ª rodada): cartas Monstro de qualquer OUTRO
    // personagem não podem ocupar um dos 3 slots de combate como se fossem
    // uma carta comum - esse era exatamente o bug do item 4 (a IA, e a
    // interface em geral, tratava o Monstro como uma carta Normal/Ás,
    // lutando em combate com valor 0). Elas só podem ir para sua zona
    // própria (ver PLACE_MONSTER_CARD).
    if (card.isMonster) {
      return { ...state, log: appendLog(state, state.log, 'warning', `Cartas Monstro só podem ser posicionadas na sua zona própria, não em um slot de combate!`) };
    }
  } else {
    // Valete: SÓ pode ir como horizontal ("Esta carta pode ser posicionada
    // como horizontal em uma carta sua"). Rainha/Rei: SÓ como carta
    // principal ("posicionada como uma carta normal"/"virada no seu
    // campo"). Monstro (tratado como um "15"): qualquer uma das duas,
    // igual a uma carta numeral comum.
    if (card.value === 'J' && !asHorizontal) {
      return { ...state, log: appendLog(state, state.log, 'warning', `O Valete do Coringa só pode ser posicionado como carta horizontal!`) };
    }
    if ((card.value === 'Q' || card.value === 'K') && asHorizontal) {
      return { ...state, log: appendLog(state, state.log, 'warning', `Esta carta do Coringa só pode ser posicionada como carta principal, não horizontal!`) };
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
    newField[slotIndex] = { ...newField[slotIndex], horizontalCards: [...newField[slotIndex].horizontalCards, card] };
    log = appendLog(state, log, 'field', `Jogador ${player} posicionou uma carta ${card.revealed ? 'revelada ' : ''}horizontal no slot ${slotIndex + 1}`, { player });
  } else {
    if (newField[slotIndex].faceDownCard) return state;

    const shouldReveal = card.transformedValue !== undefined || card.revealed === true;
    newField[slotIndex] = {
      ...newField[slotIndex],
      faceDownCard: shouldReveal ? { ...card, revealed: true } : card,
      revealed: shouldReveal,
    };
    log = appendLog(state, log, 'field', `Jogador ${player} posicionou uma carta ${shouldReveal ? 'revelada ' : ''}no slot ${slotIndex + 1}`, { player });
  }

  return { ...state, log, [playerKey]: { ...playerState, hand: newHand, field: newField } };
}

function handleReturnCardToHand(state: GameState, player: PlayerNumber, slotIndex: number): GameState {
  if (state.phase !== 'strategy') return state;
  const playerKey = playerKeyOf(player);
  const playerState = state[playerKey];
  const slot = playerState.field[slotIndex];
  if (!slot.faceDownCard) return state;

  // FIX: ao devolver a carta principal do slot para a mão, quaisquer cartas
  // horizontais empilhadas nele também precisam voltar - antes elas ficavam
  // "orfãs" no slot (sem carta principal, mas ainda com horizontalCards),
  // um estado inconsistente que nenhuma outra parte do motor esperava.
  // FIX (Modo Towers, pedido do usuário): idem para a reserva da torre - sem
  // isso, devolver o topo de uma torre pra mão perderia as cartas empilhadas
  // por baixo para sempre (nunca voltariam pra lugar nenhum).
  const newHand = [...playerState.hand, slot.faceDownCard, ...(slot.towerReserve ?? []), ...slot.horizontalCards];
  const newField = [...playerState.field] as [FieldSlot, FieldSlot, FieldSlot];
  newField[slotIndex] = { ...newField[slotIndex], faceDownCard: undefined, horizontalCards: [], towerReserve: undefined, revealed: false };

  const log = appendLog(state, state.log, 'field', `Jogador ${player} retornou carta do slot ${slotIndex + 1} para a mão`, { player });

  return {
    ...state,
    log,
    [playerKey]: {
      ...playerState,
      hand: newHand,
      field: newField,
      // A torre deste jogador (se era esta) deixou de existir - libera o
      // slot pra poder virar uma torre nova neste mesmo turno, se quiser.
      towerSlotThisTurn: playerState.towerSlotThisTurn === slotIndex ? undefined : playerState.towerSlotThisTurn,
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
function handleReturnHorizontalCardToHand(state: GameState, player: PlayerNumber, slotIndex: number, cardId: string): GameState {
  if (state.phase !== 'strategy') return state;
  const playerKey = playerKeyOf(player);
  const playerState = state[playerKey];
  const slot = playerState.field[slotIndex];
  const card = slot.horizontalCards.find((c) => c.id === cardId);
  if (!card) return state;

  const newHand = [...playerState.hand, card];
  const newField = [...playerState.field] as [FieldSlot, FieldSlot, FieldSlot];
  newField[slotIndex] = { ...newField[slotIndex], horizontalCards: newField[slotIndex].horizontalCards.filter((c) => c.id !== cardId) };

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
function handleSwapFieldCard(state: GameState, player: PlayerNumber, cardId: string, slotIndex: number): GameState {
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
  if (isTowerSlot(slot)) return state;

  const oldCard = slot.faceDownCard;
  const newHand = [...playerState.hand.filter((c) => c.id !== cardId), oldCard];
  const newField = [...playerState.field] as [FieldSlot, FieldSlot, FieldSlot];

  const shouldReveal = card.transformedValue !== undefined || card.revealed === true;
  newField[slotIndex] = {
    ...newField[slotIndex],
    faceDownCard: shouldReveal ? { ...card, revealed: true } : card,
    revealed: shouldReveal,
  };

  const log = appendLog(
    state,
    state.log,
    'field',
    `Jogador ${player} trocou a carta do slot ${slotIndex + 1} por outra da mão`,
    { player }
  );

  return { ...state, log, [playerKey]: { ...playerState, hand: newHand, field: newField } };
}

// ---------------------------------------------------------------------------
// Modo Towers
// ---------------------------------------------------------------------------

/**
 * Valor efetivo "elegível pra torre" de uma carta: numeral pura (2-10) ou
 * Ás (transformado ou cru - um Ás cru vale 14, como sempre) - NUNCA magia
 * (J/Q/K) nem Monstro. Reaproveita `getEffectiveCardValue` (já resolve Ás
 * transformado) - `null` quando a carta não é elegível de jeito nenhum.
 */
export function towerEligibleValue(card: Card): number | null {
  if (card.value === 'J' || card.value === 'Q' || card.value === 'K' || card.isMonster) return null;
  return getEffectiveCardValue(card);
}

/**
 * Verifica se `player` pode formar/reforçar uma torre em `slotIndex` com as
 * cartas `cardIds` da própria mão - espelha exatamente a mesma checagem de
 * handleFormOrReinforceTower (nunca confiar só na UI), usada também por
 * FieldSlotView.tsx/GameBoard.tsx pra mostrar o botão "Towers" só quando faz
 * sentido, e por aiPlayer.ts pra decidir a mesma coisa pela IA.
 *
 * Regras (pedido do usuário, "recapitulando o Towers"):
 * - Só na fase de Estratégia, com o Modo Towers ligado nesta partida.
 * - Todas as cartas selecionadas precisam existir na mão do jogador, ser
 *   elegíveis (numeral 2-10 ou Ás) e ter o MESMO valor efetivo entre si.
 * - CRIAR uma torre nova (o slot ainda não é torre neste turno): precisa de
 *   2+ cartas selecionadas, e o slot precisa estar vazio OU já ter uma carta
 *   comum (não torre) de valor igual (ela é absorvida) - sem nenhuma carta
 *   horizontal already ali. Também precisa ser o PRIMEIRO slot que este
 *   jogador tenta virar torre neste turno (towerSlotThisTurn ainda não
 *   aponta pra outro slot).
 * - REFORÇAR uma torre já formada por este jogador neste turno (o slot já É
 *   torre e `towerSlotThisTurn` já aponta pra ele): basta 1+ carta
 *   selecionada, valor igual ao topo atual da torre.
 */
export function canFormOrReinforceTower(state: GameState, player: PlayerNumber, slotIndex: number, cardIds: string[]): boolean {
  if (state.phase !== 'strategy' || !state.gameConfig.towersMode) return false;
  if (cardIds.length === 0) return false;

  const playerState = state[playerKeyOf(player)];
  const slot = playerState.field[slotIndex];
  const selected = cardIds.map((id) => playerState.hand.find((c) => c.id === id)).filter((c): c is Card => Boolean(c));
  if (selected.length !== cardIds.length) return false; // algum id não existe na mão - nunca confiar só na UI

  const values = selected.map(towerEligibleValue);
  if (values.some((v) => v === null)) return false;
  const targetValue = values[0];
  if (!values.every((v) => v === targetValue)) return false;

  const alreadyMyTower = playerState.towerSlotThisTurn === slotIndex && isTowerSlot(slot);
  if (alreadyMyTower) {
    return getEffectiveCardValue(slot.faceDownCard!) === targetValue;
  }

  // Ainda não é minha torre neste turno - só pode CRIAR se eu não tiver
  // comprometido outro slot como torre ainda neste turno.
  if (playerState.towerSlotThisTurn !== undefined && playerState.towerSlotThisTurn !== slotIndex) return false;
  if (cardIds.length < 2) return false;
  if (slot.horizontalCards.length > 0) return false;
  if (!slot.faceDownCard) return true; // slot vazio
  // Slot com carta comum (não torre) de valor igual - absorvível.
  return !isTowerSlot(slot) && getEffectiveCardValue(slot.faceDownCard) === targetValue;
}

function handleFormOrReinforceTower(state: GameState, player: PlayerNumber, slotIndex: number, cardIds: string[]): GameState {
  if (!canFormOrReinforceTower(state, player, slotIndex, cardIds)) return state;

  const playerKey = playerKeyOf(player);
  const playerState = state[playerKey];
  const slot = playerState.field[slotIndex];
  const selectedSet = new Set(cardIds);
  const selectedCards = playerState.hand.filter((c) => selectedSet.has(c.id));
  const newHand = playerState.hand.filter((c) => !selectedSet.has(c.id));

  // Junta tudo que vai compor a torre: o que já estava no slot (reserva +
  // topo, se já era torre; ou só o topo, se era uma carta comum absorvida) +
  // as cartas recém-selecionadas - sempre reveladas (uma torre nasce e
  // permanece sempre revelada). O ÚLTIMO elemento vira o novo topo
  // (`faceDownCard`); todo o resto vira a reserva por baixo dele - a ordem
  // entre cartas de mesmo valor não importa em nada (todas são
  // intercambiáveis pro valor de combate).
  const combined = [
    ...(slot.towerReserve ?? []),
    ...(slot.faceDownCard ? [slot.faceDownCard] : []),
    ...selectedCards,
  ].map((c) => ({ ...c, revealed: true }));
  const newTop = combined[combined.length - 1];
  const newReserve = combined.slice(0, -1);

  const newField = [...playerState.field] as [FieldSlot, FieldSlot, FieldSlot];
  newField[slotIndex] = { ...slot, faceDownCard: newTop, towerReserve: newReserve, revealed: true };

  const isNewTower = !isTowerSlot(slot);
  const totalValue = combined.reduce((sum, c) => sum + getEffectiveCardValue(c), 0);
  const log = appendLog(
    state,
    state.log,
    'field',
    isNewTower
      ? `Jogador ${player} formou uma torre no slot ${slotIndex + 1} (${combined.length} cartas, valor ${totalValue})`
      : `Jogador ${player} reforçou a torre do slot ${slotIndex + 1} (${combined.length} cartas, valor ${totalValue})`,
    { player }
  );

  return {
    ...state,
    log,
    [playerKey]: {
      ...playerState,
      hand: newHand,
      field: newField,
      towerSlotThisTurn: slotIndex,
    },
  };
}

function handleTransformAce(state: GameState, player: PlayerNumber, aceCardId: string, targetCardId: string): GameState {
  if (state.phase !== 'strategy') return state;
  if (aceCardId === targetCardId) return state;
  const playerKey = playerKeyOf(player);
  const playerState = state[playerKey];
  const ace = playerState.hand.find((c) => c.id === aceCardId);
  // FIX (pedido do usuário: "remova a possibilidade de re-transformar Ás...
  // depois que transforma uma vez, não é pra poder re-transformar em outra
  // carta") - reverte um pedido ANTERIOR que removia esta trava de propósito
  // (permitindo re-transformar quantas vezes o jogador quisesse). Agora, de
  // novo, um Ás que já tem `transformedValue` definido nunca pode ser
  // transformado de novo - a transformação é definitiva assim que
  // acontece, pelo resto da partida (a UI também já bloqueia isso - ver
  // PlayingCard.tsx/HandCardView.tsx -, mas nunca confiar só nela).
  if (!ace || ace.value !== 'A' || ace.transformedValue !== undefined) return state;

  // FIX (item 19): o alvo da transformação agora pode ser tanto uma carta na
  // mão quanto uma carta já posicionada (faceDownCard) no próprio campo -
  // antes só cartas na mão eram aceitas, mesmo que o Ás já estivesse em
  // campo (o que tornava a transformação de um Ás já posicionado impossível
  // na prática, já que a mão pode não ter mais nenhuma carta apropriada).
  const targetInHand = playerState.hand.find((c) => c.id === targetCardId);
  const targetSlotIndex = playerState.field.findIndex((s) => s.faceDownCard?.id === targetCardId);
  const targetCard = targetInHand ?? (targetSlotIndex !== -1 ? playerState.field[targetSlotIndex].faceDownCard : undefined);
  if (!targetCard) return state;
  // FIX (mesmo pedido acima): um Ás JÁ transformado agora é um alvo/referência
  // válido (na prática já "é" um número normal - só falta copiar o valor
  // dele) - só um Ás CRU continua inválido como alvo (não tem valor nenhum
  // definido pra copiar). Antes `targetCard.value === 'A'` rejeitava os dois
  // casos por igual, o que também travava a IA: com 2+ Áses na mão e nenhuma
  // carta numeral "de verdade", depois de transformar o 1º Ás ela não tinha
  // mais nenhum alvo válido pra transformar o 2º (que ficava cru, lutando
  // sempre como 14).
  // FIX (checagem extensa por bugs - consolidação de regra duplicada):
  // extraído para `isValidAceTransformTarget` (cardUtils.ts) - a MESMA função
  // que aiPlayer.ts agora usa pra filtrar candidatos, em vez de cada lado ter
  // sua própria cópia da regra (ver o comentário completo lá).
  if (!isValidAceTransformTarget(targetCard)) return state;

  const targetValue = getEffectiveCardValue(targetCard);
  const newHand = playerState.hand.map((c) => {
    if (c.id === aceCardId) return { ...c, transformedValue: targetValue, revealed: true };
    if (c.id === targetCardId) return { ...c, revealed: true };
    return c;
  });

  let newField = playerState.field;
  if (targetSlotIndex !== -1 && !targetInHand) {
    newField = playerState.field.map((s, i) =>
      i === targetSlotIndex && s.faceDownCard ? { ...s, faceDownCard: { ...s.faceDownCard, revealed: true }, revealed: true } : s
    ) as [FieldSlot, FieldSlot, FieldSlot];
  }

  // FIX (mesmo pedido acima): `getDisplayValue` em vez de `targetCard.value`
  // cru - se o alvo for, ele mesmo, um Ás já transformado (ex.: em "9"), o
  // log mostra "9♦" (o que a carta realmente representa agora), não "A♦"
  // (o que confundiria, já que ela não luta mais como um Ás cru).
  const log = appendLog(state, state.log, 'ace', `Jogador ${player} transformou Ás em ${targetValue} (${getDisplayValue(targetCard)}${targetCard.suit})`, { player, cardValue: 'A' });

  return { ...state, log, [playerKey]: { ...playerState, hand: newHand, field: newField } };
}

// ---------------------------------------------------------------------------
// Magias (J, Q, K)
// ---------------------------------------------------------------------------

function handleActivateSimpleMagic(state: GameState, player: PlayerNumber, cardId: string): GameState {
  const playerKey = playerKeyOf(player);
  const playerState = state[playerKey];
  const card = playerState.hand.find((c) => c.id === cardId);
  if (!card || (card.value !== 'J' && card.value !== 'K')) return state;
  const character = characterOf(state, player);

  // Anjo J - Benção Divina (fase de compra): FIX (pedido do usuário: "mude o
  // efeito da valete do anjo para 'compre um Ás'") - o efeito antigo
  // (aumentar o limite de mão permanentemente + comprar 2 cartas aleatórias)
  // foi substituído por um efeito novo e simples: busca um Ás específico no
  // baralho (reembaralhando TODO o descarte de volta primeiro, se nenhum Ás
  // estiver no baralho no momento) e coloca ele direto na mão - uma compra
  // garantida, não aleatória. `permanentDrawBonus`/`handLimit` não são mais
  // tocados por esta magia (continuam existindo só para a Magia Numeral do
  // Anjo, Benção Eterna - uma habilidade totalmente separada, inalterada).
  if (character === 'anjo' && card.value === 'J' && state.phase === 'draw') {
    if (!canActivateMagic(state.phase, character, 'J', getMagicActivationContext(state, player))) return state;
    const newHand = playerState.hand.filter((c) => c.id !== cardId);

    let deck = state.deck;
    let discardPile = state.discardPile;
    let aceIndex = deck.findIndex((c) => c.value === 'A');
    if (aceIndex === -1 && discardPile.length > 0) {
      const reshuffled = reshuffleDiscardIntoDeck(deck, discardPile, 'all');
      deck = reshuffled.deck;
      discardPile = reshuffled.discardPile;
      aceIndex = deck.findIndex((c) => c.value === 'A');
    }

    // Guarda de segurança - não deveria acontecer (canActivateMagic já exige
    // `hasAceAvailableToDraw`), mas nunca confia só na UI: sem nenhum Ás
    // alcançável (todos já em jogo em mãos/campos/zonas de Monstro), o
    // Valete é gasto sem efeito, com aviso no log.
    if (aceIndex === -1) {
      const { deck: finalDeck, discardPile: finalDiscard } = pushToDiscard({ deck, discardPile, gameConfig: state.gameConfig }, [card]);
      const log = appendLog(state, state.log, 'warning', `Nenhum Ás disponível pra comprar agora!`);
      return { ...state, deck: finalDeck, discardPile: finalDiscard, log, [playerKey]: { ...playerState, hand: newHand } };
    }

    const ace = deck[aceIndex];
    const remainingDeck = [...deck.slice(0, aceIndex), ...deck.slice(aceIndex + 1)];
    const { deck: finalDeck, discardPile: finalDiscard } = pushToDiscard({ deck: remainingDeck, discardPile, gameConfig: state.gameConfig }, [card]);
    const log = appendLog(state, state.log, 'magic', `Jogador ${player} comprou um Ás`, { player, cardValue: card.value });
    return {
      ...state,
      deck: finalDeck,
      discardPile: finalDiscard,
      log,
      [playerKey]: { ...playerState, hand: [...newHand, ace] },
    };
  }

  // Anjo K - Reforço Angelical (fase de estratégia): permite empilhar
  // horizontal. FIX (pedido do usuário): cada ativação soma +1 ao bônus
  // (`horizontalStackBonus`) em vez de só ligar um boolean - ativar de novo
  // (com um 2º, 3º... Rei na mão, no mesmo turno) agora realmente permite
  // mais uma carta horizontal a cada vez, sem teto.
  if (character === 'anjo' && card.value === 'K' && state.phase === 'strategy') {
    if (!canActivateMagic(state.phase, character, 'K', getMagicActivationContext(state, player))) return state;
    const newHand = playerState.hand.filter((c) => c.id !== cardId);
    const { deck, discardPile } = pushToDiscard(state, [card]);
    const newHorizontalStackBonus = playerState.horizontalStackBonus + 1;
    const log = appendLog(state, state.log, 'magic', `Jogador ${player} pode agora posicionar até ${1 + newHorizontalStackBonus} cartas horizontais neste turno`, { player, cardValue: card.value });
    return {
      ...state,
      deck,
      discardPile,
      log,
      [playerKey]: { ...playerState, hand: newHand, horizontalStackBonus: newHorizontalStackBonus },
    };
  }

  return state;
}

/** Piromante - teto da Bola de Fogo (30 no Modo Towers, 20 normalmente - pedido do usuário). */
export function getFireballCap(gameConfig: GameConfig): number {
  return gameConfig.towersMode ? 30 : 20;
}

/**
 * Piromante (personagem novo, "momento game design") - lança a Bola de Fogo
 * acumulada contra o campo do oponente. Compartilhada pelas 3 magias (J/Q/K
 * escolhendo "lançar" em vez do efeito próprio de alimentar - ver
 * MagicSelection.fireballLaunch) - a única diferença entre elas é QUAL carta
 * sai da mão do jogador antes de chamar esta função.
 *
 * Sem `piromanteSpreadArmed` (Magia Numeral "Chama Repartida" não ativa):
 * mira 1 slot só (`targetSlot`), reduzindo/obliterando pelo valor TOTAL da
 * Bola de Fogo.
 * Com `piromanteSpreadArmed`: mira os 3 slots do oponente de uma vez, cada
 * um recebendo só uma FRAÇÃO do valor (dividido por 3, arredondado pra
 * baixo - o resto da divisão se perde, mesmo trade-off "força concentrada
 * vs espalhada" descrito pelo usuário).
 *
 * Cada slot atingido: soma o valor de TUDO que está empilhado ali (carta
 * principal + reserva de torre, se houver + horizontal(is) - ver
 * isTowerSlot/FieldSlot). Se a fatia da Bola de Fogo for >= a esse total, o
 * slot inteiro é obliterado (fica vazio). Se for menor, todas as cartas de
 * lá saem (descartadas normalmente, são cartas REAIS) e uma única
 * carta-token nova (`isFireToken`, ver cardUtils.ts) com o valor restante
 * ocupa o lugar da carta principal - nunca vai pro descarte quando sai de
 * campo depois (ver pushToDiscard).
 *
 * Slots protegidos por Proteção Divina do Anjo (isSlotProtected) são
 * ignorados por completo (pedido do usuário: "bloqueia") - o fogo passa
 * por cima sem efeito nenhum ali, mas a Bola de Fogo é consumida do mesmo
 * jeito (o "tiro" foi dado, o alvo é que resistiu).
 */
function executeFireballLaunch(state: GameState, player: PlayerNumber, targetSlot: number | undefined): GameState {
  const playerKey = playerKeyOf(player);
  const opponentKey = opponentKeyOf(player);
  const opponent = opponentOf(player);
  const playerState = state[playerKey];
  const opponentState = state[opponentKey];
  const fireballValue = playerState.fireballValue;
  if (fireballValue <= 0) return state;

  const spread = playerState.piromanteSpreadArmed;
  const targets = spread ? [0, 1, 2] : targetSlot !== undefined ? [targetSlot] : [];
  if (targets.length === 0) return state;

  const perTargetValue = spread ? Math.floor(fireballValue / 3) : fireballValue;

  let newField = [...opponentState.field] as [FieldSlot, FieldSlot, FieldSlot];
  let deck = state.deck;
  let discardPile = state.discardPile;
  let log = state.log;

  for (const slotIndex of targets) {
    if (isSlotProtected(state, opponent, slotIndex)) {
      log = appendLog(state, log, 'magic', `A Bola de Fogo de Jogador ${player} não teve efeito no slot ${slotIndex + 1} de Jogador ${opponent} - protegido!`, { player, slotIndex });
      continue;
    }
    if (perTargetValue <= 0) continue;
    const slot = newField[slotIndex];
    const slotCards = [...(slot.faceDownCard ? [slot.faceDownCard] : []), ...(slot.towerReserve ?? []), ...slot.horizontalCards];
    if (slotCards.length === 0) continue;
    const slotTotal = slotCards.reduce((sum, c) => sum + getEffectiveCardValue(c), 0);

    const pushed = pushToDiscard({ deck, discardPile, gameConfig: state.gameConfig }, slotCards);
    deck = pushed.deck;
    discardPile = pushed.discardPile;

    if (perTargetValue >= slotTotal) {
      newField[slotIndex] = { revealed: false, horizontalCards: [] };
      log = appendLog(state, log, 'magic', `A Bola de Fogo de Jogador ${player} obliterou o slot ${slotIndex + 1} de Jogador ${opponent}!`, { player, slotIndex });
    } else {
      const remaining = slotTotal - perTargetValue;
      const tokenCard: Card = {
        id: `fire-token-p${player}-t${state.turn}-s${slotIndex}-v${fireballValue}`,
        value: 'FIRE',
        suit: '🔥',
        transformedValue: remaining,
        isFireToken: true,
        revealed: true,
      };
      newField[slotIndex] = { faceDownCard: tokenCard, revealed: true, horizontalCards: [] };
      log = appendLog(
        state,
        log,
        'magic',
        `A Bola de Fogo de Jogador ${player} reduziu o slot ${slotIndex + 1} de Jogador ${opponent} - restam ${remaining}`,
        { player, slotIndex }
      );
    }
  }

  return {
    ...state,
    deck,
    discardPile,
    log,
    [playerKey]: { ...playerState, fireballValue: 0, piromanteSpreadArmed: false },
    [opponentKey]: { ...opponentState, field: newField },
  };
}

function handleExecuteMagic(
  state: GameState,
  action: { player: PlayerNumber; cardId: string; character: CharacterId; magicType: MagicCardType; selection: MagicSelection }
): GameState {
  const { player, cardId, character, magicType, selection } = action;
  if (characterOf(state, player) !== character) return state;

  const playerKey = playerKeyOf(player);
  const opponentKey = opponentKeyOf(player);
  const opponent = opponentOf(player);
  const playerState = state[playerKey];
  const card = playerState.hand.find((c) => c.id === cardId);
  if (!card || card.value !== magicType) return state;

  if (!canActivateMagic(state.phase, character, magicType, getMagicActivationContext(state, player))) {
    return { ...state, log: appendLog(state, state.log, 'warning', `Essa magia não pode ser ativada agora`) };
  }

  const { selectedCards, selectedSlot, selectedTargetPlayer, selectedTargetSlot, selectedRevealCardIds } = selection;
  const handWithoutMagic = playerState.hand.filter((c) => c.id !== cardId);

  // ----- Mago J: Revelação Forçada -----
  if (character === 'mago' && magicType === 'J') {
    const targetId = selectedCards?.[0];
    if (!targetId) return state;
    const opponentState = state[opponentKey];
    const targetCard = opponentState.hand.find((c) => c.id === targetId);
    if (!targetCard) return state;

    // FIX (pedido do usuário: "isso tá incorreto... você PODE descartar uma
    // carta JÁ revelada, não só quando tiver todas") - a regra original era
    // "revelar uma carta já revelada não faz nada de útil, então só quando
    // TODA a mão do oponente já estivesse revelada a magia passava a
    // descartar" - mas o pedido original do usuário sempre foi mais simples:
    // qualquer carta JÁ revelada (de uma ativação anterior desta mesma
    // magia, não importa se o resto da mão ainda está oculto) pode ser
    // escolhida para descartar agora, em vez de exigir a mão inteira
    // revelada primeiro. Continua nunca sendo possível "revelar" (sem
    // efeito) uma carta que já está revelada - nesse caso ela é descartada.
    if (targetCard.revealed) {
      const newOpponentHand = opponentState.hand.filter((c) => c.id !== targetId);
      const { deck, discardPile } = pushToDiscard(state, [card, targetCard]);
      const log = appendLog(state, state.log, 'magic', `Jogador ${player} descartou ${targetCard.value}${targetCard.suit} de Jogador ${opponent}`, { player, cardValue: card.value });
      return {
        ...state,
        deck,
        discardPile,
        log,
        [playerKey]: { ...playerState, hand: handWithoutMagic },
        [opponentKey]: { ...opponentState, hand: newOpponentHand },
      };
    }

    const newOpponentHand = opponentState.hand.map((c) => (c.id === targetId ? { ...c, revealed: true } : c));
    const { deck, discardPile } = pushToDiscard(state, [card]);
    const log = appendLog(state, state.log, 'magic', `Jogador ${player} revelou ${targetCard.value}${targetCard.suit} de Jogador ${opponent}`, { player, cardValue: card.value });
    return {
      ...state,
      deck,
      discardPile,
      log,
      [playerKey]: { ...playerState, hand: handWithoutMagic },
      [opponentKey]: { ...opponentState, hand: newOpponentHand },
    };
  }

  // ----- Besta J: Recuperação Selvagem -----
  if (character === 'besta' && magicType === 'J') {
    // FIX (pedido do usuário): só pode recuperar cartas NUMERAIS puras
    // (2-10) da pilha de descarte - nunca magias (J/Q/K), o Monstro
    // (Coringa), nem o Ás (mesmo transformado). Antes qualquer id pedido era
    // aceito sem checar o tipo da carta, então dava pra "recuperar" qualquer
    // coisa do descarte com esta magia. Filtra aqui, nunca confiando só na
    // UI (mesmo princípio já documentado no topo de magicCards.ts).
    const eligibleDiscardIds = new Set(state.discardPile.filter((c) => isPlainNumeralCard(c)).map((c) => c.id));
    const requestedIds = (selectedCards ?? []).filter((id) => eligibleDiscardIds.has(id)).slice(0, 2);
    if (requestedIds.length === 0) return state;

    // FIX (pedido do usuário: "o efeito da valete da besta não está comprando
    // duas cartas quando a mão está cheia, é para aumentar o limite apenas
    // para o efeito quando ativado") - a Recuperação Selvagem sempre entrega
    // as até 2 cartas pedidas, mesmo que isso deixe a mão temporariamente
    // acima do `handLimit` normal (o limite volta a valer normalmente no
    // próximo descarte/compra - não é alterado de verdade, só não bloqueia
    // ESTE efeito específico). Antes a mão cheia podia zerar o efeito por
    // completo (idsToTake vazio), fazendo o Valete ser gasto sem dar nada.
    const idsToTakeSet = new Set(requestedIds);
    const cardsFromDiscard = state.discardPile.filter((c) => idsToTakeSet.has(c.id)).map((c) => ({ ...c, revealed: true }));
    const remainingDiscard = state.discardPile.filter((c) => !idsToTakeSet.has(c.id));

    let log = state.log;
    log = appendLog(state, log, 'magic', `Jogador ${player} pegou ${cardsFromDiscard.length} carta(s) do descarte`, { player, cardValue: card.value });

    const { deck, discardPile } = pushToDiscard({ deck: state.deck, discardPile: remainingDiscard, gameConfig: state.gameConfig }, [card]);

    return {
      ...state,
      deck,
      discardPile,
      log,
      [playerKey]: { ...playerState, hand: [...handWithoutMagic, ...cardsFromDiscard] },
    };
  }

  // ----- Mago Q: Substituição Arcana -----
  if (character === 'mago' && magicType === 'Q') {
    if (selectedSlot === undefined || !selectedCards?.[0]) return state;
    const targetPlayer = selectedTargetPlayer ?? player;
    const targetKey = playerKeyOf(targetPlayer);
    const targetState = state[targetKey];
    const targetSlot = targetState.field[selectedSlot];

    // Alvo precisa existir, e se for do oponente precisa estar revelado e não protegido
    if (!targetSlot.faceDownCard) return state;
    if (targetPlayer !== player) {
      if (!targetSlot.revealed) return state;
      if (isSlotProtected(state, targetPlayer, selectedSlot)) {
        return { ...state, log: appendLog(state, state.log, 'warning', `Esse slot está protegido por Proteção Divina!`) };
      }
    }

    // FIX (pedido do usuário): a carta numeral usada na troca agora também
    // pode vir da mão do OPONENTE, não só da própria - mas, nesse caso, só se
    // aquela carta específica já estiver revelada (a mesma regra "sua ou do
    // oponente se revelada" já usada acima para o alvo do campo, aplicada
    // agora também à origem da carta usada na troca). Sem essa checagem seria
    // possível usar qualquer carta da mão do oponente às cegas - o Mago só
    // tem controle sobre informação que ele mesmo já expôs.
    const opponentState = state[opponentKey];
    let sourceOwner: PlayerNumber = player;
    let cardToPlace = playerState.hand.find((c) => c.id === selectedCards[0]);
    if (!cardToPlace) {
      const opponentCard = opponentState.hand.find((c) => c.id === selectedCards[0] && c.revealed);
      if (opponentCard) {
        sourceOwner = opponent;
        cardToPlace = opponentCard;
      }
    }
    if (!cardToPlace || !isNumeralCard(cardToPlace)) return state;
    const sourceKey = playerKeyOf(sourceOwner);

    // FIX (Modo Towers, pedido do usuário: "Substituição Arcana vira uma
    // ferramenta anti-torre") - mirando uma torre, a troca normal não se
    // aplica: se o valor efetivo da carta trazida bate com o topo atual da
    // torre, ela FUNDE (vira o novo topo, o antigo desce pra reserva - a
    // torre cresce, nada volta pra mão nenhuma); se não bate, a carta trazida
    // NUNCA entra em jogo (fica intocada na mão de origem) e o efeito só
    // descasca o topo da torre pro descarte (a torre encolhe 1). Confirmado
    // com o usuário: efeito colateral intencional, não um bug - dá aos
    // personagens com magia de troca um jeito de sabotar uma torre grande do
    // adversário mesmo sem ter uma carta do número certo à mão.
    if (isTowerSlot(targetSlot)) {
      const reserve = targetSlot.towerReserve!;
      const topValue = getEffectiveCardValue(targetSlot.faceDownCard!);
      const incomingValue = getEffectiveCardValue(cardToPlace);
      const newTargetField = [...targetState.field] as [FieldSlot, FieldSlot, FieldSlot];
      let newPlayer1 = state.player1;
      let newPlayer2 = state.player2;
      // FIX: `handOf` lê o estado JÁ ACUMULADO (newPlayer1/newPlayer2), não
      // `state[key].hand` cru - essencial quando `sourceKey === playerKey`
      // (o caso mais comum: usar uma carta da PRÓPRIA mão na troca), senão o
      // filtro abaixo partiria da mão ORIGINAL (ainda com a Rainha usada
      // pra ativar a magia) e desfaria silenciosamente o `setHand(playerKey,
      // handWithoutMagic)` de baixo, deixando a Rainha "voltar" pra mão.
      const handOf = (key: PlayerKey) => (key === 'player1' ? newPlayer1.hand : newPlayer2.hand);
      const setHand = (key: PlayerKey, hand: Card[]) => {
        if (key === 'player1') newPlayer1 = { ...newPlayer1, hand };
        else newPlayer2 = { ...newPlayer2, hand };
      };
      const setField = (key: PlayerKey, field: [FieldSlot, FieldSlot, FieldSlot]) => {
        if (key === 'player1') newPlayer1 = { ...newPlayer1, field };
        else newPlayer2 = { ...newPlayer2, field };
      };
      setHand(playerKey, handWithoutMagic);

      if (incomingValue === topValue) {
        newTargetField[selectedSlot] = {
          ...targetSlot,
          faceDownCard: { ...cardToPlace, revealed: true },
          towerReserve: [...reserve, { ...targetSlot.faceDownCard!, revealed: true }],
          revealed: true,
        };
        setHand(sourceKey, handOf(sourceKey).filter((c) => c.id !== selectedCards[0]));
        setField(targetKey, newTargetField);
        const { deck, discardPile } = pushToDiscard(state, [card]);
        const log = appendLog(state, state.log, 'magic', `Jogador ${player} reforçou uma torre com uma carta revelada`, { player, cardValue: card.value });
        return { ...state, deck, discardPile, log, player1: newPlayer1, player2: newPlayer2 };
      }

      const newReserve = [...reserve];
      const newTop = newReserve.pop();
      newTargetField[selectedSlot] = { ...targetSlot, faceDownCard: newTop, towerReserve: newReserve, revealed: Boolean(newTop) };
      setField(targetKey, newTargetField);
      const { deck, discardPile } = pushToDiscard(state, [card, targetSlot.faceDownCard!]);
      const log = appendLog(state, state.log, 'magic', `Jogador ${player} descartou o topo de uma torre (a carta não bateu com o número)`, { player, cardValue: card.value });
      return { ...state, deck, discardPile, log, player1: newPlayer1, player2: newPlayer2 };
    }

    const oldCard = targetSlot.faceDownCard;
    const newTargetField = [...targetState.field] as [FieldSlot, FieldSlot, FieldSlot];
    newTargetField[selectedSlot] = { ...newTargetField[selectedSlot], faceDownCard: { ...cardToPlace, revealed: true }, revealed: true };

    const { deck, discardPile } = pushToDiscard(state, [card]);
    const log = appendLog(
      state,
      state.log,
      'magic',
      sourceOwner === player
        ? `Jogador ${player} substituiu carta no campo`
        : `Jogador ${player} substituiu carta no campo usando uma carta revelada da mão de Jogador ${opponent}`,
      { player, cardValue: card.value }
    );

    // FIX: alvo do campo (own/opponent) e dono da carta usada na troca
    // (own/opponent) agora são escolhas independentes - até 4 combinações
    // possíveis. Monta o novo estado dos dois jogadores passo a passo, cada
    // ajuste lendo o resultado já atualizado do passo anterior (importante
    // quando dois passos mexem na mesma mão, ex.: sourceKey === targetKey).
    let newPlayer1 = state.player1;
    let newPlayer2 = state.player2;
    const handOf = (key: PlayerKey) => (key === 'player1' ? newPlayer1.hand : newPlayer2.hand);
    const setHand = (key: PlayerKey, hand: typeof newPlayer1.hand) => {
      if (key === 'player1') newPlayer1 = { ...newPlayer1, hand };
      else newPlayer2 = { ...newPlayer2, hand };
    };
    const setField = (key: PlayerKey, field: typeof newPlayer1.field) => {
      if (key === 'player1') newPlayer1 = { ...newPlayer1, field };
      else newPlayer2 = { ...newPlayer2, field };
    };

    // 1. A carta Rainha usada para ativar a magia sempre sai da mão de quem ativou.
    setHand(playerKey, handWithoutMagic);
    // 2. A carta numeral usada na troca sai da mão de quem a possuía.
    setHand(sourceKey, handOf(sourceKey).filter((c) => c.id !== selectedCards[0]));
    // 3. O campo alvo recebe a carta numeral.
    setField(targetKey, newTargetField);
    // 4. A carta antiga do slot alvo volta para a mão de quem era dona do slot
    //    (não necessariamente quem ativou a magia nem quem cedeu a carta nova).
    // FIX (checagem extensa por bugs - interação Piromante x Mago): uma
    // carta-token de Bola de Fogo (`isFireToken`, ver cardUtils.ts) nunca
    // existiu no baralho de 54 cartas - ela precisa DESAPARECER ao sair do
    // campo (mesma regra que pushToDiscard já aplica em todo outro lugar),
    // nunca ir pra mão de ninguém. Sem esta checagem, Substituição Arcana
    // conseguia "resgatar" o token pra mão (e de lá, até jogá-lo de volta
    // ao campo como se fosse uma carta de verdade) - o único ponto de saída
    // de campo que não passava por pushToDiscard.
    if (oldCard && !oldCard.isFireToken) {
      setHand(targetKey, [...handOf(targetKey), oldCard]);
    }

    return {
      ...state,
      deck,
      discardPile,
      log,
      player1: newPlayer1,
      player2: newPlayer2,
    };
  }

  // ----- Besta Q: Troca Predatória -----
  // FIX (itens 12 e 18): o alvo agora pode ser tanto um slot do PRÓPRIO campo
  // quanto um slot já REVELADO (e não protegido) do campo do OPONENTE - antes
  // só o próprio campo era aceito, o que criava um beco sem saída na
  // interface sempre que `canActivateMagic` permitia ativar a magia porque
  // só o oponente tinha cartas em campo (o próprio jogador com campo vazio
  // não tinha nenhum slot próprio para oferecer como alvo).
  if (character === 'besta' && magicType === 'Q') {
    if (selectedSlot === undefined || !selectedCards?.[0]) return state;
    const targetPlayer = selectedTargetPlayer ?? player;
    const targetKey = playerKeyOf(targetPlayer);
    const targetState = state[targetKey];
    const targetSlot = targetState.field[selectedSlot];
    if (!targetSlot.faceDownCard) return state;
    if (targetPlayer !== player) {
      if (!targetSlot.revealed) return state;
      if (isSlotProtected(state, targetPlayer, selectedSlot)) {
        return { ...state, log: appendLog(state, state.log, 'warning', `Esse slot está protegido por Proteção Divina!`) };
      }
    }

    // FIX (auditoria completa da Besta - brecha real encontrada): antes não
    // havia checagem nenhuma de tipo aqui, diferente da Besta J logo acima
    // (que já filtra `isPlainNumeralCard` com o comentário explícito "nunca
    // confiando só na UI") - um id de magia (J/Q/K) ou do Monstro no
    // descarte podia ser colocado direto num slot de combate, violando a
    // regra central de que só cartas numerais (2-10) ocupam os 3 slots.
    const cardFromDiscard = state.discardPile.find((c) => c.id === selectedCards[0] && isPlainNumeralCard(c));
    if (!cardFromDiscard) return state;

    // FIX (Modo Towers, pedido do usuário): mesma regra anti-torre da
    // Substituição Arcana do Mago (ver comentário completo lá) - só que aqui
    // a carta trazida vem do DESCARTE, não da mão: se bater, funde (sai do
    // descarte, vira o novo topo); se não bater, "nunca entra" significa que
    // ela CONTINUA no descarte intocada, e só o topo antigo da torre é
    // descartado (a torre encolhe 1).
    if (isTowerSlot(targetSlot)) {
      const reserve = targetSlot.towerReserve!;
      const topValue = getEffectiveCardValue(targetSlot.faceDownCard!);
      const incomingValue = getEffectiveCardValue(cardFromDiscard);
      const newTargetField = [...targetState.field] as [FieldSlot, FieldSlot, FieldSlot];

      // FIX: `targetKey` pode ser IGUAL a `playerKey` (torre no próprio
      // campo) - um objeto literal com as duas chaves computadas colidiria
      // nesse caso (a última sobrescreveria a primeira silenciosamente,
      // perdendo a mudança na mão). Mesmo padrão condicional já usado pelo
      // resto desta função (targetPlayer !== player) pra nunca colidir.
      if (incomingValue === topValue) {
        newTargetField[selectedSlot] = {
          ...targetSlot,
          faceDownCard: { ...cardFromDiscard, revealed: true },
          towerReserve: [...reserve, { ...targetSlot.faceDownCard!, revealed: true }],
          revealed: true,
        };
        const discardWithoutTaken = state.discardPile.filter((c) => c.id !== selectedCards[0]);
        const { deck, discardPile } = pushToDiscard({ deck: state.deck, discardPile: discardWithoutTaken, gameConfig: state.gameConfig }, [card]);
        const log = appendLog(state, state.log, 'magic', `Jogador ${player} reforçou uma torre com uma carta do descarte`, { player, cardValue: card.value });
        if (targetPlayer !== player) {
          return { ...state, deck, discardPile, log, [playerKey]: { ...playerState, hand: handWithoutMagic }, [targetKey]: { ...targetState, field: newTargetField } };
        }
        return { ...state, deck, discardPile, log, [playerKey]: { ...playerState, hand: handWithoutMagic, field: newTargetField } };
      }

      const newReserve = [...reserve];
      const newTop = newReserve.pop();
      newTargetField[selectedSlot] = { ...targetSlot, faceDownCard: newTop, towerReserve: newReserve, revealed: Boolean(newTop) };
      const { deck, discardPile } = pushToDiscard(state, [card, targetSlot.faceDownCard!]);
      const log = appendLog(state, state.log, 'magic', `Jogador ${player} descartou o topo de uma torre (a carta não bateu com o número)`, { player, cardValue: card.value });
      if (targetPlayer !== player) {
        return { ...state, deck, discardPile, log, [playerKey]: { ...playerState, hand: handWithoutMagic }, [targetKey]: { ...targetState, field: newTargetField } };
      }
      return { ...state, deck, discardPile, log, [playerKey]: { ...playerState, hand: handWithoutMagic, field: newTargetField } };
    }

    const oldCard = targetSlot.faceDownCard;
    const newTargetField = [...targetState.field] as [FieldSlot, FieldSlot, FieldSlot];
    newTargetField[selectedSlot] = { ...newTargetField[selectedSlot], faceDownCard: { ...cardFromDiscard, revealed: true }, revealed: true };

    const discardWithoutTaken = state.discardPile.filter((c) => c.id !== selectedCards[0]);
    // A carta removida do slot alvo vai para o descarte (mesmo quando o alvo
    // é o campo do oponente) - a "Troca Predatória" consome a carta do
    // oponente, ela não volta para a mão dele, diferente da Substituição
    // Arcana do Mago.
    const { deck, discardPile } = pushToDiscard({ deck: state.deck, discardPile: discardWithoutTaken, gameConfig: state.gameConfig }, [card, oldCard]);

    const log = appendLog(
      state,
      state.log,
      'magic',
      `Jogador ${player} trocou carta do campo${targetPlayer !== player ? ` de Jogador ${targetPlayer}` : ''} por uma do descarte`,
      { player, cardValue: card.value }
    );

    if (targetPlayer !== player) {
      return {
        ...state,
        deck,
        discardPile,
        log,
        [playerKey]: { ...playerState, hand: handWithoutMagic },
        [targetKey]: { ...targetState, field: newTargetField },
      };
    }

    return {
      ...state,
      deck,
      discardPile,
      log,
      [playerKey]: { ...playerState, hand: handWithoutMagic, field: newTargetField },
    };
  }

  // ----- Anjo Q: Visão Celestial -----
  if (character === 'anjo' && magicType === 'Q') {
    const opponentState = state[opponentKey];

    if (selectedCards?.[0]) {
      // FIX (pedido do usuário: "não permita que o jogador selecione
      // cartas... que já estão reveladas") - revelar uma carta já revelada
      // não faz nada de útil. Diferente do Mago J, o Anjo Q não tem um
      // efeito alternativo para esse caso - só rejeita a ativação.
      const targetHandCard = opponentState.hand.find((c) => c.id === selectedCards[0]);
      if (!targetHandCard || targetHandCard.revealed) return state;

      const newOpponentHand = opponentState.hand.map((c) => (c.id === selectedCards[0] ? { ...c, revealed: true } : c));
      const { deck, discardPile } = pushToDiscard(state, [card]);
      const log = appendLog(state, state.log, 'magic', `Jogador ${player} revelou uma carta da mão de Jogador ${opponent}`, { player, cardValue: card.value });
      return {
        ...state,
        deck,
        discardPile,
        log,
        [playerKey]: { ...playerState, hand: handWithoutMagic },
        [opponentKey]: { ...opponentState, hand: newOpponentHand },
      };
    }

    if (selectedSlot !== undefined) {
      const targetSlot = opponentState.field[selectedSlot];
      if (!targetSlot.faceDownCard) return state;
      // FIX (pedido do usuário): mesma proteção contra revelar um slot que
      // já está revelado.
      if (targetSlot.revealed) return state;
      if (isSlotProtected(state, opponent, selectedSlot)) {
        return { ...state, log: appendLog(state, state.log, 'warning', `Esse slot está protegido por Proteção Divina!`) };
      }

      const newField = [...opponentState.field] as [FieldSlot, FieldSlot, FieldSlot];
      newField[selectedSlot] = { ...newField[selectedSlot], revealed: true, faceDownCard: { ...targetSlot.faceDownCard, revealed: true } };

      const { deck, discardPile } = pushToDiscard(state, [card]);
      const log = appendLog(state, state.log, 'magic', `Jogador ${player} revelou carta do campo de Jogador ${opponent}`, { player, cardValue: card.value });
      const resultState: GameState = {
        ...state,
        deck,
        discardPile,
        log,
        [playerKey]: { ...playerState, hand: handWithoutMagic },
        [opponentKey]: { ...opponentState, field: newField },
      };
      // Coringa (redesenho completo) - armadilhas de campo (J/Q/K/Monstro)
      // reagem quando um efeito do OPONENTE as revela na Estratégia - ver
      // comentário completo em resolveCoringaFieldTraps.
      return resolveCoringaFieldTraps(state, resultState, opponent);
    }

    return state;
  }

  // ----- Mago K: Destruição de Reforço -----
  if (character === 'mago' && magicType === 'K') {
    if (selectedSlot === undefined) return state;
    const opponentState = state[opponentKey];
    const targetSlot = opponentState.field[selectedSlot];
    // FIX: um slot agora pode ter até 2 cartas horizontais empilhadas (Reforço
    // Angelical do Anjo) - a magia destrói a pilha INTEIRA de reforços daquele
    // slot de uma vez (todas ainda não batalhadas), não só a primeira carta.
    const horizontalCards = targetSlot.horizontalCards;
    if (horizontalCards.length === 0 || horizontalCards.some((c) => c.battled)) return state;
    if (isSlotProtected(state, opponent, selectedSlot)) {
      return { ...state, log: appendLog(state, state.log, 'warning', `Esse slot está protegido por Proteção Divina!`) };
    }

    const newField = [...opponentState.field] as [FieldSlot, FieldSlot, FieldSlot];
    newField[selectedSlot] = { ...newField[selectedSlot], horizontalCards: [] };

    const { deck, discardPile } = pushToDiscard(state, [card, ...horizontalCards]);
    const log = appendLog(
      state,
      state.log,
      'magic',
      `Jogador ${player} destruiu ${horizontalCards.length > 1 ? 'as cartas horizontais' : 'a carta horizontal'} de Jogador ${opponent}`,
      { player, cardValue: card.value }
    );

    return {
      ...state,
      deck,
      discardPile,
      log,
      [playerKey]: { ...playerState, hand: handWithoutMagic },
      [opponentKey]: { ...opponentState, field: newField },
    };
  }

  // ----- Besta K: Roubo Brutal -----
  if (character === 'besta' && magicType === 'K') {
    if (selectedSlot === undefined || selectedTargetSlot === undefined) return state;
    const opponentState = state[opponentKey];

    const newPlayerField = [...playerState.field] as [FieldSlot, FieldSlot, FieldSlot];
    const newOpponentField = [...opponentState.field] as [FieldSlot, FieldSlot, FieldSlot];

    const playerCard = newPlayerField[selectedSlot].faceDownCard;
    const opponentCard = newOpponentField[selectedTargetSlot].faceDownCard;
    // FIX: a troca só vale "antes de virar" - ambas as cartas precisam estar não-reveladas.
    if (!playerCard || !opponentCard) return state;
    if (newPlayerField[selectedSlot].revealed || newOpponentField[selectedTargetSlot].revealed) return state;
    if (isSlotProtected(state, opponent, selectedTargetSlot)) {
      return { ...state, log: appendLog(state, state.log, 'warning', `Esse slot está protegido por Proteção Divina!`) };
    }

    newPlayerField[selectedSlot] = { ...newPlayerField[selectedSlot], faceDownCard: opponentCard };
    newOpponentField[selectedTargetSlot] = { ...newOpponentField[selectedTargetSlot], faceDownCard: playerCard };

    const { deck, discardPile } = pushToDiscard(state, [card]);
    const log = appendLog(state, state.log, 'magic', `Jogador ${player} trocou carta com Jogador ${opponent}`, { player, cardValue: card.value });

    return {
      ...state,
      deck,
      discardPile,
      log,
      [playerKey]: { ...playerState, hand: handWithoutMagic, field: newPlayerField },
      [opponentKey]: { ...opponentState, field: newOpponentField },
    };
  }

  // ----- Mosqueteiro J: Tiro de Cobertura -----
  // Personagem novo, foco em descarte (pedido do usuário). Descarta a
  // própria carta + 1 carta extra escolhida (da mão própria, ou da mão do
  // OPONENTE às cegas por posição se a Recarga Rápida/Monstro estiver
  // ativa) e concede +1 ao limite de cartas horizontais deste turno - mesmo
  // mecanismo de `horizontalStackBonus` do Reforço Angelical do Anjo, só
  // que pago com um descarte em vez de ser de graça.
  if (character === 'mosqueteiro' && magicType === 'J') {
    const targetId = selectedCards?.[0];
    if (!targetId) return state;
    const redirecting = playerState.mosqueteiroRedirectNextDiscard;
    const opponentState = state[opponentKey];

    const targetCard = redirecting
      ? opponentState.hand.find((c) => c.id === targetId)
      : playerState.hand.find((c) => c.id === targetId && c.id !== cardId);
    if (!targetCard) return state;

    const newOwnHand = redirecting ? handWithoutMagic : handWithoutMagic.filter((c) => c.id !== targetId);
    const newOpponentHand = redirecting ? opponentState.hand.filter((c) => c.id !== targetId) : opponentState.hand;

    const { deck, discardPile } = pushToDiscard(state, [card, targetCard]);
    const log = appendLog(
      state,
      state.log,
      'magic',
      redirecting
        ? `Jogador ${player} ativou Tiro de Cobertura - Jogador ${opponent} descartou ${targetCard.value}${targetCard.suit} às cegas`
        : `Jogador ${player} descartou ${targetCard.value}${targetCard.suit} para posicionar uma carta horizontal a mais neste turno`,
      { player, cardValue: card.value }
    );

    return {
      ...state,
      deck,
      discardPile,
      log,
      [playerKey]: {
        ...playerState,
        hand: newOwnHand,
        horizontalStackBonus: playerState.horizontalStackBonus + 1,
        mosqueteiroDiscardsThisTurn: playerState.mosqueteiroDiscardsThisTurn + 1,
        mosqueteiroRedirectNextDiscard: false,
      },
      [opponentKey]: { ...opponentState, hand: newOpponentHand },
    };
  }

  // ----- Mosqueteiro Q: Rajada Reveladora -----
  // Descarta até 3 cartas extras (mesma fonte "própria ou do oponente às
  // cegas" do Valete acima) e revela essa mesma quantidade de cartas ainda
  // ocultas do oponente (mão OU campo, também escolhidas às cegas por
  // posição - ver selectedRevealCardIds em MagicSelection).
  if (character === 'mosqueteiro' && magicType === 'Q') {
    const discardIds = (selectedCards ?? []).slice(0, 3);
    if (discardIds.length === 0) return state;
    const redirecting = playerState.mosqueteiroRedirectNextDiscard;
    const opponentState = state[opponentKey];

    const discardSourceHand = redirecting ? opponentState.hand : playerState.hand.filter((c) => c.id !== cardId);
    const discardedCards = discardIds
      .map((id) => discardSourceHand.find((c) => c.id === id))
      .filter((c): c is Card => Boolean(c));
    if (discardedCards.length === 0) return state;

    const discardedIdSet = new Set(discardedCards.map((c) => c.id));
    const newOwnHand = redirecting ? handWithoutMagic : handWithoutMagic.filter((c) => !discardedIdSet.has(c.id));
    const opponentHandAfterDiscard = redirecting
      ? opponentState.hand.filter((c) => !discardedIdSet.has(c.id))
      : opponentState.hand;

    // Revela até `discardedCards.length` cartas ocultas do oponente (mão OU
    // campo) - o número de alvos escolhidos pode ser menor (poucas cartas
    // ocultas disponíveis), nunca maior.
    const revealIds = new Set((selectedRevealCardIds ?? []).slice(0, discardedCards.length));
    const newOpponentHand = opponentHandAfterDiscard.map((c) => (revealIds.has(c.id) ? { ...c, revealed: true } : c));
    const newOpponentField = opponentState.field.map((slot) => {
      let newSlot = slot;
      if (slot.faceDownCard && revealIds.has(slot.faceDownCard.id)) {
        newSlot = { ...newSlot, faceDownCard: { ...slot.faceDownCard, revealed: true }, revealed: true };
      }
      if (slot.horizontalCards.some((h) => revealIds.has(h.id))) {
        newSlot = { ...newSlot, horizontalCards: newSlot.horizontalCards.map((h) => (revealIds.has(h.id) ? { ...h, revealed: true } : h)) };
      }
      return newSlot;
    }) as [FieldSlot, FieldSlot, FieldSlot];

    const { deck, discardPile } = pushToDiscard(state, [card, ...discardedCards]);
    let log = appendLog(
      state,
      state.log,
      'magic',
      redirecting
        ? `Jogador ${player} ativou Rajada Reveladora - Jogador ${opponent} descartou ${discardedCards.length} carta(s) às cegas`
        : `Jogador ${player} descartou ${discardedCards.length} carta(s) com Rajada Reveladora`,
      { player, cardValue: card.value }
    );
    if (revealIds.size > 0) {
      log = appendLog(state, log, 'magic', `${revealIds.size} carta(s) de Jogador ${opponent} foram reveladas`, { player });
    }

    const resultState: GameState = {
      ...state,
      deck,
      discardPile,
      log,
      [playerKey]: {
        ...playerState,
        hand: newOwnHand,
        mosqueteiroDiscardsThisTurn: playerState.mosqueteiroDiscardsThisTurn + discardedCards.length,
        mosqueteiroRedirectNextDiscard: false,
      },
      [opponentKey]: { ...opponentState, hand: newOpponentHand, field: newOpponentField },
    };
    // Coringa (redesenho completo) - armadilhas de campo reagem quando um
    // efeito do OPONENTE as revela na Estratégia - ver resolveCoringaFieldTraps.
    return resolveCoringaFieldTraps(state, resultState, opponent);
  }

  // ----- Mosqueteiro K: Tiro Certeiro -----
  // Fase de COMBATE (como Mago K/Besta K - ver MAGIC_CARDS): reforça uma
  // carta do PRÓPRIO campo (principal ou horizontal, revelada ou não - ver
  // resposta do usuário "a qualquer momento do combate") em +N, onde N é
  // `mosqueteiroDiscardsThisTurn + mosqueteiroDiscardsTurnMinus1` NO INSTANTE
  // da ativação (quantas cartas as magias do Mosqueteiro descartaram NESTE
  // turno E no ANTERIOR - FIX pedido do usuário: "o valor extra também conta
  // o turno anterior" - antes só contava este turno) - lido e congelado
  // aqui em `mosqueteiroBoostAmount`, aplicado de verdade na resolução de
  // combate (ver handleResolveCombat). Só os 2 turnos mais recentes contam
  // aqui - a janela de 3 turnos (T-2 incluso) é só da Magia Numeral, ver
  // handleFinalizeNumeralSpell.
  if (character === 'mosqueteiro' && magicType === 'K') {
    const targetId = selectedCards?.[0];
    if (!targetId) return state;
    const mainCard = playerState.field.find((slot) => slot.faceDownCard?.id === targetId)?.faceDownCard;
    const horizontalCard = playerState.field.flatMap((slot) => slot.horizontalCards).find((c) => c.id === targetId);
    const targetCard = mainCard ?? horizontalCard;
    // FIX (checagem extensa por bugs - interação Piromante x Mosqueteiro):
    // Tiro Certeiro foi desenhado pra reforçar uma carta numeral de verdade
    // no combate - uma carta-token de Bola de Fogo (`isFireToken`) nunca
    // deveria ser um alvo válido (cosmético, mas inconsistente com a
    // identidade visual/temática do efeito).
    if (!targetCard || targetCard.isFireToken) return state;

    const boostAmount = playerState.mosqueteiroDiscardsThisTurn + playerState.mosqueteiroDiscardsTurnMinus1;
    const { deck, discardPile } = pushToDiscard(state, [card]);
    const log = appendLog(
      state,
      state.log,
      'magic',
      `Jogador ${player} ativou Tiro Certeiro - a carta ${targetCard.value}${targetCard.suit} recebe +${boostAmount} de valor no combate`,
      { player, cardValue: card.value }
    );

    return {
      ...state,
      deck,
      discardPile,
      log,
      [playerKey]: {
        ...playerState,
        hand: handWithoutMagic,
        mosqueteiroBoostedCardId: targetId,
        mosqueteiroBoostAmount: boostAmount,
      },
    };
  }

  // ----- Piromante J: Combustão -----
  // Fase de COMPRA. `selection.fireballLaunch` decide qual dos 2 caminhos:
  // lançar a Bola de Fogo já acumulada (ver executeFireballLaunch), ou o
  // efeito próprio (junta cartas <5 da mão como combustível).
  if (character === 'piromante' && magicType === 'J') {
    if (selection.fireballLaunch) {
      const { deck, discardPile } = pushToDiscard(state, [card]);
      const midState: GameState = { ...state, deck, discardPile, [playerKey]: { ...playerState, hand: handWithoutMagic } };
      return executeFireballLaunch(midState, player, selectedTargetSlot);
    }
    const cap = getFireballCap(state.gameConfig);
    const fuelCards = handWithoutMagic.filter((c) => isPlainNumeralCard(c) && getEffectiveCardValue(c) < 5);
    const fuelSum = fuelCards.reduce((sum, c) => sum + getEffectiveCardValue(c), 0);
    const fuelIds = new Set(fuelCards.map((c) => c.id));
    const newHand = handWithoutMagic.filter((c) => !fuelIds.has(c.id));
    const { deck, discardPile } = pushToDiscard(state, [card, ...fuelCards]);
    const newFireball = Math.min(cap, playerState.fireballValue + fuelSum);
    const log =
      fuelCards.length > 0
        ? appendLog(
            state,
            state.log,
            'magic',
            `Combustão: Jogador ${player} queimou ${fuelCards.length} carta(s) da mão e somou ${fuelSum} à Bola de Fogo (agora ${newFireball})`,
            { player, cardValue: card.value }
          )
        : appendLog(state, state.log, 'magic', `Combustão: Jogador ${player} não tinha cartas pequenas na mão pra queimar`, { player, cardValue: card.value });
    return { ...state, deck, discardPile, log, [playerKey]: { ...playerState, hand: newHand, fireballValue: newFireball } };
  }

  // ----- Piromante Q: Roubo Flamejante -----
  // Fase de ESTRATÉGIA. Efeito próprio: queima uma carta REVELADA do
  // oponente (mão, ou horizontal no campo) valendo 2-10. FIX (simplificação
  // consciente por escopo/tempo): não aceita a carta PRINCIPAL de um slot
  // (nem torre) como alvo aqui - remover ela exigiria promover a reserva de
  // torre pro novo topo (mesma lógica de handleResolveCombat), fora do
  // escopo desta primeira versão. Mão e horizontais já cobrem a maior parte
  // dos casos de uso reais.
  if (character === 'piromante' && magicType === 'Q') {
    if (selection.fireballLaunch) {
      const { deck, discardPile } = pushToDiscard(state, [card]);
      const midState: GameState = { ...state, deck, discardPile, [playerKey]: { ...playerState, hand: handWithoutMagic } };
      return executeFireballLaunch(midState, player, selectedTargetSlot);
    }
    const targetId = selectedCards?.[0];
    if (!targetId) return state;
    const opponentState = state[opponentKey];
    const handTarget = opponentState.hand.find((c) => c.id === targetId);
    const horizTarget = opponentState.field.flatMap((slot) => slot.horizontalCards).find((c) => c.id === targetId);
    const targetCard = handTarget ?? horizTarget;
    if (!targetCard || !targetCard.revealed) return state;
    const value = getEffectiveCardValue(targetCard);
    if (value < 2 || value > 10) return state;
    if (horizTarget && isSlotProtected(state, opponent, 0)) return state;

    const newOpponentHand = opponentState.hand.filter((c) => c.id !== targetId);
    const newOpponentField = opponentState.field.map((slot) => ({
      ...slot,
      horizontalCards: slot.horizontalCards.filter((c) => c.id !== targetId),
    })) as [FieldSlot, FieldSlot, FieldSlot];

    const cap = getFireballCap(state.gameConfig);
    const newFireball = Math.min(cap, playerState.fireballValue + value);
    const { deck, discardPile } = pushToDiscard(state, [card, targetCard]);
    const log = appendLog(
      state,
      state.log,
      'magic',
      `Roubo Flamejante: Jogador ${player} queimou ${targetCard.value}${targetCard.suit} de Jogador ${opponent} e somou ${value} à Bola de Fogo (agora ${newFireball})`,
      { player, cardValue: card.value }
    );
    return {
      ...state,
      deck,
      discardPile,
      log,
      [playerKey]: { ...playerState, hand: handWithoutMagic, fireballValue: newFireball },
      [opponentKey]: { ...opponentState, hand: newOpponentHand, field: newOpponentField },
    };
  }

  // ----- Piromante K: Queima do Reforço -----
  // Fase de COMBATE. Efeito próprio: queima uma carta horizontal do campo
  // do oponente (mesmo alvo do Rei do Mago - Destruição de Reforço - mas em
  // vez de só descartar, o valor dela vira combustível).
  if (character === 'piromante' && magicType === 'K') {
    if (selection.fireballLaunch) {
      const { deck, discardPile } = pushToDiscard(state, [card]);
      const midState: GameState = { ...state, deck, discardPile, [playerKey]: { ...playerState, hand: handWithoutMagic } };
      return executeFireballLaunch(midState, player, selectedTargetSlot);
    }
    const targetId = selectedCards?.[0];
    if (!targetId) return state;
    const opponentState = state[opponentKey];
    const targetSlotIndex = opponentState.field.findIndex((slot) => slot.horizontalCards.some((c) => c.id === targetId && !c.battled));
    if (targetSlotIndex === -1) return state;
    if (isSlotProtected(state, opponent, targetSlotIndex)) return state;
    const targetCard = opponentState.field[targetSlotIndex].horizontalCards.find((c) => c.id === targetId)!;

    const value = getEffectiveCardValue(targetCard);
    const newOpponentField = opponentState.field.map((slot, i) =>
      i === targetSlotIndex ? { ...slot, horizontalCards: slot.horizontalCards.filter((c) => c.id !== targetId) } : slot
    ) as [FieldSlot, FieldSlot, FieldSlot];

    const cap = getFireballCap(state.gameConfig);
    const newFireball = Math.min(cap, playerState.fireballValue + value);
    const { deck, discardPile } = pushToDiscard(state, [card, targetCard]);
    const log = appendLog(
      state,
      state.log,
      'magic',
      `Queima do Reforço: Jogador ${player} queimou uma horizontal de Jogador ${opponent} e somou ${value} à Bola de Fogo (agora ${newFireball})`,
      { player, cardValue: card.value }
    );
    return {
      ...state,
      deck,
      discardPile,
      log,
      [playerKey]: { ...playerState, hand: handWithoutMagic, fireballValue: newFireball },
      [opponentKey]: { ...opponentState, field: newOpponentField },
    };
  }

  return state;
}

// ---------------------------------------------------------------------------
// Modo Reações (pedido do usuário)
//
// Toda vez que uma magia (J/Q/K) é ativada com o modo ligado, se o oponente
// tiver uma carta mágica do MESMO valor na mão (e ainda não tiver estourado
// `reactionsLimit` reações NESTA fase), a ativação não se aplica na hora -
// ela fica ANUNCIADA (`state.pendingReaction`) por até 3s (o timer real vive
// em GameBoard.tsx), esperando a decisão do oponente:
// - Reage (REACT_TO_MAGIC): as duas cartas mágicas vão pro descarte, o
//   efeito NUNCA se aplica.
// - Não reage a tempo (RESOLVE_PENDING_REACTION, disparado pelo timer): o
//   efeito se aplica de verdade, exatamente como aplicaria sem o modo ligado.
//
// Quando o oponente NÃO tem carta elegível (ou já esgotou o limite da fase),
// a ativação segue direto pro efeito de verdade, sem nenhum anúncio/pausa -
// "alerta de reação só é invocado caso o jogador oponente tenha uma carta
// capaz de ser utilizada para reação em mãos" (pedido do usuário).
// ---------------------------------------------------------------------------

/**
 * Intercepta o RESULTADO já calculado (`resultState`) de uma ativação de
 * magia (ACTIVATE_SIMPLE_MAGIC/EXECUTE_MAGIC) pra decidir se ela deve ser
 * ANUNCIADA (Modo Reações) em vez de aplicada na hora. Reaproveita
 * `resultState` só pra saber SE a ativação teria sucesso (comparação por
 * referência - `resultState === state` é a mesma convenção de "rejeitado em
 * silêncio" usada em todo o resto do motor) - nunca duplica a validação de
 * cada handler de magia. Quando decide anunciar, DESCARTA `resultState`
 * (ainda não aplicado) e guarda a ação original inteira em
 * `pendingReaction.originalAction` pra ser re-executada de verdade depois
 * (ver handleResolvePendingReaction) - assim nenhuma lógica de nenhuma magia
 * precisa saber que o Modo Reações existe.
 */
/**
 * Verdadeiro se ativar `cardId` (do jogador `player`) AGORA resultaria num
 * ANÚNCIO (Modo Reações) em vez de aplicação imediata - a MESMA checagem que
 * `maybeDeferForReaction` usa internamente pra decidir isso, extraída aqui
 * pra ser reaproveitada pela UI (GameBoard.tsx).
 *
 * FIX (checagem extensa por bugs - achado independente, não relacionado ao
 * Piromante): a apresentação visual/sonora de UMA ativação de magia
 * (`applyMagicEffectPresentation`) sempre disparava ANTES do dispatch,
 * incondicionalmente - inclusive quando o Modo Reações estava ligado e a
 * ativação na verdade seria só ANUNCIADA (efeito real represado em
 * `pendingReaction`, sem aplicar nada ainda). Isso causava dois sintomas: (1)
 * se o oponente reagia (negava), o burst já tinha tocado à toa, pra um
 * efeito que nunca aconteceu; (2) se ninguém reagia a tempo, o burst tocava
 * DE NOVO quando RESOLVE_PENDING_REACTION finalmente aplicava o efeito de
 * verdade (ver o timer de 3s em GameBoard.tsx, que corretamente dispara a
 * apresentação nesse momento - o bug era o disparo ANTECIPADO extra, não a
 * apresentação em si). GameBoard.tsx agora chama esta função ANTES de
 * disparar a apresentação: se ela retornar `true`, a apresentação é adiada
 * pro mesmo caminho que já trata a resolução da reação (nega -> nenhum burst
 * toca, correto; expira sem reação -> `triggerAiActionEffects` já dispara a
 * apresentação exatamente uma vez).
 */
export function canMagicTriggerReactionAnnouncement(state: GameState, player: PlayerNumber, cardId: string): boolean {
  if (!state.gameConfig.reactionsMode) return false;

  const card = state[playerKeyOf(player)].hand.find((c) => c.id === cardId);
  if (!card || (card.value !== 'J' && card.value !== 'Q' && card.value !== 'K')) return false;

  const opponent = opponentOf(player);
  const opponentKey = playerKeyOf(opponent);
  const opponentState = state[opponentKey];
  const reactionsUsed = state.reactionsUsedThisPhase[opponent] ?? 0;
  return reactionsUsed < state.gameConfig.reactionsLimit && opponentState.hand.some((c) => c.value === card.value);
}

function maybeDeferForReaction(
  state: GameState,
  originalAction: GameAction,
  player: PlayerNumber,
  cardId: string,
  resultState: GameState
): GameState {
  if (resultState === state) return state; // a ativação seria rejeitada de qualquer forma - Reações não muda isso
  if (!canMagicTriggerReactionAnnouncement(state, player, cardId)) return resultState;

  const card = state[playerKeyOf(player)].hand.find((c) => c.id === cardId);
  if (!card || (card.value !== 'J' && card.value !== 'Q' && card.value !== 'K')) return resultState; // sempre verdadeiro aqui (já checado acima) - só pra estreitar o tipo de card.value
  const opponent = opponentOf(player);

  const playerKey = playerKeyOf(player);
  const playerState = state[playerKey];
  // FIX (pedido do usuário: "magias são reveladas ao serem anunciadas") -
  // mesmo mecanismo de `revealed` já usado em cartas de campo/mão
  // reveladas por outros efeitos neste motor (ex.: Revelação Forçada do
  // Mago) - permanente, nunca "esconde de novo" depois.
  const newHand = playerState.hand.map((c) => (c.id === cardId ? { ...c, revealed: true } : c));
  const character = characterOf(state, player);
  const log = appendLog(
    state,
    state.log,
    'magic',
    `Jogador ${player} anunciou uma magia (${card.value}) - Jogador ${opponent} pode reagir!`,
    { player, cardValue: card.value }
  );

  return {
    ...state,
    log,
    [playerKey]: { ...playerState, hand: newHand },
    pendingReaction: { casterPlayer: player, character, cardValue: card.value, cardId, originalAction },
  };
}

/**
 * `player` (precisa ser o oponente de quem anunciou - ver
 * state.pendingReaction) usa `cardId` (uma carta mágica própria do MESMO
 * valor da anunciada) pra reagir: nega o efeito por completo e descarta as
 * DUAS cartas (a anunciada e a usada pra reagir) - nenhuma delas é ativada.
 */
function handleReactToMagic(state: GameState, player: PlayerNumber, cardId: string): GameState {
  const pending = state.pendingReaction;
  if (!pending) return state;
  if (player !== opponentOf(pending.casterPlayer)) return state;

  const playerKey = playerKeyOf(player);
  const playerState = state[playerKey];
  const reactingCard = playerState.hand.find((c) => c.id === cardId);
  if (!reactingCard || reactingCard.value !== pending.cardValue) return state;

  const reactionsUsed = state.reactionsUsedThisPhase[player] ?? 0;
  if (reactionsUsed >= state.gameConfig.reactionsLimit) return state; // nunca confiar só na UI

  const casterKey = playerKeyOf(pending.casterPlayer);
  const casterState = state[casterKey];
  const announcedCard = casterState.hand.find((c) => c.id === pending.cardId);
  if (!announcedCard) return state; // nunca deveria acontecer - a carta anunciada some da mão só quando resolvida

  const newCasterHand = casterState.hand.filter((c) => c.id !== pending.cardId);
  const newReactingHand = playerState.hand.filter((c) => c.id !== cardId);
  const { deck, discardPile } = pushToDiscard(state, [announcedCard, reactingCard]);
  const log = appendLog(
    state,
    state.log,
    'magic',
    `Jogador ${player} REAGIU com ${reactingCard.value}${reactingCard.suit} - a magia de Jogador ${pending.casterPlayer} foi negada! Ambas as cartas foram descartadas.`,
    { player, cardValue: reactingCard.value }
  );

  return {
    ...state,
    log,
    deck,
    discardPile,
    pendingReaction: null,
    reactionsUsedThisPhase: { ...state.reactionsUsedThisPhase, [player]: reactionsUsed + 1 },
    [casterKey]: { ...casterState, hand: newCasterHand },
    [playerKey]: { ...playerState, hand: newReactingHand },
  };
}

/**
 * A janela de 3s expirou sem reação (timer real em GameBoard.tsx) - aplica
 * de verdade a magia anunciada, re-executando o handler original guardado em
 * `pendingReaction.originalAction` sobre o estado já sem `pendingReaction`
 * (senão o guard de bloqueio total no topo de gameReducer rejeitaria a
 * própria re-execução). O estado não muda em mais nada além disso entre o
 * anúncio e agora (a pausa total garante isso), então o resultado é
 * idêntico ao que seria se a magia tivesse aplicado na hora, sem o modo
 * ligado.
 */
function handleResolvePendingReaction(state: GameState): GameState {
  const pending = state.pendingReaction;
  if (!pending) return state;
  const stateWithoutPending: GameState = { ...state, pendingReaction: null };

  switch (pending.originalAction.type) {
    case 'ACTIVATE_SIMPLE_MAGIC':
      return handleActivateSimpleMagic(stateWithoutPending, pending.originalAction.player, pending.originalAction.cardId);
    case 'EXECUTE_MAGIC':
      return handleExecuteMagic(stateWithoutPending, pending.originalAction);
    default:
      return stateWithoutPending;
  }
}

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

/**
 * Decide o destino da carta Monstro de um jogador ao final de um turno: se
 * ela já atingiu o total de usos permitido, é descartada (some da zona); caso
 * contrário, permanece na zona própria para o turno seguinte, só com
 * `monsterUsed` resetado para false (pronta para ativar de novo) -
 * `monsterUseCount` nunca é resetado, é cumulativo entre turnos.
 */
function resolveMonsterCardAtTurnEnd(monster: Card | undefined): { kept: Card | undefined; discarded: Card | undefined } {
  if (!monster) return { kept: undefined, discarded: undefined };
  if ((monster.monsterUseCount ?? 0) >= MAX_MONSTER_USES) return { kept: undefined, discarded: monster };
  return { kept: { ...monster, monsterUsed: false }, discarded: undefined };
}

/**
 * Posiciona uma carta Monstro da mão na zona própria do jogador. Só permitido
 * enquanto a zona estiver vazia (um Monstro por vez) - a segunda carta
 * Monstro do baralho, se comprada, fica na mão até a zona esvaziar (ou até a
 * primeira se descartar depois do 3º uso - ver resolveMonsterCardAtTurnEnd).
 *
 * FIX (checagem extensa por bugs, achado via teste de propriedade: "a IA
 * nunca propõe uma ação que o motor rejeita em silêncio" - script/sanity-test.ts):
 * uma carta Monstro que já esgotou `MAX_MONSTER_USES` normalmente só existe
 * fora da zona por um instante, indo direto pro DESCARTE
 * (resolveMonsterCardAtTurnEnd) - mas nada a torna diferente de um Coringa
 * comum uma vez no descarte: `monsterUseCount` nunca reseta (por design),
 * mas o reembaralhamento do descarte de volta ao baralho (`autoShuffle`) não
 * sabe disso, então ela pode voltar a circular e ser comprada de novo por
 * QUALQUER jogador - inclusive via um caminho que devolve cartas direto pra
 * mão sem passar pelo descarte (ex.: o campo do oponente voltando pra mão
 * dele na ativação de uma Magia Numeral, ou a Fúria Sanguinária da Besta
 * puxando do baralho reembaralhado). Sem esta guarda, essa carta "morta" era
 * posicionada normalmente (parecia igual a uma nova) mas NENHUMA ativação
 * dela nunca seria aceita de novo (a guarda de segurança em
 * handleActivateMonsterEffectSimple/handleExecuteMagoMonsterEffect sempre
 * rejeita `monsterUseCount >= MAX_MONSTER_USES`) - um Coringa permanentemente
 * morto preso na zona, sem nenhum aviso do motivo, e a IA (decidePlaceMonsterCard
 * em aiPlayer.ts, ajustado junto) propondo ativá-lo pra sempre. Rejeitar a
 * colocação aqui fecha o buraco na ÚNICA porta de entrada da zona, em vez de
 * tentar prevenir cada caminho possível que devolve uma carta assim pra
 * alguma mão.
 */
function handlePlaceMonsterCard(state: GameState, player: PlayerNumber, cardId: string): GameState {
  if (state.phase !== 'strategy') return state;
  const playerKey = playerKeyOf(player);
  const playerState = state[playerKey];
  // Coringa (redesenho completo, pedido do usuário: "ao invés de ser
  // posicionado [na zona], é tratado como uma carta de número 15") - nunca
  // usa a Zona Monstro - a carta vai pro campo normal via PLAY_CARD/
  // SWAP_FIELD_CARD, como qualquer carta numeral comum.
  if (characterOf(state, player) === 'coringa') return state;
  if (playerState.monsterCard) return state; // zona já ocupada

  const card = playerState.hand.find((c) => c.id === cardId);
  if (!card || !card.isMonster) return state;
  if ((card.monsterUseCount ?? 0) >= MAX_MONSTER_USES) return state;

  const newHand = playerState.hand.filter((c) => c.id !== cardId);
  const log = appendLog(state, state.log, 'monster', `Jogador ${player} posicionou uma carta Monstro em sua zona própria`, { player, cardValue: '🃏' });

  return {
    ...state,
    log,
    [playerKey]: { ...playerState, hand: newHand, monsterCard: card, monsterTargetSlot: undefined, monsterTargetCardId: undefined },
  };
}

/**
 * Besta (Fúria Selvagem) ativa escolhendo um slot alvo E uma carta
 * específica dentro dele. Anjo (Proteção Divina) ativa direto, sem escolher
 * nada - o efeito agora protege TODO o campo do Anjo de uma vez.
 *
 * FIX (pedido do usuário): a Besta precisa de `targetCardId` - o efeito
 * dobra o valor de UMA carta específica do slot escolhido (a principal ou
 * uma horizontal), não mais "a soma de todas as horizontais do slot" (que
 * não fazia nada se o slot não tivesse nenhuma).
 *
 * FIX (pedido do usuário, rodada seguinte): a Proteção Divina do Anjo
 * deixou de proteger só "um slot selecionável" - agora protege TODAS as
 * cartas do próprio campo de uma vez (ver isSlotProtected, que agora ignora
 * qual slot é consultado para o Anjo). Por isso `targetSlotIndex` é
 * ignorado/opcional para o Anjo - a ativação nem pede mais essa escolha na
 * interface (ver handleMonsterZoneClick em GameBoard.tsx).
 */
function handleActivateMonsterEffectSimple(state: GameState, player: PlayerNumber, targetSlotIndex?: number, targetCardId?: string): GameState {
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
    const log = appendLog(state, state.log, 'monster', `Jogador ${player} ativou - todo o campo protegido contra magias até o fim do turno`, { player });
    return {
      ...state,
      log,
      [playerKey]: {
        ...playerState,
        monsterCard: { ...monster, monsterUsed: true, monsterUseCount: (monster.monsterUseCount ?? 0) + 1 },
        monsterTargetSlot: undefined,
        monsterTargetCardId: undefined,
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
      [playerKey]: {
        ...playerState,
        monsterCard: { ...monster, monsterUsed: true, monsterUseCount: (monster.monsterUseCount ?? 0) + 1 },
        monsterTargetSlot: undefined,
        monsterTargetCardId: undefined,
        mosqueteiroRedirectNextDiscard: true,
      },
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
        monsterTargetCardId: undefined,
        fireballValue: newFireball,
      },
    };
  }

  // Besta a partir daqui - precisa de um slot válido (0-2) e de uma carta
  // específica dentro dele.
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

  return {
    ...state,
    log,
    [playerKey]: {
      ...playerState,
      monsterCard: { ...monster, monsterUsed: true, monsterUseCount: (monster.monsterUseCount ?? 0) + 1 },
      monsterTargetSlot: targetSlotIndex,
      monsterTargetCardId: targetCardId,
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
function handleExecuteMagoMonsterEffect(state: GameState, player: PlayerNumber, targetSlotIndex: number, targetCardId: string): GameState {
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

/**
 * Coringa (redesenho completo, pedido do usuário) - Magia Numeral "Mão de
 * Ferro" (7,7,7): enquanto `coringaTransformWindowUntilTurn` estiver ativo,
 * transforma PERMANENTEMENTE uma carta de magia (J/Q/K) ainda na MÃO em
 * carta de número 11 (Valete), 12 (Rainha) ou 13 (Rei) - reaproveita
 * `transformedValue` (mesmo campo do Transformar Ás), então TODO o resto do
 * motor (valor de combate, exibição) já entende a carta automaticamente,
 * sem nenhuma mudança extra. `coringaTransformedToNumeral: true` marca a
 * transformação como definitiva - a carta LARGA de vez seu comportamento de
 * armadilha (nunca mais dispara os efeitos de revelação na Estratégia/
 * Combate - ver isCoringaRawTrapCard) mesmo depois que a janela fechar.
 */
function handleTransformCoringaMagicCard(state: GameState, player: PlayerNumber, cardId: string): GameState {
  if (characterOf(state, player) !== 'coringa') return state;
  const playerKey = playerKeyOf(player);
  const playerState = state[playerKey];
  const windowUntil = playerState.coringaTransformWindowUntilTurn;
  if (windowUntil === undefined || state.turn > windowUntil) return state;

  const card = playerState.hand.find((c) => c.id === cardId);
  if (!card || card.coringaTransformedToNumeral) return state;
  const targetValue = card.value === 'J' ? 11 : card.value === 'Q' ? 12 : card.value === 'K' ? 13 : null;
  if (targetValue === null) return state;

  const newHand = playerState.hand.map((c) =>
    c.id === cardId ? { ...c, transformedValue: targetValue, coringaTransformedToNumeral: true } : c
  );
  const log = appendLog(
    state,
    state.log,
    'magic',
    `Jogador ${player} transformou ${card.value}${card.suit} em uma carta de número ${targetValue}`,
    { player, cardValue: card.value }
  );

  return {
    ...state,
    log,
    [playerKey]: { ...playerState, hand: newHand },
  };
}

// ---------------------------------------------------------------------------
// Magia Numeral
// ---------------------------------------------------------------------------

function handleActivateNumeralSpell(state: GameState, player: PlayerNumber): GameState {
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
    `Jogador ${player} ativou ${getNumeralSpellInfo(character).name} (${requiredNumberLabel},${requiredNumberLabel},${requiredNumberLabel})!`,
    { player, cardValue: requiredNumberLabel }
  );
  if (opponentFieldCards.length > 0 || opponentMonsterCards.length > 0) {
    log = appendLog(state, log, 'numeral-spell', `Cartas de Jogador ${opponent} retornaram para a mão`);
  }
  if (opponentMonsterResolution.discarded) {
    log = appendLog(state, log, 'monster', `Carta Monstro de Jogador ${opponent} já esgotou os usos e foi descartada`);
  }

  return {
    ...state,
    log,
    deck: deckAfterMonsterDiscard,
    discardPile: discardPileAfterMonsterDiscard,
    numeralSpellPending: { playerNumber: player, character },
    [playerKey]: { ...playerState, hand: newHand, field: newField },
    [opponentKey]: { ...opponentState, hand: newOpponentHand, field: emptyField(), monsterCard: undefined, monsterTargetSlot: undefined },
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
function handleFinalizeNumeralSpell(state: GameState): GameState {
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
  let log = appendLog(state, state.log, 'numeral-spell', `Cartas da Magia Numeral foram descartadas`);

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

    updatedOpponent = { ...opponentState, hand: drawn };
    log = appendLog(
      state,
      log,
      'numeral-spell',
      `Fúria Sanguinária: Jogador ${opponent} descartou a mão inteira (${opponentState.hand.length} carta(s)) e comprou ${drawn.length} carta(s) de volta`,
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
    updatedPlayer = {
      ...updatedPlayer,
      mosqueteiroHandLimitBonusUntilTurn: state.turn + 1,
      mosqueteiroHandLimitBonusAmount: bonus,
    };
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
    updatedPlayer = {
      ...updatedPlayer,
      coringaTransformWindowUntilTurn: state.turn + 1,
    };
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
    updatedPlayer = {
      ...updatedPlayer,
      piromanteSpreadArmed: true,
    };
    log = appendLog(state, log, 'numeral-spell', `Chama Repartida: o próximo lançamento da Bola de Fogo de Jogador ${player} vai atingir os 3 slots do oponente`, { player });
  } else {
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

// ---------------------------------------------------------------------------
// Combate
// ---------------------------------------------------------------------------

/**
 * Verdadeiro se `player` pode escolher um slot de combate AGORA - a mesma
 * regra que handleSelectCombatSlot usa pra aceitar/rejeitar de verdade,
 * extraída aqui pra ser a ÚNICA fonte da verdade (checagem extensa por bugs,
 * pedido do usuário: "consolide as regras duplicadas... 2 por 2"). Antes
 * desta extração, aiPlayer.ts (decideCombatSlotSelection) e a UI
 * (GameBoard.tsx, seleção automática quando só resta 1 carta) cada um tinha
 * sua PRÓPRIA cópia desta mesma expressão (`firstToFlip === player ?
 * theirSelection === undefined : theirSelection !== undefined`) - por
 * enquanto sempre em sincronia (foi conferido linha a linha nesta rodada),
 * mas 3 cópias independentes da mesma regra é exatamente o padrão que já
 * causou bugs reais neste projeto (ver getUnbattledHorizontalSlots, auditoria
 * anterior) assim que uma delas mudasse sem as outras acompanharem.
 *
 * FIX (item 10 da 2ª rodada, preservado aqui): um slot SEM carta nenhuma
 * ainda pode ser selecionado para combate normalmente - ele vale 1 (ver
 * handleResolveCombat) em vez de ser um "buraco" inutilizável quando um
 * jogador posiciona menos de 3 cartas - por isso esta função não olha
 * `field` nenhum, só a ordem de seleção (`firstToFlip`/`combatSelection`).
 */
export function canSelectCombatSlot(state: GameState, player: PlayerNumber): boolean {
  if (state.phase !== 'combat' || state.combatResolution) return false;
  const playerKey = playerKeyOf(player);
  if (state.combatSelection[playerKey] !== undefined) return false; // já escolheu nesta rodada
  const otherKey = opponentKeyOf(player);
  const theirSelection = state.combatSelection[otherKey];
  if (state.firstToFlip === player) return theirSelection === undefined;
  return theirSelection !== undefined;
}

function handleSelectCombatSlot(state: GameState, player: PlayerNumber, slotIndex: number): GameState {
  if (!canSelectCombatSlot(state, player)) return state;
  const playerKey = playerKeyOf(player);
  const selection = { ...state.combatSelection, [playerKey]: slotIndex };
  const log = appendLog(state, state.log, 'combat', `Jogador ${player} selecionou slot ${slotIndex + 1} para combate`, { player });
  return { ...state, combatSelection: selection, log };
}

/**
 * Resolve o combate assim que os dois jogadores selecionaram um slot: revela
 * as cartas, calcula valores, aplica vitórias/disputa/vidas/fim-de-jogo
 * IMEDIATAMENTE (o placar já reflete o resultado assim que o popup aparece).
 * As cartas permanecem visíveis nos slots (reveladas) até FINALIZE_COMBAT ser
 * despachado pela UI, alguns segundos depois - só então elas são de fato
 * descartadas e os slots limpos, evitando a antiga janela onde uma carta
 * podia aparecer simultaneamente "em campo" e "no descarte".
 */
function handleResolveCombat(state: GameState, coringaQCopyTargetId?: string): GameState {
  const { player1: p1Slot0, player2: p2Slot0 } = state.combatSelection;
  if (p1Slot0 === undefined || p2Slot0 === undefined) return state;

  let p1Slot = state.player1.field[p1Slot0];
  let p2Slot = state.player2.field[p2Slot0];
  // FIX (item 10 da 2ª rodada): um slot sem carta principal não é mais
  // motivo para recusar a resolução - ele participa do combate valendo 1
  // (ver p1Base/p2Base abaixo), representando "nada posicionado aqui".

  const newP1Field = [...state.player1.field] as [FieldSlot, FieldSlot, FieldSlot];
  const newP2Field = [...state.player2.field] as [FieldSlot, FieldSlot, FieldSlot];

  // Coringa (redesenho completo) - armadilha revelada em COMBATE (não mais
  // na Estratégia, tratado à parte por resolveCoringaFieldTraps): Valete
  // vale 1, Monstro vale 15, Rainha copia o valor escolhido - ver
  // applyCoringaTrapCombatValue. `p1Slot`/`p2Slot` são reatribuídos aqui
  // (viram `let` só por causa disso) pra que TODO o resto da função (cálculo
  // de valor, montagem dos slots revelados) já enxergue o `transformedValue`
  // certo sem precisar duplicar a lógica. O Rei não precisa de nada aqui
  // (resolvido à parte, depois do resultado normal - ver mais abaixo).
  if (p1Slot.faceDownCard) {
    p1Slot = { ...p1Slot, faceDownCard: applyCoringaTrapCombatValue(state, 1, p1Slot.faceDownCard, state.player2.field, coringaQCopyTargetId) };
  }
  if (p2Slot.faceDownCard) {
    p2Slot = { ...p2Slot, faceDownCard: applyCoringaTrapCombatValue(state, 2, p2Slot.faceDownCard, state.player1.field, coringaQCopyTargetId) };
  }

  // FIX: um slot pode ter até 2 cartas horizontais empilhadas (Reforço
  // Angelical do Anjo) - todas as cartas horizontais do slot entram em
  // combate juntas, cada uma marcada como batalhada, e seus valores somam.
  //
  // FIX (pedido do usuário: "carta revelada no campo não deve revelar a
  // horizontal e o mesmo pro oposto... só ocorre quando a carta no campo é
  // revelada por um efeito de magia") - cada carta horizontal agora também
  // ganha `revealed: true` individualmente aqui, no momento real em que o
  // combate a revela de verdade. Antes só o SLOT ficava marcado como
  // revelado (linha abaixo) e a UI (FieldSlotView.tsx) usava esse mesmo
  // `slot.revealed` pra decidir se TODA carta horizontal do slot (mesmo uma
  // colocada DEPOIS, num turno seguinte, sem nunca ter sido revelada de
  // verdade) devia mostrar a face - o que vazava a revelação de uma magia
  // anterior (Substituição Arcana, Visão Celestial, Transformar Ás) pra
  // qualquer horizontal nova naquele slot. Agora cada carta controla sua
  // própria exibição via seu próprio `revealed` (ver FieldSlotView.tsx).
  const p1Horizontal = p1Slot.horizontalCards.map((c) =>
    applyCoringaTrapCombatValue(state, 1, { ...c, battled: true, revealed: true }, state.player2.field, coringaQCopyTargetId)
  );
  const p2Horizontal = p2Slot.horizontalCards.map((c) =>
    applyCoringaTrapCombatValue(state, 2, { ...c, battled: true, revealed: true }, state.player1.field, coringaQCopyTargetId)
  );
  newP1Field[p1Slot0] = {
    ...p1Slot,
    revealed: true,
    faceDownCard: p1Slot.faceDownCard ? { ...p1Slot.faceDownCard, revealed: true } : p1Slot.faceDownCard,
    horizontalCards: p1Horizontal,
  };
  newP2Field[p2Slot0] = {
    ...p2Slot,
    revealed: true,
    faceDownCard: p2Slot.faceDownCard ? { ...p2Slot.faceDownCard, revealed: true } : p2Slot.faceDownCard,
    horizontalCards: p2Horizontal,
  };

  let log = state.log;

  // Coringa (redesenho completo) - Rainha armadilha revelada em Combate: sem
  // isso, uma cópia decidida automaticamente pela IA (quando a dona da
  // Rainha é a IA - ver decideCoringaQCopyTarget/GameBoard.tsx) fica
  // completamente muda pro adversário humano, que só vê o valor final sem
  // entender de onde veio. `isCoringaRawTrapCard` continua `true` aqui
  // mesmo após `applyCoringaTrapCombatValue` já ter aplicado o
  // `transformedValue` (só marca `coringaTransformedToNumeral`, nunca
  // setado neste caminho) - por isso dá pra checar depois da reatribuição.
  if (p1Slot.faceDownCard && p1Slot.faceDownCard.value === 'Q' && isCoringaRawTrapCard(state, 1, p1Slot.faceDownCard)) {
    log = appendLog(state, log, 'magic', `A Rainha armadilha de Jogador 1 copiou o valor ${p1Slot.faceDownCard.transformedValue} nesta disputa`, { player: 1 });
  }
  if (p2Slot.faceDownCard && p2Slot.faceDownCard.value === 'Q' && isCoringaRawTrapCard(state, 2, p2Slot.faceDownCard)) {
    log = appendLog(state, log, 'magic', `A Rainha armadilha de Jogador 2 copiou o valor ${p2Slot.faceDownCard.transformedValue} nesta disputa`, { player: 2 });
  }

  // FIX (pedido do usuário): a Fúria Selvagem da Besta dobrava a SOMA de
  // todas as cartas horizontais do slot alvo (e não fazia nada se o slot não
  // tivesse nenhuma horizontal). Agora ela dobra o valor de UMA carta
  // específica escolhida pelo jogador (monsterTargetCardId) - pode ser a
  // carta principal do slot OU uma das horizontais.
  const p1BestaDoubleId =
    state.player1Character === 'besta' && state.player1.monsterCard?.monsterUsed ? state.player1.monsterTargetCardId : undefined;
  const p2BestaDoubleId =
    state.player2Character === 'besta' && state.player2.monsterCard?.monsterUsed ? state.player2.monsterTargetCardId : undefined;

  // Mosqueteiro - Rei (Tiro Certeiro): soma `mosqueteiroBoostAmount` (fixo,
  // calculado no instante da ativação - ver handleExecuteMagic) na carta
  // `mosqueteiroBoostedCardId`, principal ou horizontal, do PRÓPRIO campo -
  // um bônus ADITIVO (não multiplicador, diferente da Fúria Selvagem acima),
  // então os dois efeitos coexistem sem conflito na mesma carta se algum dia
  // isso for possível (nunca é hoje - são personagens diferentes).
  const p1MosqueteiroBoostId = state.player1Character === 'mosqueteiro' ? state.player1.mosqueteiroBoostedCardId : undefined;
  const p1MosqueteiroBoostAmount = state.player1.mosqueteiroBoostAmount;
  const p2MosqueteiroBoostId = state.player2Character === 'mosqueteiro' ? state.player2.mosqueteiroBoostedCardId : undefined;
  const p2MosqueteiroBoostAmount = state.player2.mosqueteiroBoostAmount;

  // FIX (item 10 da 2ª rodada): campo vazio (jogador não posicionou carta
  // ali) vale 1 no combate, em vez de ser um caso impossível/recusado.
  // FIX (pedido do usuário, Modo Spotlight): `getSpotlightAdjustedValue` no
  // lugar de `getEffectiveCardValue` em toda esta função - já resolve o
  // valor efetivo normal quando não há Spotlight ativo (ver spotlight.ts).
  const p1MainDoubled = Boolean(p1Slot.faceDownCard && p1BestaDoubleId === p1Slot.faceDownCard.id);
  const p1MainBoosted = Boolean(p1Slot.faceDownCard && p1MosqueteiroBoostId === p1Slot.faceDownCard.id);
  const p1Base = p1Slot.faceDownCard
    ? getSpotlightAdjustedValue(p1Slot.faceDownCard, state.spotlight) * (p1MainDoubled ? 2 : 1) + (p1MainBoosted ? p1MosqueteiroBoostAmount : 0)
    : 1;
  let p1DoubledHorizontal: Card | undefined;
  let p1BoostedHorizontal: Card | undefined;
  const p1HorizontalValue = p1Horizontal.reduce((sum, c) => {
    const doubled = p1BestaDoubleId === c.id;
    const boosted = p1MosqueteiroBoostId === c.id;
    if (doubled) p1DoubledHorizontal = c;
    if (boosted) p1BoostedHorizontal = c;
    return sum + getSpotlightAdjustedValue(c, state.spotlight) * (doubled ? 2 : 1) + (boosted ? p1MosqueteiroBoostAmount : 0);
  }, 0);
  if (p1MainDoubled) {
    const base = getSpotlightAdjustedValue(p1Slot.faceDownCard!, state.spotlight);
    log = appendLog(state, log, 'monster', `Fúria Selvagem dobrou a carta ${p1Slot.faceDownCard!.value}${p1Slot.faceDownCard!.suit} de Jogador 1 (${base} → ${base * 2})`, { player: 1 });
  } else if (p1DoubledHorizontal) {
    const base = getSpotlightAdjustedValue(p1DoubledHorizontal, state.spotlight);
    log = appendLog(state, log, 'monster', `Fúria Selvagem dobrou a carta ${p1DoubledHorizontal.value}${p1DoubledHorizontal.suit} de Jogador 1 (${base} → ${base * 2})`, { player: 1 });
  }
  if (p1MainBoosted || p1BoostedHorizontal) {
    const boostedCard = p1MainBoosted ? p1Slot.faceDownCard! : p1BoostedHorizontal!;
    log = appendLog(state, log, 'magic', `Tiro Certeiro reforçou a carta ${boostedCard.value}${boostedCard.suit} de Jogador 1 em +${p1MosqueteiroBoostAmount}`, { player: 1 });
  }
  // FIX (Modo Towers, pedido do usuário): a reserva da torre (cartas
  // empilhadas ABAIXO do topo) soma ao valor de combate do slot - o topo
  // (p1Base acima) já é contado normalmente, então isso nunca soma em
  // dobro. Fúria Selvagem nunca dobra uma carta da reserva (só o topo ou uma
  // horizontal, e torre nunca tem horizontal - ver design do Modo Towers).
  const p1TowerValue = (p1Slot.towerReserve ?? []).reduce((sum, c) => sum + getSpotlightAdjustedValue(c, state.spotlight), 0);
  const p1Total = p1Base + p1HorizontalValue + p1TowerValue;

  const p2MainDoubled = Boolean(p2Slot.faceDownCard && p2BestaDoubleId === p2Slot.faceDownCard.id);
  const p2MainBoosted = Boolean(p2Slot.faceDownCard && p2MosqueteiroBoostId === p2Slot.faceDownCard.id);
  const p2Base = p2Slot.faceDownCard
    ? getSpotlightAdjustedValue(p2Slot.faceDownCard, state.spotlight) * (p2MainDoubled ? 2 : 1) + (p2MainBoosted ? p2MosqueteiroBoostAmount : 0)
    : 1;
  let p2DoubledHorizontal: Card | undefined;
  let p2BoostedHorizontal: Card | undefined;
  const p2HorizontalValue = p2Horizontal.reduce((sum, c) => {
    const doubled = p2BestaDoubleId === c.id;
    const boosted = p2MosqueteiroBoostId === c.id;
    if (doubled) p2DoubledHorizontal = c;
    if (boosted) p2BoostedHorizontal = c;
    return sum + getSpotlightAdjustedValue(c, state.spotlight) * (doubled ? 2 : 1) + (boosted ? p2MosqueteiroBoostAmount : 0);
  }, 0);
  if (p2MainDoubled) {
    const base = getSpotlightAdjustedValue(p2Slot.faceDownCard!, state.spotlight);
    log = appendLog(state, log, 'monster', `Fúria Selvagem dobrou a carta ${p2Slot.faceDownCard!.value}${p2Slot.faceDownCard!.suit} de Jogador 2 (${base} → ${base * 2})`, { player: 2 });
  } else if (p2DoubledHorizontal) {
    const base = getSpotlightAdjustedValue(p2DoubledHorizontal, state.spotlight);
    log = appendLog(state, log, 'monster', `Fúria Selvagem dobrou a carta ${p2DoubledHorizontal.value}${p2DoubledHorizontal.suit} de Jogador 2 (${base} → ${base * 2})`, { player: 2 });
  }
  if (p2MainBoosted || p2BoostedHorizontal) {
    const boostedCard = p2MainBoosted ? p2Slot.faceDownCard! : p2BoostedHorizontal!;
    log = appendLog(state, log, 'magic', `Tiro Certeiro reforçou a carta ${boostedCard.value}${boostedCard.suit} de Jogador 2 em +${p2MosqueteiroBoostAmount}`, { player: 2 });
  }
  const p2TowerValue = (p2Slot.towerReserve ?? []).reduce((sum, c) => sum + getSpotlightAdjustedValue(c, state.spotlight), 0);
  const p2Total = p2Base + p2HorizontalValue + p2TowerValue;

  const p1HorizontalText = p1Horizontal.length > 0 ? ` + ${p1Horizontal.map((c) => `${c.value}${c.suit}`).join(' + ')}` : '';
  const p2HorizontalText = p2Horizontal.length > 0 ? ` + ${p2Horizontal.map((c) => `${c.value}${c.suit}`).join(' + ')}` : '';
  const p1TowerText = (p1Slot.towerReserve ?? []).length > 0 ? ` + torre(${p1TowerValue})` : '';
  const p2TowerText = (p2Slot.towerReserve ?? []).length > 0 ? ` + torre(${p2TowerValue})` : '';
  const p1CardText = p1Slot.faceDownCard ? `${p1Slot.faceDownCard.value}${p1Slot.faceDownCard.suit}` : 'campo vazio (1)';
  const p2CardText = p2Slot.faceDownCard ? `${p2Slot.faceDownCard.value}${p2Slot.faceDownCard.suit}` : 'campo vazio (1)';
  log = appendLog(
    state,
    log,
    'combat',
    `Cartas reveladas: Jogador 1 (${p1CardText}${p1HorizontalText}${p1TowerText}) vs Jogador 2 (${p2CardText}${p2HorizontalText}${p2TowerText})`
  );

  let player1: PlayerState = { ...state.player1, field: newP1Field };
  let player2: PlayerState = { ...state.player2, field: newP2Field };
  let winner: PlayerNumber | 'tie';
  let disputeWinner: PlayerNumber | null = null;
  let gameOver: GameState['gameOver'] = null;

  // Coringa (redesenho completo) - Rei armadilha revelado em Combate: força
  // esta disputa a empate por completo, ANTES de comparar p1Total/p2Total -
  // o valor de qualquer um dos dois lados nunca importa quando o Rei está
  // envolvido (mesmo se ele "venceria" por valor, o resultado real é
  // sempre o empate forçado). A devolução da carta do oponente pra mão
  // (ou o "pop" do topo da torre) acontece em handleFinalizeCombat.
  const p1RawKing = p1Slot.faceDownCard && isCoringaRawTrapCard(state, 1, p1Slot.faceDownCard) && p1Slot.faceDownCard.value === 'K';
  const p2RawKing = p2Slot.faceDownCard && isCoringaRawTrapCard(state, 2, p2Slot.faceDownCard) && p2Slot.faceDownCard.value === 'K';
  let coringaKForcedTie: CombatResolution['coringaKForcedTie'];
  if (p1RawKing || p2RawKing) {
    const koPlayer: PlayerNumber = p1RawKing ? 1 : 2;
    winner = 'tie';
    coringaKForcedTie = { koPlayer };
    log = appendLog(
      state,
      log,
      'magic',
      `O Rei armadilha de Jogador ${koPlayer} explodiu em fumaça e nuvens - a disputa é um empate e a carta do oponente volta pra mão dele!`,
      { player: koPlayer }
    );
  } else if (p1Total > p2Total) {
    winner = 1;
    player1 = { ...player1, combatWins: state.player1.combatWins + 1 };
    log = appendLog(state, log, 'combat', `Jogador 1 vence o combate! (${p1Total} > ${p2Total})`, { player: 1 });

    if (player1.combatWins >= 2) {
      disputeWinner = 1;
      player2 = { ...player2, lives: state.player2.lives - 1, combatWins: 0 };
      player1 = { ...player1, combatWins: 0 };
      log = appendLog(state, log, 'combat', `Jogador 1 vence a DISPUTA! Jogador 2 perde 1 vida`, { player: 1 });
      if (player2.lives <= 0) gameOver = { winner: 1 };
    }
  } else if (p2Total > p1Total) {
    winner = 2;
    player2 = { ...player2, combatWins: state.player2.combatWins + 1 };
    log = appendLog(state, log, 'combat', `Jogador 2 vence o combate! (${p2Total} > ${p1Total})`, { player: 2 });

    if (player2.combatWins >= 2) {
      disputeWinner = 2;
      player1 = { ...player1, lives: state.player1.lives - 1, combatWins: 0 };
      player2 = { ...player2, combatWins: 0 };
      log = appendLog(state, log, 'combat', `Jogador 2 vence a DISPUTA! Jogador 1 perde 1 vida`, { player: 2 });
      if (player1.lives <= 0) gameOver = { winner: 2 };
    }
  } else {
    winner = 'tie';
    log = appendLog(state, log, 'combat', `Empate! (${p1Total} = ${p2Total})`);
  }

  return {
    ...state,
    player1,
    player2,
    log,
    combatSelection: {},
    // FIX (pedido do usuário - turno preso em empate/vitória não-decisiva):
    // conta este combate resolvido, não importa o resultado (vitória,
    // disputa fechada ou empate) - handleFinalizeCombat usa isso pra saber
    // se ainda restam pares de slot pra batalhar nesta fase.
    combatRoundsThisPhase: state.combatRoundsThisPhase + 1,
    gameOver,
    combatResolution: { p1SlotIndex: p1Slot0, p2SlotIndex: p2Slot0, winner, p1Value: p1Total, p2Value: p2Total, disputeWinner, coringaKForcedTie },
  };
}

/**
 * Segunda etapa da resolução de combate, despachada pela UI depois de exibir
 * o popup de resultado por alguns segundos.
 *
 * FIX (bug original mais grave do jogo): aqui é onde ficava a duplicação de
 * cartas. A versão anterior calculava "quais cartas descartar" em dois
 * lugares diferentes e depois um sobrescrevia parcialmente o outro, deixando
 * cartas simultaneamente em campo e na pilha de descarte quando alguém vencia
 * uma disputa com um terceiro slot ainda não batalhado. Agora existe uma
 * única fonte de verdade: se a disputa foi fechada, TODOS os slots de ambos
 * os jogadores são limpos e suas cartas descartadas; senão, só os dois slots
 * que batalharam são limpos. Nunca os dois ao mesmo tempo, nunca em duplicado.
 */
function handleFinalizeCombat(state: GameState): GameState {
  const resolution = state.combatResolution;
  if (!resolution) return state;
  const { p1SlotIndex, p2SlotIndex, disputeWinner } = resolution;

  let player1 = state.player1;
  let player2 = state.player2;
  let cardsToDiscard: Card[];
  let log = state.log;

  if (disputeWinner) {
    // FIX (itens 4 e 7 da 3ª rodada): quando a disputa fecha, TODO o campo de
    // ambos os jogadores é descartado (ver comentário original desta função).
    // FIX (pedido do usuário, rodada seguinte): a carta Monstro de cada zona
    // própria NÃO entra mais aqui incondicionalmente - ela só se descarta
    // depois do 3º uso (ver resolveMonsterCardAtTurnEnd). Como uma disputa
    // fechada sempre avança pro turno seguinte via advancePhaseState logo
    // abaixo (a menos que a partida tenha acabado agora), é ele quem decide
    // se a carta Monstro persiste ou descarta - aqui só o campo normal (os 3
    // slots de combate) é descartado.
    cardsToDiscard = [...fieldCards(player1.field), ...fieldCards(player2.field)];
    player1 = { ...player1, field: emptyField() };
    player2 = { ...player2, field: emptyField() };
  } else {
    const p1Slot = player1.field[p1SlotIndex];
    const p2Slot = player2.field[p2SlotIndex];

    // Modo Towers - "torre solitária" (pedido do usuário, ver comentário
    // completo de `combatLoneTower` em GameState): em vez de descartar a
    // torre INTEIRA como qualquer slot normal, ela só perde a carta do topo
    // (que acabou de batalhar) - o restante da reserva permanece no slot,
    // promovendo a próxima carta a novo topo, pronta pra próxima disputa. Só
    // quando a reserva já está vazia (última carta da torre) ela vira um
    // slot comum, igual ao resto do jogo.
    const loneTower = state.combatLoneTower;
    const isP1LoneTower = loneTower?.towerOwner === 1 && loneTower.slotIndex === p1SlotIndex;
    const isP2LoneTower = loneTower?.towerOwner === 2 && loneTower.slotIndex === p2SlotIndex;

    const resolveSlot = (slot: FieldSlot, isLoneTower: boolean): { newSlot: FieldSlot; discarded: Card[] } => {
      if (!isLoneTower) {
        // FIX (Modo Towers, pedido do usuário - bug real encontrado): a
        // reserva da torre (cartas empilhadas abaixo do topo) não entrava
        // aqui - o slot era resetado pra vazio sem essas cartas nunca irem
        // pro descarte, sumindo do jogo de vez (quebrava a conservação
        // total de cartas da partida).
        const discarded = [slot.faceDownCard, ...(slot.towerReserve ?? []), ...slot.horizontalCards].filter((c): c is Card => Boolean(c));
        return { newSlot: { revealed: false, horizontalCards: [] }, discarded };
      }
      const reserve = slot.towerReserve ?? [];
      const discarded = [slot.faceDownCard, ...slot.horizontalCards].filter((c): c is Card => Boolean(c));
      if (reserve.length === 0) {
        return { newSlot: { revealed: false, horizontalCards: [] }, discarded };
      }
      const newTop = reserve[reserve.length - 1];
      const newReserve = reserve.slice(0, -1);
      return {
        newSlot: { faceDownCard: newTop, towerReserve: newReserve.length > 0 ? newReserve : undefined, revealed: true, horizontalCards: [] },
        discarded,
      };
    };

    // Coringa (redesenho completo) - Rei armadilha: a carta do OPONENTE
    // (nunca a do próprio Coringa, que explode/descarta normalmente via
    // resolveSlot acima) volta pra MÃO dele em vez de ir pro descarte - "a
    // qualquer momento" (não importa quem venceria por valor, já forçado a
    // empate em handleResolveCombat). No modo Towers contra uma torre, só o
    // TOPO volta pra mão (resposta do usuário confirmada) - o resto da
    // reserva permanece no campo, promovendo a próxima carta a novo topo,
    // mesmo padrão de "pop" já usado pela torre solitária acima.
    const koForcedTie = resolution.coringaKForcedTie;
    const opponentOfKo = koForcedTie ? opponentOf(koForcedTie.koPlayer) : undefined;
    const resolveSlotToHand = (slot: FieldSlot): { newSlot: FieldSlot; returnedToHand: Card[] } => {
      const reserve = slot.towerReserve ?? [];
      const returnedToHand = [slot.faceDownCard, ...slot.horizontalCards].filter((c): c is Card => Boolean(c));
      if (reserve.length === 0) {
        return { newSlot: { revealed: false, horizontalCards: [] }, returnedToHand };
      }
      const newTop = reserve[reserve.length - 1];
      const newReserve = reserve.slice(0, -1);
      return {
        newSlot: { faceDownCard: newTop, towerReserve: newReserve.length > 0 ? newReserve : undefined, revealed: true, horizontalCards: [] },
        returnedToHand,
      };
    };

    let p1ReturnedToHand: Card[] = [];
    let p2ReturnedToHand: Card[] = [];
    let p1Result: { newSlot: FieldSlot; discarded: Card[] };
    let p2Result: { newSlot: FieldSlot; discarded: Card[] };

    if (opponentOfKo === 1) {
      const toHand = resolveSlotToHand(p1Slot);
      p1Result = { newSlot: toHand.newSlot, discarded: [] };
      p1ReturnedToHand = toHand.returnedToHand;
      p2Result = resolveSlot(p2Slot, isP2LoneTower);
    } else if (opponentOfKo === 2) {
      const toHand = resolveSlotToHand(p2Slot);
      p2Result = { newSlot: toHand.newSlot, discarded: [] };
      p2ReturnedToHand = toHand.returnedToHand;
      p1Result = resolveSlot(p1Slot, isP1LoneTower);
    } else {
      p1Result = resolveSlot(p1Slot, isP1LoneTower);
      p2Result = resolveSlot(p2Slot, isP2LoneTower);
    }
    cardsToDiscard = [...p1Result.discarded, ...p2Result.discarded];

    const newP1Field = [...player1.field] as [FieldSlot, FieldSlot, FieldSlot];
    const newP2Field = [...player2.field] as [FieldSlot, FieldSlot, FieldSlot];
    newP1Field[p1SlotIndex] = p1Result.newSlot;
    newP2Field[p2SlotIndex] = p2Result.newSlot;
    player1 = {
      ...player1,
      field: newP1Field,
      hand: p1ReturnedToHand.length > 0 ? [...player1.hand, ...p1ReturnedToHand.map((c) => ({ ...c, revealed: false }))] : player1.hand,
    };
    player2 = {
      ...player2,
      field: newP2Field,
      hand: p2ReturnedToHand.length > 0 ? [...player2.hand, ...p2ReturnedToHand.map((c) => ({ ...c, revealed: false }))] : player2.hand,
    };
    if (p1ReturnedToHand.length > 0 || p2ReturnedToHand.length > 0) {
      log = appendLog(state, log, 'combat', `A carta atingida pelo Rei armadilha voltou pra mão do dono, ainda oculta`);
    }
  }

  const { deck, discardPile } = pushToDiscard(state, cardsToDiscard);

  let nextState: GameState = {
    ...state,
    player1,
    player2,
    deck,
    discardPile,
    log,
    combatResolution: null,
  };

  // Uma disputa fechada avança o jogo direto para o próximo turno (a menos
  // que a partida tenha acabado agora); uma resolução de combate "normal"
  // (vitória que não fecha a disputa, ou empate) limpa os dois slots e
  // aguarda os jogadores continuarem (outra seleção de combate, ou ambos
  // marcarem "Pronto") - A NÃO SER que não sobre nenhum par de slot pra
  // batalhar.
  //
  // FIX (pedido do usuário: "turnos aparentemente só acabam caso um jogador
  // vença um combate, ao invés de acabar... quando ocorre um empate") - só
  // existem 3 pares de slot possíveis por fase de Combate; antes, se os 3
  // resolvessem sem ninguém fechar uma disputa (ex.: um empate, ou um
  // placar 1-1 que nunca chega a 2), a fase ficava "presa" esperando os dois
  // jogadores clicarem "Pronto" manualmente, mesmo sem mais nada pra
  // batalhar. Agora, ao atingir o 3º combate resolvido nesta fase
  // (`combatRoundsThisPhase >= 3`), o turno avança automaticamente também
  // nesses casos.
  if (!nextState.gameOver && (disputeWinner || nextState.combatRoundsThisPhase >= 3)) {
    nextState = advancePhaseState(nextState);
  }

  return nextState;
}

// ---------------------------------------------------------------------------
// Pronto / avanço de fase
// ---------------------------------------------------------------------------

function handleToggleReady(state: GameState, player: PlayerNumber): GameState {
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
  next = { ...next, log: appendLog(state, state.log, 'system', `Jogador ${player} ${newReady ? 'está pronto' : 'não está mais pronto'} para avançar`, { player }) };

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
    const cardsToDiscard = [...fieldCards(next.player1.field), ...fieldCards(next.player2.field)];
    const { deck, discardPile } = pushToDiscard(next, cardsToDiscard);
    next = {
      ...next,
      deck,
      discardPile,
      player1: { ...next.player1, field: emptyField(), readyForNextPhase: false },
      player2: { ...next.player2, field: emptyField(), readyForNextPhase: false },
    };
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
function advancePhaseState(state: GameState): GameState {
  let newPhase: Phase;
  let newFirstToFlip = state.firstToFlip;
  let newTurn = state.turn;
  let log = state.log;
  let deck = state.deck;
  let newCombatLoneTower: GameState['combatLoneTower'] = null;
  let discardPile = state.discardPile;
  let p1Monster: { kept: Card | undefined; discarded: Card | undefined } = { kept: state.player1.monsterCard, discarded: undefined };
  let p2Monster: { kept: Card | undefined; discarded: Card | undefined } = { kept: state.player2.monsterCard, discarded: undefined };
  let newSpotlight = state.spotlight;

  if (state.phase === 'draw') {
    newPhase = 'strategy';
    log = appendLog(state, log, 'phase', `Turno ${state.turn} - Fase de Estratégia`, { phaseOverride: 'strategy' });
  } else if (state.phase === 'strategy') {
    newPhase = 'combat';
    newCombatLoneTower = computeLoneTowerForCombat(state);
    log = appendLog(
      state,
      log,
      'phase',
      newCombatLoneTower ? `Turno ${state.turn} - Ataque à Torre!` : `Turno ${state.turn} - Fase de Combate`,
      { phaseOverride: 'combat' }
    );
  } else {
    newPhase = 'draw';
    newFirstToFlip = state.firstToFlip === 1 ? 2 : 1;
    newTurn = state.turn + 1;
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

    const leftover = [
      ...fieldCards(state.player1.field),
      ...fieldCards(state.player2.field),
      ...(p1Monster.discarded ? [p1Monster.discarded] : []),
      ...(p2Monster.discarded ? [p2Monster.discarded] : []),
    ];
    if (leftover.length > 0) {
      const pushed = pushToDiscard({ deck, discardPile, gameConfig: state.gameConfig }, leftover);
      deck = pushed.deck;
      discardPile = pushed.discardPile;
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
  let activeNumeralSpells = state.activeNumeralSpells;
  if (newPhase === 'draw') {
    const next = { ...activeNumeralSpells };
    let changed = false;
    for (const p of [1, 2] as PlayerNumber[]) {
      const entry = next[p];
      if (entry && newTurn > entry.expiresAtTurn) {
        delete next[p];
        changed = true;
        log = appendLog(state, log, 'numeral-spell', `Efeito da Magia Numeral de Jogador ${p} terminou`, { player: p });
      }
    }
    if (changed) activeNumeralSpells = next;
  }

  // FIX (item 10 da 2ª rodada): "certas batalhas terminam com apenas uma ou
  // duas disputas mesmo com empates" - `combatWins` só era zerado dentro do
  // próprio branch de VITÓRIA de uma disputa (handleResolveCombat, quando um
  // dos lados chega a 2). Se a fase de combate terminasse de forma
  // INCONCLUSIVA (ex.: um empate consumiu um dos 3 pares de slots, sobrando
  // pares insuficientes para qualquer lado chegar a 2 vitórias reais nesta
  // fase), o contador ficava com um valor "preso" (1-0, 0-1, etc.) que
  // atravessava para a PRÓXIMA fase de combate - bastando UMA vitória comum
  // no turno seguinte para fechar a disputa precocemente. Como esse contador
  // só tem sentido DENTRO de uma única fase de combate, ele agora é sempre
  // zerado a cada transição de fase (nunca precisa "sobreviver" a uma
  // transição, mesmo dentro do mesmo turno).
  const resetForNewTurn = (p: PlayerState, monster: { kept: Card | undefined }): PlayerState => ({
    ...p,
    // FIX (Modo Towers, pedido do usuário): "mão aumentada em 1".
    // Mosqueteiro - Munição Infinita: bônus recalculado do zero em TODA
    // transição de fase a partir de `mosqueteiroHandLimitBonusUntilTurn`
    // (não somado uma vez só) - garante que o bônus suma sozinho, sem ação
    // extra, no turno em que expira.
    handLimit:
      8 +
      p.permanentDrawBonus +
      (state.gameConfig.towersMode ? 1 : 0) +
      (p.mosqueteiroHandLimitBonusUntilTurn !== undefined && newTurn <= p.mosqueteiroHandLimitBonusUntilTurn ? p.mosqueteiroHandLimitBonusAmount : 0),
    mosqueteiroHandLimitBonusUntilTurn:
      p.mosqueteiroHandLimitBonusUntilTurn !== undefined && newTurn <= p.mosqueteiroHandLimitBonusUntilTurn ? p.mosqueteiroHandLimitBonusUntilTurn : undefined,
    mosqueteiroHandLimitBonusAmount:
      p.mosqueteiroHandLimitBonusUntilTurn !== undefined && newTurn <= p.mosqueteiroHandLimitBonusUntilTurn ? p.mosqueteiroHandLimitBonusAmount : 0,
    // Coringa (redesenho completo) - Mão de Ferro: a janela de transformação
    // expira sozinha, mesmo padrão dos campos acima - só CONTROLA quando o
    // botão de transformar pode ser apertado, nunca desfaz uma
    // transformação já feita (ver `coringaTransformedToNumeral` em Card,
    // permanente, nunca mexido aqui).
    coringaTransformWindowUntilTurn:
      p.coringaTransformWindowUntilTurn !== undefined && newTurn <= p.coringaTransformWindowUntilTurn ? p.coringaTransformWindowUntilTurn : undefined,
    horizontalStackBonus: 0,
    combatWins: 0,
    field: newPhase === 'draw' ? emptyField() : p.field,
    monsterCard: newPhase === 'draw' ? monster.kept : p.monsterCard,
    monsterTargetSlot: newPhase === 'draw' ? undefined : p.monsterTargetSlot,
    monsterTargetCardId: newPhase === 'draw' ? undefined : p.monsterTargetCardId,
    discardsThisTurn: newPhase === 'draw' ? 0 : p.discardsThisTurn,
    drawsThisTurn: newPhase === 'draw' ? 0 : p.drawsThisTurn,
    fusesThisTurn: newPhase === 'draw' ? 0 : p.fusesThisTurn,
    towerSlotThisTurn: newPhase === 'draw' ? undefined : p.towerSlotThisTurn,
    // Mosqueteiro (personagem novo) - janela deslizante de 3 turnos (ver
    // comentário completo em `mosqueteiroDiscardsThisTurn`, PlayerState): a
    // cada nova virada de turno, T-1 vira T-2 e o valor final do turno que
    // está terminando vira o novo T-1 - só acontece de verdade na entrada na
    // fase de Compra (nova virada de turno), mesmo padrão de todo o resto
    // deste helper.
    mosqueteiroDiscardsTurnMinus2: newPhase === 'draw' ? p.mosqueteiroDiscardsTurnMinus1 : p.mosqueteiroDiscardsTurnMinus2,
    mosqueteiroDiscardsTurnMinus1: newPhase === 'draw' ? p.mosqueteiroDiscardsThisTurn : p.mosqueteiroDiscardsTurnMinus1,
    mosqueteiroDiscardsThisTurn: newPhase === 'draw' ? 0 : p.mosqueteiroDiscardsThisTurn,
    mosqueteiroRedirectNextDiscard: newPhase === 'draw' ? false : p.mosqueteiroRedirectNextDiscard,
    mosqueteiroBoostedCardId: newPhase === 'draw' ? undefined : p.mosqueteiroBoostedCardId,
    mosqueteiroBoostAmount: newPhase === 'draw' ? 0 : p.mosqueteiroBoostAmount,
  });

  const player1Result = resetForNewTurn(state.player1, p1Monster);
  const player2Result = resetForNewTurn(state.player2, p2Monster);

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
