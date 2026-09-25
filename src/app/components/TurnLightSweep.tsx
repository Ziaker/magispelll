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
 *
 * FIX (Fase 2 do overhaul de animações) - antes a duração (0.7s) era fixa,
 * ignorando `settings.animationSpeed` (só o timeout de limpeza em
 * GameBoard.tsx escalava, mesmo gap já corrigido na Fase 1 pro
 * FlyingDiscardCard/DeckReshuffleBurst) - `scale` (vindo de
 * `getAnimationDurationScale(settings)`) mantém a varredura e o giro de
 * dígitos do TurnCounter.tsx andando na MESMA velocidade relativa, como uma
 * única sequência de "virada de turno".
 */
export function TurnLightSweep({ active, scale }: { active: boolean; scale: number }) {
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
            transition={{ duration: 0.7 * scale, ease: 'easeInOut' }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
