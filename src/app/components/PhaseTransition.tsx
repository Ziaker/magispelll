import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShoppingCart, Lightbulb, Swords } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import type { SpotlightState } from '../lib/spotlight';
import { ROULETTE_DURATION_MS } from './AceTransformBurst';

// Modo Spotlight (pedido do usuário: "devia ter uma 'cutscene' do número
// rodando como um caça niquels até chegar no resultado aleatório que
// receberá o Spotlight") - mesmo mecanismo de "roleta" já usado na
// transformação de Ás (ver AceTransformBurst.tsx/ROULETTE_DURATION_MS):
// dígitos aleatórios piscando rápido até assentar no valor de verdade. Com
// mais de um número em destaque, cada um assenta em um instante diferente
// (`idx * SPOTLIGHT_ROULETTE_STAGGER_MS` de atraso extra), como rolos de
// caça-níquel parando um de cada vez.
const SPOTLIGHT_ROULETTE_STAGGER_MS = 280;
const SPOTLIGHT_ROULETTE_TICK_MS = 70;
/** Tempo extra (além do assentar do último número) pro jogador ler o resultado antes do popup sumir. */
const SPOTLIGHT_ROULETTE_READ_MS = 900;

/**
 * Duração total (ms) que o popup de transição de fase precisa ficar aberto
 * quando há uma cutscene de Spotlight rodando - usada por GameBoard.tsx para
 * estender o timeout genérico de 900ms só nesse caso específico (entrada na
 * Fase de Compra com o modo ativo), sem afetar a velocidade das outras
 * transições de fase.
 */
export function getSpotlightCutsceneDurationMs(spotlightNumberCount: number): number {
  if (spotlightNumberCount <= 0) return 0;
  return SPOTLIGHT_ROULETTE_STAGGER_MS * (spotlightNumberCount - 1) + ROULETTE_DURATION_MS + SPOTLIGHT_ROULETTE_READ_MS;
}

