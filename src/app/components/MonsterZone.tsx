import type { CSSProperties } from 'react';
import { useEffect, useRef } from 'react';
import { useDrop } from 'react-dnd';
import { PlayingCard, PHASE_DISPLAY } from './PlayingCard';
import { getCharacterTheme } from '../lib/characterThemes';
import type { Card } from '../lib/cardUtils';
import type { CharacterId } from '../lib/gameEngine';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { getMonsterEffect } from '../lib/monsterCards';
import { MAX_MONSTER_USES } from '../lib/gameEngine';
import { CARD_ITEM_TYPE, type CardDragItem } from '../lib/dnd';
import { registerDropTarget, unregisterDropTarget } from '../lib/dropTargetRegistry';

interface MonsterZoneProps {
  playerNumber: 1 | 2;
  character: CharacterId;
  monsterCard?: Card;
  phase: 'draw' | 'strategy' | 'combat';
  /** Verdadeiro quando esta é a zona do Jogador 2 no modo "Contra a IA" - só usado para bloquear o drag-and-drop (o clique já é bloqueado em handleMonsterZoneClick, GameBoard.tsx). */
  isAiField?: boolean;
  /** Jogador que está no meio de escolher o slot alvo para ativar o efeito do Monstro (ver GameBoard.tsx) - usado só para destacar visualmente esta zona enquanto a escolha está pendente. */
  monsterTargetSelection?: { playerNumber: 1 | 2 } | null;
  onMonsterZoneClick: (playerNumber: 1 | 2) => void;
  onMonsterCardDrop?: (playerNumber: 1 | 2, cardId: string) => void;
}

/**
 * MonsterZone - card próprio (fora do "campo") onde cada jogador posiciona e
 * ativa sua carta Monstro (Coringa).
 *
 * FIX (item 1 da 8ª rodada): "SEPARAR do campo... NÃO É PRA FICAR NO CAMPO,
 * é pra ficar onde estou marcando" - depois de 3 tentativas anteriores
 * (colada na linha divisória central, depois lado a lado, depois separada de
 * novo mas ainda dentro do card do campo de batalha) todas mantendo a Zona
 * Monstro DENTRO do contêiner com borda do BattleField.tsx, o print anotado
 * deixou claro (comparando a posição exata das setas/caixas desenhadas com o
 * layout real) que a zona precisa sair completamente do "campo" e morar na
 * COLUNA LATERAL direita - a caixa laranja (zona da IA) fica acima do card
 * "Pontuação", a caixa azul (zona do humano) fica abaixo do card "Baralho &
 * Descarte" - exatamente onde já ficam os blocos de CharacterMagicReference
 * (ver GameBoard.tsx, coluna "Direita - Informações do Jogo"). Por isso esta
 * lógica (que antes era a função renderMonsterZone, interna a
 * BattleField.tsx) virou um componente próprio, renderizado agora por
 * GameBoard.tsx dentro da coluna lateral, ao lado do CharacterMagicReference
 * de cada jogador - e BattleField.tsx não sabe mais nada sobre a Zona
 * Monstro (nem recebe mais as props relacionadas a ela).
 */
