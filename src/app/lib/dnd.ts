import type { Card } from './cardUtils';

/**
 * Tipo único de item arrastável do jogo (usado por react-dnd em
 * HandCardView.tsx, FieldSlotView.tsx e CardDragLayer.tsx) - substitui o drag
 * and drop nativo (HTML5 `draggable`/`dataTransfer`) por `react-dnd`, que já
 * era uma dependência instalada mas não utilizada. Isso permite um preview
 * customizado seguindo o cursor (CardDragLayer) e destacar todos os slots
 * válidos durante o arraste (via `monitor.canDrop()`), não só o que está sob
 * o cursor no momento.
 */
export const CARD_ITEM_TYPE = 'CARD';

/**
 * Raio do "ímã" de aproximação (px, a partir do centro de um slot válido) -
 * consumido por CardDragLayer.tsx (efeito visual) e
 * dropTargetRegistry.ts/HandCardView.tsx (torna o ímã funcionalmente real,
 * não só visual - ver comentário completo em dropTargetRegistry.ts).
 *
 * Não existe mais uma constante de "tamanho da carta" aqui - CardDragLayer.tsx
 * usava `CARD_DRAG_W/H` (o tamanho nominal w-28/h-40 do Tailwind, em px) pra
 * calcular o canto superior-esquerdo do preview a partir do centro. Isso
 * quebrava sempre que a página não estava em 100% de escala (ex.: o zoom de
 * 80% que `desktop/main.go` aplica no executável empacotado) - o tamanho
 * NOMINAL em px não acompanha o tamanho REAL renderizado na tela. Corrigido
 * usando `translate(-50%, -50%)` no CSS (relativo ao tamanho real do próprio
 * elemento, sempre correto independente de zoom/escala) - ver comentário
 * completo em CardDragLayer.tsx.
 */
export const CARD_SNAP_RADIUS = 90;

export interface CardDragItem {
  cardId: string;
  value?: string;
  suit?: string;
  card?: Card;
  /**
   * Ângulo de giro (graus) no instante mais recente do arraste - calculado e
   * atualizado a cada frame por CardDragLayer.tsx (que muta esta MESMA
   * referência de objeto, já que `item` é compartilhado entre o
   * `useDrag`/`useDragLayer`/`useDrop` do react-dnd durante todo o arraste).
   * Lido por FieldSlotView.tsx no momento do `drop` para saber "com que
   * força" a carta estava girando quando foi solta, e continuar esse giro
   * na animação de pouso (pedido do usuário: "corrija o giro... que quando
   * posicionada assim girando, ela gira no campo até ficar normal").
   */
  spinAngle?: number;
}