function SpotlightRouletteNumber({
  finalValue,
  polarity,
  settleDelay,
}: {
  finalValue: number;
  polarity: 'positive' | 'negative';
  settleDelay: number;
}) {
  const [rollingValue, setRollingValue] = useState(() => 2 + Math.floor(Math.random() * 9));
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setRollingValue(2 + Math.floor(Math.random() * 9));
    }, SPOTLIGHT_ROULETTE_TICK_MS);
    const settleTimeout = setTimeout(() => {
      clearInterval(intervalId);
      setSettled(true);
    }, settleDelay);
    return () => {
      clearInterval(intervalId);
      clearTimeout(settleTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const displayValue = settled ? finalValue : rollingValue;
  const color = settled ? (polarity === 'positive' ? '#F2C94C' : '#8A5A5A') : '#EFE7D6';

  return (
    <motion.p
      className="font-display text-[22px]"
      animate={settled ? { scale: [0.6, 1.3, 1] } : undefined}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      style={{ color, textShadow: settled ? `0 0 14px ${color}` : undefined }}
    >
      {displayValue}
      {settled ? ` - ${polarity === 'positive' ? 'vale 3x mais' : 'valor fixo em 1'}` : ''}
    </motion.p>
  );
}

interface PhaseTransitionProps {
  phase: 'draw' | 'strategy' | 'combat';
  show: boolean;
  /**
   * Modo Spotlight (pedido do usuário: "no início do turno aparece uma
   * mensagem que diz se o número vai ter um spotlight positivo ou
   * negativo") - só mostrado quando `phase === 'draw'` (o início de um
   * turno novo é exatamente quando esta transição já aparece pra "Fase de
   * Compra") e o modo está ativo. `null`/`undefined` = sem Spotlight nesta
   * partida, nenhum conteúdo extra. Ver spotlight.ts.
   */
  spotlight?: SpotlightState | null;
  /**
   * Modo Towers - "torre solitária" (pedido do usuário: "quando entra na
   * fase de combate seguindo a ideia de 1 torre vs 2 ou 3 cartas
   * avulsas/com horizontais, o aviso/notificação que anuncia a fase é
   * diferente para referenciar essa mecânica") - `true` quando
   * `gameState.combatLoneTower` está ativo (ver comentário completo em
   * GameState/computeLoneTowerForCombat, gameEngine.ts). Só muda o texto
   * (nome + descrição) desta transição para 'combat' - o resto do popup
   * (ícone, cor, animação) permanece o mesmo.
   */
  loneTower?: boolean;
  /**
   * FIX (pedido do usuário: "quando o jogo começa... com o anúncio (...) e
   * mostre quais modos de jogo estão ativos") - `true` só na transição de
   * ENTRADA numa partida (turno 1, Fase de Compra - mount real ou uma
   * revanche, ver `isGameStart` em GameBoard.tsx). Controla se a seção de
   * `activeModes` abaixo aparece - as outras transições de fase (turno 2 em
   * diante) não repetem essa lista toda vez.
   */
  isGameStart?: boolean;
  /** Rótulos já formatados dos modos de jogo ativos nesta partida (ver GameBoard.tsx) - `[]` = nenhuma variante ligada, mostra "Modo Clássico". Só renderizado quando `isGameStart`. */
  activeModes?: string[];
}

export function PhaseTransition({ phase, show, spotlight, loneTower, isGameStart, activeModes = [] }: PhaseTransitionProps) {
  const { settings } = useSettings();

  const phaseConfig = {
    draw: {
      name: 'FASE DE COMPRA',
      icon: ShoppingCart,
      color: '#6CC47A',
      description: 'Organize sua mão e compre cartas',
    },
    strategy: {
      name: 'FASE DE ESTRATÉGIA',
      icon: Lightbulb,
      color: '#C59E4F',
      description: 'Posicione suas cartas no campo',
    },
    combat: loneTower
      ? {
          name: 'ATAQUE À TORRE',
          icon: Swords,
          color: '#7AA7C4',
          description: 'A torre solitária perde a carta do topo a cada disputa!',
        }
      : {
          name: 'FASE DE COMBATE',
          icon: Swords,
          color: '#D45D4A',
          description: 'Revele e batalhe!',
        },
  };

  const config = phaseConfig[phase];
  const Icon = config.icon;

  // FIX (pedido do usuário, "Overhaul de Animações" - "transição de fase
  // temática por fase"): antes as 3 fases usavam a MESMA animação de
  // entrada (scale+flip em Y), só recolorida - agora cada uma tem uma
  // assinatura própria (Compra = cartas caindo, Estratégia = peças se
  // ajeitando, Combate = impacto de choque), preservando o resto do popup
  // (glow, ícone giratório, título, Spotlight/Modos Ativos, cantos ✦)
  // intacto. `settings.animations` desligado continua caindo pro fade
  // simples de sempre, sem nenhuma das variantes abaixo.
  const phaseCardMotion = {
    draw: {
      initial: { y: -90, opacity: 0, rotate: -6 },
      animate: { y: [-90, 12, 0], opacity: 1, rotate: [-6, 2, 0] },
      exit: { y: 70, opacity: 0, rotate: 6 },
      transition: { duration: 0.6, ease: 'easeOut' as const },
    },
    strategy: {
      initial: { scale: 0.85, opacity: 0, x: -40 },
      animate: { scale: [0.85, 1.05, 1], opacity: 1, x: [-40, 10, 0] },
      exit: { scale: 0.85, opacity: 0, x: 40 },
      transition: { duration: 0.55, ease: 'easeOut' as const },
    },
    combat: {
      initial: { scale: 1.7, opacity: 0 },
      animate: { scale: [1.7, 0.88, 1.06, 1], opacity: 1 },
      exit: { scale: 0.7, opacity: 0 },
      transition: { duration: 0.45, ease: 'easeOut' as const },
    },
  }[phase];

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.7)' }}
        >
          <motion.div
            initial={settings.animations ? phaseCardMotion.initial : { opacity: 0 }}
            animate={settings.animations ? phaseCardMotion.animate : { opacity: 1 }}
            exit={settings.animations ? phaseCardMotion.exit : { opacity: 0 }}
            transition={settings.animations ? phaseCardMotion.transition : { duration: 0.3 }}
            className="bg-[#1E1A16] rounded-2xl p-12 border-4 relative overflow-hidden"
            style={{
              borderColor: config.color,
              boxShadow: `0 0 60px ${config.color}80, 0 0 120px ${config.color}40`,
            }}
          >
            {/* Efeito de brilho de fundo */}
            <div
              className="absolute inset-0 opacity-20"
              style={{
                background: `radial-gradient(circle at center, ${config.color}40 0%, transparent 70%)`,
              }}
            />

            {/* Combate - anel de choque expandindo por trás do ícone, no
                mesmo instante do "punch" de escala acima (assinatura de
                impacto pedida pelo usuário). */}
            {settings.animations && phase === 'combat' && (
              <motion.div
                className="absolute left-1/2 top-[104px] -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
                style={{ border: `3px solid ${config.color}`, width: 96, height: 96 }}
                initial={{ opacity: 0.9, scale: 0.5 }}
                animate={{ opacity: 0, scale: 2.6 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            )}

            {/* Compra - punhado de cartas de costas "caindo" e pousando por
                cima do ícone, uma de cada vez (assinatura pedida pelo
                usuário: "cartas caindo"). */}
            {settings.animations && phase === 'draw' && (
              <div className="absolute left-1/2 top-[40px] -translate-x-1/2 pointer-events-none" style={{ width: 1, height: 1 }}>
                {[-26, 0, 26].map((offsetX, idx) => (
                  <motion.div
                    key={offsetX}
                    className="absolute rounded-sm bg-[#EFE7D6] border border-[#8F6A30]"
                    style={{ width: 18, height: 25, left: offsetX - 9 }}
                    initial={{ y: -70, opacity: 0, rotate: offsetX }}
                    animate={{ y: 0, opacity: [0, 1, 1, 0], rotate: 0 }}
                    transition={{ duration: 0.5, delay: idx * 0.09, ease: 'easeIn' }}
                  />
                ))}
              </div>
            )}

            {/* Estratégia - 3 "peças" deslizando de direções diferentes e se
                encaixando ao redor do ícone (assinatura pedida pelo
                usuário: "peças se ajeitando"). */}
            {settings.animations && phase === 'strategy' && (
              <>
                {[
                  { from: { x: -120, y: 0, rotate: -35 }, to: { left: 'calc(50% - 60px)', top: 40 } },
                  { from: { x: 120, y: 0, rotate: 35 }, to: { left: 'calc(50% + 40px)', top: 40 } },
                  { from: { x: 0, y: -80, rotate: 20 }, to: { left: 'calc(50% - 10px)', top: 8 } },
                ].map((piece, idx) => (
                  <motion.div
                    key={idx}
                    className="absolute rounded pointer-events-none"
                    style={{ width: 22, height: 22, left: piece.to.left, top: piece.to.top, backgroundColor: `${config.color}55`, border: `2px solid ${config.color}` }}
                    initial={{ x: piece.from.x, y: piece.from.y, rotate: piece.from.rotate, opacity: 0 }}
                    animate={{ x: 0, y: 0, rotate: 0, opacity: [0, 1, 1, 0] }}
                    transition={{ duration: 0.55, delay: idx * 0.07, ease: 'easeOut' }}
                  />
                ))}
              </>
            )}

            {/* Conteúdo */}
            <div className="relative z-10 flex flex-col items-center gap-6">
              <motion.div
                animate={settings.animations ? { rotate: [0, 360] } : undefined}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                className="w-24 h-24 rounded-full flex items-center justify-center"
                style={{
                  backgroundColor: config.color,
                  boxShadow: `0 0 40px ${config.color}`,
                }}
              >
                <Icon className="w-12 h-12 text-[#0F1113]" />
              </motion.div>

              <div className="text-center">
                <h2
                  className="font-display text-[48px] mb-2"
                  style={{ color: config.color }}
                >
                  {config.name}
                </h2>
                <p className="text-[#BFB6A6] text-[20px]">{config.description}</p>
                {phase === 'draw' && spotlight && (
                  <div className="mt-4 flex flex-col items-center gap-1">
                    <p className="text-[#EFE7D6] text-[13px] uppercase tracking-wider">Spotlight deste turno</p>
                    {spotlight.numbers.map((n, idx) => (
                      <SpotlightRouletteNumber
                        key={n.value}
                        finalValue={n.value}
                        polarity={n.polarity}
                        settleDelay={ROULETTE_DURATION_MS + idx * SPOTLIGHT_ROULETTE_STAGGER_MS}
                      />
                    ))}
                  </div>
                )}
                {/* FIX (pedido do usuário, item 2.1: "deveria mostrar uma
                    mensagem mostrando quais modos de jogo estão ativos") -
                    só no anúncio de início de partida (isGameStart), não em
                    toda transição de fase - senão repetiria a cada turno.
                    Spotlight não aparece nesta lista (já tem a própria
                    cutscene de roleta acima) - "Modo Clássico" quando
                    nenhuma variante está ligada, em vez de omitir a seção,
                    pra sempre confirmar visualmente que a configuração
                    escolhida foi aplicada. */}
                {isGameStart && (
                  <div className="mt-4 flex flex-col items-center gap-1">
                    <p className="text-[#EFE7D6] text-[13px] uppercase tracking-wider">Modos ativos</p>
                    <p className="text-[#BFB6A6] text-[15px]">
                      {activeModes.length > 0 ? activeModes.join(' · ') : 'Modo Clássico'}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Cantos decorativos */}
            <div className="absolute top-4 left-4 text-[24px] opacity-30 font-display" style={{ color: config.color }}>✦</div>
            <div className="absolute top-4 right-4 text-[24px] opacity-30 font-display" style={{ color: config.color }}>✦</div>
            <div className="absolute bottom-4 left-4 text-[24px] opacity-30 font-display" style={{ color: config.color }}>✦</div>
            <div className="absolute bottom-4 right-4 text-[24px] opacity-30 font-display" style={{ color: config.color }}>✦</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
