import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';

/**
 * ScreenTransition - pedido do usuário ("Overhaul de Animações", item 7):
 * "transição entre telas do wizard (Início -> Configuração -> Personagens
 * -> Resumo -> Jogo)". Antes, `App.tsx` trocava de tela com um switch/case
 * puro (`renderScreen()`) - a tela nova aparecia instantaneamente por cima
 * da antiga, sem nenhuma transição.
 *
 * `direction` (+1 avançando no wizard, -1 voltando, 0 quando a troca não
 * faz parte da ordem linear do wizard - ex.: indo pra Regras/Personagens/
 * Configurações, que são desvios laterais, não passos do fluxo principal)
 * decide de que lado a tela nova entra e pra que lado a antiga sai -
 * calculado em App.tsx (`WIZARD_ORDER`, comparando a tela atual com a
 * anterior via `prevScreenRef`, mesmo padrão de "detectar TRANSIÇÃO, não só
 * o valor atual" já usado em outros lugares desta sessão, ex.: `prevLivesRef`
 * em PlayerZone.tsx).
 *
 * `mode="wait"` (a tela antiga termina de sair antes da nova começar a
 * entrar) em vez de sobrepor as duas - mais seguro pra telas cheias e
 * pesadas (cada uma com seu próprio scroll/layout), e combina com a
 * preferência já demonstrada pelo usuário por transições sequenciais, não
 * simultâneas.
 */
const SLIDE_DISTANCE = 24;

const screenVariants = {
  enter: (direction: number) => ({
    opacity: 0,
    x: direction === 0 ? 0 : direction > 0 ? SLIDE_DISTANCE : -SLIDE_DISTANCE,
  }),
  center: { opacity: 1, x: 0 },
  exit: (direction: number) => ({
    opacity: 0,
    x: direction === 0 ? 0 : direction > 0 ? -SLIDE_DISTANCE : SLIDE_DISTANCE,
  }),
};

export function ScreenTransition({
  screenKey,
  direction,
  children,
}: {
  screenKey: string;
  direction: number;
  children: ReactNode;
}) {
  return (
    <AnimatePresence mode="wait" custom={direction}>
      <motion.div
        key={screenKey}
        custom={direction}
        variants={screenVariants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{ duration: 0.22, ease: 'easeOut' }}
        className="size-full"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
