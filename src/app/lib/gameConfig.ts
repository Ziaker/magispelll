/**
 * gameConfig.ts - Configuração de uma partida
 *
 * Tipo central (fica em lib/ e não no componente GameConfig.tsx) para que
 * gameEngine.ts possa depender dele sem criar uma dependência de lib → componente.
 *
 * STATUS DAS OPÇÕES:
 * - mode: 'hotseat' (2 jogadores no mesmo dispositivo), 'vsAI' (sozinho
 *   contra o computador) e 'spectator' (pedido do usuário: "modo espectador
 *   abaixo do vs IA que é apenas IA vs IA" - os dois lados são controlados
 *   pela IA, ninguém joga, só assiste) estão implementados - todos os três
 *   reaproveitam exatamente a mesma lib/aiPlayer.ts, só mudando QUANTOS
 *   jogadores ela controla (ver `aiPlayers` em GameBoard.tsx). 'online'
 *   exige um back-end de multiplayer que não existe neste projeto - a opção
 *   fica desabilitada ("em breve") na tela de configuração.
 * - deckType: apenas 'common' (52 + 2 Coringas) está implementado. 'thematic'
 *   (baralho de 62 cartas com conteúdo novo) exige cartas que não existem
 *   neste projeto - fica desabilitada ("em breve") também.
 * - monsterCards: totalmente funcional (gera ou não os 2 Coringas).
 * - autoShowEffects: reservado para uma futura melhoria de UX (destacar
 *   automaticamente efeitos de magia numeral); não afeta regras do jogo.
 * - autoShuffle: totalmente funcional - ver reshuffleDiscardIntoDeck em
 *   cardUtils.ts e seu uso em gameEngine.ts.
 * - fusion: totalmente funcional (pedido do usuário) - permite juntar 2
 *   cartas numerais da mão em 1 só, na fase de Compra, até `fusionLimit`
 *   vezes por turno - ver fusion.ts/FUSE_CARDS em gameEngine.ts. Desligada
 *   por padrão (é uma variante nova/opcional, diferente de Cartas Monstro
 *   que já é parte histórica do jogo).
 * - fusionLimit: quantas fusões cada jogador pode fazer por turno quando
 *   `fusion` está ligado (1-4, padrão 1). Só tem efeito com `fusion: true` -
 *   ver o seletor abaixo do switch "Fusão" em GameConfig.tsx.
 * - drawLimitEnabled/drawLimit: totalmente funcional (pedido do usuário) -
 *   limite opcional de quantas cartas podem ser COMPRADAS (DRAW_CARDS, a
 *   compra normal da fase de Compra) por turno, independente do limite de
 *   mão (`handLimit`) - desligado por padrão (compra livre até a mão
 *   encher, comportamento histórico do jogo). NUNCA afeta cartas ganhas por
 *   efeitos de magia (ex.: Recuperação Selvagem da Besta, Benção Divina do
 *   Anjo) - só a compra manual da fase de Compra passa por essa checagem
 *   (ver handleDrawCards em gameEngine.ts).
 * - discardLimit: quantas cartas podem ser descartadas por turno na fase de
 *   Compra (mínimo 4, era um valor fixo de 4 antes de virar configurável -
 *   pedido do usuário). Sempre ativo (não tem switch liga/desliga, só o
 *   número é ajustável) - ver handleDiscardCards em gameEngine.ts.
 * - towersMode: totalmente funcional (pedido do usuário, variante nova) -
 *   quando ligado: +1 compra, +1 descarte e +1 limite de mão pros dois
 *   jogadores desde o início da partida, e o baralho ganha +20 numerais
 *   (2-10) e +2 Áses extras (ver generateDeck em cardUtils.ts). Permite
 *   empilhar cartas de mesmo número num único slot de campo por turno (ver
 *   FieldSlot.towerReserve/FORM_OR_REINFORCE_TOWER em gameEngine.ts).
 *   Desligada por padrão, igual Fusão - variante opcional, não faz parte do
 *   jogo histórico.
 * - spotlightMode/spotlightCount/spotlightPositive/spotlightNegative:
 *   totalmente funcional (pedido do usuário, modo novo "Spotlight") - no
 *   início de CADA turno, `spotlightCount` (1-3) números de 2 a 10 são
 *   sorteados (sem repetir entre si no mesmo turno); cada um recebe uma
 *   polaridade - positiva (`spotlightPositive`, valor da carta x3 em TUDO
 *   que usa esse valor: combate, Magia Numeral, Torres) ou negativa
 *   (`spotlightNegative`, valor da carta fixado em 1) - ver spotlight.ts
 *   para a mecânica completa (rollSpotlight/getSpotlightAdjustedValue).
 *   Com as duas polaridades ligadas ao mesmo tempo, cada número sorteado
 *   recebe a sua própria moeda ao ar, independente dos outros. Precisa de
 *   pelo menos uma polaridade ligada pra ter efeito - a tela de
 *   configuração (GameConfig.tsx) garante isso. Desligado por padrão, igual
 *   Fusão/Towers - variante opcional. Suporta todos os outros modos
 *   simultaneamente (Towers, Cartas Monstro, Fusão, limites de
 *   compra/descarte etc.) - nenhum deles precisa saber que Spotlight existe.
 * - reactionsMode/reactionsLimit: totalmente funcional (pedido do usuário,
 *   modo novo "Reações") - toda vez que uma magia (J/Q/K) é ativada, se o
 *   oponente tiver uma carta mágica do MESMO valor na mão (e ainda não tiver
 *   estourado `reactionsLimit`, 1-3, reações NESTA fase), a ativação é
 *   ANUNCIADA (a carta fica revelada) e um contador de 3s aparece pro
 *   oponente reagir - reagindo, as duas cartas são descartadas e o efeito é
 *   negado; sem reação a tempo, o efeito se aplica normalmente. Ver
 *   PendingReaction/handleReactToMagic em gameEngine.ts. Desligado por
 *   padrão, igual Fusão/Towers/Spotlight - variante opcional.
 */
