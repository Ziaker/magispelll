import { motion, AnimatePresence } from 'motion/react';
import { Orbit, Feather, Sparkles, Zap, Flame, Sprout, Leaf } from 'lucide-react';
import { getCharacterTheme } from '../lib/characterThemes';
import type { CharacterId } from '../lib/gameEngine';

/**
 * CharacterMagicBurst - substitui MagicEffectBurst.tsx para efeitos de magia
 * (cartas J/Q/K, Magias Numerais e efeitos de Monstro). Pedido do usuário
 * (em duas rodadas): "mais efeitos visuais nas magias dos 3 personagens...
 * mais chamativos e notáveis" e depois "deixe ainda mais chamativo, tão
 * muito simples... pesquise por mais bibliotecas de efeitos visuais".
 *
 * O motivo SVG/motion próprio de cada personagem (formas geométricas
 * controladas por CSS/transform - preciso, mas "contido" dentro da área do
 * alvo, e barato: só opacity/scale/transform, sem manipulação direta do DOM).
 *
 * FIX (pedido do usuário: "o jogo trava quando ativa algumas magias, corrija
 * este problema de desempenho") - até aqui, este componente TAMBÉM disparava
 * suas próprias partículas físicas via `party-js` (55-75 partículas por
 * chamada), além do motivo próprio. O problema: ele é montado UMA VEZ POR
 * ALVO (`effectFlashSlots`/`effectFlashCardIds` em GameBoard.tsx) - magias
 * com 2 alvos (Besta K, Besta Q, Mago Q) montavam DUAS instâncias
 * simultâneas, cada uma disparando sua própria explosão de partículas, ao
 * mesmo tempo que ArenaMagicBurst.tsx (que já cobre a tela inteira com seu
 * próprio `party-js`, disparado só 1x por ativação, não por alvo) - juntando
 * tudo, uma única magia de 2 alvos podia gerar bem mais de 200 partículas
 * físicas simultâneas (cada uma sendo um nó DOM que o party-js atualiza a
 * cada frame via manipulação direta de estilo, mais caro que uma animação
 * CSS pura), travando visivelmente em máquinas mais fracas. Agora as
 * partículas físicas ficam concentradas só em ArenaMagicBurst.tsx (o "grande
 * momento", disparado uma única vez por ativação, nunca multiplicado por
 * alvo) - este componente continua com o motivo animado (barato, sempre
 * transform/opacity via Framer Motion), só sem a camada de partículas extra.
 */
