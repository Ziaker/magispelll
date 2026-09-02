import { PHASE_DISPLAY } from './PlayingCard';
import type { Phase } from '../lib/gameEngine';

const PHASE_ORDER: Phase[] = ['draw', 'strategy', 'combat'];
const SHORT_LABEL: Record<Phase, string> = { draw: 'Compra', strategy: 'Estratégia', combat: 'Combate' };

/**
 * PhaseProgress - barra superior do jogo (pedido do usuário: "barra de
 * progresso de fase... Compra → Estratégia → Combate, com a atual
 * destacada" em vez de só o texto "Fase: Estratégia"). Reaproveita
 * PHASE_DISPLAY (PlayingCard.tsx) - a MESMA cor por fase já usada nos
 * selos de tooltip de carta em todo o resto do jogo - só pro passo ATUAL;
 * passos já concluídos ficam num dourado neutro (não faz sentido reusar a
 * cor da fase de Compra pra indicar "já passou por ela", por exemplo), e
 * passos futuros ficam apagados.
 */
export function PhaseProgress({ phase }: { phase: Phase }) {
  const currentIndex = PHASE_ORDER.indexOf(phase);

  return (
    <div className="flex items-center">
      {PHASE_ORDER.map((p, i) => {
        const info = PHASE_DISPLAY[p];
        const isCurrent = i === currentIndex;
        const isPast = i < currentIndex;
        const style = isCurrent
          ? { borderColor: info.color, backgroundColor: `${info.color}25`, color: info.color }
          : isPast
          ? { borderColor: '#C59E4F80', backgroundColor: 'transparent', color: '#C59E4F' }
          : { borderColor: '#8F6A3040', backgroundColor: 'transparent', color: '#8F6A30' };

        return (
          <div key={p} className="flex items-center">
            <div
              className={`px-2 py-0.5 rounded-full border text-[10px] whitespace-nowrap transition-all ${isCurrent ? 'font-semibold' : ''}`}
              style={style}
            >
              {SHORT_LABEL[p]}
            </div>
            {i < PHASE_ORDER.length - 1 && (
              <div className="w-3 h-px mx-0.5" style={{ backgroundColor: i < currentIndex ? '#C59E4F' : '#8F6A3040' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
