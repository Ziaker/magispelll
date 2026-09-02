import type { CSSProperties, MouseEvent } from 'react';
import { useEffect, useState } from 'react';
import { motion, useMotionTemplate, useMotionValue, useSpring } from 'motion/react';
import { useDrag, useDrop } from 'react-dnd';
import { PlayingCard } from './PlayingCard';
import { CharacterMagicBurst } from './CharacterMagicBurst';
import { MagicCalloutLabel } from './MagicCalloutLabel';
import { AceTransformBurst } from './AceTransformBurst';
import { CardRejectFlash } from './CardRejectFlash';
import type { Card } from '../lib/cardUtils';
import type { FusionPartnerPreview } from '../lib/handQol';
import type { CharacterId, Phase } from '../lib/gameEngine';
import type { SpotlightState } from '../lib/spotlight';
import { CARD_ITEM_TYPE, CARD_SNAP_RADIUS, type CardDragItem } from '../lib/dnd';
import { findNearestDropTarget } from '../lib/dropTargetRegistry';

interface HandCardViewProps {
  card: Card;
  phase: Phase;
  character: CharacterId;
  themeColor: string;
  isSelectedForPlay: boolean;
  isSelectedForDiscard: boolean;
  isRejected: boolean;
  isEffectFlashing: boolean;
  /** Modo Towers (pedido do usuário): true quando esta carta está marcada pra formar/reforçar uma torre (Ctrl/Shift+clique) - ver PlayerZone.tsx/GameBoard.tsx. */
  isSelectedForTower?: boolean;
  /** Personagem de quem ativou a magia atualmente em exibição nesta carta (não necessariamente o dono dela!), e o nome dela. */
  magicCaster?: CharacterId | null;
  magicLabel?: string | null;
  /** FIX (pedido do usuário: "efeito visual chamativo quando o Ás é transformado") - true por ~1.3s logo após esta carta ser transformada. */
  isAceTransformFlashing?: boolean;
  isDraggable: boolean;
  onClick: () => void;
  /** Disparado no instante em que o arraste desta carta começa (equivalente ao antigo `onDragStart` nativo). */
  onDragStart?: () => void;
  onTransformAce: () => void;
  onActivateMagic: () => void;
  canActivateMagicNow: boolean;
  magicTooltip?: string;
  magicPhase?: Phase;
  /**
   * FIX (pedido do usuário, variante "Fusão": "também pode fazer isso
   * arrastando uma carta em cima de outra na mão") - verdadeiro quando ESTA
   * carta específica pode receber outra carta arrastada em cima pra fundir
   * agora (fase de Compra, variante ligada, ainda não fundiu neste turno, e
   * ELA MESMA é uma candidata válida - a elegibilidade da carta ARRASTADA é
   * checada de novo no dispatch, ver handleFuseCards em gameEngine.ts).
   */
  canFuseTarget?: boolean;
  /** Disparado quando outra carta da mão é solta em cima desta (fusão via drag-and-drop) - `droppedCardId` é a carta que estava sendo arrastada. */
  onFuseDrop?: (droppedCardId: string) => void;
  /**
   * FIX (pedido do usuário: "forma rápida com drag n drop de transformar Ás
   * em outro número apenas clicando e arrastando o Ás encima do número 2 a
   * 10") - verdadeiro quando ESTA carta específica (uma numeral 2-10 da mão,
   * fase de Estratégia) pode receber um Ás arrastado em cima para
   * transformá-lo no valor dela, sem precisar abrir o diálogo "Transformar
   * Ás". Mesma elegibilidade que o próprio motor usa em handleTransformAce
   * (gameEngine.ts) para um alvo válido: nunca outro Ás, nunca magia (J/Q/K),
   * nunca Monstro.
   */
  canAceTransformTarget?: boolean;
  /** Disparado quando um Ás não transformado é solto em cima desta carta (transformação via drag-and-drop) - `droppedAceCardId` é o Ás que estava sendo arrastado. */
  onAceTransformDrop?: (droppedAceCardId: string) => void;

