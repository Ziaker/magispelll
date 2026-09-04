import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import party from 'party-js';
import { useSettings } from '../context/SettingsContext';

/** Ângulos (radianos) dos estilhaços, distribuídos em círculo com um pouco de variação - mesmo esquema de CardShatterBurst.tsx. */
const SHARD_ANGLES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (i / 10) * Math.PI * 2 + (i % 2 === 0 ? 0.15 : -0.15));
// FIX (pedido do usuário, 2ª rodada: "as línguas de fogo mal parecem que
// aumentaram") - a 1ª tentativa só aumentou width/height (10x22 -> 18x40),
// mas a causa real era outra: as línguas nasciam ANTES, no DOM, da camada
// opaca que "carboniza" o card inteiro (bg-[#3D1900] cobrindo `inset-0`) -
// como as duas vivem no MESMO empilhamento (nenhuma tinha z-index próprio),
// a camada mais tarde no DOM (a carbonização) pintava POR CIMA da base das
// chamas, escondendo boa parte delas nos primeiros ~0.3s (justo quando
// estão maiores/mais opacas, perto do chão). Agora reordenadas (ver JSX
// abaixo) pra nascerem DEPOIS da carbonização, sempre visíveis por cima, e
// aumentadas de novo (8 línguas em vez de 6, 30x70 em vez de 18x40).
const FLAME_LICKS = [0, 1, 2, 3, 4, 5, 6, 7];

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
  const { settings } = useSettings();

  useEffect(() => {
    if (!active) return;
    const el = containerRef.current;
    if (!el) return;
    // FIX (pedido do usuário: "desconfio que a opção de reduzir efeitos e
    // partículas não funciona como deveria" + "cheque desempenho... nas
    // magias do piromante") - `settings.particleEffects` antes só desligava
    // as partículas decorativas de fundo (RuneParticles.tsx) - nunca as
    // chamadas reais de `party.confetti` em combate. Esta é a MAIS pesada
    // (Chama Repartida pode acionar até 3 destas ao mesmo tempo, uma por
    // slot atingido) - agora respeita o mesmo switch. Desligado, o slot
    // ainda pega fogo/racha/estilhaça (Framer Motion, CSS, barato), só sem a
    // nuvem de partículas via canvas em cada uma.
    if (!settings.particleEffects) return;
    party.confetti(el, {
      count: party.variation.range(20, 28),
      spread: party.variation.range(110, 150),
      speed: party.variation.range(450, 750),
      size: party.variation.range(0.7, 1.3),
      shapes: ['square', 'circle'],
      color: () => party.Color.fromHex(['#FFE0B3', '#FF8033', '#CC5500', '#D45D4A'][Math.floor(Math.random() * 4)]),
    });
  }, [active, settings.particleEffects]);

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
            {/* A "carta" carboniza e encolhe rápido, dando lugar aos estilhaços em brasa. */}
            <motion.div
              className="absolute inset-0 rounded-lg bg-[#3D1900] border-2 border-[#FF8033]"
              initial={{ opacity: 1, scale: 1 }}
              animate={{ opacity: 0, scale: 0.85 }}
              transition={{ duration: 0.3, ease: 'easeIn' }}
            />
            {/* Línguas de fogo subindo pelas bordas antes da carta se partir.
                FIX (pedido do usuário, 2ª rodada: "as línguas de fogo mal
                parecem que aumentaram") - causa raiz: nasciam ANTES da
                carbonização acima no DOM, então a camada opaca dela pintava
                POR CIMA da base das chamas nos primeiros instantes (mesmo
                empilhamento, sem z-index próprio) - agora vêm DEPOIS dela,
                sempre visíveis por cima. Também aumentadas de novo: 30x70
                (era 18x40), 8 línguas (era 6), brilho mais forte. */}
            {FLAME_LICKS.map((i) => (
              <motion.div
                key={`flame-${i}`}
                className="absolute bottom-0 rounded-full"
                style={{
                  left: `${2 + i * 12}%`,
                  width: 30,
                  height: 70,
                  background: 'linear-gradient(to top, #FF8033, #FFE0B3, transparent)',
                  boxShadow: '0 0 22px 8px rgba(255, 128, 51, 0.75)',
                }}
                initial={{ opacity: 0, scaleY: 0.3, y: 0 }}
                animate={{ opacity: [0, 1, 1, 0], scaleY: [0.3, 1.4, 1.1, 0.7], y: [0, -30, -48, -60] }}
                transition={{ duration: 0.9, delay: i * 0.04, ease: 'easeOut' }}
              />
            ))}
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
