import { motion, AnimatePresence } from 'motion/react';

/**
 * TurnLightSweep - pedido do usuário ("Overhaul de Animações", hodômetro de
 * turno): "talvez com uma varredura sutil de luz cruzando o tabuleiro
 * inteiro na virada". Uma faixa diagonal clara atravessa a tela inteira uma
 * única vez quando `gameState.turn` incrementa (ver o `useEffect` que
 * dispara `active` em GameBoard.tsx) - puramente decorativo, sutil o
 * bastante pra não distrair de nada que já esteja acontecendo na tela
 * (fica ATRÁS das cartas/UI, `mix-blend-mode: overlay` em vez de uma cor
 * sólida).
 */
export function TurnLightSweep({ active }: { active: boolean }) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          className="fixed inset-0 z-[30] pointer-events-none overflow-hidden"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="absolute top-0 h-full"
            style={{
              width: '35%',
              background: 'linear-gradient(90deg, transparent, rgba(197,158,79,0.35), transparent)',
              transform: 'skewX(-20deg)',
              mixBlendMode: 'overlay',
            }}
            initial={{ left: '-40%' }}
            animate={{ left: '110%' }}
            transition={{ duration: 0.7, ease: 'easeInOut' }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
