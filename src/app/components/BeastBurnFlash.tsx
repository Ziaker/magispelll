import { AnimatePresence, motion } from 'motion/react';
import { BeastFaceIcon } from './CharacterGlyphIcons';
import { useZoomEscapeFactor } from '../lib/useZoomEscapeFactor';

export interface BeastBurnFlashSpec {
  key: string;
  /** Última posição conhecida da carta queimada (ver cardPositionsRef em GameBoard.tsx - mesmo mecanismo já usado por FlyingDiscardCard.tsx/ReactionNegatedBurst.tsx). */
  rect: { left: number; top: number; width: number; height: number };
}

/**
 * BeastBurnFlash - pedido do usuário: "animação na mão pra quando o jogador
 * gera ou recebe uma carta de valor > 6 com a Magia Numeral da Besta ativa
 * ... o ícone da besta pulando na mão e descartando a carta".
 *
 * O "descartando a carta" já é coberto de graça pelo FlyingDiscardCard.tsx
 * existente (applyBestaBloodRageSweep, gameEngine.ts, move a carta pra
 * `discardPile` como qualquer outra - o observador genérico de
 * GameBoard.tsx já anima ela voando até lá). Este componente cobre só o
 * flourish extra: o rosto da Besta "pulando" bem em cima da última posição
 * conhecida da carta na mão (mesmo `cardPositionsRef` usado pelos
 * componentes irmãos acima), reforçando visualmente QUEM/O QUE causou o
 * descarte - some rápido, a tempo da carta já estar voando por baixo dele.
 */
export function BeastBurnFlash({ specs }: { specs: BeastBurnFlashSpec[] }) {
  // FIX (achado testando ao vivo, auditando "Descarte com trajetória" no
  // backlog de animações - mesma causa raiz documentada em
  // useZoomEscapeFactor.ts): `position: fixed` dentro da árvore zoomada de
  // GameBoard.tsx aterrissa fora do lugar sempre que `settings.interfaceZoom`
  // (padrão 85%) está ativo - `zoom` num ancestral cria um novo "containing
  // block" pra descendentes fixed, fazendo pixels de `left`/`top` (vindos de
  // `getBoundingClientRect()`, já reais) serem reinterpretados no espaço
  // PRÉ-zoom desse ancestral. `posCompensation` (1/zoomFactor) escala de
  // volta ANTES de usar esses valores - correção só matemática, sem tirar
  // este elemento da árvore (uma tentativa inicial com Portal pra
  // `document.body` quebrou a animação de keyframes do Framer Motion aqui
  // por um motivo não identificado, revertida - ver FlyingDiscardCard.tsx
  // pro relato completo dessa investigação).
  const zoomFactor = useZoomEscapeFactor();
  const posCompensation = 1 / zoomFactor;
  return (
    <AnimatePresence>
      {specs.map((spec) => (
        <motion.div
          key={spec.key}
          className="fixed z-[95] pointer-events-none flex items-center justify-center"
          style={{
            left: spec.rect.left * posCompensation,
            top: spec.rect.top * posCompensation,
            width: spec.rect.width * posCompensation,
            height: spec.rect.height * posCompensation,
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 1, 0] }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7, times: [0, 0.2, 0.7, 1] }}
        >
          {/* Flash vermelho rápido atrás do ícone, reforçando "queimou". */}
          <motion.div
            className="absolute inset-0 rounded-lg"
            initial={{ opacity: 0.8 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            style={{ backgroundColor: '#8A2E2E', mixBlendMode: 'overlay' }}
          />
          <motion.div
            initial={{ y: 0, scale: 0.6, opacity: 0 }}
            animate={{ y: [0, -18, 0], scale: [0.6, 1.15, 1], opacity: 1 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            <BeastFaceIcon className="w-10 h-10" style={{ filter: 'drop-shadow(0 0 8px #E24A4A)' }} />
          </motion.div>
        </motion.div>
      ))}
    </AnimatePresence>
  );
}
