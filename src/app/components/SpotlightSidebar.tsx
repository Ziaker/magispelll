import { motion } from 'motion/react';
import { Box } from 'lucide-react';
import type { SpotlightState } from '../lib/spotlight';

const POLARITY_COLOR = {
  positive: '#6CC47A',
  negative: '#D45D4A',
} as const;

/**
 * SpotlightSidebar - Modo Spotlight (pedido do usuário: "tá impossível saber
 * quando uma carta está com Spotlight, deixe mais claro uma referência
 * visual posicionada na direita dos dois campos, por fora, o número
 * destacado").
 *
 * O indicador que já existia no cabeçalho (badge pequeno perto de "Turno
 * N"/"Fase: X") era discreto demais - fácil de nunca notar durante o jogo.
 * Esta faixa fica colada na LATERAL DIREITA do próprio BattleField.tsx (por
 * FORA da caixa do campo, nunca sobrepondo cartas), grande e sempre visível
 * enquanto o modo está ativo, com um número BEM grande por Spotlight ativo -
 * verde/⬆ para positivo (vale 3x mais), vermelho/⬇ para negativo (valor fixo
 * em 1). `null`/nenhum número ativo = não renderiza nada (sem reservar
 * espaço à toa quando o modo está desligado).
 */
export function SpotlightSidebar({ spotlight }: { spotlight: SpotlightState | null | undefined }) {
  if (!spotlight || spotlight.numbers.length === 0) return null;

  return (
    <div className="flex flex-col items-center gap-3 w-20 flex-shrink-0 self-stretch justify-center">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-[#C59E4F]">
        <Box className="w-3 h-3" />
        Spotlight
      </div>
      {spotlight.numbers.map((n) => {
        const color = POLARITY_COLOR[n.polarity];
        return (
          <motion.div
            key={n.value}
            className="flex flex-col items-center justify-center rounded-xl border-2 w-16 h-16 flex-shrink-0"
            style={{
              borderColor: color,
              backgroundColor: `${color}22`,
              boxShadow: `0 0 18px ${color}70, inset 0 0 12px ${color}40`,
            }}
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: [0.7, 1.08, 1], opacity: 1 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          >
            <span className="font-display text-[26px] leading-none" style={{ color }}>
              {n.value}
            </span>
            <span className="text-[10px] font-bold" style={{ color }}>
              {n.polarity === 'positive' ? '×3' : '=1'}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}
