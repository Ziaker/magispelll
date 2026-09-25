/**
 * gameLogTypes.ts - contrato de dados do log da partida.
 *
 * O motor produz estes eventos, mas a UI de log também precisa consumi-los
 * sem depender conceitualmente do reducer inteiro. Este módulo contém só
 * tipos, sem lógica nem efeitos colaterais.
 */
import type { Phase, PlayerNumber } from './gameTypes';
import type { CharacterId } from './characterRegistry';

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
 * Overhaul de Event System (item 5 do roadmap arquitetural, "regras
 * produzem eventos, apresentação decide como mostrar") - marcador
 * ESTRUTURAL opcional pra UI decidir qual efeito visual/sonoro disparar em
 * reação a uma entrada, sem inspecionar `text` (ver GameBoard.tsx). Existe
 * porque algumas reações (armadilhas do Coringa, hoje) são efeito COLATERAL
 * da ação de outro personagem/fase - não têm um dispatch próprio pra
 * `applyMagicEffectPresentation` reconhecer, então antes o único sinal era
 * casar substring da mensagem (`text.includes('Valete armadilha')`), frágil
 * a qualquer reformulação de texto. Complementa `type`, não substitui: mais
 * de um `type`/call site pode compartilhar o mesmo `trigger` (ex.: a Rainha
 * armadilha reage tanto revelada na Estratégia quanto copiando valor em
 * Combate - mesmo som nos dois, gatilhos de motor bem diferentes). Migração
 * incremental: só as reações já convertidas têm um `trigger`; as que ainda
 * não foram têm `undefined` aqui e continuam no texto por enquanto.
 */
export type LogTrigger =
  | 'coringa-trap-j'
  | 'coringa-trap-q'
  | 'coringa-trap-k'
  | 'deck-reshuffled'
  | 'druida-broto-planted'
  | 'druida-monster-placed'
  | 'glacial-golem-placed'
  | 'reaction-announced'
  | 'reaction-denied'
  | 'player-ready'
  | 'player-unready'
  | 'life-lost';

/**
 * Fase 0.2 do roadmap de overhaul de animações ("contrato mínimo de evento
 * visual") - de onde/por que este evento aconteceu, estruturado o bastante
 * pra UI decidir apresentação (ícone, agrupamento, skin de personagem) sem
 * inspecionar texto. Um único campo (não `source`+`cause` separados): as
 * duas perguntas ("o que produziu" / "por quê") colapsam no mesmo dado pra
 * toda entrada real do motor, e dois campos seria só mais uma chance de
 * divergirem entre si.
 *
 * `effect` em `character-effect` é opcional DE PROPÓSITO: quando `cardValue`
 * já é 'J'/'Q'/'K', `character`+`cardValue` já desambiguam o efeito exato
 * (ver magicCards.ts); só preencher `effect` quando a entrada NÃO tem esse
 * apoio (ex.: o sweep de bloodRage da Besta roda fora de qualquer ativação
 * de carta - `effect: 'bloodRage'`, mesmo literal já usado em
 * StatusEffectKind).
 */
export type LogSource =
  | { kind: 'character-effect'; character: CharacterId; effect?: string }
  | { kind: 'monster'; character: CharacterId }
  | { kind: 'status'; statusKind: string; origin: CharacterId }
  | { kind: 'combat' }
  | { kind: 'phase-rule' }
  | { kind: 'special-mode'; mode: 'towers' | 'spotlight' | 'reactions' | 'fusion' };

/**
 * Se o valor referenciado por esta entrada pode aparecer com a face pra cima
 * numa animação sem vazar informação oculta - um SNAPSHOT do `card.revealed`
 * relevante no instante do evento, não uma leitura ao vivo (a carta pode já
 * ter saído do estado - descartada/consumida - quando a UI processar isto).
 */
export type LogVisibility = 'public' | 'owner-only';

/** Sugestão pra fila de animação (Fase 0.3, "arbitragem de cadeias visuais") - nunca lógica de regra. */
export type AnimationPolicy = 'queue' | 'parallel' | 'suppress';

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
   * FIX (pedido do usuário: "não é isso que eu pedi, é pra mostrar A CARTA e
   * a descrição do efeito dela" - painel "Última Magia Usada", GameBoard.tsx)
   * - naipe da carta em destaque em `cardValue` acima, quando ela é uma carta
   * de baralho de verdade (J/Q/K de uma magia) - permite renderizar a carta
   * FÍSICA de verdade (valor + naipe reais) em vez de só citar o valor no
   * texto. Ausente para os `cardValue` que não são cartas reais ('🃏' do
   * Monstro, o valor exigido de uma Magia Numeral).
   */
  cardSuit?: string;
  /**
   * Coringa (redesenho completo, "armadilhas") - slot de campo onde um
   * Valete/Rei armadilha acabou de se dissipar em fumaça na fase de
   * Estratégia (ver applyCoringaTrapReaction). GameBoard.tsx usa isso pra
   * saber ONDE disparar o CoringaSmokeBurst.tsx - sem isso, a UI só saberia
   * QUE algo aconteceu (pelo texto do log), nunca em qual dos 3 slots.
   * FIX (achado na auditoria da Fase 0.1): o comentário antigo dizia "sempre
   * do jogador `player`", mas isso já era falso pra outras entradas que só
   * ainda não setavam `target` (Bola de Fogo do Piromante e Destruição de
   * Reforço do Mago K miram slot do OPONENTE) - o slot é sempre de
   * `target ?? player`, nunca necessariamente de `player`.
   */
  slotIndex?: number;
  /**
   * Besta - Fúria Sanguinária (pedido do usuário: "animação na mão pra
   * quando o jogador gera ou recebe uma carta de valor > 6 com a Magia
   * Numeral da Besta ativa... o ícone da besta pulando na mão e
   * descartando a carta") - ids das carta(s) que `applyBestaBloodRageSweep`
   * acabou de queimar da mão nesta entrada. GameBoard.tsx usa isto pra
   * disparar BeastBurnFlash.tsx na última posição conhecida de cada carta
   * (`cardPositionsRef`, mesmo mecanismo de FlyingDiscardCard.tsx/
   * ReactionNegatedBurst.tsx) - o "voo até o descarte" em si já acontece de
   * graça (a carta entrou em `discardPile` como qualquer outra), isto só
   * cobre o flourish extra do ícone da Besta. Nunca setado por nenhuma
   * outra entrada.
   */
  burnedCardIds?: string[];
  /** Ver LogTrigger acima. */
  trigger?: LogTrigger;
  /**
   * Fase 0.2 do roadmap de overhaul de animações - agrupa entradas nascidas
   * do MESMO dispatch de `gameReducer` (ex.: o descarte por bloodRage da
   * Besta que o sweep pós-ação produz fica no mesmo `chainId` da ação que o
   * disparou, mesmo sendo de outra causa - ver `source` pra causa semântica).
   * Reusa o mesmo espaço de `LogEntry.id` (mintado como `log.at(-1)!.id` logo
   * após a entrada "raiz" da cadeia já existir) em vez de um esquema de id
   * novo - determinístico de graça, o que importa já que o reducer precisa
   * ser puro e o replay reconstrói estado reexecutando as mesmas ações.
   */
  chainId?: number;
  /**
   * Ordem local ao MESMO dispatch que produziu esta entrada (0, 1, 2...).
   * Não é um contador global entre dispatches diferentes (o Modo Reações e a
   * Magia Numeral têm cadeias que atravessam 2 dispatches separados -
   * anunciar/resolver, ativar/finalizar); pra ordem entre dispatches, usar
   * `id` (sempre monotônico, nunca colide) em vez de comparar `sequence`.
   */
  sequence?: number;
  /** Ver LogSource acima. */
  source?: LogSource;
  /**
   * Jogador/lado afetado por este evento, quando difere de `player` (que
   * continua sendo "de quem é a perspectiva/quem causou"). Ex.: Substituição
   * Arcana do Mago afeta o OPONENTE; Criogênese do Glacial afeta os DOIS
   * jogadores de uma vez (`'both'`).
   */
  target?: PlayerNumber | 'both';
  /** Ver LogVisibility acima. */
  visibility?: LogVisibility;
  /** Ver AnimationPolicy acima. */
  animationPolicy?: AnimationPolicy;
}
