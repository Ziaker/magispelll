import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Wand2, Sparkles } from 'lucide-react';
import party from 'party-js';

const TRANSFORM_COLOR = '#6CC47A';

/** Duração (ms) da parte "cassino" do efeito (item 7): números aleatórios
 * piscando rápido antes de assentar no valor real - depois disso o número
 * fica fixo em `finalValue` até o burst inteiro sumir. Usa `setInterval`
 * (não depende de `requestAnimationFrame`/compositing), então funciona
 * mesmo em ambientes onde os bursts via `party-js`/Framer Motion não
 * renderizam de fato. */
export const ROULETTE_DURATION_MS = 650;
const ROULETTE_TICK_MS = 60;

/**
 * AceTransformBurst - efeito visual chamativo no INSTANTE em que um Ás é
 * transformado (pedido do usuário). Diferente de CharacterMagicBurst.tsx
 * (que muda de cor/motivo por personagem), este é um mecanismo do jogo
 * BASE - disponível pra qualquer personagem, sempre na mesma cor verde já
 * usada em toda a interface pra indicar "carta transformada" (a borda do
 * card, o ícone permanente de TransformedAceBadge em PlayingCard.tsx).
 *
 * Mesma linguagem visual/intensidade dos bursts de magia (anéis expandindo
 * + partículas físicas via `party-js`, já usado em CharacterMagicBurst.tsx),
 * pra não parecer "fraco" em comparação.
 */
export function AceTransformBurst({ active, finalValue }: { active: boolean; finalValue?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  // FIX (pedido do usuário, item 7: "efeito de roleta de números na
  // transformação do Ás") - antes do valor real aparecer, alguns dígitos
  // aleatórios piscam rápido, como um caça-níquel/roleta, até assentar no
  // valor de verdade (`finalValue`, já disponível assim que o dispatch de
  // TRANSFORM_ACE termina - ver HandCardView.tsx/GameBoard.tsx, que passa
  // `card.transformedValue` direto).
  const [rouletteValue, setRouletteValue] = useState<number | null>(null);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (!active) {
      setRouletteValue(null);
      setSettled(false);
      return;
    }
    setSettled(false);
    const intervalId = setInterval(() => {
      setRouletteValue(2 + Math.floor(Math.random() * 9));
    }, ROULETTE_TICK_MS);
    const settleTimeout = setTimeout(() => {
      clearInterval(intervalId);
      setRouletteValue(finalValue ?? null);
      setSettled(true);
    }, ROULETTE_DURATION_MS);
    return () => {
      clearInterval(intervalId);
      clearTimeout(settleTimeout);
    };
  }, [active, finalValue]);

  // FIX (pedido do usuário: "o efeito de transformar Ás trava o jogo,
  // corrija o desempenho") - este componente nunca tinha passado pelo mesmo
  // corte já aplicado às 9 magias (ver ArenaMagicBurst.tsx/CardShatterBurst.tsx):
  // contagens de partícula bem menores (cada partícula do party-js roda via
  // JS na thread principal, não no compositor - é o item mais caro de todo o
  // sistema de efeitos, confirmado lendo o código-fonte da biblioteca), e
  // menos anéis/blur nos elementos que sobraram.
  useEffect(() => {
    if (!active) return;
    const el = containerRef.current;
    if (!el) return;

    party.sparkles(el, {
      count: party.variation.range(10, 14),
      speed: party.variation.range(150, 300),
      size: party.variation.range(0.9, 1.4),
      color: () => party.Color.fromHex([TRANSFORM_COLOR, '#EFE7D6', '#C59E4F'][Math.floor(Math.random() * 3)]),
    });
    party.confetti(el, {
      count: party.variation.range(14, 20),
      spread: party.variation.range(60, 90),
      speed: party.variation.range(280, 480),
      size: party.variation.range(0.8, 1.3),
      shapes: ['star', 'circle'],
      color: () => party.Color.fromHex([TRANSFORM_COLOR, '#C59E4F', '#FFFFFF'][Math.floor(Math.random() * 3)]),
    });
  }, [active]);

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none">
      <AnimatePresence>
        {active && (
          <motion.div
            key="ace-transform-burst"
            className="absolute inset-0 z-40 pointer-events-none rounded-lg flex items-center justify-center overflow-visible"
            initial={{ opacity: 0, scale: 1 }}
            animate={{ opacity: 1, scale: [1, 1.12, 1] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, scale: { duration: 0.5, ease: 'easeOut' } }}
          >
            <motion.div
              className="absolute inset-0 rounded-lg"
              initial={{ opacity: 0.95 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
              style={{ backgroundColor: TRANSFORM_COLOR, mixBlendMode: 'overlay' }}
            />
            {[0, 0.18].map((delay, idx) => (
              <motion.div
                key={idx}
                className="absolute rounded-full"
                style={{ border: `4px solid ${TRANSFORM_COLOR}`, width: 34, height: 34, boxShadow: `0 0 10px ${TRANSFORM_COLOR}` }}
                initial={{ opacity: 1, scale: 1 }}
                animate={{ opacity: 0, scale: 10 }}
                transition={{ duration: 1.5, ease: 'easeOut', delay }}
              />
            ))}
            <motion.div
              initial={{ opacity: 0, scale: 0.2, rotate: -60 }}
              animate={{ opacity: [0, 1, 0], scale: [0.2, 2, 1.4], rotate: 300 }}
              transition={{ duration: 1.4, ease: 'easeOut' }}
            >
              <Wand2 className="w-16 h-16" style={{ color: TRANSFORM_COLOR, filter: `drop-shadow(0 0 8px ${TRANSFORM_COLOR})` }} />
            </motion.div>
            <motion.div
              className="absolute"
              initial={{ opacity: 0, scale: 0.4, rotate: 30 }}
              animate={{ opacity: [0, 0.9, 0], scale: [0.4, 1.5, 1], rotate: -180 }}
              transition={{ duration: 1.2, ease: 'easeOut', delay: 0.1 }}
            >
              <Sparkles className="w-10 h-10" style={{ color: '#EFE7D6' }} />
            </motion.div>
            {/* Roleta de números (item 7): dígitos piscando rápido até
                assentar no valor de verdade da transformação, com um "pop"
                de escala no instante em que assenta. */}
            {rouletteValue !== null && (
              <motion.div
                key={settled ? `settled-${rouletteValue}` : rouletteValue}
                className="absolute font-display font-bold"
                initial={{ opacity: settled ? 1 : 0.85, scale: settled ? 0.4 : 0.85 }}
                animate={{ opacity: 1, scale: settled ? [0.4, 1.5, 1] : 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: settled ? 0.45 : 0.06, ease: 'easeOut' }}
                style={{
                  fontSize: 46,
                  color: settled ? TRANSFORM_COLOR : '#EFE7D6',
                  textShadow: settled ? `0 0 22px ${TRANSFORM_COLOR}, 0 0 8px ${TRANSFORM_COLOR}` : '0 0 10px rgba(0,0,0,0.6)',
                }}
              >
                {rouletteValue}
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
