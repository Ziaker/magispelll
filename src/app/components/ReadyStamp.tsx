import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

/** Mesmo conjunto de glifos rúnicos de RuneParticles.tsx (fundo da Home) e do anel arcano de ArenaMagicBurst.tsx (Magia Numeral do Mago) - reaproveita o vocabulário visual já estabelecido em vez de inventar um novo. */
const SEAL_RUNES = ['ᚱ', 'ᛟ', 'ᚻ', 'ᛗ', '✦'];
const SEAL_RING_SIZE = 42;
const SEAL_RUNE_RADIUS = 19;

/**
 * ReadyStamp - pedido do usuário ("Polish Visual Final", pós-overhaul de
 * animações): o carimbo anterior (uma caixa retangular lisa) virou um selo
 * arcano de confirmação pequeno - um anel com runas ao redor (mesmos glifos
 * de RuneParticles.tsx/ArenaMagicBurst.tsx, só numa escala bem menor - o
 * badge/botão por baixo é uma cápsula estreita, não cabe um anel do tamanho
 * usado na Magia Numeral), a palavra "PRONTO" estampada por cima (mais larga
 * que o próprio anel de propósito, mesma leitura de um carimbo de tinta de
 * verdade) e um pulso de impacto ÚNICO ecoando pelo painel no instante do
 * "baque" (BothReadyPulse, logo abaixo, é o pulso INFINITO separado de "os
 * dois prontos" - este aqui é só o baque do selo individual, uma vez só).
 * Duração total pouco maior que a versão anterior (620ms vs. 550ms, pedido
 * explícito do usuário pra não aumentar muito).
 *
 * Detecta a PRÓPRIA transição `false -> true` de `active` (useRef/useEffect
 * internos - o pai só passa o boolean já conhecido,
 * `playerState.readyForNextPhase`, sem precisar gerenciar mais nenhum estado
 * transitório) e, só nesse instante, o selo aparece - puramente decorativo,
 * nunca substitui o texto "Pronto!"/"Pronto" real por baixo.
 */
