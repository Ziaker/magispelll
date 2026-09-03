import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { useDrop } from 'react-dnd';
import { PlayingCard } from './PlayingCard';
import { FlipCard } from './FlipCard';
import { CharacterMagicBurst } from './CharacterMagicBurst';
import { MagicCalloutLabel } from './MagicCalloutLabel';
import { CardShatterBurst } from './CardShatterBurst';
import { FireShatterBurst } from './FireShatterBurst';
import { CoringaSmokeBurst } from './CoringaSmokeBurst';
import { CardImpactBurst } from './CardImpactBurst';
import { CardKeywords } from './CardKeywords';
import { getDisplayValue, type Card } from '../lib/cardUtils';
import type { FieldSlot, CharacterId } from '../lib/gameEngine';
import { isTowerSlot, isBrotoSlot } from '../lib/gameEngine';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { CARD_ITEM_TYPE, type CardDragItem } from '../lib/dnd';
import { registerDropTarget, unregisterDropTarget } from '../lib/dropTargetRegistry';
import { soundManager } from '../lib/soundManager';
import type { CharacterTheme } from '../lib/characterThemes';
import { getSpotlightAdjustedValue, getSpotlightEntry, type SpotlightState } from '../lib/spotlight';

/**
 * FIX (pedido do usuário: "adicione este som quando a carta aterrisa no
 * campo" + "efeitos de impacto quando a carta é posicionada, embaixo dela";
 * depois revisado: "volte atrás com o som, remova e troque por um som
 * genérico de carta" - o som customizado foi removido; 'card-flip' já
 * existia na biblioteca de efeitos e serve bem como o "baque" genérico de
 * pouso) - atraso (ms) até tocar o som e mostrar o CardImpactBurst depois que
 * uma carta NOVA nasce num slot, sincronizado com o instante em que ela
 * VISUALMENTE bate no chão (o momento de maior achatamento do próprio
 * squash & stretch - 2º keyframe de MAIN_LANDING_TRANSITION/
 * HORIZONTAL_LANDING_TRANSITION abaixo, em `duration * times[1]`), não com o
 * instante em que o estado muda - vale tanto pra jogada humana quanto da IA.
 *
 * FIX (pedido do usuário: "remova o efeito para cartas horizontais") - o
 * CardImpactBurst (o efeito VISUAL) só é mostrado na carta PRINCIPAL de um
 * slot agora - horizontais continuam tocando o som de pouso (`triggerSoundOnly`
 * abaixo), só sem o quadrado.
 */
const MAIN_IMPACT_DELAY_MS = 0.45 * 420; // 189ms - times[1] * duration (em ms) de MAIN_LANDING_TRANSITION (instante do pouso)
const HORIZONTAL_IMPACT_DELAY_MS = 0.45 * 340; // 153ms - idem para HORIZONTAL_LANDING_TRANSITION
const IMPACT_VISUAL_MS = 450; // cobre a duração do quadrado (CardImpactBurst.tsx, 0.45s) com folga mínima

// FIX (bug reproduzido pelo usuário: "o squash & stretch está fazendo a
// carta sumir e aparecer"): esses objetos de animação estavam sendo criados
// como literais NOVOS a cada render de FieldSlotView (ex.: JSX inline
// `animate={{ ... scaleX: [0.35, 1.45, ...] }}`). GameBoard.tsx re-renderiza
// com muita frequência (qualquer dispatch, o polling da IA, toasts de log),
// e o Framer Motion trata um array de keyframes com uma referência NOVA como
// um alvo de animação diferente do anterior - mesmo com os MESMOS valores -
// reiniciando a animação de "pouso" do zero a cada re-render, o que lido
// rápido demais parece a carta "piscando"/sumindo. Definidos aqui como
// constantes de módulo (fora do componente), eles têm a MESMA referência em
// todo render, então o Framer Motion não os reinicia à toa - só tocam de
// verdade quando o `key` do card muda (carta nova de fato).
//
// FIX (pedido do usuário: "corrija isso da carta desaparecer durante seus
// efeitos de ser colocada no campo") - a correção acima resolveu o
// REINÍCIO indevido da animação, mas a animação em si ainda tinha
// `opacity: 0` como ponto de partida: mesmo rodando só uma vez, do jeito
// certo, a carta começava INVISÍVEL e só ficava visível aos poucos - somado
// ao achatamento extremo do squash (`scaleX: 0.35`, quase uma linha vertical)
// bem no início, o efeito combinado lia como "a carta sumiu e depois
// materializou", não como uma queda contínua. A carta agora entra sempre
// com `opacity: 1` (nunca invisível, em nenhum momento da animação) - só a
// FORMA (achatar/esticar) e a POSIÇÃO (caindo de cima) animam, preservando o
// impacto/quique do squash & stretch sem nunca "apagar" a carta.
// FIX (pedido do usuário: "remova o squash & stretch do jogo ou arrume pra
// que só ocorra no segundo que a carta se posicionar no campo e só faça
// ocorrer no momento que chega. Inclusive faça com que o posicionamento da
// carta seja mais rápido ao invés dessa descida lenta") - antes a carta
// nascia JÁ deformada (scaleX 0.35, quase uma linha vertical) e passava a
// descida inteira se contorcendo, num total de 0.75s. Agora a queda é curta
// e SEM deformação nenhuma (escala 1 o tempo todo até encostar), e o squash &
// stretch só existe DEPOIS do impacto: achata no toque, dá um repique menor e
// assenta. `times` marca o instante do pouso (0.45) - é o mesmo ponto usado
// por MAIN_IMPACT_DELAY_MS abaixo pra sincronizar som e CardImpactBurst.
const MAIN_LANDING_INITIAL = { opacity: 1, scaleX: 1, scaleY: 1, y: -90 };
const MAIN_LANDING_ANIMATE = {
  y: [-90, 0, 0, 0, 0],
  scaleX: [1, 1, 1.22, 0.95, 1],
  scaleY: [1, 1, 0.78, 1.04, 1],
};
const MAIN_LANDING_TRANSITION = { duration: 0.42, ease: 'easeIn' as const, times: [0, 0.45, 0.62, 0.82, 1] };

const HORIZONTAL_LANDING_INITIAL = { opacity: 1, scaleX: 1, scaleY: 1, y: -50 };
const HORIZONTAL_LANDING_ANIMATE = {
  y: [-50, 0, 0, 0, 0],
  scaleX: [1, 1, 1.18, 0.96, 1],
  scaleY: [1, 1, 0.82, 1.03, 1],
};
const HORIZONTAL_LANDING_TRANSITION = { duration: 0.34, ease: 'easeIn' as const, times: [0, 0.45, 0.64, 0.84, 1] };

// Mesma razão do bug acima: mantém referência estável entre renders para a
// flutuação em loop de combate (item 2) não reiniciar/soluçar a cada
// re-render do GameBoard enquanto `isCombatSelected` permanece true.
const COMBAT_FLOAT_ANIMATE = { y: [0, -34, -29, -34, 0], rotate: [0, -4, 4, -3, 0], scale: 1.14 };
const COMBAT_FLOAT_TRANSITION = {
  y: { duration: 1.5, repeat: Infinity, ease: 'easeInOut' as const },
  rotate: { duration: 1.5, repeat: Infinity, ease: 'easeInOut' as const },
  scale: { duration: 0.25, ease: 'easeOut' as const },
};
const COMBAT_FLOAT_REST_ANIMATE = { y: 0, rotate: 0, scale: 1 };
const COMBAT_FLOAT_REST_TRANSITION = { duration: 0.25, ease: 'easeOut' as const };

/**
 * Modo Towers (pedido do usuário, ideia "cor por tamanho de torre") - a cor
 * do brilho/selo/partículas esquenta conforme a torre cresce (azul -> roxo
 * -> dourado), pra uma torre grande se destacar mais que uma recém-formada
 * de 2 cartas só de bater o olho, sem precisar ler o número no selo.
 * `soft`/`strong` alimentam as duas pontas do pulso de `tower-glow-pulse`
 * (globals.css); `ring` é usada em tudo que precisa de uma cor sólida
 * (borda, selo, partículas, textura do flourish).
 */
