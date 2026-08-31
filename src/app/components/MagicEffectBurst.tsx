import { motion, AnimatePresence } from 'motion/react';
import { Sparkles } from 'lucide-react';

/**
 * MagicEffectBurst - efeito visual (item 5 da 4ª rodada): "eu gostaria que os
 * efeitos de magia tivessem efeitos visuais no campo e na mão (caso sejam os
 * alvos)". Biblioteca escolhida: `motion` (motion/react) - já era uma
 * dependência do projeto (usada em CombatResult.tsx e PhaseTransition.tsx
 * para outras animações), então não precisou adicionar nada novo.
 *
 * Componente pequeno e reutilizável: um anel dourado que expande e desvanece
 * por cima do alvo (slot do campo ou carta da mão), junto de um ícone de
 * brilho (Sparkles) que gira e cresce no centro. `active` controla quando o
 * efeito dispara - quem usa este componente é responsável por desligar
 * `active` de novo depois de um tempo (ver `EFFECT_FLASH_DURATION_MS` em
 * GameBoard.tsx), senão o efeito não anima uma segunda vez no mesmo alvo.
 *
 * FIX (item 8 da 6ª rodada): "os efeitos visuais de magia mal são
 * perceptíveis nas cartas, deixe mais chamativos" - a versão original tinha
 * só 2 anéis finos (3px/2px de contorno) e um Sparkles pequeno, tudo em cima
 * de cartas que já são bem coloridas/ilustradas - fácil de passar batido,
 * principalmente numa partida corrida. Reforçado em 3 frentes, sem trocar a
 * abordagem (ainda um overlay `absolute inset-0`, então continua funcionando
 * em cima de qualquer alvo - carta da mão ou slot do campo - sem mudar nada
 * em quem usa o componente):
 * 1) um flash de cor de fundo (preenche o alvo inteiro, não só a borda) nos
 *    primeiros instantes - o que realmente chama o olho é a MUDANÇA de cor
 *    da própria carta, não só um contorno fino ao redor dela;
 * 2) um leve "pulso" de escala no overlay inteiro (1 → 1.06 → 1) logo no
 *    início - como o overlay cobre o alvo inteiro (`inset-0`), esse pulso lê
 *    como se a própria carta "respirasse" por um instante;
 * 3) anéis mais grossos/opacos e um 3º anel (antes só 2), e o Sparkles maior
 *    e com um segundo ícone espelhado, para o brilho central ficar mais
 *    denso. Duração total esticada de 0.9s para 1.1s (ver também
 *    `EFFECT_FLASH_DURATION_MS` em GameBoard.tsx, ajustado junto para o
 *    estado não "desligar" o efeito antes dele terminar de animar).
 */
export function MagicEffectBurst({ active, color = '#C59E4F' }: { active: boolean; color?: string }) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="magic-effect-burst"
          className="absolute inset-0 z-40 pointer-events-none rounded-lg flex items-center justify-center overflow-visible"
          initial={{ opacity: 0, scale: 1 }}
          animate={{ opacity: 1, scale: [1, 1.06, 1] }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, scale: { duration: 0.4, ease: 'easeOut' } }}
        >
          {/* FIX (item 8): flash de cor sólida preenchendo o alvo inteiro nos
              primeiros instantes - muito mais perceptível de relance do que
              só um contorno fino, que se perde fácil no fundo colorido das
              cartas. */}
          <motion.div
            className="absolute inset-0 rounded-lg"
            initial={{ opacity: 0.85 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
            style={{ backgroundColor: color, mixBlendMode: 'overlay' }}
          />
          {/* Anel 1: expande a partir do centro da carta/slot */}
          <motion.div
            className="absolute inset-0 rounded-lg"
            initial={{ opacity: 1, scale: 0.8 }}
            animate={{ opacity: 0, scale: 1.45 }}
            transition={{ duration: 1.1, ease: 'easeOut' }}
            style={{ boxShadow: `0 0 0 5px ${color}, 0 0 34px 12px ${color}` }}
          />
          {/* Anel 2, um pouco atrasado, para dar sensação de "pulso duplo" */}
          <motion.div
            className="absolute inset-0 rounded-lg"
            initial={{ opacity: 0.9, scale: 0.8 }}
            animate={{ opacity: 0, scale: 1.75 }}
            transition={{ duration: 1.1, ease: 'easeOut', delay: 0.15 }}
            style={{ boxShadow: `0 0 0 3px ${color}` }}
          />
          {/* FIX (item 8): 3º anel, ainda mais atrasado - o "pulso triplo"
              deixa o efeito mais denso/demorado sem esticar demais a duração
              total de cada anel individual. */}
          <motion.div
            className="absolute inset-0 rounded-lg"
            initial={{ opacity: 0.7, scale: 0.8 }}
            animate={{ opacity: 0, scale: 2.05 }}
            transition={{ duration: 1.1, ease: 'easeOut', delay: 0.3 }}
            style={{ boxShadow: `0 0 0 2px ${color}` }}
          />
          {/* Brilho central - maior e mais denso que antes (2 ícones
              sobrepostos com rotações opostas, em vez de 1). */}
          <motion.div
            initial={{ opacity: 0, scale: 0.3, rotate: -30 }}
            animate={{ opacity: [0, 1, 0], scale: [0.3, 1.5, 1.1], rotate: 25 }}
            transition={{ duration: 1.1, ease: 'easeOut' }}
          >
            <Sparkles className="w-11 h-11" style={{ color }} />
          </motion.div>
          <motion.div
            className="absolute"
            initial={{ opacity: 0, scale: 0.2, rotate: 40 }}
            animate={{ opacity: [0, 0.8, 0], scale: [0.2, 1, 0.7], rotate: -35 }}
            transition={{ duration: 1.1, ease: 'easeOut', delay: 0.08 }}
          >
            <Sparkles className="w-6 h-6" style={{ color }} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
