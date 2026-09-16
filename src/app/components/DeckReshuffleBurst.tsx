import { motion, AnimatePresence } from 'motion/react';
import { PlayingCard } from './PlayingCard';
import { useZoomEscapeFactor } from '../lib/useZoomEscapeFactor';

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface DeckReshuffleBurstSpec {
  key: string;
  /** Posição real do painel "Cemitério" no instante em que o reembaralhamento aconteceu. */
  from: Rect;
  /** Posição real do painel "Baralho". */
  to: Rect;
}

const CARD_COUNT = 7;
const CARD_W = 40;
const CARD_H = 56;

/**
 * DeckReshuffleBurst - pedido do usuário ("Overhaul de Animações"): "quando
 * o baralho esgota e a pilha de descarte volta, uma animação dedicada
 * (cartas do cemitério 'embaralhando' de volta pro baralho) em vez do
 * contador só resetar instantaneamente".
 *
 * Puramente decorativo, igual FlyingDiscardCard.tsx: o reembaralhamento JÁ
 * aconteceu de verdade no motor (`ensureDeckHasCards`/`reshuffleDiscardIntoDeck`,
 * gameEngine.ts) antes deste componente sequer montar - ele só cobre
 * visualmente a distância entre os dois painéis reais ("Cemitério" ->
 * "Baralho", mesmas posições que FlyingDiscardCard.tsx já usa como destino
 * do voo normal). Um punhado de costas de carta (não a pilha inteira - seria
 * caro e o cemitério pode ter 20+ cartas; um punhado já vende a ideia de
 * "embaralhando de volta") voa em arcos levemente aleatórios, junto com um
 * pulso de brilho dourado nos dois painéis marcando o exato instante da
 * troca.
 */
export function DeckReshuffleBurst({ spec }: { spec: DeckReshuffleBurstSpec | null }) {
  // FIX (achado testando ao vivo, auditando "Descarte com trajetória" no
  // backlog de animações - mesma causa raiz documentada em
  // useZoomEscapeFactor.ts): `fixed inset-0` sozinho "sobrevive" ao zoom
  // (cobre a tela toda de qualquer jeito, por ser só 0/0/0/0 - nenhum
  // pixel cru envolvido), mas os FILHOS `absolute` aqui dentro
  // (posicionados por pixel cru vindo de `getBoundingClientRect()`) não -
  // o espaço de coordenadas interno da árvore zoomada ainda os reinterpreta
  // errado. `posCompensation` (1/zoomFactor) escala de volta ANTES de usar
  // esses valores - correção só matemática, sem Portal (uma tentativa
  // inicial com Portal pra `document.body` quebrou a animação de keyframes
  // do Framer Motion por um motivo não identificado, revertida - ver
  // FlyingDiscardCard.tsx pro relato completo).
  const zoomFactor = useZoomEscapeFactor();
  const posCompensation = 1 / zoomFactor;
  return (
    <AnimatePresence>
      {spec && (
        <motion.div key={spec.key} className="fixed inset-0 z-[85] pointer-events-none">
          {/* Pulso no Cemitério, na saída, seguido do pulso no Baralho, na chegada. */}
          <motion.div
            className="absolute rounded-lg"
            style={{
              left: spec.from.left * posCompensation,
              top: spec.from.top * posCompensation,
              width: spec.from.width * posCompensation,
              height: spec.from.height * posCompensation,
              boxShadow: '0 0 0 3px #C59E4F',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.9, 0] }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
          <motion.div
            className="absolute rounded-lg"
            style={{
              left: spec.to.left * posCompensation,
              top: spec.to.top * posCompensation,
              width: spec.to.width * posCompensation,
              height: spec.to.height * posCompensation,
              boxShadow: '0 0 0 3px #C59E4F',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0, 0.9, 0] }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
          {Array.from({ length: CARD_COUNT }).map((_, idx) => (
            <ShuffleCard key={idx} idx={idx} from={spec.from} to={spec.to} posCompensation={posCompensation} />
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ShuffleCard({ idx, from, to, posCompensation }: { idx: number; from: Rect; to: Rect; posCompensation: number }) {
  const scaledFrom = { left: from.left * posCompensation, top: from.top * posCompensation, width: from.width * posCompensation, height: from.height * posCompensation };
  const scaledTo = { left: to.left * posCompensation, top: to.top * posCompensation, width: to.width * posCompensation, height: to.height * posCompensation };
  const cardW = CARD_W;
  const cardH = CARD_H;
  const originLeft = scaledFrom.left + scaledFrom.width / 2 - cardW / 2;
  const originTop = scaledFrom.top + scaledFrom.height / 2 - cardH / 2;
  const deltaX = scaledTo.left + scaledTo.width / 2 - (originLeft + cardW / 2);
  const deltaY = scaledTo.top + scaledTo.height / 2 - (originTop + cardH / 2);
  // Jitter fixo por índice (não por Math.random puro a cada render) evitaria
  // re-sorteio, mas este componente só monta 1x por burst (chave `spec.key`
  // no pai já garante isso), então Math.random direto aqui é seguro - cada
  // burst novo tem seu próprio jitter, sem precisar de useState/useMemo.
  const jitterX = (Math.random() - 0.5) * 36;
  const jitterY = (Math.random() - 0.5) * 24;
  const spinDir = Math.random() < 0.5 ? -1 : 1;
  const delay = idx * 0.045 + Math.random() * 0.03;

  return (
    <motion.div
      className="absolute"
      style={{ left: originLeft, top: originTop, width: cardW, height: cardH }}
      initial={{ x: 0, y: 0, rotate: 0, opacity: 0, scale: 0.75 }}
      animate={{
        x: [0, deltaX * 0.5 + jitterX, deltaX],
        y: [0, deltaY * 0.5 + jitterY, deltaY],
        rotate: spinDir * (200 + Math.random() * 220),
        opacity: [0, 1, 1, 0],
        scale: [0.75, 1, 0.85],
      }}
      transition={{ duration: 0.65, delay, ease: 'easeInOut' }}
    >
      <PlayingCard faceDown className="w-full h-full" />
    </motion.div>
  );
}