  /**
   * QoL da mão (pedido do usuário: "me de mais ideias, melhores" sobre a
   * mão, seguido de "implemente tudo") - ver handQol.ts para a lógica pura
   * por trás de cada uma destas.
   */
  /** Ideia "leque em arco": rotação estática (graus) baseada na posição desta carta na mão exibida - 0 = mão comum, sem leque. */
  arcRotateDeg?: number;
  /** Ideia "leque em arco": deslocamento vertical (px) complementar à rotação, pra cartas nas pontas "descerem" um pouco, como um leque de baralho de verdade. */
  arcLiftPx?: number;
  /** Ideia "linha de fusão ao passar o mouse": preenchido quando OUTRA carta da mão está com o mouse em cima e esta carta fundiria com ela agora - contém o resultado específico desse par (não é genérico "pode fundir", já que qualquer par de numerais pode). */
  fusionPreview?: FusionPartnerPreview;
  /** Reporta início/fim do hover (mouse sobre a carta) pro pai calcular `fusionPreview` das OUTRAS cartas - ver PlayerZone.tsx. Disparado além do tilt 3D já existente (handlePointerEnter/Leave), não no lugar dele. */
  onHoverChange?: (hovering: boolean) => void;
  /** Ideia "destaque temporário nova": true por alguns segundos logo depois desta carta ser comprada. */
  isNew?: boolean;
  /** Ideia "contagem de risco no baralho": rótulo pronto pra mostrar no tooltip ao passar o mouse (ex.: "Restam 2 no baralho"), ou undefined quando não há nada a mostrar (mão da IA etc.). */
  deckRemainingLabel?: string;
  /** Modo Spotlight (pedido do usuário) - números em destaque neste turno, repassado pra PlayingCard.tsx mostrar o selo de palavra-chave (cubo) quando o valor desta carta bate. Ver spotlight.ts. */
  spotlight?: SpotlightState | null;
  /**
   * Modo Reações (pedido do usuário: "as outras cartas na mão do jogador
   * ficam obscurecidas e a carta que pode ser utilizada para reação brilha
   * de forma diferente, destacada") - `undefined` na maior parte do tempo
   * (sem reação pendente pra este jogador agora). `'eligible'` = esta carta
   * pode ser usada pra reagir (mesmo valor da magia anunciada) - `onClick`
   * já chama a reação em vez do comportamento normal (ver PlayerZone.tsx).
   * `'dimmed'` = qualquer outra carta da mão enquanto a decisão está em
   * aberto.
   */
  reactionState?: 'eligible' | 'dimmed';
}