export function MonsterZone({
  playerNumber,
  character,
  monsterCard,
  phase,
  isAiField = false,
  monsterTargetSelection,
  onMonsterZoneClick,
  onMonsterCardDrop,
}: MonsterZoneProps) {
  const theme = getCharacterTheme(character);
  const monsterEffect = getMonsterEffect(character);

  const isMonsterTargetChoice = monsterTargetSelection?.playerNumber === playerNumber;
  const monsterReady = Boolean(monsterCard && !monsterCard.monsterUsed);
  const monsterUsed = Boolean(monsterCard?.monsterUsed);
  const canDropMonsterHere = Boolean(onMonsterCardDrop) && phase === 'strategy' && !isAiField;

  // FIX (pedido do usuário: "a carta monstro não está podendo ser arrastada
  // até seu local, só posicionada através do botão") - esta zona ainda usava
  // drag-and-drop NATIVO do HTML5 (`onDragOver`/`onDrop`/`e.dataTransfer`),
  // um resquício de antes da migração do resto do jogo para `react-dnd` (ver
  // dnd.ts/FieldSlotView.tsx/HandCardView.tsx). Como toda carta na mão agora
  // é arrastada via `useDrag` do react-dnd (não mais `draggable` nativo), o
  // `e.dataTransfer.getData('text/plain')` daqui nunca encontrava nada (o
  // react-dnd não populā o dataTransfer nesse formato) - o card chegava a ser
  // "solto" visualmente, mas o drop nunca registrava nada, então só o botão
  // (clique na própria carta -> "Ativar") continuava funcionando. Agora usa
  // `useDrop`, o mesmo mecanismo (e o mesmo destaque visual ao arrastar) já
  // usado pelos slots de combate.
  const dropOnMonsterZone = (item: CardDragItem) => {
    onMonsterCardDrop?.(playerNumber, item.cardId);
  };

  const [{ isOver, canDrop }, dropRef] = useDrop<CardDragItem, unknown, { isOver: boolean; canDrop: boolean }>(
    () => ({
      accept: CARD_ITEM_TYPE,
      canDrop: () => canDropMonsterHere,
      drop: dropOnMonsterZone,
      collect: (monitor) => ({ isOver: monitor.isOver(), canDrop: monitor.canDrop() }),
    }),
    [canDropMonsterHere, playerNumber, onMonsterCardDrop]
  );

  // FIX (pedido do usuário: "melhore a detecção de campo para cartas
  // arrastadas/jogadas lá") - mesmo registro de dropTargetRegistry.ts usado
  // em FieldSlotView.tsx, pra soltar perto da zona do Monstro também cair
  // nela pelo raio do ímã quando o evento nativo não acertar o elemento.
  const nodeRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const id = `monster-${playerNumber}`;
    registerDropTarget(id, {
      getCenter: () => {
        const rect = nodeRef.current?.getBoundingClientRect();
        return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
      },
      canDrop: () => canDropMonsterHere,
      onDrop: dropOnMonsterZone,
    });
    return () => unregisterDropTarget(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canDropMonsterHere, playerNumber, onMonsterCardDrop]);

  return (
    <div className="bg-[#1E1A16]/50 border border-[#C59E4F]/20 rounded-lg p-3 flex items-center gap-3">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="relative flex flex-col items-center">
              <div
                ref={(node) => {
                  dropRef(node);
                  nodeRef.current = node;
                }}
                data-card-drop-target={canDrop ? 'true' : undefined}
                data-card-id={monsterCard?.id}
                onClick={() => onMonsterZoneClick(playerNumber)}
                className={`transition-all cursor-pointer hover:scale-105 rounded-lg ${
                  isMonsterTargetChoice ? 'ring-4 shadow-2xl scale-105 animate-pulse' : ''
                } ${monsterReady && !isMonsterTargetChoice ? 'rune-glow animate-pulse' : ''} ${
                  isOver && canDrop
                    ? 'ring-4 ring-[#6CC47A] scale-105 shadow-2xl'
                    : canDrop && !monsterCard
                    ? 'ring-2 ring-dashed ring-[#C59E4F]/60 animate-pulse'
                    : ''
                }`}
                style={{ '--tw-ring-color': '#C59E4F' } as CSSProperties}
              >
                {monsterCard ? (
                  <PlayingCard value={monsterCard.value} suit={monsterCard.suit} card={monsterCard} className="w-20 h-28" />
                ) : (
                  <PlayingCard slot className="w-20 h-28" />
                )}
              </div>
              {monsterReady && (
                <div
                  className="absolute -bottom-2 -right-2 z-10 bg-[#C59E4F] border-2 border-[#8F6A30] rounded-full w-7 h-7 flex items-center justify-center animate-pulse pointer-events-none"
                  aria-label="Efeito de Monstro pronto para ativar"
                >
                  <span className="text-[13px]">🃏</span>
                </div>
              )}
              {monsterUsed && (
                <div
                  className="absolute -bottom-2 -right-2 z-10 bg-[#1E1A16] border-2 border-[#8F6A30]/50 rounded-full w-7 h-7 flex items-center justify-center opacity-60 pointer-events-none"
                  aria-label="Efeito de Monstro já usado neste turno"
                >
                  <span className="text-[11px] opacity-60">🃏</span>
                </div>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent className="bg-[#1E1A16] border-[#C59E4F] max-w-[240px]">
            <p className="text-[10px] font-semibold mb-1 uppercase tracking-wide" style={{ color: '#C59E4F' }}>
              🃏 {monsterEffect.name}
            </p>
            <p className="text-[10px] font-semibold mb-1 uppercase tracking-wide flex gap-2">
              <span style={{ color: PHASE_DISPLAY.strategy.color }}>{PHASE_DISPLAY.strategy.label}</span>
              <span className="text-[#BFB6A6]">ou</span>
              <span style={{ color: PHASE_DISPLAY.combat.color }}>{PHASE_DISPLAY.combat.label}</span>
            </p>
            <p className="text-[#EFE7D6] text-[11px]">{monsterEffect.detailedDescription}</p>
            {monsterCard && (
              <>
                <p className="text-[10px] mt-1" style={{ color: monsterReady ? '#C59E4F' : '#8F6A30' }}>
                  {monsterReady ? 'Pronto para ativar' : 'Já usado neste turno'}
                </p>
                <p className="text-[10px] text-[#BFB6A6]">
                  Usos: {monsterCard.monsterUseCount ?? 0}/{MAX_MONSTER_USES}
                </p>
              </>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <p className="text-[11px] font-medium" style={{ color: theme.primary }}>
        Zona Monstro
      </p>
    </div>
  );
}
