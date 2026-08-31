import { useEffect, useRef, useState } from 'react';
import { useDragLayer } from 'react-dnd';
import { PlayingCard } from './PlayingCard';
import { CARD_ITEM_TYPE, CARD_SNAP_RADIUS, type CardDragItem } from '../lib/dnd';

/** Graus de rotação por px/ms de velocidade horizontal - define o quão "violento" o giro fica ao arrastar rápido. */
const ROTATION_PER_VELOCITY = 22;
const MAX_ROTATION_DEG = 75;
const BASE_ROTATION_DEG = -6;
/** Abaixo desse limiar (px/ms) o arraste é considerado "calmo" - sem rastro, giro só o básico. */
const FAST_DRAG_THRESHOLD = 0.35;
/** Quantas posições passadas guardar para o rastro (a 1ª é a posição atual). */
const TRAIL_LENGTH = 4;
const SNAP_RADIUS = CARD_SNAP_RADIUS;
/** Força máxima do puxão (0-1), atingida quando o centro da carta já está bem em cima do slot. */
const MAX_SNAP_PULL = 0.6;

/**
 * CardDragLayer - preview customizado de "carta física" seguindo o cursor
 * durante um arraste, no lugar do fantasma cinza/transparente padrão do
 * drag-and-drop nativo HTML5 (usado antes em PlayerZone.tsx/BattleField.tsx).
 * `react-dnd` já era dependência instalada mas não utilizada - substituir o
 * drag nativo por ele é o que permite este preview customizado (via
 * `useDragLayer`), além de destacar TODOS os slots válidos durante o arraste
 * (ver FieldSlotView.tsx), não só o que está embaixo do cursor no momento.
 *
 * FIX (pedido do usuário, itens 6 e 7 - "fazer a carta girar como se
 * tivesse sido atirada quando arrastada com muita velocidade" + rastro de
 * movimento): a cada atualização de posição, calculamos a velocidade
 * horizontal comparando com a posição/instante anteriores (guardados em
 * refs). Essa velocidade vira: 1) o ângulo de rotação da carta (`spinAngle`,
 * suavizado com uma média móvel simples para não tremer a cada frame) e 2)
 * um rastro de "fantasmas" semitransparentes nas últimas posições, só
 * visível quando a velocidade passa de `FAST_DRAG_THRESHOLD` - um arraste
 * calmo continua com a inclinação sutil de sempre, sem rastro nenhum.
 *
 * FIX (pedido do usuário, item 8 - "ímã: carta é puxada pro centro do slot
 * ao se aproximar arrastando"): a cada frame, procura por elementos marcados
 * com `data-card-drop-target="true"` (ver FieldSlotView.tsx - só os slots
 * que aceitariam ESTA carta agora ganham essa marca) e, se o centro da carta
 * arrastada estiver a menos de `SNAP_RADIUS` px do centro de um deles, puxa
 * a posição RENDERIZADA (só visual) na direção desse slot, mais forte quanto
 * mais perto. `document.querySelectorAll` a cada frame é aceitável aqui: no
 * máximo 6 slots no tabuleiro inteiro.
 *
 * FIX (pedido do usuário, bug reaberto 2x - "quando eu seguro a carta, a
 * posição dela não é a mesma do mouse"): as duas primeiras tentativas de
 * correção usavam `monitor.getClientOffset()` (a posição do ponteiro,
 * mantida internamente pelo BACKEND do react-dnd) como fonte de verdade.
 * Investigando a fundo (script injetado no navegador comparando a posição
 * real do mouse com a posição renderizada do preview, a cada movimento):
 * com `document.documentElement.style.zoom` diferente de 100% (é exatamente
 * o caso do executável empacotado - ver `desktop/main.go`, que aplica 80% de
 * zoom pra não precisar reduzir manualmente toda vez que abre o jogo), o
 * `getClientOffset()` do `TouchBackend` trava na posição do PRIMEIRO
 * movimento do arraste e nunca mais atualiza nos movimentos seguintes -
 * reproduzido de forma consistente e isolada (offsets de posição idênticos
 * entre 3 movimentos bem diferentes entre si). Isso não é bug deste
 * componente nem do `HTML5Backend` trocado antes (que tinha OUTRO problema,
 * de atualizar em intervalos throttled pelo navegador) - é uma peculiaridade
 * da combinação `react-dnd-touch-backend` + `zoom` CSS não-padrão.
 *
 * A correção definitiva para de depender do rastreamento de posição
 * INTERNO de qualquer backend do react-dnd: escuta `mousemove`/`touchmove`
 * diretamente na `window` (o mesmo `MouseEvent.clientX/clientY` que
 * `getBoundingClientRect()` também usa como referência - confirmado sempre
 * consistente entre si, com ou sem zoom, nos mesmos testes) enquanto
 * `isDragging` estiver ativo. `monitor`/`useDragLayer` continua sendo usado
 * só para saber SE há um arraste em andamento e QUAL item está sendo
 * arrastado - nunca mais para a posição em si.
 */