/**
 * HandCardView - uma carta individual na mão do jogador humano.
 *
 * Extraído de PlayerZone.tsx (antes era um `.map()` inline ali mesmo) por uma
 * razão técnica: `useDrag` (react-dnd) é um Hook, e Hooks só podem ser
 * chamados no topo de um componente - nunca dentro de um `.map()` de um
 * componente maior, já que o tamanho da mão muda a cada turno (violaria as
 * "rules of hooks", com número de chamadas de Hook variável entre renders).
 * Ter cada carta como seu próprio componente resolve isso de forma limpa.
 *
 * Duas melhorias de manuseio pedidas pelo usuário vivem aqui:
 * 1) `useDrag` no lugar do drag-and-drop nativo HTML5 (`draggable`/
 *    `dataTransfer`, como era antes em PlayerZone.tsx) - permite o preview
 *    customizado de CardDragLayer.tsx e o destaque de todos os slots válidos
 *    durante o arraste em FieldSlotView.tsx (não só o que está sob o cursor).
 * 2) `layout` do `motion` (framer-motion): quando outra carta é removida da
 *    mão (jogada ou descartada), as cartas restantes deslizam suavemente até
 *    sua nova posição em vez de saltarem instantaneamente. `initial`/`animate`
 *    cobrem a animação de entrada desta própria carta quando ela é comprada.
 *    (Duas tentativas mais ambiciosas foram feitas e revertidas, ambas
 *    confirmadas via teste manual: um `layoutId` compartilhado com
 *    FieldSlotView.tsx para a carta "voar" da mão até o slot, e um `exit`
 *    dentro de `AnimatePresence` para animar a saída ao ser jogada/descartada.
 *    As duas deixavam um nó fantasma (invisível, preso no estado `initial`)
 *    para trás no lugar da carta antiga sempre que ela saía da mão - por
 *    isso a saída (jogar/descartar) é instantânea, como antes desta rodada.)
 * 3) Tilt 3D + brilho seguindo o cursor (pedido do usuário) - ao passar o
 *    mouse, a carta se inclina na direção do cursor (`rotateX`/`rotateY`,
 *    via `useSpring` para suavizar) e um brilho radial acompanha a posição
 *    exata do ponteiro sobre a carta (`useMotionTemplate` monta o
 *    `radial-gradient` a partir de `glowX`/`glowY`). Os dois usam
 *    `MotionValue`s em vez de `useState` de propósito: atualizam a cada
 *    `mousemove` (muito frequente) sem causar um re-render de React por
 *    evento - só o transform/estilo do DOM muda diretamente.
 */
