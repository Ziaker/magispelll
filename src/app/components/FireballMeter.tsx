import { motion } from 'motion/react';
import { useSettings } from '../context/SettingsContext';

interface FireballMeterProps {
  value: number;
  cap: number;
  /** Piromante armou "Chama Repartida" (Magia Numeral) - o próximo lançamento se espalha pelos 3 slots do oponente, cada um recebendo só uma fração do valor. */
  spreadArmed?: boolean;
  /**
   * Pedido do usuário: "projéteis visualmente indo em direção aos seus
   * alvos" - identifica QUAL jogador é dono deste medidor, usado só para
   * marcar `data-card-id="piromante-fireball-pN"` na raiz. GameBoard.tsx
   * rastreia esse atributo pelo MESMO mecanismo genérico (`cardPositionsRef`)
   * que já usa pra cartas (ver FlyingDiscardCard.tsx) - a posição de tela
   * real deste círculo vira a ORIGEM do voo de FireballProjectile.tsx.
   */
  playerNumber: 1 | 2;
}

const EMBER_OFFSETS = [-10, -3, 5, 11, -14];

/**
 * Piromante (personagem novo) - "a bola de fogo tem presença na interface do
 * jogo, estando posicionada em uma das extremidades do campo... como um
 * círculo com efeito contínuo de fogo que tem seu valor dentro" (pedido
 * explícito do usuário). Renderizado por BattleField.tsx, ancorado na borda
 * do campo do lado do Piromante - visível para os dois jogadores o tempo
 * todo (não é um popup/burst temporário como os outros efeitos de magia).
 *
 * O "efeito contínuo de fogo" é só CSS/Framer Motion (consistente com o
 * resto dos efeitos visuais do jogo - ver CardShatterBurst.tsx): um núcleo
 * de gradiente laranja pulsando + brasas subindo em loop, sem nenhum
 * asset de imagem.
 */
export function FireballMeter({ value, cap, spreadArmed, playerNumber }: FireballMeterProps) {
  const { settings } = useSettings();
  // FIX (checagem extensa de desempenho, pedido do usuário): este círculo
  // fica montado o jogo INTEIRO (não é um burst temporário) pros dois
  // jogadores ao mesmo tempo quando o Piromante está em campo, com 7
  // animações em loop infinito cada (5 brasas + anel + núcleo) - ao
  // contrário de todo o resto dos efeitos visuais do jogo, que só animam
  // durante um instante. Com "Animações" desligada nas Configurações
  // (mesma flag que RuneParticles.tsx/PhaseTransition.tsx já respeitam),
  // esses loops nem chegam a montar - fica só o núcleo/anel estáticos
  // (ainda mostrando a cor e o valor certos), sem nenhum custo contínuo de
  // frame.
  const animationsOn = settings.animations;
  const fillRatio = cap > 0 ? Math.min(1, value / cap) : 0;

  return (
    <div
      className="relative w-[68px] h-[68px] flex items-center justify-center select-none"
      data-card-id={`piromante-fireball-p${playerNumber}`}
    >
      {/* Brasas subindo, em loop contínuo - o "efeito contínuo de fogo" pedido pelo usuário. */}
      {animationsOn &&
        EMBER_OFFSETS.map((x, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full pointer-events-none"
            style={{
              width: 3 + (i % 2),
              height: 3 + (i % 2),
              left: `calc(50% + ${x}px)`,
              bottom: '20%',
              backgroundColor: i % 2 === 0 ? '#FFB380' : '#FF8033',
              boxShadow: '0 0 4px #FF8033',
            }}
            animate={{ y: [0, -34, -46], opacity: [0, 1, 0], x: [0, x > 0 ? 6 : -6, x > 0 ? 12 : -12] }}
            transition={{ duration: 1.6 + (i % 3) * 0.3, repeat: Infinity, delay: i * 0.35, ease: 'easeOut' }}
          />
        ))}

      {/* Anel externo pulsante - brilho ambiente contínuo. */}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(255,128,51,0.55) 0%, rgba(204,85,0,0) 72%)' }}
        animate={animationsOn ? { scale: [1, 1.18, 1], opacity: [0.6, 0.95, 0.6] } : undefined}
        transition={animationsOn ? { duration: 1.4, repeat: Infinity, ease: 'easeInOut' } : undefined}
      />

      {/* Núcleo da bola de fogo: gradiente "chama" que treme continuamente. */}
      <motion.div
        className="absolute rounded-full border-2"
        style={{
          width: 52,
          height: 52,
          borderColor: '#FFB380',
          background: 'radial-gradient(circle at 50% 65%, #FFE0B3 0%, #FF8033 38%, #CC5500 68%, #3D1900 100%)',
          boxShadow: '0 0 18px 4px rgba(255,128,51,0.6), inset 0 0 10px rgba(61,25,0,0.6)',
        }}
        animate={animationsOn ? { scale: [1, 1.05, 0.98, 1.03, 1], rotate: [0, 3, -2, 1, 0] } : undefined}
        transition={animationsOn ? { duration: 2.2, repeat: Infinity, ease: 'easeInOut' } : undefined}
      />

      {/* Preenchimento proporcional ao teto (20, ou 30 no modo Towers) - um arco visual simples via conic-gradient, para reforçar "quão cheia" a bola está além do número. */}
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: 60,
          height: 60,
          background: `conic-gradient(#FFE0B3 ${fillRatio * 360}deg, transparent ${fillRatio * 360}deg)`,
          opacity: 0.35,
          mixBlendMode: 'overlay',
        }}
      />

      <span
        className="relative z-10 font-display text-[22px] leading-none"
        style={{ color: '#FFF3E6', textShadow: '0 1px 3px rgba(0,0,0,0.9), 0 0 8px rgba(255,128,51,0.8)' }}
      >
        {value}
      </span>

      {spreadArmed && (
        <div
          className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-1.5 py-[1px] rounded-full text-[8px] uppercase tracking-wider whitespace-nowrap"
          style={{ backgroundColor: '#3D1900', color: '#FFB380', border: '1px solid #FF8033' }}
        >
          Repartida
        </div>
      )}
    </div>
  );
}