export function CardDragLayer() {
  const { itemType, isDragging, item } = useDragLayer((monitor) => ({
    item: monitor.getItem() as CardDragItem | null,
    itemType: monitor.getItemType(),
    isDragging: monitor.isDragging(),
  }));

  const [pointerPos, setPointerPos] = useState<{ x: number; y: number } | null>(null);
  const prevRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const velocityRef = useRef(0);
  const trailRef = useRef<Array<{ x: number; y: number }>>([]);
  // FIX (pedido do usuário, bug reaberto de novo - "a posição da carta não
  // ta na posição do mouse quando tu clica e segura a carta tirando da
  // mão"): investigando o CÓDIGO-FONTE do próprio react-dnd-touch-backend
  // (node_modules/react-dnd-touch-backend/dist/TouchBackendImpl.js,
  // handleTopMove) - o evento de `mousemove` que faz o arraste OFICIALMENTE
  // começar (`monitor.isDragging()` passa a `true`) é tratado de forma
  // SÍNCRONA dentro do backend, mas o `useDragLayer` deste componente só
  // fica sabendo disso no PRÓXIMO ciclo de render do React (uma volta a
  // mais no event loop). Como o listener abaixo só chamava `setPointerPos`
  // quando `isDraggingRef.current` já era `true`, o EXATO evento de
  // mousemove que inicia o arraste (o primeiro que o usuário vê "puxando a
  // carta pra fora da mão") sempre chegava com esse ref ainda desatualizado
  // (`false`) e era descartado - a carta só passava a acompanhar o mouse a
  // partir do movimento SEGUINTE, sempre um passo atrás bem no instante em
  // que é pega. `latestMouseRef` abaixo resolve isso: é atualizado em TODO
  // mousemove, mesmo fora de um arraste (barato - é só uma ref, nunca
  // dispara render), então quando `isDragging` finalmente vira `true` (e
  // este componente re-renderiza), o efeito abaixo já tem a posição mais
  // recente do mouse à mão para "grudar" o preview nela imediatamente, sem
  // esperar o PRÓXIMO mousemove.
  const latestMouseRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const trackMove = (clientX: number, clientY: number) => {
      latestMouseRef.current = { x: clientX, y: clientY };
    };
    const onMouseMoveTrack = (e: MouseEvent) => trackMove(e.clientX, e.clientY);
    const onTouchMoveTrack = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (touch) trackMove(touch.clientX, touch.clientY);
    };
    window.addEventListener('mousemove', onMouseMoveTrack);
    window.addEventListener('touchmove', onTouchMoveTrack);
    return () => {
      window.removeEventListener('mousemove', onMouseMoveTrack);
      window.removeEventListener('touchmove', onTouchMoveTrack);
    };
  }, []);

  useEffect(() => {
    if (!isDragging) {
      setPointerPos(null);
      prevRef.current = null;
      velocityRef.current = 0;
      trailRef.current = [];
      return;
    }

    // Assim que o arraste É CONFIRMADO (este efeito só roda de novo quando
    // `isDragging` muda), já gruda o preview na última posição conhecida do
    // mouse - fecha a lacuna do evento "perdido" descrita no comentário
    // acima, sem precisar esperar o próximo mousemove.
    if (latestMouseRef.current) {
      setPointerPos(latestMouseRef.current);
    }

    const handleMove = (clientX: number, clientY: number) => {
      const now = performance.now();
      if (prevRef.current) {
        const dt = Math.max(1, now - prevRef.current.t);
        const vx = (clientX - prevRef.current.x) / dt;
        // Média móvel simples (70/30) - suaviza tremores de frame a frame sem
        // atrasar demais a resposta a uma guinada real de direção.
        velocityRef.current = velocityRef.current * 0.7 + vx * 0.3;
      }
      prevRef.current = { x: clientX, y: clientY, t: now };
      trailRef.current = [{ x: clientX, y: clientY }, ...trailRef.current].slice(0, TRAIL_LENGTH);
      setPointerPos({ x: clientX, y: clientY });
    };
    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX, e.clientY);
    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (touch) handleMove(touch.clientX, touch.clientY);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('touchmove', onTouchMove);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('touchmove', onTouchMove);
    };
  }, [isDragging]);

  if (!isDragging || itemType !== CARD_ITEM_TYPE || !pointerPos || !item) return null;
  const currentOffset = pointerPos;

  const speed = Math.abs(velocityRef.current);
  const isFastDrag = speed > FAST_DRAG_THRESHOLD;
  const spinAngle = Math.max(
    -MAX_ROTATION_DEG,
    Math.min(MAX_ROTATION_DEG, BASE_ROTATION_DEG + velocityRef.current * ROTATION_PER_VELOCITY)
  );
  // FIX (pedido do usuário: "corrija o giro... que quando posicionada assim
  // girando, ela gira no campo até ficar normal") - `item` é a MESMA
  // referência de objeto que o `useDrag` de HandCardView.tsx criou e que o
  // `useDrop`/`drop` de FieldSlotView.tsx vai ler no momento de soltar
  // (react-dnd compartilha o item por referência durante todo o arraste).
  // Mutar `spinAngle` nele a cada frame é como o ângulo de giro "atual" vira
  // visível para o slot no instante exato do drop, sem precisar de nenhum
  // estado global novo entre estes dois componentes desconectados.
  item.spinAngle = spinAngle;

  // Ímã (item 8): puxa a posição renderizada em direção ao slot válido mais
  // próximo, se estiver dentro do raio de captura. `currentOffset` já É o
  // centro da carta - nenhuma conversão de/para canto superior-esquerdo é
  // necessária.
  let renderX = currentOffset.x;
  let renderY = currentOffset.y;
  let nearestDist = Infinity;
  let nearestCenter: { x: number; y: number } | null = null;
  document.querySelectorAll('[data-card-drop-target="true"]').forEach((el) => {
    const rect = el.getBoundingClientRect();
    const targetCenterX = rect.left + rect.width / 2;
    const targetCenterY = rect.top + rect.height / 2;
    const dist = Math.hypot(targetCenterX - currentOffset.x, targetCenterY - currentOffset.y);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestCenter = { x: targetCenterX, y: targetCenterY };
    }
  });
  if (nearestCenter && nearestDist < SNAP_RADIUS) {
    const pull = MAX_SNAP_PULL * (1 - nearestDist / SNAP_RADIUS);
    renderX = currentOffset.x + ((nearestCenter as { x: number; y: number }).x - currentOffset.x) * pull;
    renderY = currentOffset.y + ((nearestCenter as { x: number; y: number }).y - currentOffset.y) * pull;
  }

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none overflow-hidden" aria-hidden="true">
      {/* Rastro de movimento (item 7) - só aparece acima do limiar de velocidade, sombras da carta nas últimas posições.
          `translate(-50%, -50%)` centraliza cada "fantasma" na posição guardada, mesmo truque de centralização do preview principal abaixo. */}
      {isFastDrag &&
        trailRef.current.slice(1).map((pos, idx) => (
          <div
            key={idx}
            className="absolute w-28 h-40 rounded-lg"
            style={{
              left: 0,
              top: 0,
              transform: `translate(${pos.x}px, ${pos.y}px) translate(-50%, -50%) rotate(${spinAngle}deg)`,
              backgroundColor: 'rgba(197, 158, 79, 0.35)',
              opacity: 0.32 - idx * 0.08,
              filter: 'blur(3px)',
            }}
          />
        ))}
      {/* FIX (pedido do usuário, bug reaberto de novo - "a posição da carta
          não ta na posição do mouse"): a causa final (achada só depois de
          assistir a um vídeo em câmera lenta do arraste real, quadro a
          quadro - as tentativas anteriores por análise de código/teste
          automatizado nunca reproduziram isto) era simples e sempre esteve
          aqui: `transition: 'transform 40ms linear'` no MESMO elemento que
          recebe `translate(renderX, renderY)` (a posição real). Como
          `transform` anima como um valor ÚNICO, isso fazia a POSIÇÃO em si
          suavizar/interpolar a cada novo frame de mouse - inofensivo com o
          mouse parado, mas com um movimento rápido (exatamente o gesto de
          "puxar a carta pra fora da mão") os eventos de mousemove chegam
          mais rápido que os 40ms da transição, então a carta nunca alcança
          de vez a posição real - fica sempre alguns frames atrás,
          visualmente "arrastando" longe do cursor. Corrigido separando em
          DOIS elementos: o de fora só tem `translate` (posição), SEM
          transição nenhuma - sempre 1:1 com o mouse, sem exceção; o de
          dentro tem `rotate`/`scale` (só cosmético) com a MESMA transição
          suave de antes, sem afetar a posição. */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          // `translate(-50%, -50%)` centraliza a carta no ponto (renderX,
          // renderY) relativo ao PRÓPRIO tamanho renderizado do elemento -
          // o navegador já leva em conta `zoom`/qualquer escala da página
          // nesse cálculo, diferente de uma constante em px fixa.
          transform: `translate(${renderX}px, ${renderY}px) translate(-50%, -50%)`,
        }}
      >
        <div
          style={{
            transform: `rotate(${spinAngle}deg) scale(${isFastDrag ? 1.15 : 1.1})`,
            filter: isFastDrag ? 'drop-shadow(0 26px 40px rgba(0,0,0,0.7))' : 'drop-shadow(0 18px 30px rgba(0,0,0,0.6))',
            transition: 'transform 40ms linear',
          }}
        >
          <PlayingCard value={item.value} suit={item.suit} card={item.card} />
        </div>
      </div>
    </div>
  );
}
