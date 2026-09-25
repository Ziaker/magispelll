import { AnimatePresence, motion } from 'motion/react';

/**
 * TurnCounter - pedido do usuário ("Overhaul de Animações"): "'Turno N'
 * incrementando com um giro/flip de dígito... como um hodômetro", em vez do
 * número trocando instantaneamente (era só texto estático em GameBoard.tsx,
 * `Turno {gameState.turn}`). Cada DÍGITO gira independente (rotateX + leve
 * deslocamento vertical, como uma roda de hodômetro de verdade) - o antigo
 * "sai por cima" e o novo "entra por baixo" no mesmo instante, `AnimatePresence`
 * cuida da troca via a MUDANÇA da própria `key` (o dígito em si).
 *
 * FIX (Fase 2 do overhaul de animações) - antes a duração do giro (0.32s)
 * era fixa, ignorando `settings.animationSpeed`/`settings.animations` por
 * completo (o único componente de transição de turno/fase que ainda não
 * respeitava nenhuma das duas preferências) - `scale` (vindo de
 * `getAnimationDurationScale(settings)`, `0` quando animações estão
 * desligadas) mantém o giro do dígito na MESMA velocidade relativa da
 * varredura de luz (TurnLightSweep.tsx) - as duas nascem do MESMO evento de
 * troca de turno em GameBoard.tsx.
 */
function OdometerDigit({ digit, scale }: { digit: string; scale: number }) {
  return (
    <span className="relative inline-block overflow-hidden text-center" style={{ width: '0.62em', height: '1.1em' }}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={digit}
          className="absolute inset-0 flex items-center justify-center"
          initial={{ y: '70%', rotateX: -70, opacity: 0 }}
          animate={{ y: '0%', rotateX: 0, opacity: 1 }}
          exit={{ y: '-70%', rotateX: 70, opacity: 0 }}
          transition={{ duration: 0.32 * scale, ease: 'easeOut' }}
        >
          {digit}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export function TurnCounter({ turn, scale }: { turn: number; scale: number }) {
  const digits = String(turn).split('');
  return (
    <span className="inline-flex" style={{ perspective: 240 }}>
      {/* FIX (pesquisa de bugs: hodômetro rolava o dígito errado ao cruzar
          10/100) - chave por valor posicional (da direita pra esquerda), não
          por índice do array: assim o dígito das unidades mantém a MESMA
          `OdometerDigit` (e portanto o giro 9->0) quando um novo dígito
          aparece à esquerda, em vez de herdar a identidade de quem já
          estava naquela posição do array. */}
      {digits.map((d, i) => (
        <OdometerDigit key={digits.length - 1 - i} digit={d} scale={scale} />
      ))}
    </span>
  );
}
