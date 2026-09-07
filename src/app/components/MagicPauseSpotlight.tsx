import { AnimatePresence, motion } from 'motion/react';
import { Sparkles } from 'lucide-react';
import { getCharacterTheme } from '../lib/characterThemes';
import type { CharacterId } from '../lib/gameEngine';

export interface MagicPauseSpotlightSpec {
  title: string;
  detail: string;
  character: CharacterId;
  /** Posição real da carta ativada na tela (mesmo cardPositionsRef que FlyingDiscardCard.tsx/BulletImpactBurst.tsx já usam), capturada no instante em que a pausa começa. `null` só no caso defensivo de a carta nunca ter renderizado (nunca deveria acontecer na prática). */
  rect: DOMRect | null;
}

interface MagicPauseSpotlightProps {
  spec: MagicPauseSpotlightSpec | null;
}

const SPOTLIGHT_PADDING = 10;

/**
 * Pausa pós-ativação de magia (pedido do usuário: "mostra carta na tela NO
 * MEIO DELA, deixa a tela obscurecida, faz highlight na carta (deixando SÓ
 * ELA fora desse efeito de obscurecido), e mostra o que o efeito dela faz" -
 * substitui por completo o banner fino do topo que o usuário rejeitou 4x por
 * "nem parecer que faz parte do jogo"). Mesma técnica de spotlight de
 * tutorial: um recorte na escuridão via box-shadow gigante (`0 0 0 9999px`)
 * exatamente no retângulo real da carta - só ela fica de fora do
 * escurecimento, o resto da tela apaga.
 *
 * O recorte escuro (`div` estático) NUNCA anima, pra nunca "tremer" -  só o
 * anel de brilho por cima pulsa, na cor do personagem que ativou a magia,
 * mesmo espírito visual de impacto do ReactionAlertBanner.tsx (sem repetir o
 * layout dele - aqui é uma pausa fixa, não uma janela com contagem
 * regressiva que o oponente pode interromper).
 */
export function MagicPauseSpotlight({ spec }: MagicPauseSpotlightProps) {
  const theme = spec ? getCharacterTheme(spec.character) : null;
  const rect = spec?.rect ?? null;
  // FIX (bug real encontrado testando ao vivo): centralizar o texto na tela
  // SEMPRE, como o ReactionAlertBanner.tsx faz, soa bem quando a carta ativada
  // está numa borda - mas uma carta cujo retângulo cai perto do meio vertical
  // da tela (ex.: mão comprida rolada, campo em telas baixas) fica com o
  // texto sobrepondo o próprio recorte que deveria estar "livre" da escuridão.
  // Em vez de centralizar sempre, joga o texto pro lado OPOSTO da carta (topo
  // da tela se ela está na metade de baixo, base se está na metade de cima) -
  // afasta o texto do recorte não importa onde a carta esteja.
  const cardInLowerHalf = rect ? rect.top + rect.height / 2 > window.innerHeight / 2 : false;

  return (
    <AnimatePresence>
      {spec && theme && (
        <motion.div
          className="fixed inset-0 z-[95] pointer-events-none overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.25 } }}
        >
          {rect ? (
            <>
              <div
                className="absolute rounded-xl"
                style={{
                  top: rect.top - SPOTLIGHT_PADDING,
                  left: rect.left - SPOTLIGHT_PADDING,
                  width: rect.width + SPOTLIGHT_PADDING * 2,
                  height: rect.height + SPOTLIGHT_PADDING * 2,
                  boxShadow: '0 0 0 9999px rgba(10,8,6,0.85)',
                }}
              />
              <motion.div
                className="absolute rounded-xl border-2"
                style={{
                  top: rect.top - SPOTLIGHT_PADDING,
                  left: rect.left - SPOTLIGHT_PADDING,
                  width: rect.width + SPOTLIGHT_PADDING * 2,
                  height: rect.height + SPOTLIGHT_PADDING * 2,
                  borderColor: theme.primary,
                }}
                animate={{ boxShadow: [`0 0 20px ${theme.primary}90`, `0 0 45px ${theme.primary}`, `0 0 20px ${theme.primary}90`] }}
                transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut' }}
              />
            </>
          ) : (
            // Fallback defensivo: sem posição real conhecida - ainda assim
            // escurece a tela inteira (sem recorte) pra nunca deixar a pausa
            // muda/sem feedback nenhum.
            <div className="absolute inset-0" style={{ backgroundColor: 'rgba(10,8,6,0.85)' }} />
          )}

          {/* Nome + descrição do efeito - lado OPOSTO da carta (ver
              `cardInLowerHalf` acima), nunca sobrepondo o recorte. Sem
              posição real conhecida (`rect` nulo), cai no centro mesmo. */}
          <div
            className={`absolute inset-x-0 flex justify-center px-6 ${rect ? (cardInLowerHalf ? 'top-10' : 'bottom-10') : 'inset-y-0 items-center'}`}
          >
            <motion.div
              className="max-w-md text-center px-6 py-4 rounded-xl border-2 shadow-2xl"
              style={{ backgroundColor: '#1E1A16F2', borderColor: theme.primary, boxShadow: `0 0 40px ${theme.primary}60` }}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25 }}
            >
              <div className="flex items-center justify-center gap-2 mb-1">
                <Sparkles className="w-4 h-4 flex-shrink-0" style={{ color: theme.primary }} />
                <p className="text-[15px] font-bold" style={{ color: theme.primary }}>
                  {spec.title}
                </p>
              </div>
              <p className="text-[13px] text-[#EFE7D6] leading-snug">{spec.detail}</p>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
