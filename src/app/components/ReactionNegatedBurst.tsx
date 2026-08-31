import { AnimatePresence, motion } from 'motion/react';

export interface ReactionNegatedBurstSpec {
  key: string;
  /** Última posição conhecida da carta anunciada (ver cardPositionsRef em GameBoard.tsx - mesmo mecanismo já usado por FlyingDiscardCard.tsx). */
  rect: { left: number; top: number; width: number; height: number };
}

/**
 * ReactionNegatedBurst - Modo Reações (pedido do usuário: "quando a carta de
 * reação é escolhida, ocorre uma notificação épica no jogo e as cartas são
 * descartadas com um grande X surgindo na carta do oponente").
 *
 * O "descartadas" já é coberto de graça pelo sistema existente de
 * FlyingDiscardCard.tsx (ambas as cartas entram em `discardPile` de verdade
 * assim que REACT_TO_MAGIC é despachado, e aquele observador já anima
 * qualquer carta nova no descarte voando até lá). Este componente cobre só o
 * "grande X" - um selo dramático que nasce EXATAMENTE sobre a última posição
 * conhecida da carta anunciada (mesmo `cardPositionsRef` que
 * FlyingDiscardCard.tsx usa como origem do voo) e desaparece rápido, como
 * uma "marca de negado" antes da carta sair voando.
 */
export function ReactionNegatedBurst({ spec }: { spec: ReactionNegatedBurstSpec | null }) {
  return (
    <AnimatePresence>
      {spec && (
        <motion.div
          key={spec.key}
          className="fixed z-[95] pointer-events-none flex items-center justify-center"
          style={{
            left: spec.rect.left,
            top: spec.rect.top,
            width: spec.rect.width,
            height: spec.rect.height,
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 1, 0] }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.9, times: [0, 0.15, 0.75, 1] }}
        >
          <motion.div
            className="font-display"
            style={{
              fontSize: Math.max(48, spec.rect.width * 0.9),
              color: '#D45D4A',
              textShadow: '0 0 18px rgba(212,93,74,0.9), 0 4px 10px rgba(0,0,0,0.8)',
              lineHeight: 1,
            }}
            initial={{ scale: 2.2, rotate: -20, opacity: 0 }}
            animate={{ scale: [2.2, 0.85, 1], rotate: [-20, 4, 0], opacity: 1 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
          >
            ✕
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
