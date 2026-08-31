import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import party from 'party-js';

/** Ângulos (radianos) das 14 nuvens de fumaça "principais", distribuídas em círculo com variação, mais viés pra cima (fumaça sobe). */
const PUFF_COUNT = 14;
const PUFF_ANGLES = Array.from({ length: PUFF_COUNT }, (_, i) => (i / PUFF_COUNT) * Math.PI * 2 + (i % 2 === 0 ? 0.25 : -0.25));
/** Paleta da fumaça - creme/marrom do verso da carta (identidade visual já usada) + um roxo escuro sombrio (cor de identidade do Coringa, ver CharactersList.tsx) entrando como nuvens "sombrias" no meio das claras. */
const PUFF_COLORS = ['#D8D0C0', '#8F6A30', '#3B2A55', '#EFE7D6'];

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
 * FIX (pedido do usuário: "mal dá pra perceber os efeitos de fumaça, deixe
 * mais exagerado e espetacular"): a versão original tinha só 6 nuvens
 * pequenas (26-46px) e sumia em ~1s - discreto demais pra um evento raro e
 * importante (armadilha revelada). Aumentado pra 14 nuvens bem maiores
 * (50-130px), mais borradas, com uma paleta de 4 cores (creme/marrom do
 * verso da carta + roxo escuro da identidade do Coringa) em vez de só duas,
 * anel de onda de choque se expandindo, e ~80% mais duração. Também ganhou
 * `party-js` (confetti de círculos borrados, reforçando o volume de fumaça)
 * - a MESMA justificativa de custo/frequência já usada em CardShatterBurst.tsx
 * (que também usa `party-js`): dispara só quando uma armadilha É REVELADA
 * pelo oponente, um evento raro (no máximo umas poucas vezes por partida),
 * bem diferente de ArenaMagicBurst.tsx (removeu partículas físicas por
 * disparar em QUALQUER magia, a fonte de longe mais frequente - "o jogo
 * trava" era sobre ESSA frequência, não sobre `party-js` em si).
 */
export function CoringaSmokeBurst({ active }: { active: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;
    const el = containerRef.current;
    if (!el) return;
    party.confetti(el, {
      count: party.variation.range(28, 36),
      spread: party.variation.range(140, 180),
      speed: party.variation.range(200, 380),
      size: party.variation.range(1.1, 2),
      shapes: ['circle'],
      color: () => party.Color.fromHex(PUFF_COLORS[Math.floor(Math.random() * PUFF_COLORS.length)]),
    });
  }, [active]);

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none overflow-visible">
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
            {/* Clarão central, no instante da dissipação - maior e mais demorado que antes pra acompanhar o resto do efeito. */}
            <motion.div
              className="absolute inset-0 rounded-lg"
              initial={{ opacity: 0.95, scale: 1 }}
              animate={{ opacity: 0, scale: 2.2 }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
              style={{ backgroundColor: '#BFB6A6', mixBlendMode: 'overlay' }}
            />
            {/* Anel de onda de choque se expandindo a partir do centro - reforça o "impacto" da explosão/dissipação. */}
            <motion.div
              className="absolute top-1/2 left-1/2 rounded-full border-4"
              style={{ borderColor: '#C59E4F', width: 20, height: 20 }}
              initial={{ x: '-50%', y: '-50%', opacity: 0.9, scale: 0.5 }}
              animate={{ x: '-50%', y: '-50%', opacity: 0, scale: 9 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
            {/* Nuvens de fumaça (4 cores) subindo e se expandindo em todas as
                direções - bem maiores e mais demoradas que a versão original.
                FIX (checagem extensa de desempenho): eram círculos sólidos
                com `filter: blur(10px)` cada - 14 camadas borradas ao mesmo
                tempo, todas com SCALE animando (não só opacity/posição),
                forçando o navegador a re-rasterizar o blur a cada quadro em
                vez de só compositar uma bitmap já borrada. Convertido pra
                `radial-gradient` (cor -> transparente), mesma técnica já
                usada no brilho do Anjo (ArenaMagicBurst.tsx/
                CharacterMagicBurst.tsx) - visual de "nuvem macia"
                equivalente, mas só opacity/transform, 100% compositor. */}
            {PUFF_ANGLES.map((angle, idx) => {
              const distance = 45 + (idx % 4) * 22;
              const size = 50 + (idx % 4) * 28;
              const puffColor = PUFF_COLORS[idx % PUFF_COLORS.length];
              return (
                <motion.div
                  key={idx}
                  className="absolute top-1/2 left-1/2 rounded-full"
                  style={{
                    width: size,
                    height: size,
                    background: `radial-gradient(circle, ${puffColor} 0%, ${puffColor} 35%, transparent 72%)`,
                  }}
                  initial={{ x: '-50%', y: '-50%', opacity: 0.85, scale: 0.3 }}
                  animate={{
                    x: `calc(-50% + ${Math.cos(angle) * distance}px)`,
                    y: `calc(-50% + ${Math.sin(angle) * distance}px - 90px)`,
                    opacity: 0,
                    scale: 2.4 + (idx % 4) * 0.4,
                  }}
                  transition={{ duration: 1.7 + (idx % 4) * 0.2, ease: 'easeOut', delay: idx * 0.04 }}
                />
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