export function HandCardView({
  card,
  phase,
  character,
  themeColor,
  isSelectedForPlay,
  isSelectedForDiscard,
  isSelectedForTower,
  isRejected,
  isEffectFlashing,
  magicCaster,
  magicLabel,
  isAceTransformFlashing,
  isDraggable,
  onClick,
  onDragStart,
  onTransformAce,
  onActivateMagic,
  canActivateMagicNow,
  magicTooltip,
  magicPhase,
  canFuseTarget,
  onFuseDrop,
  canAceTransformTarget,
  onAceTransformDrop,
  arcRotateDeg = 0,
  arcLiftPx = 0,
  fusionPreview,
  onHoverChange,
  isNew,
  deckRemainingLabel,
  spotlight,
  reactionState,
}: HandCardViewProps) {
  const [showHoverInfo, setShowHoverInfo] = useState(false);
  const [{ isDragging }, dragRef] = useDrag<CardDragItem, unknown, { isDragging: boolean }>(
    () => ({
      type: CARD_ITEM_TYPE,
      item: { cardId: card.id, value: card.value, suit: card.suit, card, spinAngle: 0 },
      canDrag: isDraggable,
      collect: (monitor) => ({ isDragging: monitor.isDragging() }),
      // FIX (pedido do usuário: "melhore a detecção de campo para cartas
      // arrastadas/jogadas lá" - "área de detecção pequena/imprecisa em
      // geral") - o ímã visual de CardDragLayer.tsx já mostrava a carta
      // "grudando" no slot válido mais próximo, mas isso nunca teve efeito
      // real na decisão de onde a carta cai: o evento nativo do HTML5 drag-
      // and-drop (`react-dnd-html5-backend`) só registra o drop se o cursor
      // estiver EXATAMENTE em cima do elemento HTML do alvo naquele pixel -
      // sem relação com a posição "puxada" que o jogador vê na tela. Quando
      // o drop nativo falha (`!monitor.didDrop()`), mas o cursor ainda
      // estava dentro do raio do ímã de algum alvo válido (mesma distância
      // usada pra puxar o preview visualmente - ver dropTargetRegistry.ts),
      // este `end()` aciona esse alvo manualmente, tornando o ímã funcional
      // de verdade e não só cosmético.
      end: (item, monitor) => {
        if (monitor.didDrop()) return;
        // FIX (bug encontrado ao investigar o offset da carta arrastada -
        // ver comentário completo em CardDragLayer.tsx): `getClientOffset()`
        // já é a posição do PONTEIRO em si, que é onde o CENTRO da carta é
        // desenhado (CardDragLayer.tsx centraliza o preview exatamente
        // nela) - somar CARD_DRAG_W/H/2 aqui deslocava o "centro" usado pelo
        // ímã de fallback pra bem longe do centro visual de verdade que o
        // jogador vê na tela, na mesma direção e proporção do bug relatado.
        const cardCenter = monitor.getClientOffset();
        if (!cardCenter) return;
        const target = findNearestDropTarget(cardCenter, CARD_SNAP_RADIUS, item);
        target?.onDrop(item);
      },
    }),
    [isDraggable, card]
  );

  // FIX (pedido do usuário, variante "Fusão", depois estendido para
  // "forma rápida com drag n drop de transformar Ás"): esta carta também é
  // um alvo de drop (não só uma origem de arraste) - aceita OU outra carta
  // da mão solta em cima dela pra fundir as duas, OU um Ás (transformado ou
  // não) solto em cima dela pra ser (re)transformado no valor dela. As duas
  // interações nunca colidem na prática (Fusão só na fase de Compra,
  // Transformar Ás só na de Estratégia - ver canFuseTarget/
  // canAceTransformTarget, calculados em PlayerZone.tsx), mas o item
  // arrastado decide qual das duas se aplica: um Ás AINDA NÃO transformado
  // (`value === 'A' && transformedValue === undefined` - ver FIX abaixo,
  // "remova a possibilidade de re-transformar Ás") sempre significa
  // transformação; qualquer outra carta (inclusive um Ás JÁ transformado -
  // ele não pode mais ser transformado de novo, mas continua uma carta
  // numeral comum pra todo o resto) sempre significa fusão (nenhum Ás jamais
  // entra numa fusão normal de qualquer forma - ver isPlainNumeralCard).
  // `item.cardId !== card.id` evita (defensivamente) soltar uma carta em
  // cima dela mesma.
  //
  // FIX (pedido do usuário: "remova a possibilidade de re-transformar Ás
  // que você fez, depois que transforma uma vez, não é pra poder
  // re-transformar em outra carta") - reverte um pedido ANTERIOR que
  // deliberadamente permitia re-transformar (ver o comentário ainda mais
  // antigo removido daqui e do handleTransformAce/gameEngine.ts, que dizia
  // "pode ser re-transformado quantas vezes o jogador quiser"). Antes,
  // `isDraggedAce` checava só `value === 'A'`, então arrastar um Ás JÁ
  // transformado pra cima de outra carta ainda disparava o fluxo de
  // transformação (o motor até já rejeitava a ação de verdade - `nunca
  // confiar só na UI` -, mas a UI convidava pro drop com o anel verde, sem
  // efeito nenhum ao soltar). Agora só um Ás CRU conta como origem de
  // transformação; um já transformado cai no branch de Fusão como qualquer
  // carta comum (que o motor também recusa corretamente, já que Ás nunca
  // participa de fusão normal - isPlainNumeralCard).
  const [{ isCardDropOver, canDropNow }, cardDropRef] = useDrop<CardDragItem, unknown, { isCardDropOver: boolean; canDropNow: boolean }>(
    () => ({
      accept: CARD_ITEM_TYPE,
      canDrop: (item) => {
        if (item.cardId === card.id) return false;
        const isUntransformedDraggedAce = item.card?.value === 'A' && item.card?.transformedValue === undefined;
        return isUntransformedDraggedAce ? Boolean(canAceTransformTarget) : Boolean(canFuseTarget);
      },
      drop: (item) => {
        const isUntransformedDraggedAce = item.card?.value === 'A' && item.card?.transformedValue === undefined;
        if (isUntransformedDraggedAce) onAceTransformDrop?.(item.cardId);
        else onFuseDrop?.(item.cardId);
      },
      collect: (monitor) => ({ isCardDropOver: monitor.isOver(), canDropNow: monitor.canDrop() }),
    }),
    [canFuseTarget, canAceTransformTarget, card.id, onFuseDrop, onAceTransformDrop]
  );

  // Dispara o equivalente ao antigo `onDragStart` nativo (seleciona a carta
  // assim que o arraste começa, para o painel "Posicionar/Horizontal" de
  // PlayerZone.tsx já aparecer durante o arraste, não só depois de soltar).
  useEffect(() => {
    if (isDragging) onDragStart?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragging]);

  // Tilt 3D + brilho seguindo o cursor (item 3 - "deixe os efeitos o mais
  // impressionantes possíveis, estão mt sutis"). `useSpring` sobre os
  // ângulos deixa o movimento "atrasar" suavemente atrás do cursor em vez de
  // grudar nele. Ângulo máximo mais que dobrado (10 -> 24deg).
  //
  // FIX (pedido do usuário: "remova o efeito de aumentar o tamanho da carta
  // quando dá hover na mão, troque por outro que não cause isso") - o
  // aumento de escala (`liftScale`, chegava a 1.14x) crescia o retângulo
  // TRANSFORMADO da carta além dos limites da linha da mão
  // (`overflow-x-auto` em PlayerZone.tsx); como a "scrollable overflow area"
  // de um container CSS considera o bounding box já transformado dos
  // descendentes, isso fazia o scroll horizontal da mão pular/aparecer
  // sozinho a cada hover perto da borda, mesmo sem nenhuma carta nova
  // entrar - exatamente o comportamento relatado. Trocado por um levantar
  // vertical (`liftY`, translateY) + sombra mais forte: dá a mesma sensação
  // de "a carta subiu na direção do cursor" sem alterar a largura ocupada
  // pela carta, então nunca contribui pro scrollWidth da mão.
  const MAX_TILT_DEG = 24;
  const rotateX = useSpring(0, { stiffness: 260, damping: 20, mass: 0.5 });
  const rotateY = useSpring(0, { stiffness: 260, damping: 20, mass: 0.5 });
  const liftY = useSpring(0, { stiffness: 260, damping: 20 });
  const glowX = useMotionValue(50);
  const glowY = useMotionValue(50);
  const glowOpacity = useSpring(0, { stiffness: 260, damping: 26 });
  const glowBackground = useMotionTemplate`radial-gradient(circle at ${glowX}% ${glowY}%, rgba(255,255,255,0.7), transparent 65%)`;

  const handlePointerMove = (e: MouseEvent<HTMLDivElement>) => {
    if (isDragging) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    rotateY.set((px - 0.5) * MAX_TILT_DEG * 2);
    rotateX.set((0.5 - py) * MAX_TILT_DEG * 2);
    glowX.set(px * 100);
    glowY.set(py * 100);
  };
  const handlePointerEnter = () => {
    if (!isDragging) {
      glowOpacity.set(1);
      liftY.set(-14);
      setShowHoverInfo(true);
      onHoverChange?.(true);
    }
  };
  const handlePointerLeave = () => {
    rotateX.set(0);
    rotateY.set(0);
    glowOpacity.set(0);
    liftY.set(0);
    setShowHoverInfo(false);
    onHoverChange?.(false);
  };

  // FIX (pedido do usuário: "cartas reveladas, na fase de compra, não
  // aparecem mais obscurecidas") - causa raiz: `opacity-60`/`opacity-70`
  // eram classes Tailwind, mas o PRÓPRIO `motion.div` já define `opacity`
  // via o `animate` abaixo (para o fade de entrada/saída da carta) - o
  // `style` inline que o Framer Motion aplica no DOM sempre tem
  // especificidade MAIOR que uma classe CSS, então esse `animate={{opacity:
  // isDragging ? 0 : 1, ...}}` sempre "ganhava" e sobrescrevia silenciosamente
  // qualquer opacidade vinda de classe - a carta selecionada para descarte
  // (opacity-70) e a revelada na fase de Compra (opacity-60) nunca
  // conseguiam de fato ficar semi-transparentes, não importa o que a classe
  // dissesse. Corrigido incluindo esses casos no PRÓPRIO valor animado, na
  // mesma prioridade que a classe já expressava (arrastando > selecionada
  // pro descarte > revelada na Compra > normal).
  const targetOpacity = isDragging ? 0 : isSelectedForDiscard ? 0.7 : card.revealed && phase === 'draw' ? 0.6 : 1;

  return (
    <motion.div
      ref={(node) => {
        dragRef(node);
        cardDropRef(node);
      }}
      data-card-id={card.id}
      data-card-drop-target={canFuseTarget || canAceTransformTarget ? 'true' : undefined}
      layout
      initial={{ opacity: 0, y: -36, scale: 0.7 }}
      // FIX (pedido do usuário: "a carta não tira quando atirada") - antes
      // ficava a 25% de opacidade na mão durante o arraste, o que lia como
      // "duas cartas" (uma fantasma na mão + o preview voando em
      // CardDragLayer.tsx). Agora ela some de vez (opacity 0) da mão assim
      // que o arraste começa - só o preview que segue o cursor fica visível,
      // reforçando que a carta realmente "saiu" da mão para ser jogada.
      animate={{
        opacity: reactionState === 'dimmed' ? 0.3 : targetOpacity,
        y: arcLiftPx,
        scale: reactionState === 'eligible' ? 1.06 : 1,
        rotate: arcRotateDeg,
        filter: reactionState === 'dimmed' ? 'grayscale(1) brightness(0.5)' : 'none',
      }}
      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
      onClick={onClick}
      onMouseMove={handlePointerMove}
      onMouseEnter={handlePointerEnter}
      onMouseLeave={handlePointerLeave}
      className={`flex-shrink-0 relative select-none ${isDraggable ? 'cursor-grab active:cursor-grabbing' : ''} ${isNew ? 'animate-new-card-glow' : ''} ${
        // Modo Reações (pedido do usuário: "a carta que pode ser utilizada
        // para reação brilha de forma diferente, destacada" / "as outras
        // ficam obscurecidas") - `eligible` ganha um anel pulsante dourado
        // por cima de QUALQUER outro destaque (seleção, fusão etc. não fazem
        // sentido enquanto o jogo está pausado esperando esta decisão);
        // `dimmed` perde a interação por completo (`pointer-events-none`) -
        // clicar nelas não faria nada mesmo (o motor bloqueia toda ação que
        // não seja a própria reação), então nem oferece o cursor de clique.
        reactionState === 'eligible'
          ? 'ring-4 ring-[#F2C94C] rounded-lg shadow-xl animate-pulse cursor-pointer'
          : reactionState === 'dimmed'
          ? 'pointer-events-none'
          : ''
      } ${
        isSelectedForTower
          ? 'ring-4 ring-[#7AA7C4] rounded-lg shadow-xl'
          : isSelectedForPlay
          ? 'ring-4 rounded-lg shadow-xl'
          : isSelectedForDiscard
          ? 'ring-4 ring-[#D45D4A] rounded-lg'
          : phase === 'strategy'
          ? (card.value === 'J' || card.value === 'Q' || card.value === 'K' ? '' : 'cursor-pointer hover:shadow-lg')
          : phase === 'draw' && !card.revealed
          ? 'cursor-pointer hover:shadow-lg'
          : card.revealed && phase === 'draw'
          ? 'cursor-not-allowed'
          : ''
      } ${
        // FIX (pedido do usuário, variante "Fusão", depois estendido para o
        // drag-and-drop de Transformar Ás): destaque ao arrastar uma carta
        // em cima desta (fusão na fase de Compra, ou um Ás na fase de
        // Estratégia) - mesma linguagem visual (anel verde) já usada nos
        // slots de campo/Zona Monstro para "solte aqui" válido.
        isCardDropOver && canDropNow
          ? 'ring-4 ring-[#6CC47A] rounded-lg scale-105'
          : fusionPreview
          ? 'ring-4 rounded-lg shadow-lg'
          : canFuseTarget || canAceTransformTarget
          ? 'ring-2 ring-dashed ring-[#C59E4F]/50 rounded-lg'
          : ''
      }`}
      style={{
        '--tw-ring-color': isSelectedForPlay ? themeColor : fusionPreview ? fusionPreview.color : undefined,
        animation: isRejected ? 'shake 0.4s ease-in-out' : undefined,
        perspective: 700,
      } as CSSProperties}
    >
      {/* Tilt 3D (item 3): só este wrapper interno gira com o mouse - o
          motion.div externo continua cuidando só de layout/posição/drag,
          então o tilt não briga com as outras animações (pop-in, drag). */}
      <motion.div
        className="relative"
        style={{ rotateX, rotateY, y: liftY, transformStyle: 'preserve-3d', filter: `drop-shadow(0 14px 12px rgba(0,0,0,0.5))` }}
      >
        <PlayingCard
          value={card.value}
          suit={card.suit}
          card={card}
          phase={phase}
          isInHand={true}
          playerCharacter={character}
          onTransformAce={onTransformAce}
          onActivateMagic={onActivateMagic}
          canActivateMagic={canActivateMagicNow}
          magicTooltip={magicTooltip}
          magicPhase={magicPhase}
          spotlight={spotlight}
        />
        {/* Brilho seguindo o cursor (item 3) - acompanha a posição exata do
            mouse sobre a carta via `glowBackground` (MotionValue, sem
            re-render de React por movimento do mouse). */}
        <motion.div
          className="absolute inset-0 rounded-lg pointer-events-none mix-blend-overlay"
          style={{ opacity: glowOpacity, background: glowBackground }}
        />
      </motion.div>
      <CharacterMagicBurst active={isEffectFlashing} character={magicCaster ?? character} />
      <MagicCalloutLabel active={isEffectFlashing} text={magicLabel} character={magicCaster} />
      <AceTransformBurst active={Boolean(isAceTransformFlashing)} finalValue={card.transformedValue} />
      <CardRejectFlash active={isRejected} />
      {/* Ideia "linha de fusão ao passar o mouse": badge flutuante mostrando
          o resultado ESPECÍFICO de fundir com a carta atualmente sob o
          mouse (ver getFusionPartnerPreviews em handQol.ts) - só aparece
          nas OUTRAS cartas parceiras, nunca na que está sendo sobrevoada. */}
      {fusionPreview && (
        <div
          className="absolute -top-3 left-1/2 z-20 -translate-x-1/2 rounded-full px-2 py-0.5 whitespace-nowrap pointer-events-none"
          style={{
            backgroundColor: fusionPreview.color,
            border: '2px solid #0F1113',
            boxShadow: '0 2px 8px rgba(0,0,0,0.6)',
            color: '#0F1113',
          }}
        >
          <span className="text-[11px] font-bold">{fusionPreview.label}</span>
        </div>
      )}
      {/* Ideia "contagem de risco no baralho": painel simples ao passar o
          mouse na PRÓPRIA carta (não usa Tooltip do Radix pra não competir
          com o badge acima, que precisa aparecer em VÁRIAS cartas ao mesmo
          tempo enquanto só uma está sob o mouse). */}
      {showHoverInfo && deckRemainingLabel && (
        <div
          className="absolute -top-7 left-1/2 z-30 -translate-x-1/2 rounded px-2 py-1 whitespace-nowrap pointer-events-none border"
          style={{ backgroundColor: '#1E1A16', borderColor: '#C59E4F80' }}
        >
          <span className="text-[10px] text-[#EFE7D6]">{deckRemainingLabel}</span>
        </div>
      )}
    </motion.div>
  );
}