export function CharacterMagicBurst({ active, character }: { active: boolean; character: CharacterId }) {
  const theme = getCharacterTheme(character);
  const color = theme.primary;

  return (
    <div className="absolute inset-0 pointer-events-none">
      <AnimatePresence>
        {active && (
          <motion.div
            key="character-magic-burst"
            className="absolute inset-0 z-40 pointer-events-none rounded-lg flex items-center justify-center overflow-visible"
            initial={{ opacity: 0, scale: 1 }}
            animate={{ opacity: 1, scale: [1, 1.12, 1] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, scale: { duration: 0.5, ease: 'easeOut' } }}
          >
            {/* Flash de cor de fundo - em todos os motivos, primeiros instantes. */}
            <motion.div
              className="absolute inset-0 rounded-lg"
              initial={{ opacity: 0.95 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
              style={{ backgroundColor: color, mixBlendMode: 'overlay' }}
            />

            {/* FIX (pedido do usuário: "melhore ainda mais a performance nas
                magias... não quero que o jogo trave nunca") - este
                componente monta UMA VEZ POR ALVO (Recuperação Selvagem da
                Besta chega a montar 2 instâncias simultâneas, uma por carta
                recuperada - ver o comentário maior no topo do arquivo), então
                qualquer corte aqui vale em dobro nesses casos. Mesmo
                tratamento de ArenaMagicBurst.tsx: menos elementos
                simultâneos, raio de blur bem menor nos que sobraram, e o
                brilho do Anjo trocou `filter: blur()` por `radial-gradient`
                (visualmente equivalente, sem o passe de blur do navegador a
                cada frame). */}
            {character === 'mago' && (
              <>
                {/* Anel de runas girando, se contraindo. */}
                <motion.div
                  className="absolute"
                  initial={{ opacity: 1, scale: 3.4, rotate: 0 }}
                  animate={{ opacity: 0, scale: 0.4, rotate: 280 }}
                  transition={{ duration: 1.7, ease: 'easeIn' }}
                  style={{ width: 140, height: 140 }}
                >
                  {['ᚱ', 'ᛟ', 'ᚻ', 'ᛗ', '✦', 'ᚦ'].map((glyph, idx) => {
                    const angle = (idx / 6) * Math.PI * 2;
                    return (
                      <span
                        key={idx}
                        className="absolute text-[26px] font-display"
                        style={{
                          color,
                          left: `${50 + Math.cos(angle) * 45}%`,
                          top: `${50 + Math.sin(angle) * 45}%`,
                          transform: 'translate(-50%, -50%)',
                          textShadow: `0 0 8px ${color}`,
                        }}
                      >
                        {glyph}
                      </span>
                    );
                  })}
                </motion.div>
                {/* Anéis de choque expandindo. */}
                {[0, 0.18].map((delay, idx) => (
                  <motion.div
                    key={idx}
                    className="absolute rounded-full"
                    style={{ border: `4px solid ${color}`, width: 34, height: 34, boxShadow: `0 0 10px ${color}` }}
                    initial={{ opacity: 1, scale: 1 }}
                    animate={{ opacity: 0, scale: 11 }}
                    transition={{ duration: 1.5, ease: 'easeOut', delay }}
                  />
                ))}
                {/* Núcleo do portal, girando no sentido oposto. */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.2, rotate: 0 }}
                  animate={{ opacity: [0, 1, 0], scale: [0.2, 2.2, 1.5], rotate: -320 }}
                  transition={{ duration: 1.5, ease: 'easeOut' }}
                >
                  <Orbit className="w-16 h-16" style={{ color, filter: `drop-shadow(0 0 8px ${color})` }} />
                </motion.div>
              </>
            )}

            {character === 'besta' && (
              <>
                {/* Rasgos de garra. */}
                {[-20, 0, 20].map((offset, idx) => (
                  <motion.div
                    key={idx}
                    className="absolute rounded-full"
                    style={{
                      width: '200%',
                      height: 9,
                      background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
                      top: `${50 + offset}%`,
                      rotate: '-28deg',
                      boxShadow: `0 0 8px ${color}`,
                    }}
                    initial={{ scaleX: 0, opacity: 0 }}
                    animate={{ scaleX: [0, 1.2, 1], opacity: [0, 1, 0] }}
                    transition={{ duration: 0.65, ease: 'easeOut', delay: idx * 0.07 }}
                  />
                ))}
                {/* Pulso de impacto bruto (era 2 sobrepostos - 1 já lê bem). */}
                <motion.div
                  className="absolute inset-0 rounded-lg"
                  style={{ boxShadow: `0 0 0 10px ${color}` }}
                  initial={{ opacity: 0.95, scale: 0.8 }}
                  animate={{ opacity: 0, scale: 1.9 }}
                  transition={{ duration: 0.55, ease: 'easeOut' }}
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.4, rotate: -15 }}
                  animate={{ opacity: [0, 1, 0], scale: [0.4, 2.4, 1.6], rotate: 15 }}
                  transition={{ duration: 0.85, ease: 'easeOut' }}
                >
                  <Zap className="w-14 h-14" style={{ color, filter: `drop-shadow(0 0 8px ${color})` }} />
                </motion.div>
              </>
            )}

            {character === 'anjo' && (
              <>
                {/* Feixes de luz descendo. */}
                {[-30, -10, 10, 30].map((xOffset, idx) => (
                  <motion.div
                    key={idx}
                    className="absolute top-0"
                    style={{
                      left: `${50 + xOffset}%`,
                      width: 7,
                      height: '85%',
                      background: `linear-gradient(180deg, ${color}, transparent)`,
                      transform: 'translateX(-50%)',
                    }}
                    initial={{ opacity: 0, scaleY: 0 }}
                    animate={{ opacity: [0, 1, 0], scaleY: [0, 1, 1] }}
                    transition={{ duration: 1.4, ease: 'easeOut', delay: idx * 0.05 }}
                  />
                ))}
                {/* Brilho quente - `radial-gradient` no lugar de `filter:
                    blur()` (ver comentário acima do motivo do Mago). */}
                <motion.div
                  className="absolute rounded-full"
                  style={{ background: `radial-gradient(circle, ${color} 0%, ${color} 35%, transparent 70%)`, width: 50, height: 50 }}
                  initial={{ opacity: 0.95, scale: 0.5 }}
                  animate={{ opacity: 0, scale: 8 }}
                  transition={{ duration: 1.5, ease: 'easeOut' }}
                />
                {/* Uma pena caindo (eram 2). */}
                <motion.div
                  className="absolute"
                  style={{ top: '5%', left: '45%' }}
                  initial={{ opacity: 0, y: -10, rotate: -20 }}
                  animate={{ opacity: [0, 1, 1, 0], y: 100, rotate: 50 }}
                  transition={{ duration: 1.6, ease: 'easeInOut' }}
                >
                  <Feather className="w-8 h-8" style={{ color }} />
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, scale: 0.3 }}
                  animate={{ opacity: [0, 1, 0], scale: [0.3, 2.2, 1.6] }}
                  transition={{ duration: 1.2, ease: 'easeOut' }}
                >
                  <Sparkles className="w-14 h-14" style={{ color, filter: `drop-shadow(0 0 8px ${color})` }} />
                </motion.div>
              </>
            )}

            {/* Piromante (personagem novo, pedido do usuário: "as magias do
                piromante mal tem efeitos visuais, especialmente quanto a
                cartas queimar") - antes este componente não tinha NENHUM
                motivo próprio pro Piromante (caía no flash de cor genérico
                acima, sem nada de "fogo" de verdade) - usado em toda
                ativação que não passa pelo FireShatterBurst.tsx (reservado
                só pro "grande momento" do lançamento da Bola de Fogo): a
                Combustão (cartas da própria mão), o Roubo Flamejante e a
                Queima do Reforço (carta alvo do oponente). */}
            {character === 'piromante' && (
              <>
                {/* Línguas de fogo subindo pelas bordas. */}
                {[8, 32, 58, 82].map((left, idx) => (
                  <motion.div
                    key={idx}
                    className="absolute bottom-0 rounded-full"
                    style={{
                      left: `${left}%`,
                      width: 9,
                      height: 20,
                      background: `linear-gradient(to top, ${color}, #FFE0B3, transparent)`,
                    }}
                    initial={{ opacity: 0, scaleY: 0.3, y: 0 }}
                    animate={{ opacity: [0, 1, 0], scaleY: [0.3, 1.3, 0.6], y: [0, -22, -36] }}
                    transition={{ duration: 0.75, delay: idx * 0.05, ease: 'easeOut' }}
                  />
                ))}
                {/* Brasas subindo do centro. */}
                {[-14, -4, 6, 16].map((x, idx) => (
                  <motion.div
                    key={`ember-${idx}`}
                    className="absolute rounded-full"
                    style={{ left: `calc(50% + ${x}px)`, bottom: '30%', width: 4, height: 4, backgroundColor: '#FFB380', boxShadow: `0 0 5px ${color}` }}
                    initial={{ opacity: 0, y: 0 }}
                    animate={{ opacity: [0, 1, 0], y: [0, -40, -56], x: [0, x > 0 ? 10 : -10] }}
                    transition={{ duration: 1, delay: idx * 0.09, ease: 'easeOut' }}
                  />
                ))}
                {/* Núcleo em brasa, pulsando. */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.3 }}
                  animate={{ opacity: [0, 1, 0], scale: [0.3, 2, 1.4] }}
                  transition={{ duration: 0.9, ease: 'easeOut' }}
                >
                  <Flame className="w-14 h-14" style={{ color, filter: `drop-shadow(0 0 10px ${color})` }} />
                </motion.div>
              </>
            )}

            {/* Druida (personagem novo) - Broto/Simbiose/Urtiga/Fotossíntese:
                gavinhas (vinhas) curvando e crescendo das bordas pra dentro,
                folhas subindo em espiral (mesmo papel dos embers do
                Piromante, mas orgânico em vez de fagulha reta), e um anel de
                "crescimento" (tronco de árvore) pulsando no centro em vez do
                anel de choque reto que os outros personagens usam. */}
            {character === 'druida' && (
              <>
                {/* Gavinhas curvando a partir dos 4 cantos, se esticando pra dentro. */}
                {[
                  { corner: 'top-0 left-0', rotate: 25 },
                  { corner: 'top-0 right-0', rotate: -25 },
                  { corner: 'bottom-0 left-0', rotate: -25 },
                  { corner: 'bottom-0 right-0', rotate: 25 },
                ].map(({ corner, rotate }, idx) => (
                  <motion.div
                    key={idx}
                    className={`absolute ${corner} rounded-full origin-center`}
                    style={{
                      width: 3,
                      height: 46,
                      background: `linear-gradient(to top, transparent, ${color})`,
                      transformOrigin: corner.includes('top') ? 'top' : 'bottom',
                    }}
                    initial={{ opacity: 0, scaleY: 0, rotate: rotate * 2.2 }}
                    animate={{ opacity: [0, 1, 0], scaleY: [0, 1, 0.7], rotate: rotate }}
                    transition={{ duration: 0.9, delay: idx * 0.05, ease: 'easeOut' }}
                  />
                ))}
                {/* Folhas subindo em espiral pelo centro (mesmo papel das brasas do Piromante). */}
                {[-16, -6, 4, 14].map((x, idx) => (
                  <motion.div
                    key={`leaf-${idx}`}
                    className="absolute"
                    style={{ left: `calc(50% + ${x}px)`, bottom: '25%' }}
                    initial={{ opacity: 0, y: 0, rotate: 0, scale: 0.5 }}
                    animate={{ opacity: [0, 1, 0], y: [0, -46, -64], rotate: [0, idx % 2 === 0 ? 140 : -140], scale: [0.5, 0.9, 0.7] }}
                    transition={{ duration: 1.1, delay: idx * 0.08, ease: 'easeOut' }}
                  >
                    <Leaf className="w-4 h-4" style={{ color, filter: `drop-shadow(0 0 4px ${color})` }} />
                  </motion.div>
                ))}
                {/* Anel de crescimento (tronco de árvore) pulsando, no lugar do anel de choque reto. */}
                <motion.div
                  className="absolute rounded-full"
                  style={{ border: `3px solid ${color}`, width: 40, height: 40 }}
                  initial={{ opacity: 0.9, scale: 0.6 }}
                  animate={{ opacity: 0, scale: 7 }}
                  transition={{ duration: 1.3, ease: 'easeOut' }}
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.3, y: 6 }}
                  animate={{ opacity: [0, 1, 0], scale: [0.3, 2, 1.4], y: [6, -4, 0] }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                >
                  <Sprout className="w-14 h-14" style={{ color, filter: `drop-shadow(0 0 8px ${color})` }} />
                </motion.div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
