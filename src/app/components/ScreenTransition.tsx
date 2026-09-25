import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useSettings } from '../context/SettingsContext';
import { getAnimationDurationScale } from '../lib/settings';

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
const EXIT_DURATION_MS = 220;

/**
 * FIX (pesquisa de bugs: "Continuar"/"Iniciar" travando o wizard pra
 * sempre) - o Framer Motion, quando o clique troca `screenKey` enquanto a
 * animação de ENTRADA da tela atual ainda está rodando (ex.: clicar rápido
 * assim que a tela aparece), às vezes interrompe pra ir pra animação de
 * SAÍDA mas nunca resolve essa saída - `AnimatePresence` (`mode="wait"`)
 * fica esperando um `onExitComplete` que nunca chega, e a tela nova nunca é
 * montada (reproduzido e confirmado com logs: 2 `animationStart` seguidos
 * pro mesmo elemento, sem nenhum `animationComplete`/`onExitComplete` entre
 * eles). Isso é uma falha da própria lib em runtime, não um erro de lógica
 * daqui - então em vez de tentar "consertar" o Framer Motion, este timeout
 * é uma rede de segurança: se a saída não se resolver sozinha a tempo,
 * força um remount limpo do AnimatePresence (que descarta qualquer estado
 * interno travado) mostrando a tela atual. No caminho normal (a imensa
 * maioria das trocas de tela) o timeout é cancelado por `onExitComplete`
 * antes de disparar, e nada muda visualmente.
 */
/** Margem fixa (não escalada por `animationSpeed`) além da duração real da saída - tempo de sobra pra ter certeza de que o Framer Motion travou, não só está terminando. */
const SAFETY_TIMEOUT_MARGIN_MS = 500;

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
  // FIX (Fase 2.2 do overhaul de animações, "Wizard") - antes esta duração
  // (0.22s) era fixa, ignorando `settings.animationSpeed` por completo (mesma
  // classe de gap já corrigida duas vezes neste roadmap: Fase 1 pro
  // descarte/reembaralhamento, Fase 2.1 pra transição de fase/turno).
  const { settings } = useSettings();
  const scale = getAnimationDurationScale(settings);

  // Ver comentário de SAFETY_TIMEOUT_MARGIN_MS acima - `presenceKey` força um
  // remount completo do AnimatePresence quando a rede de segurança dispara.
  const [presenceKey, setPresenceKey] = useState(0);
  const lastScreenKeyRef = useRef(screenKey);
  const safetyTimeoutRef = useRef<number | null>(null);

  const clearSafetyTimeout = () => {
    if (safetyTimeoutRef.current !== null) {
      window.clearTimeout(safetyTimeoutRef.current);
      safetyTimeoutRef.current = null;
    }
  };

  // FIX (achado na Fase 2.1, agora aplicado aqui de propósito - ver
  // feedback_review_blocking_timer_useeffect_deps na memória): este efeito só
  // deve REAGIR a `screenKey` mudando de verdade - `settings.animations`/
  // `scale` são lidos aqui dentro via closure (valor fresco no instante em
  // que o efeito roda), NUNCA como dependências reativas. Colocá-los no
  // array faria o cleanup (que cancela o `safetyTimeoutRef` pendente de uma
  // troca de tela ainda em andamento) disparar toda vez que a preferência de
  // velocidade mudasse no meio de uma transição, sem reagendar nada no lugar
  // - a mesma classe de bug que travou `showPhaseTransition` pra sempre.
  useEffect(() => {
    if (lastScreenKeyRef.current === screenKey) return;
    lastScreenKeyRef.current = screenKey;
    clearSafetyTimeout();
    // Sem animação, não existe animação de saída pra travar - a rede de
    // segurança não tem nada pra proteger aqui.
    if (!settings.animations) return;
    safetyTimeoutRef.current = window.setTimeout(() => {
      safetyTimeoutRef.current = null;
      setPresenceKey((k) => k + 1);
    }, Math.round(EXIT_DURATION_MS * scale) + SAFETY_TIMEOUT_MARGIN_MS);
    return clearSafetyTimeout;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenKey]);

  // FIX (Fase 2.2): `settings.animations` desligado agora REMOVE a transição
  // de verdade (troca instantânea, sem AnimatePresence/motion nenhum) - antes
  // este componente nem checava a preferência, a troca de tela sempre
  // animava. Mesmo padrão "pula por completo em vez de só encurtar" já
  // aplicado nas Fases 1 e 2.1. Sem AnimatePresence aqui, a própria rede de
  // segurança contra saída travada também fica sem propósito (não corre o
  // risco de nunca disparar `onExitComplete` se não há exit animation).
  if (!settings.animations) {
    return (
      <div key={screenKey} className="size-full">
        {children}
      </div>
    );
  }

  return (
    <AnimatePresence key={presenceKey} mode="wait" custom={direction} onExitComplete={clearSafetyTimeout}>
      <motion.div
        key={screenKey}
        custom={direction}
        variants={screenVariants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{ duration: 0.22 * scale, ease: 'easeOut' }}
        className="size-full"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
