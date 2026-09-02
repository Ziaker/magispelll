import { motion } from 'motion/react';

export interface BulletImpactSpec {
  key: string;
  /** Última posição conhecida da carta-alvo (mesmo mecanismo de cardPositionsRef em GameBoard.tsx já usado por FlyingDiscardCard.tsx/ReactionNegatedBurst.tsx). */
  rect: { left: number; top: number; width: number; height: number };
  /** Atraso (s) antes deste tiro específico disparar - usado pra escalonar vários alvos de uma vez (ex.: Rajada Reveladora) como uma rajada, um tiro após o outro, em vez de todos batendo no mesmo instante. */
  delay?: number;
  /**
   * Pedido explícito do usuário: "projéteis visualmente indo em direção aos
   * seus alvos para o... mosqueteiro" - posição de tela real da PRÓPRIA
   * carta mágica que o Mosqueteiro ativou (mesmo cardPositionsRef, ver
   * applyMagicEffectPresentation em GameBoard.tsx), usada como origem real
   * do tiro em vez de um ponto fixo fora da tela. Opcional só por segurança
   * (a carta pode ter saído de cena antes da posição ser capturada) - sem
   * ela, cai de volta pro comportamento antigo (borda esquerda da tela).
   */
  from?: { left: number; top: number; width: number; height: number };
}

const MUZZLE_COLOR = '#FFD76B';
const STEEL_COLOR = '#8C9199';
/** Laranja quente pros riscos de ricochete - distinto o bastante do amarelo do clarão e do cinza das faíscas pra não se confundir com nenhum dos dois. */
const RICOCHET_COLOR = '#FF8C42';
// FIX (pedido do usuário: "mais efeitos visuais de disparos e balas") - de 6
// pra 12 faíscas, ângulos completos em vez de só 1/6 de volta cada.
const SPARK_ANGLES = Array.from({ length: 12 }, (_, i) => (i / 12) * Math.PI * 2);
// FIX (pedido do usuário: "algum efeito visual de ricochete") - 4 riscos de
// ricochete, cada um num ângulo distinto dentro do semicírculo VOLTADO PRA
// ORIGEM do tiro (esquerda) - pesquisado (ver fontes): um ricochete de
// verdade reflete a direção de chegada pela normal da superfície atingida,
// nunca "atravessa" na mesma direção do impacto - como o tiro sempre chega
// da esquerda aqui (`startX` abaixo), os fragmentos espalham de volta pra
// esquerda/cima/baixo, nunca continuando reto pra direita.
const RICOCHET_ANGLES = [2.35, 2.85, 3.4, 3.9];

/**
 * Uma única bala: uma trilha curta "voando" da borda esquerda da tela até a
 * carta-alvo, seguida de um flash de impacto + faíscas metálicas no ponto de
 * chegada. Renderizado como `fixed`, posicionado por coordenadas de tela
 * (nunca precisa saber em qual componente/zona a carta-alvo realmente vive -
 * funciona igual pra carta na mão, no campo, ou na zona própria).
 *
 * FIX (pedido do usuário: "mais efeitos visuais de disparos e balas, algum
 * efeito visual de ricochete, cace por assets"): pesquisado técnica de VFX
 * de tiro/ricochete de referência (flash + faíscas circulares + fragmentos
 * refletidos pela normal da superfície - ver fontes no PR) - mantido 100%
 * código (Framer Motion), sem nenhum asset de imagem externo, consistente
 * com o resto do jogo (nenhum efeito visual daqui usa imagem/sprite, só
 * CSS/SVG/Framer Motion - ver CardShatterBurst.tsx/CoringaSmokeBurst.tsx).
 * Reforçado em 3 frentes: (1) clarão de impacto maior e um pouco mais
 * demorado; (2) o dobro de faíscas (6 -> 12); (3) NOVO - 4 riscos de
 * ricochete (`RICOCHET_ANGLES`), um flash metálico curto que sai do ponto de
 * impacto DEPOIS do clarão principal, como fragmentos de verdade quicando
 * pra longe.
 */
