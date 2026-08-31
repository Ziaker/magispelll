import { motion, AnimatePresence } from 'motion/react';
import { Orbit, Feather, Zap, Sparkles } from 'lucide-react';
import { getCharacterTheme } from '../lib/characterThemes';
import type { CharacterId } from '../lib/gameEngine';

/**
 * ArenaMagicBurst - versão "por toda a arena" do CharacterMagicBurst.tsx.
 *
 * Pedido do usuário, item 4 ("burst de arena em TODAS as magias"): antes só
 * disparava na Magia Numeral (`showNumeralSpellPopup`); agora GameBoard.tsx
 * o liga a `activeMagicCaster` - o MESMO estado que já é preenchido para
 * QUALQUER efeito de magia (as 9 cartas J/Q/K, os 3 efeitos de Monstro e as
 * 3 Magias Numerais, ver flashEffectTargets/flashSelfEffect em
 * GameBoard.tsx) - então esta versão "tela inteira" agora acompanha TODA
 * magia, não só a Numeral.
 *
 * Pedido do usuário, item 6 ("portal/asas cobrindo a tela"): antes era um
 * burst genérico (anéis + 1 brilho), igual pra qualquer personagem, só
 * recolorido. Agora usa os MESMOS 3 motivos de CharacterMagicBurst.tsx
 * (portal do Mago, garras da Besta, luz do Anjo), só que na escala da
 * viewport inteira em vez da carta.
 *
 * FIX (pedido do usuário: "correções de desempenho quanto a magias") -
 * partículas físicas via `party-js` foram REMOVIDAS por completo daqui (3
 * rodadas anteriores só cortavam a contagem, sem resolver de vez - ver
 * histórico no git/CODIGO_COMENTADO.md). Causa raiz: cada partícula do
 * party-js é um elemento HTML real, atualizado via `requestAnimationFrame`
 * com manipulação DIRETA de estilo em JavaScript, na MESMA thread principal
 * que o React usa pra renderizar - o único custo de todo o sistema de
 * efeitos que não roda no compositor da GPU. Como este burst dispara em
 * QUALQUER magia (as 9 combinações J/Q/K, os 3 efeitos de Monstro, as 3
 * Magias Numerais - é de longe o efeito mais frequente do jogo), era
 * também de longe a maior fonte de possível travamento. Os motivos
 * CSS/`motion` abaixo (anéis, glifos, ícones) continuam intactos - já eram,
 * segundo o histórico, "quem carrega a maior parte do grande momento visual
 * mesmo assim", já que rodam no compositor, não na thread principal.
 */
