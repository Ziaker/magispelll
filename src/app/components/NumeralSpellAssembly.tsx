import { motion, AnimatePresence } from 'motion/react';
import { numeralDisplayLabel } from '../lib/numeralSpells';
import { useZoomEscapeFactor } from '../lib/useZoomEscapeFactor';
import { getCharacterTheme } from '../lib/characterThemes';
import type { CharacterId } from '../lib/characterRegistry';

/**
 * NumeralSpellAssembly - pedido do usuário ("Overhaul de Animações", item
 * 8): "montagem da Magia Numeral (as 3 cartas do combo se reunindo antes
 * do efeito disparar)". `numeralSpellPending` (gameEngine.ts) só guarda
 * `{playerNumber, character}` - os IDs exatos das 3 cartas usadas na
 * ativação já se perderam a essa altura (a Magia Numeral descarta as 3
 * cartas na MESMA ação que a ativa). Em vez de perseguir cartas específicas
 * (como FlyingDiscardCard/BeastBurnFlash fazem, quando o ID sobrevive),
 * esta animação é SIMBÓLICA: 3 cartas-fantasma mostrando os valores exigidos
 * pelo personagem (`requiredNumbers`, ex.: "9,9,9" do Mago) saem da MÃO de
 * quem ativou (`cardPositionsRef.get('hand-p'+player)`, mesmo anchor
 * sintético usado por BeastBurnFlash) e convergem pro centro da tela, onde
 * se encontram num flash - só ENTÃO (ver o `setTimeout` extra em
 * GameBoard.tsx) o popup/som/tremor de sempre disparam, dando a impressão
 * de que o combo se "monta" antes do efeito de fato acontecer.
 *
 * Mesma técnica de compensação de `useZoomEscapeFactor()` que
 * FlyingDiscardCard/BeastBurnFlash/DeckReshuffleBurst já usam (`zoom` no
 * wrapper de GameBoard.tsx cria um containing block novo pra
 * `position:fixed`, então coordenadas em pixel cru - origem E alvo - saem
 * do lugar sem multiplicar por `1/zoomFactor` primeiro).
 */
export interface NumeralSpellAssemblySpec {
  character: CharacterId;
  requiredNumbers: number[];
  originLeft: number;
  originTop: number;
}

const CARD_W = 34;
const CARD_H = 46;
/** Deslocamentos das 3 cartas ao redor da origem da mão, pra não nascerem todas empilhadas no mesmo pixel. */
const ORIGIN_JITTER = [-26, 0, 26];

export function NumeralSpellAssembly({ spec }: { spec: NumeralSpellAssemblySpec | null }) {
  const zoomFactor = useZoomEscapeFactor();
  const posCompensation = 1 / zoomFactor;

  return (
    <AnimatePresence>
      {spec &&
        (() => {
          const theme = getCharacterTheme(spec.character);
          const targetLeft = (typeof window !== 'undefined' ? window.innerWidth / 2 : 0) * posCompensation;
          const targetTop = (typeof window !== 'undefined' ? window.innerHeight / 2 : 0) * posCompensation;
          const originLeft = spec.originLeft * posCompensation;
          const originTop = spec.originTop * posCompensation;
          return (
            <div className="fixed inset-0 z-[42] pointer-events-none overflow-hidden">
              {spec.requiredNumbers.map((num, i) => {
                const jitter = ORIGIN_JITTER[i % ORIGIN_JITTER.length] * posCompensation;
                return (
                  <motion.div
                    key={i}
                    className="absolute flex items-center justify-center rounded-md border-2 font-display"
                    style={{
                      width: CARD_W,
                      height: CARD_H,
                      left: originLeft + jitter - CARD_W / 2,
                      top: originTop - CARD_H / 2,
                      backgroundColor: '#1E1A16',
                      borderColor: theme.primary,
                      color: theme.primary,
                      fontSize: 16,
                    }}
                    initial={{ x: 0, y: 0, opacity: 0, scale: 0.6, rotate: 0 }}
                    animate={{
                      x: [0, targetLeft - originLeft - jitter],
                      y: [0, targetTop - originTop],
                      opacity: [0, 1, 1, 0],
                      scale: [0.6, 1, 1.15, 0],
                      rotate: [0, i % 2 === 0 ? -20 : 20, 0],
                    }}
                    transition={{ duration: 0.5, delay: i * 0.06, times: [0, 0.6, 0.85, 1], ease: 'easeIn' }}
                  >
                    {numeralDisplayLabel(num)}
                  </motion.div>
                );
              })}
              {/* Flash no instante em que as 3 cartas se encontram. */}
              <motion.div
                className="absolute rounded-full"
                style={{
                  left: targetLeft - 30,
                  top: targetTop - 30,
                  width: 60,
                  height: 60,
                  backgroundColor: theme.primary,
                }}
                initial={{ opacity: 0, scale: 0.3 }}
                animate={{ opacity: [0, 0, 0.9, 0], scale: [0.3, 0.3, 1.8, 2.4] }}
                transition={{ duration: 0.55, times: [0, 0.55, 0.75, 1], ease: 'easeOut' }}
              />
            </div>
          );
        })()}
    </AnimatePresence>
  );
}
