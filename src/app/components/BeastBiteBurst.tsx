import { motion, AnimatePresence } from 'motion/react';

/** Quantos "dentes" cada fileira da mordida tem. */
const TEETH_COUNT = 5;
const TEETH_X = Array.from({ length: TEETH_COUNT }, (_, idx) => 8 + idx * (84 / (TEETH_COUNT - 1)));

/**
 * BeastBiteBurst - overhaul visual da Besta (pedido do usuário, "todos" -
 * item 5): Roubo Brutal (Besta K) TROCA a carta do slot-alvo do oponente
 * pela própria - não DESTRÓI nada, diferente da Destruição de Reforço do
 * Mago (ver CardShatterBurst.tsx) - então este efeito não estilhaça nada:
 * duas fileiras de "dentes" (triângulos vermelho-sangue) fecham por cima do
 * slot roubado, como uma mordida, com um aperto rápido (`scale`) simulando
 * o "belisco". A troca de carta de verdade continua vindo do dispatch
 * normal (ver applyMagicEffectPresentation em GameBoard.tsx) - isto é só a
 * mordida por cima.
 */
export function BeastBiteBurst({ active }: { active: boolean }) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="beast-bite-burst"
          className="absolute inset-0 z-40 pointer-events-none rounded-lg overflow-visible"
          initial={{ opacity: 1, scale: 1 }}
          animate={{ opacity: 1, scale: [1, 0.88, 1] }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        >
          {/* Flash vermelho-sangue no instante da mordida. */}
          <motion.div
            className="absolute inset-0 rounded-lg"
            initial={{ opacity: 0.85 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            style={{ backgroundColor: '#8A2E2E', mixBlendMode: 'overlay' }}
          />
          {/* Fileira de cima da mordida, descendo. */}
          {TEETH_X.map((x, idx) => (
            <motion.div
              key={`top-${idx}`}
              className="absolute"
              style={{
                left: `${x}%`,
                top: -2,
                width: 0,
                height: 0,
                borderLeft: '6px solid transparent',
                borderRight: '6px solid transparent',
                borderTop: '16px solid #E24A4A',
                filter: 'drop-shadow(0 0 4px #8A2E2E)',
              }}
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: [0, 1, 1, 0], y: 0 }}
              transition={{ duration: 0.5, ease: 'easeOut', delay: idx * 0.02 }}
            />
          ))}
          {/* Fileira de baixo da mordida, subindo. */}
          {TEETH_X.map((x, idx) => (
            <motion.div
              key={`bottom-${idx}`}
              className="absolute"
              style={{
                left: `${x}%`,
                bottom: -2,
                width: 0,
                height: 0,
                borderLeft: '6px solid transparent',
                borderRight: '6px solid transparent',
                borderBottom: '16px solid #E24A4A',
                filter: 'drop-shadow(0 0 4px #8A2E2E)',
              }}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: [0, 1, 1, 0], y: 0 }}
              transition={{ duration: 0.5, ease: 'easeOut', delay: idx * 0.02 }}
            />
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
