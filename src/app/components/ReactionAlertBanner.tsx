import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle } from 'lucide-react';
import { getCharacterTheme } from '../lib/characterThemes';
import type { CharacterId } from '../lib/gameEngine';
import { getMagicCardInfo, type MagicCardType } from '../lib/magicCards';

interface ReactionAlertBannerProps {
  show: boolean;
  /** Personagem de quem ANUNCIOU a magia (colore o banner - a mesma identidade do SpeedlinesBackground.tsx ativo agora). */
  casterCharacter: CharacterId | null;
  /** Valete/Rainha/Rei anunciado - usado só pra buscar nome/descrição em magicCards.ts (ver getMagicCardInfo abaixo). */
  magicType: MagicCardType | null;
  /** Quem pode reagir agora. */
  reactingPlayer: 1 | 2 | null;
  /** Contagem cosmética (3, 2, 1) - a resolução de verdade é um timer único de 3000ms em GameBoard.tsx, independente deste número só decorativo. */
  secondsLeft: number;
}

/**
 * ReactionAlertBanner - Modo Reações (pedido do usuário: "aparece um
 * contador de 3 segundos para o outro jogador reagir... um texto falando
 * que o jogador pode reagir a tal ação").
 *
 * FIX (pedido do usuário: "deixe o aviso para reação muito mais notável e
 * impactante, mal é perceptível... é para o número cobrir quase toda
 * tela"): a v1 era um badge discreto no topo - trocado por uma tela cheia
 * (vinheta pulsando na cor do personagem + moldura nas bordas + o número da
 * contagem GIGANTE, ocupando a maior parte da altura da tela). Continua
 * `pointer-events-none` de propósito (mesmo motivo de sempre - a mão
 * precisa continuar 100% clicável embaixo dele: ver HandCardView.tsx/
 * reactionState), então mesmo cobrindo boa parte da tela nunca atrapalha o
 * clique na carta elegível, só o quanto se vê dela por baixo do número.
 *
 * FIX (pedido do usuário: "mostre a descrição do efeito de magia que está
 * sendo anunciado no modo de reações") - antes só dizia QUEM pode reagir,
 * nunca O QUE está sendo anunciado - o jogador precisava adivinhar (ou
 * conferir o log) se vale a pena negar. Busca nome + descrição em
 * magicCards.ts (mesma fonte usada em todo o resto da UI, nunca desatualiza
 * em relação às regras reais) a partir de `casterCharacter`+`magicType`.
 */
export function ReactionAlertBanner({ show, casterCharacter, magicType, reactingPlayer, secondsLeft }: ReactionAlertBannerProps) {
  const theme = getCharacterTheme(casterCharacter ?? 'mago');
  const magicInfo = casterCharacter && magicType ? getMagicCardInfo(casterCharacter, magicType) : null;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[95] pointer-events-none flex flex-col items-center justify-center overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.3 } }}
        >
          {/* Vinheta pulsando na cor de quem lançou a magia - preenche a tela
              inteira de forma bem mais chamativa que o badge de antes, sem
              nunca ficar sólida a ponto de esconder o jogo por trás. */}
          <motion.div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(circle at center, transparent 30%, ${theme.primary}30 75%, ${theme.primary}55 100%)`,
            }}
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut' }}
          />
          {/* Moldura pulsando nas bordas da tela - reforça a sensação de
              "alerta" mesmo em quem só está olhando de relance. */}
          <motion.div
            className="absolute inset-0"
            animate={{ boxShadow: [`inset 0 0 60px ${theme.primary}90`, `inset 0 0 140px ${theme.primary}`, `inset 0 0 60px ${theme.primary}90`] }}
            transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut' }}
          />

          <motion.div
            className="flex items-center gap-3 rounded-full px-6 py-3 border-2 shadow-2xl relative z-10"
            style={{
              backgroundColor: '#1E1A16',
              borderColor: theme.primary,
              boxShadow: `0 0 40px ${theme.primary}`,
            }}
            animate={{ scale: [1, 1.06, 1] }}
            transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut' }}
          >
            <AlertTriangle className="w-7 h-7 flex-shrink-0" style={{ color: theme.primary }} />
            <p className="text-[#EFE7D6] text-[22px] font-bold whitespace-nowrap">
              Jogador {reactingPlayer} pode <span style={{ color: theme.primary }}>REAGIR</span>!
            </p>
          </motion.div>

          {/* Nome + descrição da magia anunciada (pedido do usuário: "mostre
              a descrição do efeito de magia que está sendo anunciado") -
              caixa própria, legível mesmo com o resto da tela pulsando atrás. */}
          {magicInfo && (
            <motion.div
              className="relative z-10 mt-3 max-w-md text-center px-5 py-2.5 rounded-xl border"
              style={{ backgroundColor: '#1E1A16E6', borderColor: `${theme.primary}80` }}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
            >
              <p className="text-[15px] font-bold" style={{ color: theme.primary }}>
                {magicInfo.name}
              </p>
              <p className="text-[12px] text-[#EFE7D6] leading-snug mt-1">{magicInfo.description}</p>
            </motion.div>
          )}

          {/* O número em si - pedido do usuário, cobrindo quase toda a tela. */}
          <motion.div
            key={secondsLeft}
            className="font-display relative z-10 leading-none select-none"
            style={{
              fontSize: 'min(52vw, 62vh)',
              color: theme.primary,
              WebkitTextStroke: '6px #0F1113',
              textShadow: `0 0 60px ${theme.primary}, 0 0 120px ${theme.primary}, 0 0 20px #0F1113`,
            }}
            initial={{ scale: 2.2, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          >
            {secondsLeft}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
