import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import party from 'party-js';
import { useSettings } from '../context/SettingsContext';

/** Ângulos (radianos) dos 10 estilhaços, distribuídos em círculo com um pouco de variação - mesma distribuição de CardShatterBurst.tsx. */
const SHARD_ANGLES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (i / 10) * Math.PI * 2 + (i % 2 === 0 ? 0.15 : -0.15));

/**
 * IceShatterBurst - pedido do usuário: "faça o efeito do gelo quebrando
 * quando a carta é descongelada" - irmã de CardShatterBurst.tsx (mesma
 * técnica: rachadura central + estilhaços voando + confete via party-js),
 * recolorida pra gelo (branco/azul-claro do tema do Glacial, #0ADEFF/#7FF2FF/
 * #CBF9FF - characterThemes.ts) em vez de creme/marrom. Ao contrário de
 * CardShatterBurst (a carta é DESTRUÍDA de verdade), aqui a carta continua
 * existindo - só o "gelo" ao redor dela se quebra, então a carta NÃO encolhe/
 * desaparece, só os estilhaços de gelo voam por cima dela.
 */
export function IceShatterBurst({ active }: { active: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { settings } = useSettings();

  useEffect(() => {
    if (!active) return;
    const el = containerRef.current;
    if (!el) return;
    if (!settings.particleEffects) return;
    party.confetti(el, {
      count: party.variation.range(16, 22),
      spread: party.variation.range(100, 140),
      speed: party.variation.range(350, 650),
      size: party.variation.range(0.6, 1.2),
      shapes: ['square', 'circle'],
      color: () => party.Color.fromHex(['#CBF9FF', '#7FF2FF', '#0ADEFF', '#FFFFFF'][Math.floor(Math.random() * 4)]),
    });
  }, [active, settings.particleEffects]);

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none">
      <AnimatePresence>
        {active && (
          <motion.div
            key="ice-shatter-burst"
            className="absolute inset-0 z-40 pointer-events-none rounded-lg overflow-visible"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {/* Flash azul-claro central, no instante em que o gelo racha. */}
            <motion.div
              className="absolute inset-0 rounded-lg"
              initial={{ opacity: 0.9 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              style={{ backgroundColor: '#7FF2FF', mixBlendMode: 'screen' }}
            />
            {/* Estilhaços de gelo voando em todas as direções com rotação e "queda". */}
            {SHARD_ANGLES.map((angle, idx) => {
              const distance = 90 + (idx % 3) * 30;
              return (
                <motion.div
                  key={idx}
                  className="absolute top-1/2 left-1/2"
                  style={{
                    width: 9 + (idx % 3) * 4,
                    height: 13 + (idx % 4) * 3,
                    backgroundColor: idx % 2 === 0 ? '#CBF9FF' : '#0ADEFF',
                    border: '1px solid #7FF2FF',
                    borderRadius: '2px',
                    boxShadow: '0 0 6px #7FF2FF',
                  }}
                  initial={{ x: '-50%', y: '-50%', opacity: 1, rotate: 0, scale: 1 }}
                  animate={{
                    x: `calc(-50% + ${Math.cos(angle) * distance}px)`,
                    y: `calc(-50% + ${Math.sin(angle) * distance}px + 40px)`,
                    opacity: 0,
                    rotate: (idx % 2 === 0 ? 1 : -1) * (180 + idx * 30),
                    scale: 0.4,
                  }}
                  transition={{ duration: 0.9 + (idx % 3) * 0.1, ease: 'easeOut', delay: idx * 0.015 }}
                />
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
