import { motion, AnimatePresence } from 'motion/react';
import { PlayingCard } from './PlayingCard';
import { useZoomEscapeFactor } from '../lib/useZoomEscapeFactor';
import { getCharacterTheme } from '../lib/characterThemes';
import type { CharacterId } from '../lib/characterRegistry';
import type { NumeralSpellCardSnapshot } from '../lib/gameStateTypes';

/**
 * NumeralSpellAssembly - pedido do usuário ("Overhaul de Animações", item 8,
 * "montagem da Magia Numeral, as 3 cartas do combo se reunindo antes do
 * efeito disparar"): antes de qualquer coisa (popup/som/tremor), as 3 cartas
 * consumidas saem da própria posição real na mão (ou do anchor sintético
 * `hand-pN` quando a posição real não está disponível - mesmo fallback do
 * flourish da Besta em GameBoard.tsx) e convergem pro centro da tela.
 *
 * FIX (Fase 4 do overhaul de animações) - até aqui a montagem era 100%
 * simbólica (caixas com o número em texto, nem a carta real) porque
 * `numeralSpellPending` só guardava `{playerNumber, character}` - as 3
 * cartas já tinham saído da mão quando a UI via essa mudança, sem jeito de
 * saber QUAIS eram. A Fase 0.2 resolveu isso guardando `cardSnapshots`
 * (id/naipe/valor de exibição/revelado) no próprio `numeralSpellPending` no
 * instante da ativação - agora cada "fantasma" é a `PlayingCard` de verdade
 * (respeitando `revealed`, mesmo princípio de não vazar informação da
 * Fase 1), com um brilho na cor do personagem por baixo pra manter a
 * identidade visual que as caixas simbólicas tinham.
 */
export interface NumeralSpellAssemblyCardSpec {
  snapshot: NumeralSpellCardSnapshot;
  /** Centro da última posição real conhecida desta carta (cardPositionsRef) - ou do anchor sintético hand-pN. */
  fromLeft: number;
  fromTop: number;
}

export interface NumeralSpellAssemblySpec {
  character: CharacterId;
  cards: [NumeralSpellAssemblyCardSpec, NumeralSpellAssemblyCardSpec, NumeralSpellAssemblyCardSpec];
}

const CARD_W = 48;
const CARD_H = 68;

export function NumeralSpellAssembly({ spec, scale }: { spec: NumeralSpellAssemblySpec | null; scale: number }) {
  const zoomFactor = useZoomEscapeFactor();
  const posCompensation = 1 / zoomFactor;

  return (
    <AnimatePresence>
      {spec &&
        (() => {
          const theme = getCharacterTheme(spec.character);
          const targetLeft = (typeof window !== 'undefined' ? window.innerWidth / 2 : 0) * posCompensation;
          const targetTop = (typeof window !== 'undefined' ? window.innerHeight / 2 : 0) * posCompensation;
          return (
            <div className="fixed inset-0 z-[42] pointer-events-none overflow-hidden">
              {spec.cards.map(({ snapshot, fromLeft, fromTop }, i) => {
                const originLeft = fromLeft * posCompensation;
                const originTop = fromTop * posCompensation;
                return (
                  <motion.div
                    key={snapshot.id}
                    className="absolute"
                    style={{
                      width: CARD_W,
                      height: CARD_H,
                      left: originLeft - CARD_W / 2,
                      top: originTop - CARD_H / 2,
                      filter: `drop-shadow(0 0 6px ${theme.primary})`,
                    }}
                    initial={{ x: 0, y: 0, opacity: 0, scale: 0.6, rotate: 0 }}
                    animate={{
                      x: [0, targetLeft - originLeft],
                      y: [0, targetTop - originTop],
                      opacity: [0, 1, 1, 0],
                      scale: [0.6, 1, 1.15, 0],
                      rotate: [0, i % 2 === 0 ? -20 : 20, 0],
                    }}
                    transition={{
                      duration: 0.5 * scale,
                      delay: i * 0.06 * scale,
                      times: [0, 0.6, 0.85, 1],
                      ease: 'easeIn',
                    }}
                  >
                    {snapshot.revealed ? (
                      <PlayingCard value={snapshot.displayValue} suit={snapshot.suit} className="w-full h-full" />
                    ) : (
                      <PlayingCard faceDown className="w-full h-full" />
                    )}
                  </motion.div>
                );
              })}
              {/* Flash no instante em que as 3 cartas se encontram no centro. */}
              <motion.div
                className="absolute rounded-full"
                style={{ left: targetLeft - 30, top: targetTop - 30, width: 60, height: 60, backgroundColor: theme.primary }}
                initial={{ opacity: 0, scale: 0.3 }}
                animate={{ opacity: [0, 0, 0.9, 0], scale: [0.3, 0.3, 1.8, 2.4] }}
                transition={{ duration: 0.55 * scale, times: [0, 0.55, 0.75, 1], ease: 'easeOut' }}
              />
            </div>
          );
        })()}
    </AnimatePresence>
  );
}