function towerGlowColor(cardCount: number): { ring: string; soft: string; strong: string } {
  if (cardCount >= 5) {
    return { ring: '#C59E4F', soft: 'rgba(197, 158, 79, 0.45)', strong: 'rgba(197, 158, 79, 0.9)' };
  }
  if (cardCount >= 3) {
    return { ring: '#9B7AC4', soft: 'rgba(155, 122, 196, 0.45)', strong: 'rgba(155, 122, 196, 0.9)' };
  }
  return { ring: '#7AA7C4', soft: 'rgba(122, 167, 196, 0.45)', strong: 'rgba(122, 167, 196, 0.85)' };
}

// Posição horizontal (%) e atraso (s) de cada fagulha ambiente - fixos (não
// `Math.random()` a cada render) pra não reiniciar/tremular a cada
// re-render do GameBoard, mesma razão dos objetos de animação acima.
const TOWER_PARTICLES = [
  { left: '18%', delay: '0s' },
  { left: '48%', delay: '0.9s' },
  { left: '78%', delay: '1.7s' },
];

/**
 * Efeitos de status contínuos (pedido do usuário: "mais efeitos visuais nas
 * magias... mais auras e efeitos como você fez nas torres, por exemplo, na
 * coringa da besta quando a carta está sob o efeito de valer o dobro,
 * mostrar um x2 e partículas contínuas vermelhas") - cores fixas por status
 * (diferente da torre, cuja cor MUDA com o tamanho - aqui cada efeito tem
 * seu próprio significado, então a cor precisa ser sempre a mesma pra ser
 * reconhecível): vermelho (Besta) pra "dobrado", azul arcano (Mago) pra
 * "reforçado" pela Ilusão Arcana, dourado (Anjo) pra "protegido" pela
 * Proteção Divina - a mesma cor já usada pelo tema de cada personagem
 * (characterThemes.ts), pra reforçar de quem é o efeito só pela cor.
 */
const STATUS_COLORS = {
  doubled: { ring: '#D45D4A', soft: 'rgba(212, 93, 74, 0.45)', strong: 'rgba(212, 93, 74, 0.9)' },
  reinforced: { ring: '#4A90E2', soft: 'rgba(74, 144, 226, 0.45)', strong: 'rgba(74, 144, 226, 0.9)' },
  protected: { ring: '#E2B84A', soft: 'rgba(226, 184, 74, 0.45)', strong: 'rgba(226, 184, 74, 0.9)' },
  // Mosqueteiro - Tiro Certeiro (pedido do usuário): mesmo cinza-aço do tema
  // do personagem (ver characterThemes.ts).
  boosted: { ring: '#8C9199', soft: 'rgba(140, 145, 153, 0.45)', strong: 'rgba(140, 145, 153, 0.9)' },
  // FIX (pedido do usuário, Modo Spotlight: "adicione um efeito de spotlight
  // nessas cartas, um verde para spotlights positivos e vermelho para
  // negativos") - verde (vale 3x mais) e vermelho (valor fixo em 1), mesmo
  // sistema de aura+partículas contínuas já usado acima (dobrado/reforçado/
  // protegido) - ver spotlightPositive/spotlightNegative mais abaixo.
  spotlightPositive: { ring: '#6CC47A', soft: 'rgba(108, 196, 122, 0.45)', strong: 'rgba(108, 196, 122, 0.9)' },
  spotlightNegative: { ring: '#D45D4A', soft: 'rgba(212, 93, 74, 0.35)', strong: 'rgba(212, 93, 74, 0.75)' },
  // Druida (personagem novo, pedido do usuário: "marcador verde com ícone de
  // broto") - mesmo verde do tema do personagem (characterThemes.ts).
  broto: { ring: '#0F8A19', soft: 'rgba(15, 138, 25, 0.45)', strong: 'rgba(15, 138, 25, 0.9)' },
} as const;

const STATUS_PARTICLES_2 = [
  { left: '30%', delay: '0.3s' },
  { left: '65%', delay: '1.2s' },
];

interface FieldSlotViewProps {
  playerNumber: 1 | 2;
  slotIndex: number;
  slot: FieldSlot;
  theme: CharacterTheme;
  isAiField: boolean;
  isSelected: boolean;
  isCombatSelected: boolean;
  isMonsterTargetChoice: boolean;
  isEffectFlashing: boolean;
  /**
   * Piromante (personagem novo, pedido do usuário: "as magias do piromante
   * mal tem efeitos visuais, especialmente quanto a cartas queimar") - ids
   * das cartas HORIZONTAIS deste slot que acabaram de ser alvo de uma magia
   * (ex.: Queima do Reforço, que sempre mira uma horizontal do oponente, e
   * às vezes o Roubo Flamejante) - `isEffectFlashing` acima já cobre a carta
   * PRINCIPAL/o slot inteiro, mas nunca cobria uma horizontal específica
   * (que nem chegava a receber highlight nenhum antes deste FIX). Mesma
   * lista (`effectFlashCardIds`) que PlayerZone.tsx já usa pra cartas na
   * mão - GameBoard.tsx é a única fonte de verdade de quais ids estão
   * "em chamas" agora.
   */
  effectFlashCardIds?: string[];
  protectedSlot: boolean;
  phase: 'draw' | 'strategy' | 'combat';
  onSlotClick: (playerNumber: 1 | 2, slotIndex: number) => void;
  onSlotDoubleClick?: (playerNumber: 1 | 2, slotIndex: number) => void;
  onCardDrop?: (playerNumber: 1 | 2, slotIndex: number, cardId: string, asHorizontal: boolean) => void;
  /** Ver comentário completo em BattleField.tsx - atalho de arrastar-e-soltar pra ativar magias de alvo único. */
  onMagicCardDrop?: (playerNumber: 1 | 2, slotIndex: number, cardId: string) => void;
  isMagicDropTarget?: (playerNumber: 1 | 2, slotIndex: number, card: Card) => boolean;
  onRemoveHorizontalCard?: (playerNumber: 1 | 2, slotIndex: number, cardId: string) => void;
  /** Personagem de quem ativou a magia/efeito de Monstro atualmente em exibição neste slot, e o nome dela - ver BattleField.tsx. */
  activeMagicCaster?: CharacterId | null;
  activeMagicLabel?: string | null;
  /** FIX (pedido do usuário, item 5): verdadeiro quando ESTE slot acabou de ser destruído pela Destruição de Reforço do Mago - troca o burst mágico genérico por CardShatterBurst.tsx (estilhaços). Ver BattleField.tsx/GameBoard.tsx. */
  isShattering?: boolean;
  /** Coringa (redesenho completo, "armadilhas"): verdadeiro quando ESTE slot acabou de ter um Valete/Rei armadilha reagindo (dissipando em fumaça) - troca o burst mágico genérico por CoringaSmokeBurst.tsx. Ver BattleField.tsx/GameBoard.tsx. */
  isSmoking?: boolean;
  /** Piromante (personagem novo, pedido explícito do usuário: "carta pegando fogo e se despedaçando") - verdadeiro quando ESTE slot acabou de ser atingido por um lançamento da Bola de Fogo (obliterado ou reduzido a carta-token) - troca o burst mágico genérico por FireShatterBurst.tsx. Ver BattleField.tsx/GameBoard.tsx. */
  isBurning?: boolean;
  /** Efeitos de status contínuos (pedido do usuário): id da carta (principal OU horizontal, deste MESMO jogador) atualmente sob a Fúria Selvagem da Besta - ver BattleField.tsx/GameBoard.tsx (`monsterTargetCardId`). */
  doubledCardId?: string;
  /** Mosqueteiro (personagem novo) - id da carta (principal OU horizontal, deste MESMO jogador) reforçada pelo Tiro Certeiro (Rei), e o valor extra que ela recebe - ver BattleField.tsx/GameBoard.tsx (`mosqueteiroBoostedCardId`). */
  boostedCardId?: string;
  boostAmount?: number;
  /**
   * Modo Spotlight (pedido do usuário) - números em destaque neste turno,
   * `undefined`/`null` quando o modo está desligado. Repassado pra
   * PlayingCard.tsx (selo de palavra-chave na carta principal) e usado aqui
   * mesmo pra ajustar o total exibido de uma Torre (Modo Towers) - ver
   * spotlight.ts.
   */
  spotlight?: SpotlightState | null;
}

