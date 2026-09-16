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
export function ReadyStamp({ active }: { active: boolean }) {
  const wasActiveRef = useRef(active);
  const [justStamped, setJustStamped] = useState(false);

  useEffect(() => {
    if (active && !wasActiveRef.current) {
      setJustStamped(true);
      const t = setTimeout(() => setJustStamped(false), 550);
      wasActiveRef.current = active;
      return () => clearTimeout(t);
    }
    wasActiveRef.current = active;
  }, [active]);

  return (
    <AnimatePresence>
      {justStamped && (
        <motion.div
          className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            className="rounded-md border-2 flex items-center justify-center"
            style={{ borderColor: '#6CC47A', width: '80%', height: '80%' }}
            initial={{ scale: 2.4, rotate: -18, opacity: 0 }}
            animate={{ scale: [2.4, 0.9, 1], rotate: [-18, -18, -8], opacity: [0, 1, 1] }}
            transition={{ duration: 0.32, ease: 'easeOut' }}
          />
          {/* Flash rápido no instante do "impacto" do carimbo. */}
          <motion.div
            className="absolute inset-0 rounded-md"
            initial={{ opacity: 0.7 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.3, delay: 0.15, ease: 'easeOut' }}
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
export function BothReadyPulse({ active }: { active: boolean }) {
  return (
    <AnimatePresence>
      {active && (
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
          transition={{ duration: 0.9, repeat: Infinity, ease: 'easeOut' }}
        />
      )}
    </AnimatePresence>
  );
}
