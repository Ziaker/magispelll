import { motion } from 'motion/react';

/**
 * MagicToast - conteúdo customizado da notificação (toast) de ativação de
 * magia/Magia Numeral/efeito de Monstro.
 *
 * FIX (pedido do usuário: "quanto à notificação de uma habilidade, faça ser
 * mais chamativa visualmente, raramente é perceptível quando ocorre") -
 * antes era um `toast(texto)` padrão do sonner: uma linha de texto pequena,
 * sem cor própria, do mesmo tamanho/estilo de qualquer outra notificação do
 * app - fácil de nunca notar, especialmente durante o calor de uma partida
 * com várias coisas acontecendo na tela ao mesmo tempo. Agora é um cartão
 * bem maior, com a cor do personagem que ativou (a mesma identidade visual
 * usada em todo o resto do jogo - bordas, glow), um ícone bem grande que
 * "pulsa" ao aparecer, e uma entrada com efeito de mola (spring) em vez de
 * só um fade - pensado para ser notado mesmo com o olhar em outro canto da
 * tela.
 *
 * FIX (pedido do usuário: "corrija esse MagicToast") - este cartão aparece a
 * cada ativação de magia/Monstro/Numeral (humana OU da IA, para as 9
 * combinações J/Q/K) e podia empilhar várias instâncias simultâneas em
 * sequências rápidas (a IA agindo várias vezes seguidas) - mas nunca tinha
 * passado pelo mesmo corte de desempenho que o resto do sistema de efeitos
 * (ver ArenaMagicBurst.tsx/CharacterMagicBurst.tsx): tinha DOIS `box-shadow`
 * empilhados (o 2º com 40px de blur) e o ícone ficava girando/escalando em
 * loop (`repeat: 2`) por mais de 2s com um `filter: drop-shadow` por cima -
 * a combinação mais cara de recompor a cada frame (ver comentário completo
 * em ArenaMagicBurst.tsx sobre por que `box-shadow`/`filter` custam mais que
 * `transform`/`opacity` puros). Reduzido a 1 `box-shadow` de raio menor e o
 * ícone agora só "pulsa" uma vez.
 */
export function MagicToast({ icon, text, color }: { icon: string; text: string; color: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.4, y: -30 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 350, damping: 18 }}
      className="flex items-center gap-3 pointer-events-none"
      style={{
        background: 'linear-gradient(135deg, #1E1A16, #0F1113)',
        border: `2px solid ${color}`,
        borderRadius: 14,
        padding: '14px 24px',
        boxShadow: `0 0 16px 3px ${color}90`,
        minWidth: 340,
        maxWidth: 460,
      }}
    >
      <motion.span
        className="text-[36px] leading-none flex-shrink-0"
        style={{ filter: `drop-shadow(0 0 6px ${color})` }}
        animate={{ scale: [1, 1.35, 1], rotate: [0, -10, 10, 0] }}
        transition={{ duration: 0.7, ease: 'easeInOut' }}
      >
        {icon}
      </motion.span>
      <span className="text-[15px] font-semibold leading-snug" style={{ color: '#EFE7D6' }}>
        {text}
      </span>
    </motion.div>
  );
}