export function ReadyStamp({ active, scale }: { active: boolean; scale: number }) {
  const wasActiveRef = useRef(active);
  const [justStamped, setJustStamped] = useState(false);
  // FIX (pesquisa de bugs: selo ficava preso visível pra sempre) - o timer
  // precisa sobreviver a re-execuções do efeito abaixo (que disparam toda
  // vez que `active` muda). Antes ele vivia só no cleanup do efeito, então
  // um "Pronto" seguido de "não Pronto" em menos de 620ms cancelava o único
  // reset agendado sem agendar outro. Guardando em ref, o timeout iniciado
  // no "carimbou" segue até o fim mesmo que `active` volte a false antes
  // disso - o selo é puramente decorativo (ver comentário acima), não
  // precisa acompanhar `active` em tempo real.
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // FIX (Fase 3 do overhaul de animações) - `settings.animations`/
  // `settings.animationSpeed` não eram respeitados aqui (mesma classe de gap
  // já corrigida nas Fases 1 e 2). `scale` vem de `getAnimationDurationScale`
  // (0 quando animações estão desligadas) - com animações desligadas, o
  // efeito é puramente decorativo demais pra valer a pena até agendar o
  // timer, então pula o carimbo por completo (o badge por baixo já muda de
  // cor sozinho, sem precisar de nenhum flourish). `settings.animations` não
  // é dependência deste efeito de propósito - ver
  // feedback_review_blocking_timer_useeffect_deps na memória: só `active`
  // decide SE o efeito deve agir, `scale` é lido via closure no instante em
  // que ele roda.
  useEffect(() => {
    if (active && !wasActiveRef.current && scale > 0) {
      setJustStamped(true);
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setJustStamped(false);
        timeoutRef.current = null;
      }, Math.round(620 * scale));
    }
    wasActiveRef.current = active;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <AnimatePresence>
      {justStamped && (
        <motion.div
          className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 * scale }}
        >
          {/* Onda de impacto no painel - disparo único (diferente do anel
              infinito de BothReadyPulse), lida como o "baque" do selo
              ecoando pela borda da cápsula inteira. */}
          <motion.div
            className="absolute inset-0 rounded-md"
            initial={{ boxShadow: '0 0 0 0 rgba(108,196,122,0.55)' }}
            animate={{ boxShadow: ['0 0 0 0 rgba(108,196,122,0.55)', '0 0 0 5px rgba(108,196,122,0)'] }}
            transition={{ duration: 0.35 * scale, ease: 'easeOut' }}
          />

          {/* Anel arcano com runas ao redor. */}
          <motion.div
            className="relative rounded-full border-2"
            style={{ width: SEAL_RING_SIZE, height: SEAL_RING_SIZE, borderColor: '#6CC47A' }}
            initial={{ scale: 2, rotate: -25, opacity: 0 }}
            animate={{ scale: [2, 0.92, 1], rotate: [-25, -25, 0], opacity: [0, 1, 1] }}
            transition={{ duration: 0.3 * scale, ease: 'easeOut' }}
          >
            {SEAL_RUNES.map((rune, i) => {
              const angle = (i / SEAL_RUNES.length) * Math.PI * 2 - Math.PI / 2;
              return (
                <motion.span
                  key={i}
                  className="absolute font-display"
                  style={{
                    left: SEAL_RING_SIZE / 2 + Math.cos(angle) * SEAL_RUNE_RADIUS - 4,
                    top: SEAL_RING_SIZE / 2 + Math.sin(angle) * SEAL_RUNE_RADIUS - 5,
                    fontSize: 7,
                    lineHeight: 1,
                    color: '#6CC47A',
                    textShadow: '0 0 4px #6CC47A',
                  }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 1, 0.85] }}
                  transition={{ duration: 0.25 * scale, delay: (0.08 + i * 0.02) * scale }}
                >
                  {rune}
                </motion.span>
              );
            })}
          </motion.div>

          {/* "PRONTO" estampado por cima do anel - mais largo que o próprio
              anel de propósito, mesma leitura visual de um carimbo de tinta
              de verdade (o texto costuma extrapolar a borda do emblema
              central). */}
          <motion.p
            className="absolute inset-0 flex items-center justify-center font-display uppercase pointer-events-none"
            style={{
              fontSize: 10,
              letterSpacing: '0.06em',
              color: '#6CC47A',
              textShadow: '0 0 6px #6CC47A, 0 1px 2px rgba(0,0,0,0.8)',
            }}
            initial={{ scale: 1.6, opacity: 0, rotate: -6 }}
            animate={{ scale: [1.6, 0.88, 1], opacity: [0, 1, 1], rotate: [-6, -6, -3] }}
            transition={{ duration: 0.26 * scale, delay: 0.04 * scale, ease: 'easeOut' }}
          >
            PRONTO
          </motion.p>

          {/* Flash rápido no instante do "impacto" do carimbo. */}
          <motion.div
            className="absolute inset-0 rounded-md"
            initial={{ opacity: 0.6 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.3 * scale, delay: 0.12 * scale, ease: 'easeOut' }}
            style={{ backgroundColor: '#6CC47A', mixBlendMode: 'overlay' }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * BothReadyPulse - segunda metade do pedido do "selo de Pronto": "quando os
 * DOIS ficam prontos, um pulso sincronizado nos dois lados sinalizando 'vai
 * avançar'". `active` chega já calculado em GameBoard.tsx (`bothReady`, ver
 * comentário em PlayerZoneProps) e é o MESMO valor nos dois PlayerZone ao
 * mesmo tempo - cada lado desenha seu próprio anel expandindo por cima do
 * badge/botão de Pronto, sem precisar de nenhuma coordenação extra além de
 * receber o mesmo booleano.
 */
export function BothReadyPulse({ active, scale }: { active: boolean; scale: number }) {
  // FIX (Fase 3 do overhaul de animações) - `settings.animations` desligado
  // (scale === 0) agora realmente pula o pulso, em vez de continuar rodando
  // ignorando a preferência - os dois badges já verdes por baixo continuam
  // comunicando "os dois prontos" sem precisar do anel.
  return (
    <AnimatePresence>
      {active && scale > 0 && (
        <motion.div
          className="absolute inset-0 z-10 rounded-md pointer-events-none"
          initial={{ boxShadow: '0 0 0 0 rgba(108,196,122,0.6)' }}
          animate={{
            boxShadow: [
              '0 0 0 0 rgba(108,196,122,0.6)',
              '0 0 0 6px rgba(108,196,122,0)',
              '0 0 0 0 rgba(108,196,122,0.6)',
            ],
          }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.9 * scale, repeat: Infinity, ease: 'easeOut' }}
        />
      )}
    </AnimatePresence>
  );
}
