import { motion, AnimatePresence } from 'motion/react';
import { Sparkles } from 'lucide-react';
import { getCharacterTheme } from '../lib/characterThemes';
import type { CharacterId } from '../lib/gameEngine';

/**
 * MagicCalloutLabel - rótulo flutuante com o NOME da magia, por cima do
 * alvo (carta da mão ou slot do campo) que acabou de ser afetado.
 *
 * Pedido do usuário: "especialmente efeitos que alteram cartas do oponente
 * do jogador que ativou elas, mostrando uma referência ou notificação
 * visual de seus atos" - antes, quando o Mago (por exemplo) destruía uma
 * carta da Besta, o único feedback visual era o CharacterMagicBurst.tsx no
 * MESMO lugar - útil, mas não deixava explícito "o que" aconteceu nem
 * "quem" fez, exigindo ler o log de ações (texto pequeno, fácil de perder)
 * para saber. Este rótulo aparece bem em cima do alvo, com o nome da magia
 * por extenso e a cor de quem ativou - visível para os dois jogadores, sem
 * precisar ler o log.
 */
export function MagicCalloutLabel({
  active,
  text,
  character,
}: {
  active: boolean;
  text?: string | null;
  character?: CharacterId | null;
}) {
  const color = character ? getCharacterTheme(character).primary : '#C59E4F';

  return (
    <AnimatePresence>
      {active && text && (
        <motion.div
          key="magic-callout-label"
          className="absolute -top-3 left-1/2 z-50 pointer-events-none"
          initial={{ opacity: 0, y: 8, scale: 0.5, x: '-50%' }}
          animate={{ opacity: 1, y: -8, scale: 1, x: '-50%' }}
          exit={{ opacity: 0, y: -18, scale: 0.75, x: '-50%' }}
          transition={{ type: 'spring', stiffness: 380, damping: 22 }}
        >
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 shadow-lg whitespace-nowrap"
            style={{ backgroundColor: '#0F1113ee', borderColor: color, boxShadow: `0 0 18px ${color}90` }}
          >
            <Sparkles className="w-3.5 h-3.5" style={{ color }} />
            <span className="text-[11px] font-display" style={{ color }}>
              {text}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
