import { motion, AnimatePresence } from 'motion/react';

/**
 * LastLifeImpact - pedido do usuário ("Overhaul de Animações", perda de
 * vida com mais peso): "câmera lenta na última vida". Sem reescrever o
 * motor de animação do resto da tela (arriscado demais por um efeito
 * decorativo), o "peso" vem de uma vinheta vermelha cobrindo a tela inteira
 * e pulsando bem mais devagar (1.4s, contra os ~0.65s do coração quebrando
 * normal - ver HEART_LAST_LIFE_BREAK_TRANSITION em PlayerZone.tsx) do que
 * qualquer outra animação do jogo - a duração longa por si já lê como
 * "câmera lenta" no instante em que um jogador perde a ÚLTIMA vida.
 * `inset-0` percentual (não pixels), então imune ao bug de `zoom` +
 * `position:fixed` documentado em useZoomEscapeFactor.ts (mesma solução já
 * usada em TurnLightSweep.tsx).
 */
export function LastLifeImpact({ active, scale }: { active: boolean; scale: number }) {
  // FIX (Fase 3 do overhaul de animações) - `settings.animations`/
  // `settings.animationSpeed` não eram respeitados aqui (mesma classe de gap
  // já corrigida nas Fases 1 e 2) - `scale === 0` pula a vinheta por
  // completo (a "câmera lenta" perde o sentido se instantânea); em qualquer
  // outra velocidade, a duração de 1.4s escala junto com o resto do jogo.
  return (
    <AnimatePresence>
      {active && scale > 0 && (
        <motion.div
          className="fixed inset-0 z-[45] pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0.6, 0] }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.4 * scale, times: [0, 0.25, 0.6, 1], ease: 'easeOut' }}
          style={{
            background: 'radial-gradient(ellipse at center, transparent 40%, rgba(139,0,0,0.55) 100%)',
          }}
        />
      )}
    </AnimatePresence>
  );
}