export interface GameConfig {
  mode: 'hotseat' | 'vsAI' | 'spectator' | 'online';
  deckType: 'common' | 'thematic';
  monsterCards: boolean;
  autoShowEffects: boolean;
  autoShuffle: boolean;
  fusion: boolean;
  fusionLimit: number;
  drawLimitEnabled: boolean;
  drawLimit: number;
  discardLimit: number;
  towersMode: boolean;
  spotlightMode: boolean;
  spotlightCount: number;
  spotlightPositive: boolean;
  spotlightNegative: boolean;
  reactionsMode: boolean;
  reactionsLimit: number;
}

/** Mínimo permitido para `discardLimit` - "como no jogo normal" (pedido do usuário). */
export const MIN_DISCARD_LIMIT = 4;

// FIX (pedido do usuário: "corrija o modo de jogo normal ser contra IA e com
// a carta monstro liberada") - o modo padrão ao abrir a tela de configuração
// era 'hotseat' (2 jogadores no mesmo dispositivo) com Cartas Monstro
// desligadas; agora abre direto em "Contra a IA" com Cartas Monstro
// habilitadas, o modo mais comum de um jogador solo experimentar o jogo pela
// primeira vez. Continua 100% ajustável na tela de configuração antes de
// "Iniciar Partida" - isto só muda o que vem PRÉ-SELECIONADO.
export const DEFAULT_GAME_CONFIG: GameConfig = {
  mode: 'vsAI',
  deckType: 'common',
  monsterCards: true,
  autoShowEffects: true,
  autoShuffle: true,
  fusion: false,
  fusionLimit: 1,
  drawLimitEnabled: false,
  drawLimit: 4,
  discardLimit: MIN_DISCARD_LIMIT,
  towersMode: false,
  spotlightMode: false,
  spotlightCount: 1,
  spotlightPositive: true,
  spotlightNegative: false,
  reactionsMode: false,
  reactionsLimit: 1,
};
