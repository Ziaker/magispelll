import { motion } from 'motion/react';

export interface BulletImpactSpec {
  key: string;
  /** Última posição conhecida da carta-alvo (mesmo mecanismo de cardPositionsRef em GameBoard.tsx já usado por FlyingDiscardCard.tsx/ReactionNegatedBurst.tsx). */
  rect: { left: number; top: number; width: number; height: number };
  /** Atraso (s) antes deste tiro específico disparar - usado pra escalonar vários alvos de uma vez (ex.: Rajada Reveladora) como uma rajada, um tiro após o outro, em vez de todos batendo no mesmo instante. */
  delay?: number;
}

const MUZZLE_COLOR = '#FFD76B';
const STEEL_COLOR = '#8C9199';
const SPARK_ANGLES = [0, 1, 2, 3, 4, 5].map((i) => (i / 6) * Math.PI * 2);

/**
 * Uma única bala: uma trilha curta "voando" da borda esquerda da tela até a
 * carta-alvo, seguida de um flash de impacto + faíscas metálicas no ponto de
 * chegada. Renderizado como `fixed`, posicionado por coordenadas de tela
 * (nunca precisa saber em qual componente/zona a carta-alvo realmente vive -
 * funciona igual pra carta na mão, no campo, ou na zona própria).
 */
function SingleBulletImpact({ rect, delay = 0 }: { rect: BulletImpactSpec['rect']; delay?: number }) {
  const targetX = rect.left + rect.width / 2;
  const targetY = rect.top + rect.height / 2;
  const startX = -60;
  const impactDelay = delay + 0.22;

  return (
    <>
      {/* Trilha do projétil. */}
      <motion.div
        className="fixed z-[94] pointer-events-none rounded-full"
        style={{ top: targetY - 2, height: 3, backgroundColor: STEEL_COLOR, boxShadow: `0 0 10px ${STEEL_COLOR}, 0 0 4px #EFE7D6` }}
        initial={{ left: startX, width: 0, opacity: 0 }}
        animate={{ left: [startX, targetX - 26, targetX], width: [0, 34, 0], opacity: [0, 1, 1, 0] }}
        transition={{ duration: 0.22, delay, ease: 'easeIn', times: [0, 0.75, 0.9, 1] }}
      />
      {/* Flash de impacto - clarão amarelo-alaranjado (mesmo num tema cinza/aço, o flash de pólvora é sempre quente). */}
      <motion.div
        className="fixed z-[94] pointer-events-none rounded-full"
        style={{ left: targetX, top: targetY, backgroundColor: MUZZLE_COLOR }}
        initial={{ x: '-50%', y: '-50%', width: 0, height: 0, opacity: 0 }}
        animate={{ width: [0, 58, 16], height: [0, 58, 16], opacity: [0, 1, 0] }}
        transition={{ duration: 0.32, delay: impactDelay, ease: 'easeOut' }}
      />
      {/* Faíscas metálicas se espalhando a partir do impacto. */}
      {SPARK_ANGLES.map((angle, idx) => (
        <motion.div
          key={idx}
          className="fixed z-[94] pointer-events-none rounded-full"
          style={{ left: targetX, top: targetY, width: 4, height: 4, backgroundColor: idx % 2 === 0 ? MUZZLE_COLOR : STEEL_COLOR }}
          initial={{ x: '-50%', y: '-50%', opacity: 0 }}
          animate={{
            x: `calc(-50% + ${Math.cos(angle) * (22 + (idx % 3) * 6)}px)`,
            y: `calc(-50% + ${Math.sin(angle) * (22 + (idx % 3) * 6)}px)`,
            opacity: [0, 1, 0],
          }}
          transition={{ duration: 0.38, delay: impactDelay, ease: 'easeOut' }}
        />
      ))}
    </>
  );
}

/**
 * BulletImpactBurst - pedido do usuário: "efeitos visuais de balas sendo
 * disparadas nas cartas que as magias do mosqueteiro utiliza". Usado só nas
 * 3 magias (Valete/Rainha/Rei) do Mosqueteiro - ver applyMagicEffectPresentation
 * em GameBoard.tsx, que já calcula os ids das cartas-alvo de cada uma
 * (computeMagicEffectTargets) e resolve a posição de tela de cada uma via
 * `cardPositionsRef` (mesmo mecanismo de FlyingDiscardCard.tsx/
 * ReactionNegatedBurst.tsx) antes de montar os `specs` abaixo.
 *
 * Cada spec já traz seu próprio atraso (`delay`), escalonado pelo chamador -
 * com vários alvos de uma vez (Rajada Reveladora pode acertar até 3), os
 * tiros disparam em sequência rápida, como uma rajada de verdade, em vez de
 * todos simultâneos.
 */
export function BulletImpactBurst({ specs }: { specs: BulletImpactSpec[] }) {
  if (specs.length === 0) return null;
  return (
    <>
      {specs.map((spec) => (
        <SingleBulletImpact key={spec.key} rect={spec.rect} delay={spec.delay} />
      ))}
    </>
  );
}