/**
 * FieldSlotView - um slot do campo (carta principal + reforços horizontais).
 *
 * Extraído de BattleField.tsx (antes era um `.map()` inline dentro de
 * `renderField`) pela mesma razão de HandCardView.tsx: `useDrop` (react-dnd) é
 * um Hook e não pode ser chamado dentro de um `.map()` de outro componente -
 * precisa ser o topo de SEU PRÓPRIO componente.
 *
 * Duas melhorias pedidas pelo usuário vivem aqui:
 * 1) `useDrop` no lugar do `onDragOver`/`onDrop` nativos - além de resolver o
 *    problema de Hooks acima, `monitor.canDrop()` fica verdadeiro durante
 *    TODO o arraste de uma carta válida (não só quando o cursor já está
 *    exatamente em cima deste slot), o que permite destacar TODOS os slots
 *    onde a carta pode ser solta assim que o arraste começa - não só reagir
 *    depois que o cursor já chegou em cima de um deles.
 * 2) `FlipCard` no lugar da troca instantânea `faceUp ? <PlayingCard/> :
 *    <PlayingCard faceDown/>` - a carta agora vira em 3D (rotateY) no momento
 *    em que é revelada (combate, magia, Ás transformado etc.), com um
 *    "pop-in" (`initial`/`animate` do `motion`, chaveado por `card.id`) ao ser
 *    posicionada aqui pela primeira vez ou trocada, em vez de aparecer de
 *    supetão.
 */
