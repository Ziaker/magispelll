import { useMemo } from 'react';
import { motion } from 'motion/react';

export interface FireballProjectileSpec {
  key: string;
  /** Posição de origem (getBoundingClientRect da própria FireballMeter.tsx do jogador que lançou - ver data-card-id="piromante-fireball-pN" em BattleField.tsx). */
  from: { left: number; top: number; width: number; height: number };
  /** Posição de chegada (getBoundingClientRect do SLOT alvo inteiro - ver data-card-id="slot-pN-i" em FieldSlotView.tsx). */
  to: { left: number; top: number; width: number; height: number };
  /** Duração do voo em segundos - GameBoard.tsx usa o MESMO valor pra escalonar quando o dispatch/impacto realmente acontecem (ver FIREBALL_TRAVEL_MS). */
  durationS: number;
  /**
   * FIX (checagem extensa de desempenho, pedido do usuário): "Chama
   * Repartida" pode disparar até 3 destas simultaneamente (uma por slot do
   * oponente), cada uma com 8 animações em loop (6 brasas + brilho + giro
   * do núcleo) - 3x ao mesmo tempo por ~0.5s. GameBoard.tsx passa um valor
   * menor aqui quando `projectileSpecs.length > 1` pra compensar a
   * multiplicação, mantendo o rastro visível sem triplicar a contagem de
   * nós animados. Opcional - cai pra `EMBER_COUNT` (6) por padrão.
   */
  emberCount?: number;
}

const BALL_SIZE = 30;
const EMBER_COUNT = 6;

/**
 * FireballProjectile - pedido explícito do usuário: "eu queria que realmente
 * houvesse projéteis visualmente indo em direção aos seus alvos para o
 * piromante" (e Mosqueteiro, ver BulletImpactBurst.tsx). Uma bola de fogo de
 * verdade viajando em linha reta da FireballMeter.tsx do jogador que lançou
 * até o slot alvo no campo do oponente - MESMA técnica de posição-a-posição
 * (`from`/`to` via getBoundingClientRect, position: fixed) já usada e
 * comprovada por FlyingDiscardCard.tsx (carta voando até o descarte), só que
 * em linha reta acelerando (`ease: 'easeIn'`) em vez de um arco - um
 * lançamento de ataque, não um descarte suave.
 *
 * GameBoard.tsx só dispara o impacto de verdade (FireShatterBurst.tsx) e o
 * dispatch que aplica a mudança no motor DEPOIS que essa animação termina
 * (mesmo `durationS`) - a Bola de Fogo precisa visivelmente CHEGAR no alvo
 * antes dele reagir.
 */
export function FireballProjectile({ spec }: { spec: FireballProjectileSpec }) {
  const { from, to, durationS, emberCount = EMBER_COUNT } = spec;
  const originLeft = from.left + from.width / 2 - BALL_SIZE / 2;
  const originTop = from.top + from.height / 2 - BALL_SIZE / 2;
  const deltaX = to.left + to.width / 2 - (originLeft + BALL_SIZE / 2);
  const deltaY = to.top + to.height / 2 - (originTop + BALL_SIZE / 2);

  const emberOffsets = useMemo(() => Array.from({ length: emberCount }, () => (Math.random() - 0.5) * 14), [spec.key, emberCount]);

  return (
    <motion.div
      className="fixed z-[92] pointer-events-none"
      style={{ left: originLeft, top: originTop, width: BALL_SIZE, height: BALL_SIZE }}
      initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
      animate={{ x: deltaX, y: deltaY, opacity: [0, 1, 1, 0.9], scale: [0.4, 1, 1, 0.85] }}
      transition={{ duration: durationS, ease: 'easeIn' }}
    >
      {/* Rastro de brasas atrás da bola - cada uma nasce um pouco depois da
          anterior e some rápido, dando sensação de esteira em chamas. */}
      {emberOffsets.map((offset, idx) => (
        <motion.div
          key={idx}
          className="absolute rounded-full"
          style={{
            left: BALL_SIZE / 2 + offset,
            top: BALL_SIZE / 2,
            width: 5 - (idx % 3),
            height: 5 - (idx % 3),
            backgroundColor: idx % 2 === 0 ? '#FFB380' : '#FF8033',
            boxShadow: '0 0 6px #FF8033',
          }}
          initial={{ x: '-50%', y: '-50%', opacity: 0 }}
          animate={{ opacity: [0, 0.9, 0] }}
          transition={{ duration: durationS * 0.5, delay: (idx / emberCount) * durationS * 0.7, repeat: Infinity, repeatDelay: durationS * 0.15 }}
        />
      ))}

      {/* Brilho externo pulsante. */}
      <motion.div
        className="absolute inset-[-8px] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(255,128,51,0.65) 0%, rgba(204,85,0,0) 72%)' }}
        animate={{ scale: [1, 1.25, 1], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 0.22, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Núcleo da bola de fogo, girando. */}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background: 'radial-gradient(circle at 45% 40%, #FFF3E6 0%, #FFE0B3 22%, #FF8033 52%, #CC5500 78%, #3D1900 100%)',
          boxShadow: '0 0 14px 4px rgba(255,128,51,0.75)',
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 0.4, repeat: Infinity, ease: 'linear' }}
      />
    </motion.div>
  );
}
