import { useState } from 'react';
import { motion } from 'motion/react';

/**
 * BeastClawBurst.tsx - QoL/overhaul visual da Besta (pedido do usuário:
 * "componente próprio... com rasgos de garra em ângulos ligeiramente
 * diferentes por ativação, deixando um rastro que esmaece mais devagar").
 *
 * Antes disto, o motivo de "rasgos de garra" (3 riscos de mesmo ângulo fixo,
 * -28deg) vivia DUPLICADO, quase idêntico, dentro de CharacterMagicBurst.tsx
 * (burst por alvo) e ArenaMagicBurst.tsx (burst de tela inteira, na Fúria
 * Sanguinária) - os dois agora chamam este componente só, parametrizado por
 * `size`, então uma correção/ajuste futuro no motivo vale pros dois de uma
 * vez.
 *
 * Ângulo/posição de cada risco tem um jitter aleatório pequeno, sorteado
 * UMA VEZ por montagem (`useState` com inicializador preguiçoso - nunca
 * re-sorteia nos re-renders da própria animação) - cada ativação "arranha"
 * ligeiramente diferente da anterior, em vez do mesmo desenho idêntico
 * sempre. O último risco (o mais "forte") deixa um rastro que continua
 * visível e esmaecendo bem depois dos outros já terem sumido - a garra
 * "ainda dói" um instante a mais.
 */
export function BeastClawBurst({ color, size = 'small' }: { color: string; size?: 'small' | 'large' }) {
  const scale = size === 'large' ? 1.8 : 1;
  const [claws] = useState(() =>
    [-20, 0, 20].map((baseOffset) => ({
      offset: baseOffset + (Math.random() - 0.5) * 14,
      rotate: -28 + (Math.random() - 0.5) * 12,
      delay: Math.random() * 0.06,
    }))
  );

  return (
    <>
      {claws.map((claw, idx) => (
        <motion.div
          key={idx}
          className="absolute rounded-full"
          style={{
            width: `${size === 'large' ? 160 : 200}%`,
            height: 9 * scale,
            background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
            top: `${50 + claw.offset}%`,
            left: size === 'large' ? '-30vw' : undefined,
            rotate: `${claw.rotate}deg`,
            boxShadow: `0 0 ${8 * scale}px ${color}`,
          }}
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: [0, 1.2, 1], opacity: [0, 1, 0] }}
          transition={{ duration: 0.65, ease: 'easeOut', delay: claw.delay + idx * 0.07 }}
        />
      ))}
      {/* Rastro do último risco - mesma posição/ângulo do 3º acima, mas mais
          fino, mais fraco e esmaecendo bem mais devagar (1.1s em vez de
          0.65s) - fica visível sozinho por um instante depois que o resto
          do burst já sumiu. */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: `${size === 'large' ? 160 : 200}%`,
          height: 3 * scale,
          background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
          top: `${50 + claws[2].offset}%`,
          left: size === 'large' ? '-30vw' : undefined,
          rotate: `${claws[2].rotate}deg`,
        }}
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: [0, 1, 1], opacity: [0, 0.65, 0] }}
        transition={{ duration: 1.1, ease: 'easeOut', delay: claws[2].delay + 0.2 }}
      />
    </>
  );
}
