import type { CardDragItem } from './dnd';

/**
 * FIX (pedido do usuário: "melhore a detecção de campo para cartas
 * arrastadas/jogadas lá" - "área de detecção pequena/imprecisa em geral") -
 * o ímã visual de CardDragLayer.tsx já calculava, a cada frame, qual slot
 * válido estava mais perto do centro da carta arrastada e "puxava" o preview
 * pra cima dele quando dentro de `SNAP_RADIUS` - mas isso sempre foi
 * PURAMENTE VISUAL: a decisão real de onde a carta cai continuava vindo do
 * evento nativo `drop` do HTML5 (via `react-dnd-html5-backend`), que só
 * dispara no elemento EXATO que está embaixo do cursor no pixel final da
 * soltura. Resultado: a carta podia parecer "grudada" visualmente num slot
 * (dentro do raio do ímã) e mesmo assim o drop falhar ou não registrar nada,
 * porque o cursor real nunca chegou a entrar na caixa HTML daquele slot -
 * exatamente a sensação de "detecção imprecisa" relatada, já que a área
 * REAL de aceite (a caixa CSS, no máximo alargada até tocar o slot vizinho -
 * ver comentário em FieldSlotView.tsx) é bem menor que o raio do ímã.
 *
 * Este registro resolve isso tornando o ímã real: cada alvo de campo (slot
 * principal/horizontal em FieldSlotView.tsx, zona do Monstro em
 * MonsterZone.tsx) se registra aqui com sua posição atual e sua própria
 * função de drop. Quando o `useDrag` de HandCardView.tsx detecta que o
 * evento nativo NÃO capturou o drop (`monitor.didDrop() === false` em
 * `end()`), ele consulta `findNearestDropTarget` com a última posição
 * conhecida do cursor - se houver um alvo válido dentro do raio do ímã
 * (mesma distância usada para o efeito visual, então o que o jogador VÊ
 * "grudar" é exatamente o que vai aceitar o drop), a função de drop dele é
 * chamada manualmente, como se o navegador tivesse acertado o elemento.
 *
 * Não substitui o `useDrop` nativo em nenhum lugar - ele continua sendo o
 * caminho normal (e mais comum) quando o cursor já está mesmo em cima do
 * alvo. Isto é só o caminho de EXCEÇÃO para quando o drop nativo falha mas o
 * jogador claramente estava mirando um alvo bem próximo.
 */
interface DropTargetEntry {
  getCenter: () => { x: number; y: number } | null;
  /**
   * FIX (pedido do usuário: "arraste sua magia até o campo do alvo pra
   * ativar ela mais rápido") - recebe o `item` sendo arrastado (antes não
   * recebia nada) pra que um alvo possa aceitar um drop CONDICIONALMENTE ao
   * que está sendo arrastado agora (ex.: FieldSlotView.tsx aceita o ímã de
   * fallback pra uma magia com atalho válido mesmo em slots onde a
   * colocação normal de carta não seria aceita, tipo o campo do oponente).
   * Alvos que não precisam dessa distinção (ex.: MonsterZone.tsx) podem
   * ignorar o parâmetro.
   */
  canDrop: (item: CardDragItem) => boolean;
  onDrop: (item: CardDragItem) => void;
}

const registry = new Map<string, DropTargetEntry>();

export function registerDropTarget(id: string, entry: DropTargetEntry): void {
  registry.set(id, entry);
}

export function unregisterDropTarget(id: string): void {
  registry.delete(id);
}

export function findNearestDropTarget(point: { x: number; y: number }, maxDist: number, item: CardDragItem): DropTargetEntry | null {
  let nearest: DropTargetEntry | null = null;
  let nearestDist = Infinity;
  for (const entry of registry.values()) {
    if (!entry.canDrop(item)) continue;
    const center = entry.getCenter();
    if (!center) continue;
    const dist = Math.hypot(center.x - point.x, center.y - point.y);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = entry;
    }
  }
  return nearestDist <= maxDist ? nearest : null;
}
