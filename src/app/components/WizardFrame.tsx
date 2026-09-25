import { motion } from 'motion/react';
import { useSettings } from '../context/SettingsContext';
import { getAnimationDurationScale } from '../lib/settings';

/** Mesmos glifos rúnicos de RuneParticles.tsx (fundo da Home)/ArenaMagicBurst.tsx/ReadyStamp.tsx - reaproveita o vocabulário visual já estabelecido, um por canto. */
const CORNER_RUNES: [string, string, string, string] = ['ᚱ', 'ᛟ', 'ᚻ', 'ᛗ'];

/**
 * WizardFrame - pedido do usuário ("Polish Visual Final", pós-overhaul de
 * animações): "painel/tomo arcano deslizante, onde a moldura visual
 * permanece e o conteúdo troca dentro dela com direção e parallax leves" -
 * em vez de um page-turn 3D literal, uma moldura decorativa (borda fina +
 * cantos ornamentados com runas, extensão direta dos 4 cantos decorativos já
 * existentes em Home.tsx) que PERMANECE fixa na tela durante toda a
 * sequência Início->Configuração->Personagens->Resumo, enquanto o conteúdo
 * de cada tela continua trocando por dentro dela via `ScreenTransition.tsx`
 * (inalterado - ver App.tsx, só esta tela é envolvida por este componente
 * quando a tela atual faz parte do wizard, nunca durante o próprio Jogo).
 *
 * Parallax leve: a cada troca de tela, a moldura inteira (borda + cantos)
 * ganha um leve deslocamento na MESMA direção do slide do conteúdo, mas mais
 * lento/suave - lê como uma camada de fundo reagindo com um pouco de atraso
 * atrás do conteúdo em primeiro plano, sem nenhum efeito 3D de verdade. Como
 * a moldura NUNCA desmonta (só o `key={screenKey}` força uma nova animação
 * `initial`->`animate` a cada troca, sem AnimatePresence nenhum envolvido),
 * não existe risco de "saída presa" - a mesma classe de robustez que
 * `ScreenTransition.tsx` já conquistou (ver seu próprio comentário sobre a
 * rede de segurança) simplesmente não se aplica aqui, porque não há exit
 * animation nenhuma pra travar.
 */
export function WizardFrame({
  screenKey,
  direction,
  children,
}: {
  screenKey: string;
  direction: number;
  children: React.ReactNode;
}) {
  const { settings } = useSettings();
  const scale = getAnimationDurationScale(settings);
  const nudge = direction === 0 ? 0 : direction > 0 ? -6 : 6;

  return (
    <div className="relative size-full">
      <div className="relative size-full">{children}</div>
      {/* FIX (achado ao vivo: moldura invisível em telas com fundo opaco,
          ex. Personagens) - cada tela do wizard pinta o PRÓPRIO fundo cheio
          (`min-h-screen`/`size-full`, opaco em quase todas, só a Home tem
          `.parchment` com alguma transparência) - com a moldura atrás do
          conteúdo (z menor), o fundo da tela cobria a borda/cantos por
          completo em toda tela que não fosse a Home. `z-40` (acima do
          conteúdo normal, sem competir com diálogos reais - nenhuma tela do
          wizard usa z-index tão alto) resolve isso - `pointer-events-none`
          garante que nunca bloqueia clique nenhum, então pintar por cima do
          conteúdo é seguro (a moldura só ocupa a margem/cantos, nunca o
          centro onde os controles de verdade vivem). */}
      <motion.div
        key={screenKey}
        className="fixed inset-3 sm:inset-6 border border-[#C59E4F]/20 rounded-2xl pointer-events-none z-40"
        initial={scale > 0 ? { x: nudge, opacity: 0.6 } : false}
        animate={scale > 0 ? { x: 0, opacity: 1 } : undefined}
        transition={{ duration: 0.4 * scale, ease: 'easeOut' }}
      >
        <div className="absolute top-0 left-0 w-16 h-16 sm:w-20 sm:h-20 border-l-2 border-t-2 border-[#C59E4F]/30 rounded-tl-2xl" />
        <div className="absolute top-0 right-0 w-16 h-16 sm:w-20 sm:h-20 border-r-2 border-t-2 border-[#C59E4F]/30 rounded-tr-2xl" />
        <div className="absolute bottom-0 left-0 w-16 h-16 sm:w-20 sm:h-20 border-l-2 border-b-2 border-[#C59E4F]/30 rounded-bl-2xl" />
        <div className="absolute bottom-0 right-0 w-16 h-16 sm:w-20 sm:h-20 border-r-2 border-b-2 border-[#C59E4F]/30 rounded-br-2xl" />
        <span className="absolute top-2.5 left-2.5 sm:top-3.5 sm:left-3.5 text-[15px] font-display text-[#C59E4F]/25 select-none">{CORNER_RUNES[0]}</span>
        <span className="absolute top-2.5 right-2.5 sm:top-3.5 sm:right-3.5 text-[15px] font-display text-[#C59E4F]/25 select-none">{CORNER_RUNES[1]}</span>
        <span className="absolute bottom-2.5 left-2.5 sm:bottom-3.5 sm:left-3.5 text-[15px] font-display text-[#C59E4F]/25 select-none">{CORNER_RUNES[2]}</span>
        <span className="absolute bottom-2.5 right-2.5 sm:bottom-3.5 sm:right-3.5 text-[15px] font-display text-[#C59E4F]/25 select-none">{CORNER_RUNES[3]}</span>
      </motion.div>
    </div>
  );
}