export function FieldSlotView({
  playerNumber,
  slotIndex: i,
  slot,
  theme,
  isAiField,
  isSelected,
  isCombatSelected,
  isMonsterTargetChoice,
  isEffectFlashing,
  protectedSlot,
  phase,
  onSlotClick,
  onSlotDoubleClick,
  onCardDrop,
  onMagicCardDrop,
  isMagicDropTarget,
  onRemoveHorizontalCard,
  activeMagicCaster,
  activeMagicLabel,
  isShattering,
  isSmoking,
  isBurning,
  effectFlashCardIds,
  doubledCardId,
  boostedCardId,
  boostAmount,
  spotlight,
}: FieldSlotViewProps) {
  const canClick = phase === 'strategy' || phase === 'combat';
  const hasHorizontal = slot.horizontalCards.length > 0;
  const mainFaceUp = slot.revealed || slot.faceDownCard?.revealed === true;
  // Modo Towers (pedido do usuário): este slot é uma torre quando tem
  // reserva empilhada abaixo do topo (`faceDownCard`) - sempre revelada, por
  // regra (ver isTowerSlot/FieldSlot.towerReserve em gameEngine.ts).
  const hasTower = isTowerSlot(slot);
  const towerCardCount = (slot.towerReserve?.length ?? 0) + (slot.faceDownCard ? 1 : 0);
  // FIX (pedido do usuário, Modo Spotlight, "tudo que usa o valor da
  // carta"): `getSpotlightAdjustedValue` no lugar de `getEffectiveCardValue`
  // - o total exibido da Torre já reflete o bônus/penalidade de qualquer
  // carta spotlighted empilhada nela, igual ao motor já soma de verdade em
  // handleResolveCombat (gameEngine.ts).
  const towerTotalValue =
    (slot.towerReserve ?? []).reduce((sum, c) => sum + getSpotlightAdjustedValue(c, spotlight), 0) +
    (slot.faceDownCard ? getSpotlightAdjustedValue(slot.faceDownCard, spotlight) : 0);
  const towerGlow = towerGlowColor(towerCardCount);
  const canDropHere = Boolean(onCardDrop) && phase === 'strategy' && !isAiField;

  // Fúria Selvagem da Besta (pedido do usuário: "mostrar um x2 e partículas
  // contínuas vermelhas"): a carta dobrada pode ser a principal do slot OU
  // uma horizontal específica - `doubledCardId` já vem filtrado por
  // jogador (ver BattleField.tsx), só falta achar QUAL das duas é.
  const isMainDoubled = Boolean(doubledCardId && slot.faceDownCard?.id === doubledCardId);
  const doubledHorizontal = doubledCardId ? slot.horizontalCards.find((c) => c.id === doubledCardId) : undefined;

  // Mosqueteiro - Tiro Certeiro (pedido do usuário: mesmo tratamento visual
  // do "x2" da Fúria Selvagem acima, com um selo "+N" em vez de multiplicar).
  const isMainBoosted = Boolean(boostedCardId && slot.faceDownCard?.id === boostedCardId);
  const boostedHorizontal = boostedCardId ? slot.horizontalCards.find((c) => c.id === boostedCardId) : undefined;

  // Ilusão Arcana do Mago: reforça o valor da carta PRINCIPAL copiando o de
  // outra já revelada (handleExecuteMagoMonsterEffect em gameEngine.ts,
  // via `transformedValue` na própria carta numeral - nunca a horizontal).
  // Só é "reforço" quando NÃO é um Ás transformado (que usa o mesmo campo
  // pra um propósito totalmente diferente) - `card.value !== 'A'` distingue
  // os dois casos sem precisar de nenhum estado extra.
  // FIX (Druida, personagem novo, achado testando ao vivo no navegador): o
  // Broto TAMBÉM reaproveita `transformedValue` (pro próprio valor
  // acumulado, nunca copiado de outra carta) - sem esta exclusão, o selo
  // "🔮 Ilusão Arcana" (com a cor azul do Mago) aparecia sobre o Broto de
  // QUALQUER Druida, mesmo numa partida sem Mago nenhum, insinuando um
  // reforço que nunca aconteceu.
  const isMainReinforced = Boolean(
    slot.faceDownCard &&
      !slot.faceDownCard.isMonster &&
      slot.faceDownCard.value !== 'A' &&
      slot.faceDownCard.transformedValue !== undefined &&
      !isBrotoSlot(slot)
  );

  // Modo Spotlight (pedido do usuário: "adicione um efeito de spotlight
  // nessas cartas, um verde para spotlights positivos e vermelho para
  // negativos na carta") - mesma aura+partículas contínuas de
  // dobrado/reforçado/protegido acima, só a cor muda com a polaridade.
  //
  // FIX (disciplina de informação já aplicada no Modo Reações -
  // ver PlayerZone.tsx/reactionState): diferente de "dobrado"/"reforçado"
  // (que só sinalizam um multiplicador, sem dizer QUAL valor a carta tem),
  // o Spotlight aponta um número específico - um brilho nessa cor antes da
  // carta ser revelada contaria pro oponente exatamente qual valor ela tem.
  // Só mostra depois de `revealed === true`, quando o valor já não é mais segredo.
  const mainSpotlightEntry = slot.faceDownCard?.revealed ? getSpotlightEntry(slot.faceDownCard, spotlight) : null;

  // Modo Towers (pedido do usuário, ideia "animação de formação/reforço
  // maior"): dispara o flourish (anel expandindo, ver `.animate-tower-flourish`
  // em globals.css) só quando `towerCardCount` REALMENTE sobe entre renders -
  // não no primeiro render (senão qualquer torre já existente "flourisharia"
  // ao simplesmente navegar/re-renderizar a tela), mesmo padrão do
  // `prevMainCardIdRef` acima para detectar carta nova.
  const [flourish, setFlourish] = useState(false);
  const prevTowerCountRef = useRef(towerCardCount);
  useEffect(() => {
    const prev = prevTowerCountRef.current;
    prevTowerCountRef.current = towerCardCount;
    if (towerCardCount > prev) {
      setFlourish(true);
      const t = setTimeout(() => setFlourish(false), 800);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [towerCardCount]);

  // FIX (pedido do usuário: "corrija o giro... que quando posicionada assim
  // girando, ela gira no campo até ficar normal") - guarda o `spinAngle` da
  // carta no instante exato em que ela foi solta aqui (ver CardDragLayer.tsx,
  // que muta essa mesma referência de item a cada frame do arraste). É uma
  // ref (não state) porque é consumida e zerada durante o PRÓPRIO render que
  // desenha o pouso, não precisa disparar um re-render à parte.
  const lastDropSpinRef = useRef(0);

  // FIX (pedido do usuário: "arraste sua magia até o campo do alvo pra
  // ativar ela mais rápido") - antes de tratar um drop como "colocar esta
  // carta AQUI" (a única possibilidade até então), checa se `item.card` é
  // uma magia com um atalho de arrastar-e-soltar válido PRA ESTE slot
  // específico (`isMagicDropTarget`, vindo de GameBoard.tsx via
  // dragActivation.ts - nunca hardcoded aqui). Cartas mágicas nunca eram
  // `isFieldEligible` (PlayerZone.tsx), então esta checagem nunca compete de
  // verdade com o caminho de colocação normal - só existe pra QUEM antes
  // nem chegava a ser arrastável.
  const isMagicDrop = (item: CardDragItem) => Boolean(item.card && isMagicDropTarget?.(playerNumber, i, item.card));

  // FIX (Druida, personagem novo, bug relatado pelo usuário: "é pra ser
  // capaz de fazer drag & drop de um J encima de outro também") - soltar
  // QUALQUER carta na área principal de um slot já ocupado normalmente vira
  // reforço horizontal (`Boolean(slot.faceDownCard)`), a regra certa pra
  // todo o resto do jogo. Mas soltar um Valete do Druida em cima do próprio
  // Broto já plantado é o gesto natural de EMPILHAR (handlePlayCard,
  // gameEngine.ts, já sabe fazer isso com `asHorizontal: false` - rejeita se
  // vier `true`, que é exatamente o bug: nenhum caminho de UI conseguia
  // disparar o `false` certo num slot ocupado, nem clique nem arrastar).
  const isDruidaBrotoStackDrop = (item: CardDragItem) => item.card?.value === 'J' && isBrotoSlot(slot);
  const dropOnMain = (item: CardDragItem) => {
    lastDropSpinRef.current = item.spinAngle ?? 0;
    if (isMagicDrop(item)) {
      onMagicCardDrop?.(playerNumber, i, item.cardId);
      return;
    }
    onCardDrop?.(playerNumber, i, item.cardId, isDruidaBrotoStackDrop(item) ? false : Boolean(slot.faceDownCard));
  };
  const dropOnHorizontal = (item: CardDragItem) => {
    lastDropSpinRef.current = item.spinAngle ?? 0;
    if (isMagicDrop(item)) {
      onMagicCardDrop?.(playerNumber, i, item.cardId);
      return;
    }
    onCardDrop?.(playerNumber, i, item.cardId, true);
  };

  const [{ isOver: isOverMain, canDrop: canDropMain }, dropMainRef] = useDrop<
    CardDragItem,
    unknown,
    { isOver: boolean; canDrop: boolean }
  >(
    () => ({
      accept: CARD_ITEM_TYPE,
      // FIX (pedido do usuário, atalho de magia): `canDropHere` sozinho só
      // cobre "meu próprio campo, fase de Estratégia" (colocação normal) -
      // um alvo de magia pode ser o campo do OPONENTE (inclusive controlado
      // pela IA) e/ou uma fase diferente (Combate) - por isso o OR com
      // `isMagicDrop`, item-aware (react-dnd chama `canDrop` com o item
      // sendo arrastado no momento).
      canDrop: (item) => canDropHere || isMagicDrop(item),
      // Soltar em cima da carta principal já ocupada vira pedido de reforço
      // horizontal (mesma regra do drag nativo anterior); num slot vazio,
      // vira a carta principal. Uma magia com atalho válido tem prioridade
      // sobre as duas interpretações (ver dropOnMain acima).
      drop: dropOnMain,
      collect: (monitor) => ({ isOver: monitor.isOver(), canDrop: monitor.canDrop() }),
    }),
    [canDropHere, playerNumber, i, onCardDrop, onMagicCardDrop, isMagicDropTarget, slot.faceDownCard]
  );

  const [{ isOver: isOverHorizontal, canDrop: canDropHorizontal }, dropHorizontalRef] = useDrop<
    CardDragItem,
    unknown,
    { isOver: boolean; canDrop: boolean }
  >(
    () => ({
      accept: CARD_ITEM_TYPE,
      canDrop: (item) => (canDropHere && Boolean(slot.faceDownCard)) || isMagicDrop(item),
      drop: dropOnHorizontal,
      collect: (monitor) => ({ isOver: monitor.isOver(), canDrop: monitor.canDrop() }),
    }),
    [canDropHere, playerNumber, i, onCardDrop, onMagicCardDrop, isMagicDropTarget, slot.faceDownCard]
  );

  // FIX (pedido do usuário: "melhore a detecção de campo para cartas
  // arrastadas/jogadas lá" - "área de detecção pequena/imprecisa em geral") -
  // registra os dois alvos (principal e horizontal) no dropTargetRegistry
  // com sua posição atual, pra HandCardView.tsx conseguir "cair" neles pelo
  // raio do ímã quando o evento nativo de drop não acertar o elemento exato
  // (ver comentário completo em dropTargetRegistry.ts). Complementa o
  // `useDrop` nativo acima, nunca o substitui.
  const mainNodeRef = useRef<HTMLDivElement | null>(null);
  const horizontalNodeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mainId = `field-${playerNumber}-${i}-main`;
    registerDropTarget(mainId, {
      getCenter: () => {
        const rect = mainNodeRef.current?.getBoundingClientRect();
        return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
      },
      canDrop: (item) => canDropHere || isMagicDrop(item),
      onDrop: dropOnMain,
    });
    return () => unregisterDropTarget(mainId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canDropHere, playerNumber, i, onCardDrop, onMagicCardDrop, isMagicDropTarget, slot.faceDownCard]);

  useEffect(() => {
    const horizontalId = `field-${playerNumber}-${i}-horizontal`;
    registerDropTarget(horizontalId, {
      getCenter: () => {
        const rect = horizontalNodeRef.current?.getBoundingClientRect();
        return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
      },
      canDrop: (item) => (canDropHere && Boolean(slot.faceDownCard)) || isMagicDrop(item),
      onDrop: dropOnHorizontal,
    });
    return () => unregisterDropTarget(horizontalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canDropHere, playerNumber, i, onCardDrop, onMagicCardDrop, isMagicDropTarget, slot.faceDownCard]);

  const canRemoveHorizontal = Boolean(onRemoveHorizontalCard) && phase === 'strategy' && !isAiField;

  // FIX (pedido do usuário: "adicione este som quando a carta aterrisa no
  // campo" + "efeitos de impacto quando a carta é posicionada, embaixo
  // dela"; revisado depois: "remova o efeito para cartas horizontais") -
  // `impactIds` guarda os ids de carta com o CardImpactBurst atualmente
  // visível - só usado pela carta PRINCIPAL agora (o efeito visual nunca
  // aparece em cartas horizontais, mas elas ainda tocam o som de pouso).
  const [impactIds, setImpactIds] = useState<Set<string>>(new Set());
  const triggerImpact = (cardId: string, delayMs: number) => {
    const showTimer = setTimeout(() => {
      soundManager.play('card-flip');
      setImpactIds((prev) => new Set(prev).add(cardId));
      setTimeout(() => {
        setImpactIds((prev) => {
          if (!prev.has(cardId)) return prev;
          const next = new Set(prev);
          next.delete(cardId);
          return next;
        });
      }, IMPACT_VISUAL_MS);
    }, delayMs);
    return showTimer;
  };
  const triggerSoundOnly = (delayMs: number) => setTimeout(() => soundManager.play('card-flip'), delayMs);

  const prevMainCardIdRef = useRef<string | null>(null);
  useEffect(() => {
    const id = slot.faceDownCard?.id ?? null;
    const prevId = prevMainCardIdRef.current;
    prevMainCardIdRef.current = id;
    if (!id || id === prevId) return;
    const t = triggerImpact(id, MAIN_IMPACT_DELAY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot.faceDownCard?.id]);

  const prevHorizontalIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const currentIds = new Set(slot.horizontalCards.map((c) => c.id));
    const prevIds = prevHorizontalIdsRef.current;
    const newIds = [...currentIds].filter((id) => !prevIds.has(id));
    prevHorizontalIdsRef.current = currentIds;
    if (newIds.length === 0) return;
    const timers = newIds.map(() => triggerSoundOnly(HORIZONTAL_IMPACT_DELAY_MS));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot.horizontalCards]);

  // FIX (pedido do usuário: "corrija o giro... que quando posicionada assim
  // girando, ela gira no campo até ficar normal, sem o squash & stretch
  // atrapalhando"): lê e IMEDIATAMENTE zera `lastDropSpinRef` - só o próximo
  // card que MONTA DE VERDADE (key novo) usa `initial.rotate`, então isso é
  // seguro mesmo se este componente re-renderizar de novo por outro motivo
  // antes do próximo drop (`initial` não é reaplicado em elementos já
  // montados, então um valor "consumido" de sobra não causa nada). Só entra
  // no giro extra (duas voltas completas na direção do arremesso) quando o
  // ângulo capturado no drop for grande o bastante para ter sido um
  // arremesso de verdade (>15°) - um clique em "Posicionar", ou um arraste
  // calmo, não deve fazer a carta girar sozinha. `rotate` é um número simples
  // (não um array de keyframes), então combiná-lo via spread com
  // MAIN_LANDING_INITIAL/ANIMATE não reintroduz o bug de "sumir e aparecer"
  // acima - só as arrays scaleX/scaleY precisavam de referência estável.
  const dropSpin = lastDropSpinRef.current;
  lastDropSpinRef.current = 0;
  const isThrownSpin = Math.abs(dropSpin) > 15;
  const landingInitialRotate = isThrownSpin ? dropSpin + Math.sign(dropSpin) * 720 : dropSpin;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="relative flex flex-col items-center"
            data-card-id={`slot-p${playerNumber}-${i}`}
            style={
              hasTower
                ? ({
                    '--tower-glow-color-soft': towerGlow.soft,
                    '--tower-glow-color-strong': towerGlow.strong,
                  } as CSSProperties)
                : undefined
            }
          >
            {/* Modo Towers (pedido do usuário, ideia "destaque visível mesmo
                de longe/zoom afastado"): uma placa decorativa por TRÁS de
                toda a coluna do slot (carta + selo + texto "Slot N"),
                posicionada com `absolute`/`-z-10` pra não empurrar o layout
                (BattleField.tsx conta com o espaçamento exato entre slots) -
                dá pra notar qual slot tem torre num relance, sem precisar
                ler o selo pequeno em cima da carta. */}
            {hasTower && (
              <div
                className="absolute -inset-3 -z-10 rounded-2xl pointer-events-none"
                style={{
                  backgroundColor: `${towerGlow.ring}1f`,
                  border: `2px solid ${towerGlow.ring}66`,
                }}
                aria-hidden="true"
              />
            )}
            {/* Proteção Divina do Anjo (pedido do usuário: "mais efeitos
                visuais nas magias... auras e efeitos como você fez nas
                torres") - protege o campo INTEIRO (não uma carta específica,
                ver isSlotProtected em gameEngine.ts), então a aura/partículas
                vivem na coluna do SLOT como um todo, dourado (cor do Anjo),
                igual à placa de Torre acima. */}
            {protectedSlot && (
              <div
                className="absolute -inset-3 -z-10 rounded-2xl pointer-events-none animate-status-aura"
                style={
                  {
                    backgroundColor: `${STATUS_COLORS.protected.ring}1f`,
                    border: `2px solid ${STATUS_COLORS.protected.ring}66`,
                    '--status-color-soft': STATUS_COLORS.protected.soft,
                    '--status-color-strong': STATUS_COLORS.protected.strong,
                  } as CSSProperties
                }
                aria-hidden="true"
              >
                {STATUS_PARTICLES_2.map((p, idx) => (
                  <div
                    key={idx}
                    className="status-particle"
                    style={{ left: p.left, animationDelay: p.delay, '--status-color-strong': STATUS_COLORS.protected.strong } as CSSProperties}
                  />
                ))}
              </div>
            )}
            {/* Slot principal.
                FIX (pedido do usuário: "aumente o detector de posicionamento
                das cartas no campo, pra facilitar o puxar e colocar mais
                rápido") - `dropMainRef`/onClick/onDoubleClick agora vivem
                neste wrapper com `p-3 -m-3` (padding de 12px por fora,
                cancelado por uma margem negativa igual) - um truque clássico
                de CSS: a área que recebe clique/soltura de arraste cresce
                12px pra cada lado (o slot fica bem mais fácil de acertar sem
                precisão de pixel), mas o conteúdo visual e o espaço ocupado
                no layout (pros irmãos, como o texto "Slot N" abaixo)
                continuam EXATAMENTE do mesmo tamanho de antes - 12px de cada
                lado bate certinho com a metade do `gap-6` (24px) entre
                slots em BattleField.tsx, então as áreas ampliadas de dois
                slots vizinhos se tocam sem se sobrepor. */}
            <div
              ref={(node) => {
                dropMainRef(node);
                mainNodeRef.current = node;
              }}
              // FIX (bug encontrado testando o item acima): onClick/onDoubleClick
              // precisam estar NESTE wrapper (o maior, com padding) e não só no
              // filho visual - eventos de clique só "bolham" de baixo pra cima
              // (do alvo clicado até seus ANCESTRAIS), nunca do pai pro filho.
              // Um clique na área de padding tem como alvo real ESTE div (o
              // filho visual nem está embaixo do cursor ali), então só um
              // onClick aqui é acionado por ele - deixar o onClick só no filho
              // visual (versão anterior) fazia a área extra de padding não
              // responder a clique nenhum, só a soltura de arraste (que já
              // funciona via `ref`, independente de bubbling de evento React).
              onClick={() => canClick && onSlotClick(playerNumber, i)}
              onDoubleClick={() => phase === 'strategy' && onSlotDoubleClick && onSlotDoubleClick(playerNumber, i)}
              className="p-3 -m-3"
            >
              <div
                // FIX (pedido do usuário, item 8): marca este slot como um alvo
                // de "ímã" para CardDragLayer.tsx puxar visualmente o preview
                // da carta arrastada quando o cursor chega perto - só quando
                // realmente é um destino válido AGORA (mesma condição do
                // destaque `canDropMain`), senão a carta seria "puxada" para
                // slots que nem aceitariam o drop.
                data-card-drop-target={canDropMain ? 'true' : undefined}
                className={`transition-all relative ${hasTower ? 'animate-tower-glow rounded-lg' : ''} ${
                  isMonsterTargetChoice
                    ? 'ring-4 rounded-lg shadow-2xl scale-105 animate-pulse cursor-pointer'
                    : isSelected || isCombatSelected
                    ? 'ring-4 rounded-lg shadow-2xl scale-105'
                    : canClick
                    ? 'cursor-pointer hover:scale-105'
                    : ''
                } ${hasTower ? 'ring-2' : hasHorizontal ? 'ring-2 ring-offset-2 ring-offset-[#0F1113]' : ''} ${
                  isOverMain && canDropMain
                    ? 'ring-4 ring-[#6CC47A] scale-105 shadow-2xl'
                    : canDropMain
                    ? 'ring-2 ring-dashed ring-[#C59E4F]/60 animate-pulse'
                    : ''
                }`}
                style={{
                  '--tw-ring-color': isMonsterTargetChoice
                    ? '#C59E4F'
                    : isSelected || isCombatSelected
                    ? theme.primary
                    : hasTower
                    ? towerGlow.ring
                    : hasHorizontal
                    ? '#C59E4F'
                    : undefined,
                } as CSSProperties}
              >
              {/* Modo Towers (pedido do usuário: "deixe visualmente mais
                  destacado as torres") - silhuetas de carta em LEQUE atrás
                  do topo (deslocadas E levemente giradas, não só empilhadas
                  retas), sugerindo uma pilha física de verdade - puramente
                  decorativo (a reserva de verdade nunca aparece
                  individualmente, só o topo interage com qualquer efeito).
                  Até 3 camadas (o suficiente pra "ler" como pilha mesmo com
                  torres bem grandes, sem virar uma bagunça visual). */}
              {hasTower &&
                [0, 1, 2].slice(0, Math.min(3, towerCardCount - 1)).map((i) => (
                  <div
                    key={i}
                    className="absolute w-28 h-40 rounded-lg bg-[#3A2F22] border-2 border-[#8F6A30] shadow-lg tower-reserve-texture"
                    style={{
                      top: 6 + i * 7,
                      left: -(6 + i * 7) * (i % 2 === 0 ? 1 : -0.6),
                      transform: `rotate(${(i % 2 === 0 ? -1 : 1) * (5 + i * 4)}deg)`,
                      zIndex: -1 - i,
                    }}
                  />
                ))}
              {/* Modo Towers (pedido do usuário, ideia "partículas ambiente") -
                  fagulhas subindo continuamente enquanto a torre existir,
                  puramente decorativas (`pointer-events-none`). */}
              {hasTower &&
                TOWER_PARTICLES.map((p, idx) => (
                  <div
                    key={idx}
                    className="tower-particle"
                    style={{ left: p.left, animationDelay: p.delay, zIndex: 5 }}
                  />
                ))}
              {/* Fúria Selvagem da Besta / Ilusão Arcana do Mago (pedido do
                  usuário: "mais efeitos visuais nas magias... auras e
                  efeitos como você fez nas torres") - aura + partículas
                  contínuas na carta PRINCIPAL, num elemento PRÓPRIO
                  (`inset-0`, sobreposto) em vez de reaproveitar o mesmo div
                  do brilho de torre acima - as duas cores/animações nunca
                  disputam a mesma propriedade `animation` (Torre e Fúria
                  Selvagem podem coexistir na MESMA carta, se o jogador da
                  Besta também tiver uma torre - caso raro, mas possível). */}
              {(isMainDoubled || isMainReinforced) && (
                <div
                  className="absolute inset-0 rounded-lg animate-status-aura pointer-events-none"
                  style={
                    {
                      '--status-color-soft': isMainDoubled ? STATUS_COLORS.doubled.soft : STATUS_COLORS.reinforced.soft,
                      '--status-color-strong': isMainDoubled ? STATUS_COLORS.doubled.strong : STATUS_COLORS.reinforced.strong,
                      zIndex: 6,
                    } as CSSProperties
                  }
                >
                  {STATUS_PARTICLES_2.map((p, idx) => (
                    <div
                      key={idx}
                      className="status-particle"
                      style={
                        {
                          left: p.left,
                          animationDelay: p.delay,
                          '--status-color-strong': isMainDoubled ? STATUS_COLORS.doubled.strong : STATUS_COLORS.reinforced.strong,
                        } as CSSProperties
                      }
                    />
                  ))}
                </div>
              )}
              {/* Mosqueteiro - Tiro Certeiro (personagem novo): elemento
                  PRÓPRIO (mesmo motivo do comentário acima) pra nunca
                  disputar `animation` com os outros status. */}
              {isMainBoosted && (
                <div
                  className="absolute inset-0 rounded-lg animate-status-aura pointer-events-none"
                  style={
                    {
                      '--status-color-soft': STATUS_COLORS.boosted.soft,
                      '--status-color-strong': STATUS_COLORS.boosted.strong,
                      zIndex: 6,
                    } as CSSProperties
                  }
                >
                  {STATUS_PARTICLES_2.map((p, idx) => (
                    <div
                      key={idx}
                      className="status-particle"
                      style={
                        {
                          left: p.left,
                          animationDelay: p.delay,
                          '--status-color-strong': STATUS_COLORS.boosted.strong,
                        } as CSSProperties
                      }
                    />
                  ))}
                </div>
              )}
              {/* Modo Spotlight (pedido do usuário: "adicione um efeito de
                  spotlight nessas cartas, um verde para spotlights positivos
                  e vermelho para negativos") - elemento PRÓPRIO (mesmo
                  motivo do comentário acima) pra nunca disputar `animation`
                  com Torre/Fúria Selvagem/Ilusão Arcana - todos podem
                  coexistir na mesma carta. */}
              {mainSpotlightEntry && (
                <div
                  className="absolute inset-0 rounded-lg animate-status-aura pointer-events-none"
                  style={
                    {
                      '--status-color-soft':
                        mainSpotlightEntry.polarity === 'positive' ? STATUS_COLORS.spotlightPositive.soft : STATUS_COLORS.spotlightNegative.soft,
                      '--status-color-strong':
                        mainSpotlightEntry.polarity === 'positive' ? STATUS_COLORS.spotlightPositive.strong : STATUS_COLORS.spotlightNegative.strong,
                      zIndex: 6,
                    } as CSSProperties
                  }
                >
                  {STATUS_PARTICLES_2.map((p, idx) => (
                    <div
                      key={idx}
                      className="status-particle"
                      style={
                        {
                          left: p.left,
                          animationDelay: p.delay,
                          '--status-color-strong':
                            mainSpotlightEntry.polarity === 'positive' ? STATUS_COLORS.spotlightPositive.strong : STATUS_COLORS.spotlightNegative.strong,
                        } as CSSProperties
                      }
                    />
                  ))}
                </div>
              )}
              {slot.faceDownCard ? (
                  // FIX (pedido do usuário, item 3 - "aumente o squash & stretch
                  // pra ficar ainda mais animado"): a carta agora cai de MUITO
                  // mais alto (`y: -90`) já achatada/alongada como se estivesse
                  // em queda rápida (`scaleY` alto, `scaleX` baixo = um "traço"
                  // vertical), bate no chão achatando bem mais forte
                  // (`scaleX`/`scaleY` invertem: larga e baixa), e quica mais
                  // vezes (7 keyframes em vez de 5) até assentar - uma queda com
                  // impacto nitidamente maior/mais elástica que antes. Roda só
                  // UMA vez, na montagem (`initial` -> `animate`), independente
                  // de `isCombatSelected` - por isso a flutuação de combate
                  // (item 2) fica num `motion.div` FILHO separado logo abaixo,
                  // que não reinicia essa animação de pouso ao ligar/desligar.
                  <motion.div
                    key={slot.faceDownCard.id}
                    data-card-id={slot.faceDownCard.id}
                    className="w-28 h-40"
                    initial={{ ...MAIN_LANDING_INITIAL, rotate: landingInitialRotate }}
                    animate={{ ...MAIN_LANDING_ANIMATE, rotate: 0 }}
                    transition={MAIN_LANDING_TRANSITION}
                  >
                    {/* FIX (pedido do usuário, item 2 - "deixe ainda mais para
                        cima no ar, não está mt perceptível"): a distância subida
                        foi mais que triplicada (`-10` -> `-34`px), com um
                        pequeno balanço lateral (`rotate`) e um aumento de escala
                        constante (`scale: 1.14`) enquanto flutua - a carta
                        claramente "sai do chão", não só treme no lugar. Sombra
                        projetada também bem mais forte/larga para vender a
                        distância. */}
                    <motion.div
                      className="w-full h-full"
                      animate={isCombatSelected ? COMBAT_FLOAT_ANIMATE : COMBAT_FLOAT_REST_ANIMATE}
                      transition={isCombatSelected ? COMBAT_FLOAT_TRANSITION : COMBAT_FLOAT_REST_TRANSITION}
                      style={{
                        filter: isCombatSelected ? `drop-shadow(0 40px 26px ${theme.primary}b0)` : undefined,
                      }}
                    >
                      <FlipCard
                        className="w-28 h-40"
                        faceUp={mainFaceUp}
                        front={
                          <PlayingCard
                            value={slot.faceDownCard.value}
                            suit={slot.faceDownCard.suit}
                            card={slot.faceDownCard}
                            hasHorizontalOverlay={hasHorizontal}
                            spotlight={spotlight}
                          />
                        }
                        back={<PlayingCard faceDown backTheme={theme} />}
                      />
                    </motion.div>
                  </motion.div>
                ) : (
                  <PlayingCard slot emptySlotCombatHint={phase === 'combat'} />
                )}
                {isShattering ? (
                  <CardShatterBurst active={isShattering} />
                ) : isSmoking ? (
                  <CoringaSmokeBurst active={isSmoking} />
                ) : isBurning ? (
                  <FireShatterBurst active={isBurning} />
                ) : (
                  <CharacterMagicBurst active={isEffectFlashing} character={activeMagicCaster ?? 'mago'} />
                )}
                <MagicCalloutLabel active={isEffectFlashing} text={activeMagicLabel} character={activeMagicCaster} />
                {slot.faceDownCard && <CardImpactBurst active={impactIds.has(slot.faceDownCard.id)} />}
                {/* Druida (personagem novo, pedido do usuário: "não tem
                    indicador visual do valor atual do broto") - o Broto
                    sempre renderiza pelo template de carta de magia
                    (`isMagic` em PlayingCard.tsx, que só olha `card.value`,
                    nunca `transformedValue`), então o valor de verdade nunca
                    aparecia - só o "J♠" cru, sem nenhuma pista do valor
                    acumulado. Em vez de mexer no template compartilhado de
                    magia (usado por 5 outros personagens, cada carta J/Q/K
                    de verdade), um número grande sobreposto no MEIO da
                    carta, por cima do "J" pequeno que já está lá - só neste
                    slot específico (isBrotoSlot), nunca em nenhum outro
                    lugar que reusa PlayingCard. */}
                {isBrotoSlot(slot) && slot.faceDownCard && (
                  <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                    <span
                      className="font-black leading-none"
                      style={{
                        fontSize: 42,
                        color: '#EFE7D6',
                        textShadow: '0 0 16px rgba(15,138,25,0.95), 0 0 4px rgba(15,138,25,1), 0 2px 6px rgba(0,0,0,0.9)',
                      }}
                    >
                      {getDisplayValue(slot.faceDownCard)}
                    </span>
                  </div>
                )}
                {/* Modo Towers (pedido do usuário: "deixe visualmente mais
                    destacado"): faixa maior e mais chamativa no topo da
                    carta (em vez de uma pastilha pequena no canto) -
                    borda dupla, sombra própria e o valor total em destaque
                    bem maior que o resto do texto, pra ler à distância
                    mesmo com o tabuleiro cheio. */}
                {hasTower && (
                  <div
                    className={`absolute -top-3 left-1/2 z-20 rounded-full px-3 py-1 flex items-center gap-1.5 whitespace-nowrap transition-transform duration-300 ${
                      flourish ? 'scale-125' : 'scale-100'
                    }`}
                    style={{
                      transform: 'translateX(-50%)',
                      backgroundColor: towerGlow.ring,
                      border: '2px solid #0F1113',
                      boxShadow: `0 3px 10px rgba(0,0,0,0.6), 0 0 14px ${towerGlow.soft}`,
                      color: '#0F1113',
                    }}
                    title={`Torre: ${towerCardCount} cartas, valor total ${towerTotalValue}`}
                  >
                    <span className="text-[13px]">🗼</span>
                    <span className="text-[11px] font-bold">{towerCardCount}x</span>
                    <span className="text-[15px] font-black">{towerTotalValue}</span>
                  </div>
                )}
                {/* Modo Towers (pedido do usuário, ideia "animação de
                    formação/reforço maior"): anel que expande a partir do
                    selo e some, só no instante em que a torre é formada ou
                    reforçada (`flourish`, ver useEffect acima) - um "momento"
                    perceptível, diferente do glow contínuo de sempre. */}
                {flourish && (
                  <div className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 pointer-events-none">
                    <div
                      className="w-10 h-10 rounded-full animate-tower-flourish"
                      style={{ border: `3px solid ${towerGlow.ring}` }}
                    />
                  </div>
                )}
                {/* FIX (pedido do usuário: "NUNCA FAÇA marcadores estarem no
                    mesmo lado onde fica as cartas horizontais, eles tem que
                    ficar na esquerda e quando há mais do que um, um fica
                    ACIMA do outro, não literalmente em cima do outro. Você
                    tinha corrigido isso na besta e no mosqueteiro uma vez e
                    trouxe o mesmo erro de volta") - os 3 selos de status
                    (×2 da Fúria Selvagem, 🔮 da Ilusão Arcana, +N do Tiro
                    Certeiro) estavam TODOS em `-top-2 -right-2`: o mesmo
                    canto onde as cartas horizontais são ancoradas (ver o
                    `right` delas logo abaixo) E a mesma posição entre si, ou
                    seja, dois selos ativos ao mesmo tempo ficavam
                    literalmente sobrepostos. Agora eles são montados como uma
                    LISTA e renderizados numa coluna à ESQUERDA, empilhados de
                    baixo pra cima - some a disputa de espaço com as
                    horizontais e some a sobreposição entre selos, sem
                    depender de cada bloco lembrar de escolher um canto
                    diferente (a causa da regressão voltar). */}
                {(() => {
                  const statusBadges: { key: string; colors: { ring: string; soft: string }; title: string; content: ReactNode }[] = [];
                  if (isMainDoubled) {
                    statusBadges.push({
                      key: 'doubled',
                      colors: STATUS_COLORS.doubled,
                      title: 'Fúria Selvagem: esta carta vale o dobro',
                      content: <span className="text-[13px] font-black">×2</span>,
                    });
                  }
                  if (isMainReinforced) {
                    statusBadges.push({
                      key: 'reinforced',
                      colors: STATUS_COLORS.reinforced,
                      title: `Ilusão Arcana: valor reforçado para ${getDisplayValue(slot.faceDownCard!)}`,
                      content: (
                        <>
                          <span className="text-[11px]">🔮</span>
                          <span className="text-[12px] font-black">{getDisplayValue(slot.faceDownCard!)}</span>
                        </>
                      ),
                    });
                  }
                  if (isMainBoosted) {
                    statusBadges.push({
                      key: 'boosted',
                      colors: STATUS_COLORS.boosted,
                      title: `Tiro Certeiro: esta carta recebe +${boostAmount ?? 0} de valor`,
                      content: <span className="text-[12px] font-black">+{boostAmount ?? 0}</span>,
                    });
                  }
                  // Druida (personagem novo, pedido do usuário: "só ser um J
                  // não é perceptível o bastante") - o Broto precisa de um
                  // selo próprio, sempre visível enquanto ativo (não só
                  // quando empilhado) - mesma coluna/posição dos outros 3
                  // selos acima (canto superior ESQUERDO, nunca direito -
                  // pedido explícito do usuário, mesmo motivo do FIX de
                  // sobreposição documentado no topo deste bloco). Com 1 só
                  // Valete, mostra só o ícone (nada pra contar ainda); com 2+
                  // empilhados, ícone + número - "quando há 2 ou mais, não dá
                  // pra saber visualmente" - mesmo padrão de ícone+número já
                  // usado pelos selos de Fúria Selvagem/Ilusão Arcana/Tiro
                  // Certeiro acima.
                  if (isBrotoSlot(slot)) {
                    const brotoStackCount = 1 + (slot.brotoReserve?.length ?? 0);
                    statusBadges.push({
                      key: 'broto',
                      colors: STATUS_COLORS.broto,
                      title:
                        brotoStackCount > 1
                          ? `Broto: ${brotoStackCount} Valetes empilhados, vale ${getDisplayValue(slot.faceDownCard!)}`
                          : `Broto: vale ${getDisplayValue(slot.faceDownCard!)}, cresce a cada troca de turno`,
                      content: (
                        <>
                          <span className="text-[13px]">🌱</span>
                          {brotoStackCount > 1 && <span className="text-[12px] font-black">{brotoStackCount}</span>}
                        </>
                      ),
                    });
                  }
                  if (statusBadges.length === 0) return null;
                  return (
                    <div className="absolute -top-2 -left-3 z-20 flex flex-col-reverse items-start gap-1 pointer-events-none">
                      {statusBadges.map((badge) => (
                        <div
                          key={badge.key}
                          className="rounded-full px-2 py-1 flex items-center justify-center gap-1 whitespace-nowrap"
                          style={{
                            backgroundColor: badge.colors.ring,
                            border: '2px solid #0F1113',
                            boxShadow: `0 3px 10px rgba(0,0,0,0.6), 0 0 14px ${badge.colors.soft}`,
                            color: '#0F1113',
                          }}
                          title={badge.title}
                        >
                          {badge.content}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Sobreposição das cartas horizontais (reforço) */}
            {slot.horizontalCards.map((hCard, hIndex) => {
              // FIX (pedido do usuário: "carta revelada no campo não deve
              // revelar a horizontal e o mesmo pro oposto") - antes caía de
              // volta em `slot.revealed`, que fica true sempre que a carta
              // PRINCIPAL é revelada por uma magia (Substituição Arcana,
              // Visão Celestial, Transformar Ás) - isso vazava a revelação
              // pra QUALQUER horizontal colocada depois naquele slot, mesmo
              // sem ela nunca ter sido revelada de verdade. Agora cada carta
              // horizontal só mostra a face de acordo com o PRÓPRIO
              // `revealed` (o combate real ainda revela as horizontais
              // corretamente - ver handleResolveCombat, que agora marca
              // cada uma individualmente, não só o slot).
              const cardFaceUp = hCard.revealed === true;
              const offset = hIndex * 10;
              const isThisHorizontalDoubled = doubledHorizontal?.id === hCard.id;
              const isThisHorizontalBoosted = boostedHorizontal?.id === hCard.id;
              // Modo Spotlight (pedido do usuário) - mesma ideia da carta
              // principal acima (mesmo FIX de não vazar informação: só depois
              // de `revealed === true`).
              const horizontalSpotlightEntry = hCard.revealed ? getSpotlightEntry(hCard, spotlight) : null;
              return (
                <motion.div
                  key={hCard.id}
                  data-card-id={hCard.id}
                  layout
                  initial={{ ...HORIZONTAL_LANDING_INITIAL, rotate: landingInitialRotate }}
                  animate={{ ...HORIZONTAL_LANDING_ANIMATE, rotate: 0 }}
                  transition={HORIZONTAL_LANDING_TRANSITION}
                  className={`absolute z-10 ${canRemoveHorizontal ? 'cursor-pointer hover:ring-2 hover:ring-[#D45D4A] hover:scale-105 rounded transition-all' : ''} ${
                    isThisHorizontalDoubled || isThisHorizontalBoosted || horizontalSpotlightEntry ? 'animate-status-aura rounded' : ''
                  }`}
                  style={
                    {
                      top: `-${12 + offset}px`,
                      right: `-${12 + offset}px`,
                      ...(isThisHorizontalDoubled
                        ? { '--status-color-soft': STATUS_COLORS.doubled.soft, '--status-color-strong': STATUS_COLORS.doubled.strong }
                        : isThisHorizontalBoosted
                        ? { '--status-color-soft': STATUS_COLORS.boosted.soft, '--status-color-strong': STATUS_COLORS.boosted.strong }
                        : horizontalSpotlightEntry
                        ? {
                            '--status-color-soft':
                              horizontalSpotlightEntry.polarity === 'positive'
                                ? STATUS_COLORS.spotlightPositive.soft
                                : STATUS_COLORS.spotlightNegative.soft,
                            '--status-color-strong':
                              horizontalSpotlightEntry.polarity === 'positive'
                                ? STATUS_COLORS.spotlightPositive.strong
                                : STATUS_COLORS.spotlightNegative.strong,
                          }
                        : {}),
                    } as CSSProperties
                  }
                  onClick={(e) => {
                    if (!canRemoveHorizontal) return;
                    e.stopPropagation();
                    onRemoveHorizontalCard!(playerNumber, i, hCard.id);
                  }}
                  aria-label={canRemoveHorizontal ? 'Clique para devolver esta carta de reforço para a mão' : undefined}
                >
                  {/* FIX (pedido do usuário: "quando uma carta é selecionada
                      ela começa a levitar, isso não ocorre com a carta
                      horizontal junto dela... corrija") - a flutuação de
                      combate só envolvia a carta PRINCIPAL do slot, então o
                      reforço horizontal ficava parado no chão enquanto a
                      carta que ele reforça subia, quebrando a leitura de que
                      os dois entram na disputa JUNTOS. Mesmo par
                      animate/transition da principal (constantes de módulo,
                      referência estável - ver COMBAT_FLOAT_ANIMATE). A
                      reserva da torre continua de fora de propósito (o
                      usuário: "não precisa no caso da torre"). */}
                  <motion.div
                    className="w-full h-full"
                    animate={isCombatSelected ? COMBAT_FLOAT_ANIMATE : COMBAT_FLOAT_REST_ANIMATE}
                    transition={isCombatSelected ? COMBAT_FLOAT_TRANSITION : COMBAT_FLOAT_REST_TRANSITION}
                  >
                    <FlipCard
                      className="w-16 h-10"
                      faceUp={cardFaceUp}
                      front={<PlayingCard horizontal value={hCard.value} suit={hCard.suit} card={hCard} />}
                      back={<PlayingCard horizontal faceDown backTheme={theme} />}
                    />
                  </motion.div>
                  {/* Piromante (pedido do usuário: "as magias do piromante
                      mal tem efeitos visuais, especialmente quanto a cartas
                      queimar") - Queima do Reforço (e às vezes o Roubo
                      Flamejante) sempre mira uma horizontal do CAMPO, não da
                      mão - sem isto, essa carta não tinha NENHUM feedback
                      visual ao ser queimada (effectFlashCardIds nunca
                      chegava até aqui). */}
                  <CharacterMagicBurst active={Boolean(effectFlashCardIds?.includes(hCard.id))} character={activeMagicCaster ?? 'mago'} />
                  {/* Fúria Selvagem da Besta mirando uma horizontal
                      específica (em vez da carta principal do slot).
                      FIX (pedido do usuário: "o X2 fica encima da carta
                      horizontal, não da pra ver o numero... coloque na
                      esquerda ao invés da direita") - foi pro lado ESQUERDO
                      (`-left-3` em vez de `-right-2`) e com mais folga pra
                      fora da carta (`-top-3`/`-left-3`, era `-top-2`/`-right-2`)
                      - antes ficava perto demais do canto onde o valor+naipe
                      (centralizados na carinha 64x40 de PlayingCard.tsx) podem
                      se estender, cobrindo parte do número quando a carta está
                      revelada. */}
                  {isThisHorizontalDoubled && (
                    <div
                      className="absolute -top-3 -left-3 z-20 rounded-full w-4 h-4 flex items-center justify-center"
                      style={{ backgroundColor: STATUS_COLORS.doubled.ring, border: '1.5px solid #0F1113' }}
                      title="Fúria Selvagem: esta carta vale o dobro"
                    >
                      <span className="text-[8px] font-black" style={{ color: '#0F1113' }}>
                        ×2
                      </span>
                    </div>
                  )}
                  {/* Mosqueteiro - Tiro Certeiro mirando uma horizontal específica. */}
                  {isThisHorizontalBoosted && (
                    <div
                      className="absolute -top-3 -left-3 z-20 rounded-full px-1.5 py-0.5 flex items-center justify-center"
                      style={{ backgroundColor: STATUS_COLORS.boosted.ring, border: '1.5px solid #0F1113' }}
                      title={`Tiro Certeiro: esta carta recebe +${boostAmount ?? 0} de valor`}
                    >
                      <span className="text-[8px] font-black" style={{ color: '#0F1113' }}>
                        +{boostAmount ?? 0}
                      </span>
                    </div>
                  )}
                </motion.div>
              );
            })}

            {/* Área de destino para soltar uma carta como reforço horizontal
                (também aceita empilhar uma 2ª, com o Reforço Angelical do
                Anjo). FIX (pedido do usuário: "aumente o detector de
                posicionamento") - mesmo truque `p-2 -m-2` do slot principal
                acima: o alvo VISÍVEL (a caixa tracejada) continua do mesmo
                tamanho, mas a área que realmente detecta o arraste cresce
                8px pra cada lado ao redor dele. */}
            {slot.faceDownCard && (
              <div className="absolute -top-3 -right-3 z-10 p-2 -m-2">
                <div
                  ref={(node) => {
                    dropHorizontalRef(node);
                    horizontalNodeRef.current = node;
                  }}
                  className={`w-16 h-10 rounded-md border-2 border-dashed transition-all ${
                    isOverHorizontal && canDropHorizontal
                      ? 'border-[#6CC47A] bg-[#6CC47A]/10 scale-110'
                      : canDropHorizontal
                      ? 'border-[#C59E4F]/60 animate-pulse'
                      : 'border-transparent'
                  }`}
                />
              </div>
            )}

            {isMonsterTargetChoice && (
              <div
                className="absolute -bottom-2 -right-2 z-10 bg-[#C59E4F] border-2 border-[#8F6A30] rounded-full w-7 h-7 flex items-center justify-center animate-pulse"
                title="Clique para escolher este slot como alvo do efeito de Monstro"
              >
                <span className="text-[13px]">🃏</span>
              </div>
            )}

            {/* FIX (pedido do usuário: "re-faça do zero o sistema de
                palavras-chave") - selo de Proteção Divina agora vem do
                sistema unificado (CardKeywords.tsx), com seu próprio tooltip
                embutido - por isso o TooltipContent duplicado que existia
                mais abaixo, só para este caso, foi removido. */}
            {protectedSlot && <CardKeywords active={['divineProtection']} size="md" />}

            {/* Modo Towers (pedido do usuário, ideia "destaque visível mesmo
                de longe"): o próprio texto do slot muda de cor e ganha o
                ícone da torre - lê à distância junto com a placa de fundo
                acima, sem depender só do selo pequeno em cima da carta. */}
            <p
              className={`text-center text-[11px] mt-2 ${hasTower ? 'font-bold' : 'font-medium'}`}
              style={{ color: hasTower ? towerGlow.ring : theme.primary }}
            >
              {hasTower ? `🗼 Slot ${i + 1}` : `Slot ${i + 1}`}
            </p>
          </div>
        </TooltipTrigger>
        {(phase === 'strategy' || phase === 'combat') && slot.faceDownCard && !slot.revealed && !isAiField && (
          <TooltipContent className="bg-[#1E1A16] border-[#C59E4F]" style={{ borderColor: theme.border }}>
            <p className="text-[#EFE7D6]">
              {getDisplayValue(slot.faceDownCard)}
              {slot.faceDownCard.suit}
              {slot.horizontalCards.map((hCard) => (
                <span key={hCard.id}> + {getDisplayValue(hCard)}{hCard.suit}</span>
              ))}
            </p>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}
