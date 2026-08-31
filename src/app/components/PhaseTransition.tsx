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
}

export function PhaseTransition({ phase, show, spotlight, loneTower }: PhaseTransitionProps) {
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
            initial={settings.animations ? { scale: 0.5, opacity: 0, rotateY: -180 } : { opacity: 0 }}
            animate={settings.animations ? { scale: 1, opacity: 1, rotateY: 0 } : { opacity: 1 }}
            exit={settings.animations ? { scale: 0.5, opacity: 0, rotateY: 180 } : { opacity: 0 }}
            transition={{ type: 'spring', duration: 0.6 }}
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
