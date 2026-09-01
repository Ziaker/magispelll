import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import party from 'party-js';

/** Ângulos (radianos) dos estilhaços, distribuídos em círculo com um pouco de variação - mesmo esquema de CardShatterBurst.tsx. */
const SHARD_ANGLES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (i / 10) * Math.PI * 2 + (i % 2 === 0 ? 0.15 : -0.15));
const FLAME_LICKS = [0, 1, 2, 3, 4, 5];

/**
 * FireShatterBurst - pedido explícito do usuário para o Piromante: "faça
 * questão de ter um efeito da carta pegando fogo e se despedaçando". Dispara
 * no slot atingido por um lançamento da Bola de Fogo (obliterado OU reduzido
 * a uma carta-token, ver executeFireballLaunch em gameEngine.ts / GameBoard.tsx) -
 * variante em chamas de CardShatterBurst.tsx (mesma estrutura: rachadura
 * central, "a carta" encolhendo, estilhaços voando), mas com cor de brasa em
 * vez do verso creme/marrom da carta, mais línguas de fogo subindo e uma
 * explosão de partículas laranja/vermelha via `party-js` no lugar do
 * confete cinza-creme original.
 */
export function FireShatterBurst({ active }: { active: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;
    const el = containerRef.current;
    if (!el) return;
    party.confetti(el, {
      count: party.variation.range(20, 28),
      spread: party.variation.range(110, 150),
      speed: party.variation.range(450, 750),
      size: party.variation.range(0.7, 1.3),
      shapes: ['square', 'circle'],
      color: () => party.Color.fromHex(['#FFE0B3', '#FF8033', '#CC5500', '#D45D4A'][Math.floor(Math.random() * 4)]),
    });
  }, [active]);

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none">
      <AnimatePresence>
        {active && (
          <motion.div
            key="fire-shatter-burst"
            className="absolute inset-0 z-40 pointer-events-none rounded-lg overflow-visible"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {/* Clarão alaranjado central, no instante do impacto. */}
            <motion.div
              className="absolute inset-0 rounded-lg"
              initial={{ opacity: 0.95 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 0.45, ease: 'easeOut' }}
              style={{ backgroundColor: '#FF8033', mixBlendMode: 'overlay' }}
            />
            {/* Línguas de fogo subindo pelas bordas antes da carta se partir. */}
            {FLAME_LICKS.map((i) => (
              <motion.div
                key={`flame-${i}`}
                className="absolute bottom-0 rounded-full"
                style={{
                  left: `${10 + i * 15}%`,
                  width: 10,
                  height: 22,
                  background: 'linear-gradient(to top, #FF8033, #FFE0B3, transparent)',
                }}
                initial={{ opacity: 0, scaleY: 0.3, y: 0 }}
                animate={{ opacity: [0, 1, 0], scaleY: [0.3, 1.2, 0.6], y: [0, -18, -30] }}
                transition={{ duration: 0.6, delay: i * 0.04, ease: 'easeOut' }}
              />
            ))}
            {/* A "carta" carboniza e encolhe rápido, dando lugar aos estilhaços em brasa. */}
            <motion.div
              className="absolute inset-0 rounded-lg bg-[#3D1900] border-2 border-[#FF8033]"
              initial={{ opacity: 1, scale: 1 }}
              animate={{ opacity: 0, scale: 0.85 }}
              transition={{ duration: 0.3, ease: 'easeIn' }}
            />
            {/* Estilhaços em brasa voando em todas as direções com rotação e "queda". */}
            {SHARD_ANGLES.map((angle, idx) => {
              const distance = 90 + (idx % 3) * 30;
              return (
                <motion.div
                  key={idx}
                  className="absolute top-1/2 left-1/2 rounded-sm"
                  style={{
                    width: 10 + (idx % 3) * 4,
                    height: 14 + (idx % 4) * 3,
                    backgroundColor: idx % 2 === 0 ? '#FF8033' : '#3D1900',
                    border: '1px solid #FFB380',
                    boxShadow: idx % 2 === 0 ? '0 0 6px #FF8033' : 'none',
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