export function ArenaMagicBurst({ active, character }: { active: boolean; character?: CharacterId | null }) {
  const resolvedCharacter: CharacterId = character ?? 'mago';
  const theme = getCharacterTheme(resolvedCharacter);
  const color = theme.primary;

  return (
    <div className="fixed inset-0 pointer-events-none z-40">
      <AnimatePresence>
        {active && (
          <motion.div
            key="arena-magic-burst"
            className="fixed inset-0 pointer-events-none overflow-hidden flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {/* Flash de cor cobrindo a tela inteira nos primeiros instantes. */}
            <motion.div
              className="absolute inset-0"
              initial={{ opacity: 0.6 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              style={{ backgroundColor: color, mixBlendMode: 'overlay' }}
            />

            {/* FIX (pedido do usuário: "melhore ainda mais a performance nas
                magias... não quero que o jogo trave nunca") - além do corte
                de partículas acima, os motivos abaixo tinham vários
                elementos com `box-shadow`/`filter: blur()`/`filter:
                drop-shadow()` sendo ESCALADOS de várias vezes o próprio
                tamanho (ex.: anéis do Mago indo de scale 1 a 50) - essas 3
                propriedades são as mais caras de recompor a cada frame no
                CSS (exigem um passe de blur completo do navegador, repetido
                a cada frame da animação), e o custo cresce junto com a área
                que precisa ser desenhada - numa animação que ESCALA o
                elemento até 50x, esse custo pode ficar bem alto. 3 cortes
                aplicados nos 3 motivos abaixo: (1) menos elementos
                simultâneos, (2) raio de blur bem menor nos que sobraram, (3)
                o brilho do Anjo trocou `filter: blur()` (recalcula os pixels
                do elemento inteiro) por um `radial-gradient` (a "borda macia"
                já nasce pronta no próprio gradiente, sem nenhum passe de blur
                do navegador) - visualmente quase idêntico, muito mais barato. */}
            {resolvedCharacter === 'mago' && (
              <>
                {/* Anel de runas gigante girando ao redor de toda a tela. */}
                <motion.div
                  className="absolute"
                  initial={{ opacity: 1, scale: 0.3, rotate: 0 }}
                  animate={{ opacity: 0, scale: 3.5, rotate: 200 }}
                  transition={{ duration: 1.8, ease: 'easeOut' }}
                  style={{ width: '60vmin', height: '60vmin' }}
                >
                  {['ᚱ', 'ᛟ', 'ᚻ', 'ᛗ', '✦', 'ᚦ', 'ᛒ', 'ᛊ'].map((glyph, idx) => {
                    const angle = (idx / 8) * Math.PI * 2;
                    return (
                      <span
                        key={idx}
                        className="absolute text-[40px] font-display"
                        style={{
                          color,
                          left: `${50 + Math.cos(angle) * 48}%`,
                          top: `${50 + Math.sin(angle) * 48}%`,
                          transform: 'translate(-50%, -50%)',
                          textShadow: `0 0 12px ${color}`,
                        }}
                      >
                        {glyph}
                      </span>
                    );
                  })}
                </motion.div>
                {/* Anéis de choque saindo do centro até fora da viewport. */}
                {[0, 0.2, 0.4].map((delay, idx) => (
                  <motion.div
                    key={idx}
                    className="absolute rounded-full"
                    style={{ border: `4px solid ${color}`, width: 40, height: 40, boxShadow: `0 0 12px ${color}` }}
                    initial={{ opacity: 0.9, scale: 1 }}
                    animate={{ opacity: 0, scale: 50 }}
                    transition={{ duration: 1.6, ease: 'easeOut', delay }}
                  />
                ))}
                <motion.div
                  initial={{ opacity: 0, scale: 0.3, rotate: 0 }}
                  animate={{ opacity: [0, 1, 0], scale: [0.3, 4, 3], rotate: -300 }}
                  transition={{ duration: 1.5, ease: 'easeOut' }}
                >
                  <Orbit className="w-28 h-28" style={{ color, filter: `drop-shadow(0 0 10px ${color})` }} />
                </motion.div>
              </>
            )}

            {resolvedCharacter === 'besta' && (
              <>
                {/* Rasgos de garra atravessando a LARGURA da tela inteira. */}
                {[-24, -8, 8, 24].map((offset, idx) => (
                  <motion.div
                    key={idx}
                    className="absolute rounded-full"
                    style={{
                      width: '160vw',
                      height: 12,
                      background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
                      top: `${50 + offset}%`,
                      left: '-30vw',
                      rotate: '-22deg',
                      boxShadow: `0 0 14px ${color}`,
                    }}
                    initial={{ scaleX: 0, opacity: 0 }}
                    animate={{ scaleX: [0, 1.1, 1], opacity: [0, 1, 0] }}
                    transition={{ duration: 0.75, ease: 'easeOut', delay: idx * 0.08 }}
                  />
                ))}
                {/* Pulso de impacto (era 2 sobrepostos - 1 já lê bem e é a
                    metade do custo: um box-shadow `inset` cobrindo a tela
                    inteira é a única sombra deste componente que precisa
                    desenhar um perímetro do tamanho da própria viewport). */}
                <motion.div
                  className="absolute inset-0"
                  style={{ boxShadow: `inset 0 0 0 10px ${color}` }}
                  initial={{ opacity: 0.9 }}
                  animate={{ opacity: 0 }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.5, rotate: -20 }}
                  animate={{ opacity: [0, 1, 0], scale: [0.5, 5, 3.5], rotate: 20 }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                >
                  <Zap className="w-24 h-24" style={{ color, filter: `drop-shadow(0 0 10px ${color})` }} />
                </motion.div>
              </>
            )}

            {resolvedCharacter === 'anjo' && (
              <>
                {/* Feixes de luz cobrindo a ALTURA da tela inteira, do topo até embaixo. */}
                {[-36, -12, 12, 36].map((xOffset, idx) => (
                  <motion.div
                    key={idx}
                    className="absolute top-0"
                    style={{
                      left: `${50 + xOffset}%`,
                      width: 10,
                      height: '100vh',
                      background: `linear-gradient(180deg, ${color}, transparent)`,
                      transform: 'translateX(-50%)',
                    }}
                    initial={{ opacity: 0, scaleY: 0 }}
                    animate={{ opacity: [0, 1, 0], scaleY: [0, 1, 1] }}
                    transition={{ duration: 1.6, ease: 'easeOut', delay: idx * 0.05 }}
                  />
                ))}
                {/* Brilho quente - `radial-gradient` no lugar de `filter:
                    blur()` (ver comentário acima do motivo do Mago): mesmo
                    efeito de "borda macia", sem exigir um passe de blur do
                    navegador a cada frame enquanto escala até 14x. */}
                <motion.div
                  className="absolute rounded-full"
                  style={{ background: `radial-gradient(circle, ${color} 0%, ${color} 35%, transparent 70%)`, width: 80, height: 80 }}
                  initial={{ opacity: 0.9, scale: 0.5 }}
                  animate={{ opacity: 0, scale: 14 }}
                  transition={{ duration: 1.6, ease: 'easeOut' }}
                />
                {[40, 60].map((leftPct, idx) => (
                  <motion.div
                    key={idx}
                    className="absolute"
                    style={{ top: '2%', left: `${leftPct}%` }}
                    initial={{ opacity: 0, y: -20, rotate: -20 }}
                    animate={{ opacity: [0, 1, 1, 0], y: '90vh', rotate: 60 }}
                    transition={{ duration: 2, ease: 'easeInOut', delay: idx * 0.15 }}
                  >
                    <Feather className="w-10 h-10" style={{ color }} />
                  </motion.div>
                ))}
                <motion.div
                  initial={{ opacity: 0, scale: 0.3 }}
                  animate={{ opacity: [0, 1, 0], scale: [0.3, 4, 3] }}
                  transition={{ duration: 1.3, ease: 'easeOut' }}
                >
                  <Sparkles className="w-24 h-24" style={{ color, filter: `drop-shadow(0 0 10px ${color})` }} />
                </motion.div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
