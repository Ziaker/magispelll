/**
 * gameStateTypes.ts - contrato estrutural do estado do Magispelll.
 *
 * Apenas tipos: nenhum reducer, regra de gameplay ou efeito runtime mora aqui.
 * Módulos de domínio podem depender destes shapes sem depender do gameEngine.
 */
import type { Card } from './cardUtils';
import type { GameConfig } from './gameConfig';
import type { SpotlightState } from './spotlight';
import type { CharacterId } from './characterRegistry';
import type { Phase, PlayerNumber } from './gameTypes';
import type { LogEntry } from './gameLogTypes';
import type { GameAction } from './gameActionTypes';
import type { ActiveNumeralSpells } from './numeralSpellLifecycle';
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
   * Ver FORM_OR_REINFORCE_TOWER.
   *
   * 3 estados, não 2 (FIX, pedido do usuário: "checagem que vê se ela ERA
   * uma torre ou É uma carta singular"): `undefined` = nunca foi torre;
   * `[]` (array vazio, nunca convertido de volta pra `undefined`) = FOI
   * torre e erodiu até sobrar só o topo sozinho (`isTowerSlot` falso, mas
   * `wasEverTowerSlot` verdadeiro); `.length > 0` = torre ativa agora
   * (`isTowerSlot`). Ver isTowerSlot/wasEverTowerSlot logo abaixo.
   */
  towerReserve?: Card[];
  /**
   * Druida (personagem novo) - cartas do Broto empilhadas ABAIXO do topo
   * (mesma forma de `towerReserve`, mas NUNCA erode - ver resolveCombatSlot).
   * Campo IRMÃO de `towerReserve`, não reaproveitado dele de propósito: um
   * Broto plantado sozinho (sem nenhum Valete extra empilhado) já marca este
   * campo como `[]` (define a PRESENÇA do Broto desde o nascimento, com só
   * 1 carta - diferente de `towerReserve`, que só chega a `[]` DEPOIS de já
   * ter sido uma torre de verdade, nunca no nascimento - uma torre precisa
   * de 2+ cartas pra nascer) - por isso `isBrotoSlot` testa PRESENÇA
   * (`!== undefined`), nunca o comprimento, diferente de `isTowerSlot`
   * (embora `wasEverTowerSlot` também teste só presença, pelo motivo
   * oposto: sinalizar histórico, não estado atual - ver os dois logo
   * abaixo). O valor de combate atual do
   * Broto vive em `faceDownCard.transformedValue` (mesmo campo reaproveitado
   * do Ás transformado e do Monstro-15 do Coringa) - a reserva aqui só
   * guarda as cartas físicas empilhadas por baixo, pra conservação de
   * cartas no colapso (ver fieldCards/resolveCombatSlot), nunca é somada
   * separadamente ao valor de combate (ao contrário de `towerReserve` -
   * comparar com `towerValue` em slotCombatTotal). `undefined` = sem Broto
   * neste slot. Ver PLANT_OR_STACK_BROTO/handlePlantOrStackBroto.
   */
  brotoReserve?: Card[];
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
   * para dobrar (StatusEffect `kind: 'combatModifier'`, ver statusEffects.ts
   * - a carta pode ser a principal do slot OU uma horizontal); para o Anjo,
   * o slot protegido contra magias; para o Mago, o slot cuja carta recebeu o
   * valor copiado. undefined enquanto o efeito não foi ativado neste turno
   * (ver monsterCard.monsterUsed).
   */
  monsterTargetSlot?: number;
  /**
   * Anjo (Proteção Divina) - FIX (pedido do usuário: "o monstro do anjo agora
   * só protege 1 slot selecionado do campo ao invés dos 3, mas pode ser
   * ativado múltiplas vezes no mesmo turno ao invés de 1 vez só") - volta a
   * proteger só o(s) slot(s) ESCOLHIDO(S) em vez do campo inteiro, mas como
   * agora pode ativar de novo no mesmo turno (`monsterUsed` nunca vira
   * `true` pro Anjo - só `monsterUseCount`, o orçamento de 3 usos VITALÍCIO,
   * limita), cada ativação pode mirar um slot DIFERENTE, acumulando aqui em
   * vez de sobrescrever um único `monsterTargetSlot`. Zerado a cada turno
   * (ver `resetForNewTurn`) - a proteção nunca sobrevive pro turno seguinte,
   * mesmo espírito de sempre.
   */
  monsterProtectedSlots: number[];
  /**
   * Overhaul genérico de Status Effects (ver `src/app/lib/statusEffects.ts`):
   * contadores/janelas temporárias do JOGADOR INTEIRO (não ligadas a uma
   * carta específica) - ex.: `redirectNextDiscard` do Mosqueteiro,
   * `transformWindow` do Coringa, `handLimitBonus` do Mosqueteiro,
   * `bloodRage` da Besta, `spreadArmed` do Piromante. Use os helpers
   * `hasStatus`/`getStatus`/`applyStatus`/`removeStatus`/`tickEntityStatuses`
   * em vez de ler/escrever este array diretamente.
   *
   * Efeitos ligados a UMA carta específica vivem em `Card.statusEffects` -
   * substitui `CombatModifier`/`PlayerState.combatModifiers` (o antigo array
   * plano de modificadores de valor de combate por `cardId`, que unificava a
   * Fúria Selvagem da Besta e o Tiro Certeiro do Mosqueteiro): o efeito
   * agora mora DENTRO da própria carta (`kind: 'combatModifier'`), não num
   * array solto do jogador. `handleResolveCombat` e `trueSlotValue`
   * (aiPlayer.ts) chamam a MESMA função (`applyCombatModifierStatuses`)
   * sobre a MESMA carta - a divergência fica estruturalmente impossível de
   * repetir. Fúria Selvagem da Besta fica registrada como `{ kind:
   * 'combatModifier', mode: 'multiply', magnitude: 2, source: 'besta' }` na
   * carta escolhida (principal ou horizontal) do PRÓPRIO slot. Tiro Certeiro
   * do Mosqueteiro e Simbiose/Urtiga do Druida ficam como `{ kind:
   * 'combatModifier', mode: 'add', magnitude: <valor>, source: ... }` -
   * Urtiga e Tiro Certeiro miram uma carta do campo do OPONENTE (`magnitude`
   * negativo), Simbiose mira uma carta do PRÓPRIO campo (`magnitude`
   * positivo). `duration: { type: 'untilPhase', phase: 'draw' }` em todos -
   * removido pelo tick genérico na virada pra Compra (ver `resetForNewTurn`).
   */
  statusEffects?: import('./statusEffects').StatusEffect[];
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
  // FIX (overhaul de Status Effects, Fase 5): os 5 contadores/flags a seguir
  // (mosqueteiroRedirectNextDiscard, mosqueteiroHandLimitBonusUntilTurn/
  // Amount, coringaTransformWindowUntilTurn, bestaBloodRageUntilTurn,
  // piromanteSpreadArmed) foram migrados para `PlayerState.statusEffects`
  // (kinds 'redirectNextDiscard', 'handLimitBonus', 'transformWindow',
  // 'bloodRage', 'spreadArmed' - ver statusEffects.ts). Cada um era um campo
  // solto reinventando o mesmo padrão "guarda um `...UntilTurn`, `resetForNewTurn`
  // compara e limpa" - agora usam os mesmos helpers genéricos
  // (hasStatus/getStatus/applyStatus/removeStatus/tickEntityStatuses) que
  // `magicLocked`/`combatModifier` já usam. Bônus: corrige o vazamento real
  // de `bestaBloodRageUntilTurn` (nunca era limpo de fato, só neutralizado
  // pela comparação de turno - o tick genérico remove o efeito expirado do
  // array de verdade).
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
   * Druida (personagem novo) - nível permanente de Fotossíntese (Magia
   * Numeral, A+3+7): 0 = nunca ativada; N = ativada N vezes NO TOTAL na
   * partida. Reativável sem teto (cada ativação soma +1) - mesmo padrão de
   * `permanentDrawBonus` do Anjo: NUNCA resetado em `resetForNewTurn`,
   * permanente pelo resto da partida. Somado diretamente em todo efeito
   * relacionado ao Broto (crescimento de turno, redução da Rainha/Rei) - ver
   * handleActivateNumeralSpell/handleExecuteMagic.
   */
  druidaPhotosynthesisLevel: number;
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
  activeNumeralSpells: ActiveNumeralSpells;
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
