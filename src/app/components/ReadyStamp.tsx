import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

/**
 * ReadyStamp - pedido do usuário ("Overhaul de Animações", "selo de
 * 'Pronto'"): "em vez do badge só trocar de estado, um carimbo/selo caindo
 * no próprio painel". Detecta a PRÓPRIA transição `false -> true` de
 * `active` (useRef/useEffect internos - o pai só passa o boolean já
 * conhecido, `playerState.readyForNextPhase`, sem precisar gerenciar mais
 * nenhum estado transitório) e, só nesse instante, um carimbo cai de cima
 * com um leve giro e "bate" no painel (overshoot de escala + flash rápido),
 * sobrepondo o badge/botão existente por baixo dele - puramente
 * decorativo, nunca substitui o texto "Pronto!"/"Pronto" real.
 */
export function ReadyStamp({ active, scale }: { active: boolean; scale: number }) {
  const wasActiveRef = useRef(active);
  const [justStamped, setJustStamped] = useState(false);
  // FIX (pesquisa de bugs: selo ficava preso visível pra sempre) - o timer
  // precisa sobreviver a re-execuções do efeito abaixo (que disparam toda
  // vez que `active` muda). Antes ele vivia só no cleanup do efeito, então
  // um "Pronto" seguido de "não Pronto" em menos de 550ms cancelava o único
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
      }, Math.round(550 * scale));
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
          <motion.div
            className="rounded-md border-2 flex items-center justify-center"
            style={{ borderColor: '#6CC47A', width: '80%', height: '80%' }}
            initial={{ scale: 2.4, rotate: -18, opacity: 0 }}
            animate={{ scale: [2.4, 0.9, 1], rotate: [-18, -18, -8], opacity: [0, 1, 1] }}
            transition={{ duration: 0.32 * scale, ease: 'easeOut' }}
          />
          {/* Flash rápido no instante do "impacto" do carimbo. */}
          <motion.div
            className="absolute inset-0 rounded-md"
            initial={{ opacity: 0.7 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.3 * scale, delay: 0.15 * scale, ease: 'easeOut' }}
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
