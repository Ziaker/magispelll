import { useSettings } from '../context/SettingsContext';

/**
 * useZoomEscapeFactor - achado auditando o item "Descarte com trajetória"
 * do backlog de animações (pedido do usuário: "já existe, mas ficou
 * desatualizado com as mudanças recentes do jogo") - bug real encontrado
 * testando ao vivo: qualquer componente com `position: fixed` posicionado
 * via coordenadas absolutas (`left`/`top` vindos de `getBoundingClientRect()`
 * de algum elemento real, ex.: FlyingDiscardCard.tsx) aterrissa no lugar
 * ERRADO da tela sempre que `settings.interfaceZoom` (GameBoard.tsx,
 * aplicado via `zoom: interfaceZoomFactor` no wrapper - padrão é 85%, NUNCA
 * 100% de fábrica) está ativo - QUALQUER valor de `zoom` CSS num ancestral
 * cria um novo "containing block" pra descendentes `fixed` (comportamento
 * do Chromium), fazendo eles se comportarem como `position: absolute`
 * relativo a esse ancestral zoomado em vez de relativo à janela de verdade -
 * as coordenadas capturadas via `getBoundingClientRect()` (que JÁ refletem
 * pixels reais de tela) não batem mais com o que `left`/`top` significam
 * naquele contexto.
 *
 * Correção: portar o elemento `fixed` pra fora da árvore zoomada
 * (`createPortal(..., document.body)`, mesma fuga que os Portals do Radix já
 * fazem por padrão - ver zoomContainerContext.tsx, que resolve o problema
 * OPOSTO: Portals do Radix precisam ser trazidos PRA DENTRO da árvore
 * zoomada pra herdar a ESCALA visual certa). Uma vez fora do zoom,
 * `position: fixed` volta a valer coordenadas reais de janela - as mesmas
 * que `getBoundingClientRect()` já entregava, sem nenhuma conversão. Só
 * falta compensar o TAMANHO: um valor de `zoom` só existia ali pra encolher
 * visualmente o conteúdo (a mesma proporção que todo o resto do tabuleiro já
 * tem) - fora da árvore zoomada isso se perde, então quem porta pra fora
 * precisa aplicar esta MESMA proporção como um `scale` (nunca outro `zoom`/
 * `transform` num ancestral do próprio elemento fixed, senão o mesmo bug
 * volta - o `scale` precisa estar no PRÓPRIO elemento fixed, nunca num pai
 * dele) no lugar de qualquer escala que o componente já tivesse.
 *
 * Devolve o fator (`settings.interfaceZoom / 100`, ex.: 0.85) pra qualquer
 * componente que precise portar-se pra fora e recompensar a própria escala.
 */
export function useZoomEscapeFactor(): number {
  const { settings } = useSettings();
  return settings.interfaceZoom / 100;
}
