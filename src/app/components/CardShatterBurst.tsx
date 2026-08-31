import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import party from 'party-js';

/** Ângulos (radianos) dos 10 estilhaços, distribuídos em círculo com um pouco de variação. */
const SHARD_ANGLES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (i / 10) * Math.PI * 2 + (i % 2 === 0 ? 0.15 : -0.15));

/**
 * CardShatterBurst - pedido do usuário, item 5: "cartas destruídas se
 * estilhaçando" - usado só na Destruição de Reforço do Mago (a ÚNICA das 9
 * combinações de magia J/Q/K que realmente DESTRÓI uma carta, em vez de
 * revelar/trocar - ver GameBoard.tsx/executeMagicEffect). Em vez do burst
 * mágico genérico, a carta parece literalmente se partir: estilhaços na cor
 * do verso da carta (creme + contorno marrom, ver PlayingCard.tsx) voam pra
 * fora com rotação e gravidade, mais uma rachadura central e uma nuvem de
 * partículas via `party-js` reforçando o "estilhaçamento".
 */
export function CardShatterBurst({ active }: { active: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;
    const el = containerRef.current;
    if (!el) return;
    // FIX (pedido do usuário: "correções de desempenho quanto a magias") -
    // ArenaMagicBurst.tsx removeu suas próprias partículas físicas por
    // completo (a fonte de longe mais frequente, disparava em QUALQUER
    // magia); este componente é usado só na Destruição de Reforço do Mago
    // (a ÚNICA das 9 combinações que realmente destrói uma carta), então
    // continua sendo a única fonte de partículas físicas nesse caso
    // específico - bem menos frequente, mantido como está.
    party.confetti(el, {
      count: party.variation.range(18, 24),
      spread: party.variation.range(100, 140),
      speed: party.variation.range(400, 700),
      size: party.variation.range(0.7, 1.3),
      shapes: ['square', 'rectangle'],
      color: () => party.Color.fromHex(['#EFE7D6', '#8F6A30', '#D45D4A'][Math.floor(Math.random() * 3)]),
    });
  }, [active]);

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none">
      <AnimatePresence>
        {active && (
          <motion.div
            key="card-shatter-burst"
            className="absolute inset-0 z-40 pointer-events-none rounded-lg overflow-visible"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {/* Rachadura vermelha central, no instante do impacto. */}
            <motion.div
              className="absolute inset-0 rounded-lg"
              initial={{ opacity: 0.9 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              style={{ backgroundColor: '#D45D4A', mixBlendMode: 'overlay' }}
            />
            {/* A própria carta "some" encolhendo rápido, dando lugar aos estilhaços. */}
            <motion.div
              className="absolute inset-0 rounded-lg bg-[#EFE7D6] border-2 border-[#8F6A30]"
              initial={{ opacity: 1, scale: 1 }}
              animate={{ opacity: 0, scale: 0.85 }}
              transition={{ duration: 0.25, ease: 'easeIn' }}
            />
            {/* Estilhaços voando em todas as direções com rotação e "queda". */}
            {SHARD_ANGLES.map((angle, idx) => {
              const distance = 90 + (idx % 3) * 30;
              return (
                <motion.div
                  key={idx}
                  className="absolute top-1/2 left-1/2 rounded-sm"
                  style={{
                    width: 10 + (idx % 3) * 4,
                    height: 14 + (idx % 4) * 3,
                    backgroundColor: idx % 3 === 0 ? '#8F6A30' : '#EFE7D6',
                    border: '1px solid #8F6A30',
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
