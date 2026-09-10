import { useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { getCharacterTheme } from '../lib/characterThemes';
import { getDisplayValue, getDisplaySuit, type Card } from '../lib/cardUtils';
import type { CharacterId } from '../lib/gameEngine';
import type { CardStatusSummary, CardTypeInfo, CardValueBreakdown } from '../lib/cardEffectSummary';
import { PlayingCard } from './PlayingCard';

export interface CardInspectionSpec {
  card: Card;
  character: CharacterId;
  /** Posição real da carta no campo (mesmo cardPositionsRef que MagicPauseSpotlight.tsx já usa), capturada no instante em que o hold completa. */
  rect: DOMRect | null;
  isHorizontal: boolean;
  type: CardTypeInfo;
  statuses: CardStatusSummary[];
  valueBreakdown: CardValueBreakdown;
}

interface CardInspectionOverlayProps {
  spec: CardInspectionSpec | null;
  onClose: () => void;
}

const SPOTLIGHT_PADDING = 14;
/** Fator de ampliação da carta dentro do recorte - grande o bastante pra ler à distância, sem estourar telas menores. */
const ZOOM_SCALE = 2.1;
const CALLOUT_WIDTH = 220;
const CALLOUT_GAP = 28;
const MAX_VISIBLE_CALLOUTS = 6;

type AnchorSide = 'topLeft' | 'topRight' | 'right' | 'bottomRight' | 'bottomLeft' | 'left';
const ANCHOR_ORDER: AnchorSide[] = ['topLeft', 'topRight', 'right', 'bottomRight', 'bottomLeft', 'left'];

/**
 * CardInspectionOverlay.tsx - Interface de Inspeção de Carta (pedido do
 * usuário: "pressionar e segurar o MEIO de uma carta no campo por 1,5
 * segundo... a carta em destaque/zoom, e - nas regiões correspondentes às
 * posições dos efeitos que afetam ela - caixas de texto explicando cada
 * efeito ativo, cada uma com um ícone de seta pra cima ou seta pra baixo").
 *
 * Técnica de recorte na escuridão (spotlight cutout) IDÊNTICA à de
 * MagicPauseSpotlight.tsx (já aprovada pelo usuário) - `box-shadow: 0 0 0
 * 9999px` no tamanho exato do recorte - só que aqui o recorte já nasce
 * AMPLIADO (`ZOOM_SCALE`), centrado na posição real da carta (`rect`), em
 * vez do tamanho real dela - o "zoom" É o próprio recorte crescendo, não um
 * transform separado por cima que desalinharia buraco vs. carta.
 *
 * Diferente de MagicPauseSpotlight (decorativo, fecha sozinho, nunca
 * interativo): esta tela É interativa - clique fora ou Esc fecha, cada
 * caixa de efeito é só leitura mas o fundo escurecido aceita clique.
 */
export function CardInspectionOverlay({ spec, onClose }: CardInspectionOverlayProps) {
  useEffect(() => {
    if (!spec) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [spec, onClose]);

  const theme = spec ? getCharacterTheme(spec.character) : null;
  const rect = spec?.rect ?? null;

  // Recorte já ampliado, centrado no MESMO centro do rect real (a carta
  // "cresce" a partir da própria posição, nunca salta pra outro lugar da tela).
  const cutout = useMemo(() => {
    if (!rect) return null;
    const width = rect.width * ZOOM_SCALE;
    const height = rect.height * ZOOM_SCALE;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return { left: cx - width / 2, top: cy - height / 2, width, height, cx, cy };
  }, [rect]);

  const visibleStatuses = spec ? spec.statuses.slice(0, MAX_VISIBLE_CALLOUTS) : [];
  const overflowCount = spec ? Math.max(0, spec.statuses.length - MAX_VISIBLE_CALLOUTS) : 0;

  const calloutBoxes = useMemo(() => {
    if (!cutout || typeof window === 'undefined') return [];
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
    const boxHeight = 78;
    return visibleStatuses.map((status, idx) => {
      const side = ANCHOR_ORDER[idx % ANCHOR_ORDER.length];
      let left: number;
      let top: number;
      switch (side) {
        case 'topLeft':
          left = cutout.left - CALLOUT_WIDTH - CALLOUT_GAP;
          top = cutout.top;
          break;
        case 'topRight':
          left = cutout.left + cutout.width + CALLOUT_GAP;
          top = cutout.top;
          break;
        case 'right':
          left = cutout.left + cutout.width + CALLOUT_GAP;
          top = cutout.cy - boxHeight / 2;
          break;
        case 'bottomRight':
          left = cutout.left + cutout.width + CALLOUT_GAP;
          top = cutout.top + cutout.height - boxHeight;
          break;
        case 'bottomLeft':
          left = cutout.left - CALLOUT_WIDTH - CALLOUT_GAP;
          top = cutout.top + cutout.height - boxHeight;
          break;
        case 'left':
        default:
          left = cutout.left - CALLOUT_WIDTH - CALLOUT_GAP;
          top = cutout.cy - boxHeight / 2;
          break;
      }
      left = clamp(left, 12, vw - CALLOUT_WIDTH - 12);
      top = clamp(top, 12, vh - boxHeight - 12);
      const boxCenterX = left + CALLOUT_WIDTH / 2;
      const boxCenterY = top + boxHeight / 2;
      return { status, left, top, boxCenterX, boxCenterY };
    });
  }, [cutout, visibleStatuses]);

  const displayValue = spec ? getDisplayValue(spec.card) : '';
  const displaySuit = spec ? getDisplaySuit(spec.card) : '';

  return (
    <AnimatePresence>
      {spec && theme && (
        <motion.div
          className="fixed inset-0 z-[97]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
          onClick={onClose}
        >
          {cutout ? (
            <>
              <div
                className="absolute rounded-2xl"
                style={{
                  top: cutout.top - SPOTLIGHT_PADDING,
                  left: cutout.left - SPOTLIGHT_PADDING,
                  width: cutout.width + SPOTLIGHT_PADDING * 2,
                  height: cutout.height + SPOTLIGHT_PADDING * 2,
                  boxShadow: '0 0 0 9999px rgba(10,8,6,0.88)',
                }}
              />
              <motion.div
                className="absolute rounded-2xl border-2 pointer-events-none"
                style={{
                  top: cutout.top - SPOTLIGHT_PADDING,
                  left: cutout.left - SPOTLIGHT_PADDING,
                  width: cutout.width + SPOTLIGHT_PADDING * 2,
                  height: cutout.height + SPOTLIGHT_PADDING * 2,
                  borderColor: theme.primary,
                }}
                animate={{ boxShadow: [`0 0 20px ${theme.primary}90`, `0 0 45px ${theme.primary}`, `0 0 20px ${theme.primary}90`] }}
                transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
              />
            </>
          ) : (
            <div className="absolute inset-0" style={{ backgroundColor: 'rgba(10,8,6,0.88)' }} />
          )}

          {/* Linhas conectoras - um <svg> cobrindo a tela, atrás das caixas (z menor), na cor da polaridade de cada status. */}
          {cutout && (
            <svg className="absolute inset-0 pointer-events-none" width="100%" height="100%">
              {calloutBoxes.map(({ status, boxCenterX, boxCenterY }) => (
                <line
                  key={status.id}
                  x1={boxCenterX}
                  y1={boxCenterY}
                  x2={cutout.cx}
                  y2={cutout.cy}
                  stroke={status.polarity === 'positive' ? '#6CC47A' : status.polarity === 'negative' ? '#D45D4A' : theme.primary}
                  strokeWidth={1.5}
                  opacity={0.55}
                />
              ))}
            </svg>
          )}

          {cutout && (
            <div
              className="absolute flex flex-col items-center gap-2"
              style={{ left: cutout.cx, top: cutout.top - 46, transform: 'translateX(-50%)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="px-4 py-1.5 rounded-full border-2 text-[13px] font-bold tracking-wide"
                style={{ backgroundColor: '#1E1A16', borderColor: theme.primary, color: theme.primary }}
              >
                {spec.type.label}
              </div>
            </div>
          )}

          {cutout && (
            <div
              className="absolute flex items-center justify-center"
              style={{ left: cutout.left, top: cutout.top, width: cutout.width, height: cutout.height }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ transform: `scale(${ZOOM_SCALE})` }}>
                {spec.isHorizontal ? (
                  <PlayingCard horizontal value={spec.card.value} suit={displaySuit} card={spec.card} />
                ) : (
                  <PlayingCard value={spec.card.value} suit={displaySuit} card={spec.card} />
                )}
              </div>
            </div>
          )}

          {cutout && spec.valueBreakdown.adjustments.length > 0 && (
            <div
              className="absolute text-center"
              style={{ left: cutout.cx, top: cutout.top + cutout.height + 14, transform: 'translateX(-50%)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <p
                className="px-3 py-1 rounded-lg text-[13px] font-bold inline-block"
                style={{
                  backgroundColor: '#1E1A16F2',
                  border: `1.5px solid ${
                    spec.valueBreakdown.polarity === 'higher' ? '#6CC47A' : spec.valueBreakdown.polarity === 'lower' ? '#D45D4A' : theme.primary
                  }`,
                  color: spec.valueBreakdown.polarity === 'higher' ? '#6CC47A' : spec.valueBreakdown.polarity === 'lower' ? '#D45D4A' : '#EFE7D6',
                }}
              >
                {displayValue}
                {displaySuit} vale {spec.valueBreakdown.total} no combate
              </p>
            </div>
          )}

          {calloutBoxes.map(({ status, left, top }) => {
            const Icon = status.icon;
            const color = status.polarity === 'positive' ? '#6CC47A' : status.polarity === 'negative' ? '#D45D4A' : theme.primary;
            return (
              <motion.div
                key={status.id}
                className="absolute rounded-xl border-2 shadow-2xl"
                style={{ left, top, width: CALLOUT_WIDTH, backgroundColor: '#1E1A16F2', borderColor: color }}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2, delay: 0.05 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-3 flex gap-2">
                  <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color }} />
                  <div>
                    <p className="text-[12.5px] font-bold mb-0.5" style={{ color }}>
                      {status.label}
                    </p>
                    <p className="text-[11.5px] text-[#EFE7D6] leading-snug">{status.description}</p>
                  </div>
                </div>
              </motion.div>
            );
          })}

          {overflowCount > 0 && cutout && (
            <div
              className="absolute px-3 py-1 rounded-lg text-[12px] font-semibold"
              style={{
                left: cutout.cx,
                top: cutout.top + cutout.height + (spec.valueBreakdown.adjustments.length > 0 ? 48 : 14),
                transform: 'translateX(-50%)',
                backgroundColor: '#1E1A16F2',
                border: `1.5px solid ${theme.primary}`,
                color: theme.primary,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              +{overflowCount} outro{overflowCount === 1 ? '' : 's'} efeito{overflowCount === 1 ? '' : 's'}
            </div>
          )}

          <button
            type="button"
            className="fixed top-6 right-6 z-[98] w-10 h-10 rounded-full flex items-center justify-center"
            style={{ backgroundColor: '#1E1A16', border: `1.5px solid ${theme.primary}` }}
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            aria-label="Fechar inspeção"
          >
            <X className="w-5 h-5" style={{ color: theme.primary }} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
