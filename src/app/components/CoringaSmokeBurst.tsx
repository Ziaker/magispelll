import { motion, AnimatePresence } from 'motion/react';

/** Ângulos (radianos) das 6 nuvens de fumaça, distribuídas em círculo com um pouco de variação. */
const PUFF_ANGLES = [0, 1, 2, 3, 4, 5].map((i) => (i / 6) * Math.PI * 2 + (i % 2 === 0 ? 0.2 : -0.2));

/**
 * CoringaSmokeBurst - pedido do usuário (redesenho completo do Coringa,
 * "armadilhas"): "se dissipando em fumaça com som de riso" (Valete),
 * "se dissipando em fumaça e nuvens (uma pós explosão)" (Rei na Estratégia),
 * "A carta explode e se dissipa em fumaça" (Rei no Combate) - as 3 únicas
 * cartas-armadilha que de fato DESAPARECEM do campo ao reagir (Valete
 * descartado, Rei destruído/explodido; a Rainha e o Monstro só voltam
 * ocultos pra mão, sem "sumir em fumaça" - ver applyCoringaTrapReaction em
 * gameEngine.ts, não usam este componente).
 *
 * Mesmo padrão de CardShatterBurst.tsx (a ÚNICA outra carta que "desaparece"
 * de verdade no jogo, usado pela Destruição de Reforço do Mago): a carta
 * encolhe/some no lugar enquanto o efeito assume a cena. Em vez de
 * estilhaços físicos, várias nuvens de fumaça (círculos borrados, cor
 * cinza/creme) sobem e se expandem, desvanecendo - sem `party-js` (pedido do
 * usuário já atendido uma vez em CharacterMagicBurst.tsx: "o jogo trava
 * quando ativa algumas magias" - partículas físicas custam caro e este burst
 * pode montar em qualquer um dos 6 slots de campo a qualquer momento), só
 * Framer Motion (opacity/scale/transform, barato).
 */
export function CoringaSmokeBurst({ active }: { active: boolean }) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-visible">
      <AnimatePresence>
        {active && (
          <motion.div
            key="coringa-smoke-burst"
            className="absolute inset-0 z-40 pointer-events-none rounded-lg overflow-visible"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {/* A própria carta "some" encolhendo rápido, dando lugar à fumaça. */}
            <motion.div
              className="absolute inset-0 rounded-lg bg-[#EFE7D6] border-2 border-[#8F6A30]"
              initial={{ opacity: 1, scale: 1 }}
              animate={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.3, ease: 'easeIn' }}
            />
            {/* Clarão cinza central, no instante da dissipação. */}
            <motion.div
              className="absolute inset-0 rounded-lg"
              initial={{ opacity: 0.85 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              style={{ backgroundColor: '#BFB6A6', mixBlendMode: 'overlay' }}
            />
            {/* Nuvens de fumaça (círculos borrados) subindo e se expandindo em todas as direções. */}
            {PUFF_ANGLES.map((angle, idx) => {
              const distance = 30 + (idx % 3) * 12;
              const size = 26 + (idx % 3) * 10;
              return (
                <motion.div
                  key={idx}
                  className="absolute top-1/2 left-1/2 rounded-full"
                  style={{
                    width: size,
                    height: size,
                    backgroundColor: idx % 2 === 0 ? '#D8D0C0' : '#8F6A30',
                    filter: 'blur(6px)',
                  }}
                  initial={{ x: '-50%', y: '-50%', opacity: 0.75, scale: 0.4 }}
                  animate={{
                    x: `calc(-50% + ${Math.cos(angle) * distance}px)`,
                    y: `calc(-50% + ${Math.sin(angle) * distance}px - 55px)`,
                    opacity: 0,
                    scale: 1.8 + (idx % 3) * 0.3,
                  }}
                  transition={{ duration: 1 + (idx % 3) * 0.15, ease: 'easeOut', delay: idx * 0.05 }}
                />
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