function SingleBulletImpact({ rect, delay = 0, from }: { rect: BulletImpactSpec['rect']; delay?: number; from?: BulletImpactSpec['from'] }) {
  const targetX = rect.left + rect.width / 2;
  const targetY = rect.top + rect.height / 2;
  const startX = from ? from.left + from.width / 2 : -60;
  const startY = from ? from.top + from.height / 2 : targetY;
  const deltaX = targetX - startX;
  const deltaY = targetY - startY;
  // FIX (pedido explícito do usuário: "projéteis visualmente indo em
  // direção aos seus alvos") - com uma origem REAL (`from`, a própria carta
  // mágica ativada, ver applyMagicEffectPresentation em GameBoard.tsx) a
  // distância pode ser bem maior que os ~60px fixos de antes (carta na mão
  // até o campo do oponente, por exemplo) - duração agora escala com a
  // distância real (limitada nas duas pontas) em vez de sempre 0.22s fixo,
  // senão um tiro de longa distância pareceria teleportar.
  const distance = Math.hypot(deltaX, deltaY) || 1;
  const travelDuration = from ? Math.min(0.4, Math.max(0.18, distance / 2200)) : 0.22;
  const angleDeg = (Math.atan2(deltaY, deltaX) * 180) / Math.PI;
  const impactDelay = delay + travelDuration;
  const ricochetDelay = impactDelay + 0.1;

  return (
    <>
      {/* Projétil viajando em linha reta da origem real até o alvo - o
          próprio elemento animado só translada (x/y puros, mesma técnica seguraFlyingDiscardCard.tsx,
          sem composição de rotate+translate ambígua); o capsule visual dentro
          dele é ROTACIONADO de forma ESTÁTICA (não anima) pra já nascer
          apontado na direção certa. */}
      <motion.div
        className="fixed z-[94] pointer-events-none"
        style={{ left: startX, top: startY, width: 0, height: 0 }}
        initial={{ x: 0, y: 0, opacity: 0 }}
        animate={{ x: [0, deltaX], y: [0, deltaY], opacity: [0, 1, 1, 0] }}
        transition={{ duration: travelDuration, delay, ease: 'easeIn', times: [0, 0.85, 1] }}
      >
        {/* FIX (pedido do usuário: "deixe os projéteis do mosqueteiro
            maiores") - a cápsula era fina demais (16x3) pra ser percebida
            atravessando a tela; ampliada pra 34x7, com o brilho na mesma
            proporção, pra continuar legível como "tiro" em movimento. */}
        <div
          className="absolute rounded-full"
          style={{
            width: 34,
            height: 7,
            left: 0,
            top: 0,
            transform: `translate(-50%, -50%) rotate(${angleDeg}deg)`,
            backgroundColor: STEEL_COLOR,
            boxShadow: `0 0 18px ${STEEL_COLOR}, 0 0 8px #EFE7D6`,
          }}
        />
      </motion.div>
      {/* Flash de impacto - clarão amarelo-alaranjado (mesmo num tema cinza/aço, o flash de pólvora é sempre quente). */}
      <motion.div
        className="fixed z-[94] pointer-events-none rounded-full"
        style={{ left: targetX, top: targetY, backgroundColor: MUZZLE_COLOR }}
        initial={{ x: '-50%', y: '-50%', width: 0, height: 0, opacity: 0 }}
        animate={{ width: [0, 78, 20], height: [0, 78, 20], opacity: [0, 1, 0] }}
        transition={{ duration: 0.36, delay: impactDelay, ease: 'easeOut' }}
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
      {/* Ricochete: fragmentos metálicos alongados (não faíscas redondas) quicando pra longe do impacto, um instante depois do clarão principal - o "estilhaçar" de verdade da bala batendo. */}
      {RICOCHET_ANGLES.map((angle, idx) => {
        const distance = 46 + idx * 10;
        return (
          <motion.div
            key={idx}
            className="fixed z-[94] pointer-events-none rounded-full"
            style={{
              left: targetX,
              top: targetY,
              width: 10 + (idx % 2) * 4,
              height: 2,
              backgroundColor: RICOCHET_COLOR,
              boxShadow: `0 0 6px ${RICOCHET_COLOR}`,
              transformOrigin: 'left center',
              rotate: `${(angle * 180) / Math.PI}deg`,
            }}
            initial={{ x: '-50%', y: '-50%', scaleX: 0, opacity: 0 }}
            animate={{
              x: [
                '-50%',
                `calc(-50% + ${Math.cos(angle) * distance * 0.5}px)`,
                `calc(-50% + ${Math.cos(angle) * distance}px)`,
              ],
              y: [
                '-50%',
                `calc(-50% + ${Math.sin(angle) * distance * 0.5}px)`,
                `calc(-50% + ${Math.sin(angle) * distance}px)`,
              ],
              scaleX: [0, 1, 0.4],
              opacity: [0, 1, 0],
            }}
            transition={{ duration: 0.3, delay: ricochetDelay, ease: 'easeOut' }}
          />
        );
      })}
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
        <SingleBulletImpact key={spec.key} rect={spec.rect} delay={spec.delay} from={spec.from} />
      ))}
    </>
  );
}
