/**
 * gameLogTypes.ts - contrato de dados do log da partida.
 *
 * O motor produz estes eventos, mas a UI de log também precisa consumi-los
 * sem depender conceitualmente do reducer inteiro. Este módulo contém só
 * tipos, sem lógica nem efeitos colaterais.
 */
import type { Phase, PlayerNumber } from './gameTypes';

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
   * Coringa (redesenho completo, "armadilhas") - slot de campo (do jogador
   * `player` acima) onde um Valete/Rei armadilha acabou de se dissipar em
   * fumaça na fase de Estratégia (ver applyCoringaTrapReaction). GameBoard.tsx
   * usa isso pra saber ONDE disparar o CoringaSmokeBurst.tsx - sem isso, a UI
   * só saberia QUE algo aconteceu (pelo texto do log), nunca em qual dos 3
   * slots. Nunca setado por nenhum outro tipo de entrada.
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
}
