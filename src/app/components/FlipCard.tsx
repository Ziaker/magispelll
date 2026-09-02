import { useEffect, useRef, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { cn } from './ui/utils';
import { useSettings } from '../context/SettingsContext';
import { soundManager } from '../lib/soundManager';

interface FlipCardProps {
  /** true = mostra `front` (carta virada para cima); false = mostra `back` (costas). */
  faceUp: boolean;
  front: ReactNode;
  back: ReactNode;
  /** Deve incluir o tamanho (ex.: "w-28 h-40" ou "w-16 h-10") - vira o tamanho do card 3D inteiro. */
  className?: string;
}

/**
 * FlipCard - vira uma carta em 3D (rotateY) entre a face de costas e a face
 * revelada, no lugar da troca instantânea que existia antes (o chamador
 * simplesmente renderizava um `<PlayingCard faceDown />` OU um
 * `<PlayingCard .../>`, sem nenhuma transição entre os dois).
 *
 * As duas faces ficam sempre montadas (uma de cada lado, com
 * `backfaceVisibility: hidden`), e é o componente pai (`motion.div` com
 * `rotateY` animado) que gira entre 0deg (frente) e 180deg (costas) -
 * exatamente como uma carta física vira. Isso não abre nenhum vazamento de
 * informação novo: o valor real da carta já existe no estado React em
 * memória o tempo todo (o jogo é local/hotseat ou contra uma IA no mesmo
 * processo), e a face virada para trás nunca fica visível on-screen graças ao
 * `backfaceVisibility: hidden`.
 */
export function FlipCard({ faceUp, front, back, className }: FlipCardProps) {
  const { settings } = useSettings();
  // FIX (pedido do usuário: "som") - o tipo 'card-flip' existia em
  // soundManager.ts desde antes desta rodada, mas nenhum lugar do código
  // chamava `play('card-flip')` (era só ruído morto). Toca aqui, no
  // componente que centraliza TODO giro de carta do jogo - mas só na
  // transição real de "costas -> frente" (`prevFaceUp` guarda o valor
  // anterior via ref), nunca na MONTAGEM inicial (uma carta que já nasce
  // revelada não deveria "virar" sozinha, e o valor inicial de uma ref não
  // conta como transição).
  const prevFaceUpRef = useRef(faceUp);
  useEffect(() => {
    if (faceUp && !prevFaceUpRef.current) {
      soundManager.play('card-flip');
    }
    prevFaceUpRef.current = faceUp;
  }, [faceUp]);

  return (
    <div className={cn('relative', className)} style={{ perspective: 1200 }}>
      <motion.div
        className="absolute inset-0"
        style={{ transformStyle: 'preserve-3d' }}
        // FIX (pedido do usuário: "quando um jogador joga uma carta, ela
        // mostra seu número antes de ser ocultada (não revelada), isso é um
        // erro catastrófico") - vazamento de informação real, e não só um
        // detalhe visual. Sem `initial`, o motion.div MONTA no estado do
        // `style` (sem rotateY, ou seja, rotateY: 0 = FRENTE visível) e só
        // então ANIMA até 180 (costas) - meio segundo inteiro com o número da
        // carta na tela toda vez que uma carta é posicionada virada pra
        // baixo. `initial={false}` manda o Motion nascer já no valor de
        // `animate` (180 = costas) sem animação de montagem; as viradas de
        // verdade que acontecem DEPOIS (costas -> frente, na revelação ou no
        // combate) continuam animando normalmente, porque `initial={false}`
        // só afeta a montagem.
        initial={false}
        animate={{ rotateY: faceUp ? 0 : 180 }}
        transition={
          settings.animations
            ? { duration: 0.5, ease: [0.4, 0, 0.2, 1] }
            : { duration: 0 }
        }
      >
        <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden' }}>
          {front}
        </div>
        <div
          className="absolute inset-0"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          {back}
        </div>
      </motion.div>
    </div>
  );
}
