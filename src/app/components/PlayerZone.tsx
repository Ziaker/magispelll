import type { CSSProperties } from 'react';
import { motion } from 'motion/react';
import { Wand2, Skull, Heart as HeartIcon, Check, Trash2, ShoppingCart, Sparkles, Bot, Repeat, Combine, ArrowUpDown, Move, ChevronLeft, ChevronRight, Crosshair, Drama } from 'lucide-react';
import { AngelWingsIcon } from './AngelWingsIcon';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { PlayingCard } from './PlayingCard';
import { CharacterMagicBurst } from './CharacterMagicBurst';
import { MagicCalloutLabel } from './MagicCalloutLabel';
import { HandCardView } from './HandCardView';
import { getCharacterTheme, getCharacterIconBackground } from '../lib/characterThemes';
import type { PlayerState, CharacterId, Phase, PendingReaction } from '../lib/gameEngine';
import { getEffectiveDiscardLimit, getEffectiveDrawLimit } from '../lib/gameEngine';
import { useEffect, useRef, useState } from 'react';
import { canActivateMagic, getMagicCardInfo, type MagicActivationContext } from '../lib/magicCards';
import { canActivateNumeralSpell, getNumeralSpellInfo, formatNumeralRequirement } from '../lib/numeralSpells';
import { canFuseCards, computeFusionResult, isUntransformedAce } from '../lib/fusion';
import { isPlainNumeralCard, getDisplayValue, type Card } from '../lib/cardUtils';
import type { SpotlightState } from '../lib/spotlight';
import {
  sortHandForDisplay,
  getHandValueCounts,
  hasTowerComboAvailable,
  getFusionPartnerPreviews,
  countRemainingInDeck,
} from '../lib/handQol';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

/**
 * FIX (pedido do usuário, item 5): "contador de vida com coração
 * pulsa/quebra em vez de só apagar" - constantes de módulo (não recriadas a
 * cada render, mesma lição do bug de squash & stretch em FieldSlotView.tsx)
 * para o estouro do coração perdido: cresce, gira e desaparece, em vez de só
 * trocar de opacidade instantaneamente.
 */
const HEART_BREAK_ANIMATE = { scale: [1, 1.7, 0.2], rotate: [0, -25, 30], opacity: [1, 1, 0] };
const HEART_BREAK_TRANSITION = { duration: 0.65, times: [0, 0.35, 1], ease: 'easeOut' as const };
const HEART_REST_ANIMATE = { scale: 1, rotate: 0 };
const HEART_REST_TRANSITION = { duration: 0.2 };
/** Ângulos (em radianos) dos 6 fragmentos que estouram do coração quebrado, distribuídos em círculo. */
const HEART_FRAGMENT_ANGLES = [0, 1, 2, 3, 4, 5].map((i) => (i / 6) * Math.PI * 2);

interface PlayerZoneProps {
  playerNumber: 1 | 2;
  character: CharacterId;
  phase: Phase;
  playerState: PlayerState;
  selectedCardId: string | null;
  onCardSelect: (cardId: string | null) => void;
  onPlayCard: (cardId: string, slotIndex: number, asHorizontal: boolean) => void;
  selectedSlot: { player: 1 | 2; slot: number } | null;
  onToggleReady: () => void;
  selectedForDiscard: Set<string>;
  onToggleDiscard: (cardId: string) => void;
  onDiscardCards: () => void;
  /**
   * Modo Towers (pedido do usuário): seleção múltipla de cartas de mesmo
   * número na mão, separada de `selectedForDiscard` - vive na fase de
   * Estratégia, não na de Compra. FIX (pedido do usuário: "selecionar duas
   * cartas apenas clicando nelas") - `onSelectCardForField` substitui
   * `onCardSelect` para cliques de carta na fase de Estratégia: decide
   * sozinho (com base no valor da carta, se há outra igual na mão, ou se
   * reforça uma torre já formada neste turno) se o clique deve entrar na
   * seleção de torre (`selectedForTower`) ou na seleção normal de carta
   * única (`selectedCardId`) - nenhuma tecla modificadora necessária.
   * FIX (pedido do usuário: "faça com que o botão de empilhar surja abaixo
   * dos campos das 3 cartas... ao invés de aparecer na mão") - o botão
   * "Towers" que confirmava a torre morava aqui (perto da mão, onde as
   * cartas são selecionadas) - saiu completamente daqui e agora mora em
   * BattleField.tsx, na coluna do meio, logo abaixo dos 3 slots de combate
   * (mais perto de onde a torre de fato vai aparecer). `selectedForTower`
   * continua sendo usado aqui só pra destacar visualmente (anel) as cartas
   * já marcadas na mão - ver isSelectedForTower mais abaixo.
   */
  towersMode: boolean;
  /**
   * Modo Spotlight (pedido do usuário) - números em destaque neste turno,
   * `null`/`undefined` quando o modo está desligado. Usado pra ajustar a
   * checagem da Magia Numeral (canActivateNumeralSpell) e pro selo de
   * palavra-chave (cubo) nas cartas da mão cujo valor bate com algum número
   * em destaque - ver spotlight.ts.
   */
  spotlight?: SpotlightState | null;
  /**
   * Modo Reações (pedido do usuário) - magia anunciada aguardando reação,
   * `null`/`undefined` quando não há nenhuma agora. Quando `casterPlayer`
   * NÃO é este `playerNumber`, este jogador é quem PODE reagir agora: a
   * carta elegível (mesmo `cardValue`) brilha destacada, as outras ficam
   * obscurecidas, e clicar na elegível chama `onReactToMagic` em vez do
   * comportamento normal de clique. Ver gameEngine.ts (pendingReaction).
   */
  pendingReaction?: PendingReaction | null;
  /** Usa `cardId` (uma carta mágica própria do mesmo valor da anunciada) pra reagir - ver REACT_TO_MAGIC em gameEngine.ts. */
  onReactToMagic?: (cardId: string) => void;
  selectedForTower: Set<string>;
  onSelectCardForField: (cardId: string) => void;
  onDrawCards: (count: number) => void;
  /**
   * FIX (pedido do usuário: variante "Fusão") - verdadeiro quando
   * `gameConfig.fusion` está habilitado nesta partida. Controla se o botão
   * "Fundir" e o drag-and-drop de carta sobre carta aparecem na mão.
   */
  fusionEnabled: boolean;
  /** FIX (pedido do usuário: "limite de fusões... podendo selecionar quantas fusões os jogadores poderão fazer cada turno") - `gameConfig.fusionLimit` (1-4). Só relevante quando `fusionEnabled` é true. */
  fusionLimit: number;
  /** FIX (pedido do usuário: "opção do pré-jogo para decidir o limite de cartas que podem serem descartadas por turno") - `gameConfig.discardLimit` (mínimo 4) no lugar do antigo "4" fixo. */
  discardLimit: number;
  /** FIX (pedido do usuário: "opção no pré-jogo de limite de compra de cartas... sem afetar efeitos de magias") - `gameConfig.drawLimitEnabled`/`drawLimit`: quando ligado, limita quantas cartas podem ser compradas (não via magia) por turno, independente do limite de mão. */
  drawLimitEnabled: boolean;
  drawLimit: number;
  /** FIX (pedido do usuário: "permita o jogador de fusionar 2 ÁS para obter um monstro... sem o monstro habilitado, não permita fusão de ás") - `gameConfig.monsterCards`. Controla se 2 Áses podem ser selecionados/arrastados entre si para fusão. */
  monsterCardsEnabled: boolean;
  /** Funde as 2 cartas (por id) numa carta nova - ver handleFuseCards em gameEngine.ts. Usado tanto pelo botão "Fundir" (com as 2 cartas selecionadas) quanto pelo drag-and-drop de uma carta sobre outra na mão. */
  onFuseCards: (cardId1: string, cardId2: string) => void;
  onTransformAce: (cardId: string) => void;
  /**
   * FIX (pedido do usuário: "forma rápida com drag n drop de transformar Ás
   * em outro número apenas clicando e arrastando o Ás encima do número 2 a
   * 10") - transforma diretamente, sem abrir o diálogo de seleção: `aceCardId`
   * é o Ás arrastado, `targetCardId` a carta numeral da mão onde foi solto.
   */
  onAceTransformDrop: (aceCardId: string, targetCardId: string) => void;
  onActivateMagic: (cardId: string) => void;
  /** FIX (item 9): troca a carta principal (ainda não revelada) de um slot do campo pela carta da mão selecionada; a carta antiga volta para a mão. */
  onSwapFieldCard: (cardId: string, slotIndex: number) => void;
  deckSize: number;
  discardPileSize: number;
  /** QoL da mão (ideia "contagem de risco no baralho"): composição real do baralho, pra calcular quantas cópias de cada carta ainda restam pra comprar - ver handQol.ts. */
  deck: Card[];
  magicContext: MagicActivationContext;
  onActivateNumeralSpell: () => void;
  hasActiveNumeralSpell: boolean;
  /**
   * Verdadeiro quando este jogador é a IA (modo "Contra a IA", ver
   * lib/aiPlayer.ts e o efeito em GameBoard.tsx que despacha as ações dela).
   * Nesse caso, este painel vira só leitura: nenhum controle (comprar,
   * descartar, selecionar carta, ativar magia, marcar "Pronto") responde a
   * clique do jogador humano - a IA age sozinha. A mão também é ocultada
   * (mostrando as costas das cartas) para não dar ao humano uma vantagem de
   * informação que um oponente real jamais teria; cartas já reveladas por
   * alguma magia continuam visíveis normalmente, já que nesse caso o próprio
   * jogador humano foi quem as revelou.
   */
  isAiControlled?: boolean;
  /**
   * FIX (item 5 da 4ª rodada): ids das cartas da MÃO deste jogador que
   * acabaram de ser alvo de uma magia (ex.: Revelação Forçada do Mago, ou
   * Visão Celestial do Anjo mirando uma carta da mão do oponente) - dispara
   * o efeito visual de MagicEffectBurst.tsx sobre a carta. GameBoard.tsx
   * preenche isso no momento do dispatch e limpa de novo depois de ~1s.
   */
  effectFlashCardIds?: string[];
  /**
   * FIX (item 3 da 6ª rodada): ids das cartas da MÃO deste jogador que
   * acabaram de ser REJEITADAS ao tentar posicioná-las na Zona Monstro (por
   * não serem cartas Monstro) - dispara o tremor + flash vermelho de
   * CardRejectFlash.tsx sobre a carta. GameBoard.tsx preenche isso no
   * momento da rejeição (clique ou drag-and-drop) e limpa de novo depois de
   * ~0.5s.
   */
  rejectedCardIds?: string[];
  /**
   * FIX (item 8 da 6ª rodada): true por ~1.3s logo após este jogador ativar
   * Bênção Divina ou Reforço Angelical do Anjo (as únicas magias sem
   * diálogo, então sem nenhuma carta/slot específico pra destacar com
   * effectFlashCardIds/effectFlashSlots) - dispara um MagicEffectBurst
   * genérico no ícone/retrato do próprio jogador, ver abaixo.
   */
  selfEffectFlash?: boolean;
  /**
   * FIX (pedido do usuário, item 10): "brilho extra ao vencer 2 combates
   * seguidos" - true por alguns segundos logo depois que ESTE jogador fecha
   * uma disputa de combate (2 vitórias seguidas, custando 1 vida do
   * oponente) - a borda/fundo da zona dele pulsa com um brilho mais forte
   * que o normal, reforçando o momento além do popup/confete que já existiam.
   */
  isVictoryGlow?: boolean;
  /** Personagem de quem ativou a magia atualmente em exibição na mão deste jogador (não necessariamente o dono da mão!), e o nome dela - ver GameBoard.tsx/CharacterMagicBurst.tsx/MagicCalloutLabel.tsx. */
  activeMagicCaster?: CharacterId | null;
  activeMagicLabel?: string | null;
  /** FIX (pedido do usuário: "efeito visual chamativo quando o Ás é transformado") - id da carta Ás (na mão) recém-transformada, ver AceTransformBurst.tsx/GameBoard.tsx. */
  aceTransformFlashCardId?: string | null;
}

export function PlayerZone({
  playerNumber,
  character,
  phase,
  playerState,
  selectedCardId,
  onCardSelect,
  onPlayCard,
  selectedSlot,
  onToggleReady,
  selectedForDiscard,
  onToggleDiscard,
  onDiscardCards,
  onDrawCards,
  towersMode,
  spotlight,
  pendingReaction,
  onReactToMagic,
  selectedForTower,
  onSelectCardForField,
  fusionEnabled,
  fusionLimit,
  discardLimit,
  drawLimitEnabled,
  drawLimit,
  monsterCardsEnabled,
  onFuseCards,
  onTransformAce,
  onAceTransformDrop,
  onActivateMagic,
  onSwapFieldCard,
  deckSize,
  discardPileSize,
  deck,
  magicContext,
  onActivateNumeralSpell,
  hasActiveNumeralSpell,
  isAiControlled = false,
  effectFlashCardIds,
  rejectedCardIds,
  selfEffectFlash,
  isVictoryGlow,
  activeMagicCaster,
  activeMagicLabel,
  aceTransformFlashCardId,
}: PlayerZoneProps) {
  const theme = getCharacterTheme(character);
  const [drawCount, setDrawCount] = useState<number>(1);

  // FIX (pedido do usuário, item 5): detecta a TRANSIÇÃO de vidas (não só o
  // valor atual) para saber exatamente qual coração acabou de ser perdido e
  // disparar a animação de quebra só nele, uma única vez - `prevLivesRef`
  // guarda o valor do render anterior para comparar.
  const prevLivesRef = useRef(playerState.lives);
  const [breakingHeartIndex, setBreakingHeartIndex] = useState<number | null>(null);
  useEffect(() => {
    if (playerState.lives < prevLivesRef.current) {
      setBreakingHeartIndex(playerState.lives);
      const t = setTimeout(() => setBreakingHeartIndex(null), 650);
      prevLivesRef.current = playerState.lives;
      return () => clearTimeout(t);
    }
    prevLivesRef.current = playerState.lives;
  }, [playerState.lives]);

  // QoL da mão (pedido do usuário: "me de mais ideias, melhores" sobre a
  // mão, seguido de "implemente tudo") - ver handQol.ts para a lógica pura.
  //
  // Ideia "reordenar manualmente" vs "agrupamento automático por valor": um
  // modo por vez, alternável (`handSortMode`) - no automático a mão é
  // reordenada por `sortHandForDisplay` a cada render (nunca precisa de
  // estado próprio); no manual, `customOrderIds` guarda a ordem escolhida
  // pelo jogador (movida com os botões ◀▶ que aparecem nesse modo).
  const [handSortMode, setHandSortMode] = useState<'auto' | 'manual'>('auto');
  const [customOrderIds, setCustomOrderIds] = useState<string[]>(() => playerState.hand.map((c) => c.id));
  // Ideia "linha de fusão ao passar o mouse": qual carta está sob o mouse
  // agora, pra calcular o resultado de fundir com CADA outra carta da mão.
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  // Ideia "destaque temporário nova": ids compradas há pouco (~4s), ver o
  // useEffect abaixo. `prevHandIdsRef`/`hasMountedHandRef` seguem o mesmo
  // padrão de `prevLivesRef` acima (detectar TRANSIÇÃO, não só o valor atual
  // - e nunca marcar a mão inteira como "nova" no primeiro render).
  const [newCardIds, setNewCardIds] = useState<Set<string>>(new Set());
  const prevHandIdsRef = useRef<Set<string>>(new Set(playerState.hand.map((c) => c.id)));
  const hasMountedHandRef = useRef(false);

  useEffect(() => {
    const currentIds = playerState.hand.map((c) => c.id);
    const currentIdSet = new Set(currentIds);
    const addedIds = currentIds.filter((id) => !prevHandIdsRef.current.has(id));
    const wasMounted = hasMountedHandRef.current;
    hasMountedHandRef.current = true;
    prevHandIdsRef.current = currentIdSet;

    // Reconcilia a ordem manual: mantém a ordem já escolhida para as cartas
    // que continuam na mão, e só ANEXA no fim as que chegaram agora (compra,
    // fusão, transformação de Ás) - nunca reordena o que o jogador já tinha
    // arrumado manualmente.
    setCustomOrderIds((prevOrder) => {
      const kept = prevOrder.filter((id) => currentIdSet.has(id));
      const missing = currentIds.filter((id) => !kept.includes(id));
      return [...kept, ...missing];
    });

    if (!wasMounted || addedIds.length === 0) return;
    setNewCardIds((prev) => new Set([...prev, ...addedIds]));
    const t = setTimeout(() => {
      setNewCardIds((prev) => {
        const next = new Set(prev);
        addedIds.forEach((id) => next.delete(id));
        return next;
      });
    }, 4000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerState.hand]);

  const displayHand: PlayerState['hand'] =
    handSortMode === 'auto'
      ? sortHandForDisplay(playerState.hand)
      : (customOrderIds.map((id) => playerState.hand.find((c) => c.id === id)).filter(Boolean) as PlayerState['hand']);

  const moveCardInCustomOrder = (cardId: string, direction: -1 | 1) => {
    setCustomOrderIds((prev) => {
      const idx = prev.indexOf(cardId);
      const targetIdx = idx + direction;
      if (idx === -1 || targetIdx < 0 || targetIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
      return next;
    });
  };

  // Ideia "mini-resumo no topo da mão".
  const handValueCounts = getHandValueCounts(playerState.hand);
  // Ideia "prévia de saldo do descarte": só calculada quando há algo
  // selecionado, pra não fazer esse trabalho extra a cada render à toa.
  const handAfterDiscardCounts =
    selectedForDiscard.size > 0 ? getHandValueCounts(playerState.hand.filter((c) => !selectedForDiscard.has(c.id))) : null;
  // Ideia "torre disponível proativo".
  const hasTowerCombo = towersMode && phase === 'strategy' && hasTowerComboAvailable(playerState.hand);
  // Ideia "linha de fusão ao passar o mouse".
  const fusionPartnerPreviews = hoveredCardId
    ? getFusionPartnerPreviews(playerState.hand, hoveredCardId, fusionEnabled, phase, monsterCardsEnabled)
    : undefined;
  // Ideia "modo compacto automático" - `zoom` (não padrão, mas suportado
  // pelo Chromium/Edge do WebView2 que empacota este jogo - ver
  // scripts/build-exe.mjs) redimensiona a mão INTEIRA (incluindo o espaço
  // que ela ocupa de verdade, diferente de `transform: scale`, que só
  // escala visualmente e deixaria um vão em branco do tamanho original) só
  // quando a mão está grande o bastante pra valer a pena economizar espaço.
  const isCompactHand = playerState.hand.length > 8;

  const canActivateNumeral = phase === 'strategy' && canActivateNumeralSpell(
    character,
    playerState.hand,
    playerState.field,
    hasActiveNumeralSpell,
    spotlight ?? null
  );

  const spellInfo = getNumeralSpellInfo(character);
  const discardsThisTurn = playerState.discardsThisTurn;

  // FIX (pedido do usuário: "mude o icone do mago pra algo que seja
  // referente a um mago tipo um cajado ou sparkles" / "mude o icone da
  // besta de novo pra ser algo mais ameaçador" / "mude o icone do anjo
  // para uma aureola com asas") - ver mesma troca e motivo completo em
  // CharacterSelection.tsx (`Wand2`, `Skull`, `AngelWingsIcon`).
  const characterIcons = {
    mago: Wand2,
    besta: Skull,
    anjo: AngelWingsIcon,
    mosqueteiro: Crosshair,
    coringa: Drama,
  };

  const Icon = characterIcons[character];

  // FIX (pedido do usuário: "permita que cartas reveladas pelo próprio
  // jogador (em caso de fusões ou transformações) de serem possíveis de se
  // fusionar também") - `canFuseCards` (fusion.ts) nunca checou `.revealed`;
  // uma carta que ficou revelada por uma fusão anterior (o resultado de uma
  // fusão sempre nasce `revealed: true`, ver handleFuseCards em
  // gameEngine.ts) ou por ser o alvo de uma transformação de Ás continua
  // elegível para fundir por VALOR normalmente. Usado tanto pelo clique
  // (handleCardClick abaixo) quanto pelo drag-and-drop (canDragToFuse mais
  // abaixo), pra decidir se uma carta revelada pode entrar na seleção/ser
  // arrastada mesmo sem poder ser descartada.
  const isFusableCard = (card: PlayerState['hand'][number]) =>
    fusionEnabled && phase === 'draw' && (isPlainNumeralCard(card) || (monsterCardsEnabled && isUntransformedAce(card)));

  // Modo Reações (pedido do usuário) - este jogador PODE reagir agora quando
  // há um anúncio pendente e ele NÃO foi quem anunciou (só 2 jogadores, então
  // "não é o conjurador" já basta pra saber que é o oponente dele).
  const isReactionTarget = Boolean(pendingReaction) && pendingReaction!.casterPlayer !== playerNumber;

  const handleCardClick = (cardId: string) => {
    if (isAiControlled) return; // a mão da IA não é controlável pelo jogador humano
    const card = playerState.hand.find((c) => c.id === cardId);
    if (!card) return;

    // FIX (pedido do usuário, Modo Reações): enquanto uma magia está
    // anunciada esperando reação, clicar na carta ELEGÍVEL (mesmo valor)
    // reage - qualquer outro clique (carta não elegível, ou nenhuma
    // reação pendente pra este jogador) segue o comportamento normal
    // abaixo, sem nenhuma interferência.
    if (isReactionTarget && card.value === pendingReaction!.cardValue) {
      onReactToMagic?.(cardId);
      return;
    }

    const isMagic = (card.value === 'J' || card.value === 'Q' || card.value === 'K') && !(character === 'coringa' && card.coringaTransformedToNumeral);

    if (phase === 'draw') {
      // Cartas reveladas nunca podem ser descartadas, mas podem ser
      // selecionadas para Fusão quando elegíveis - ver isFusableCard acima.
      if (card.revealed && !isFusableCard(card)) return;
      onToggleDiscard(cardId);
    } else if (phase === 'strategy') {
      // Cartas mágicas nunca são selecionadas para posicionamento no campo -
      // elas só saem da mão ativando seu efeito (botão de magia no próprio
      // card) - EXCETO pro Coringa (redesenho completo, pedido do usuário):
      // suas próprias J/Q/K são POSICIONADAS como armadilhas (nunca
      // "ativadas"), então continuam selecionáveis normalmente aqui, a não
      // ser que a janela da Magia Numeral "Mão de Ferro" esteja aberta (aí
      // sim vira botão de transformar, igual às magias normais dos outros
      // personagens - ver mesma checagem em coringaFieldPlaceable, mais
      // abaixo no `.map()` da mão).
      const isCoringaTrapCardHere = character === 'coringa' && isMagic && !card.coringaTransformedToNumeral;
      const coringaWindowOpenHere = character === 'coringa' && playerState.coringaTransformWindowUntilTurn !== undefined;
      const coringaSelectableHere = character === 'coringa' && isMagic && (!isCoringaTrapCardHere || !coringaWindowOpenHere);
      if (isMagic && !coringaSelectableHere) return;
      // FIX (Modo Towers, pedido do usuário: "era pra ser possível selecionar
      // duas cartas apenas clicando nelas, caso tenha mais do que uma carta
      // igual a ela na mão") - o Ctrl/Shift+clique original nunca funcionava
      // de um jeito óbvio pro jogador. `onSelectCardForField` (GameBoard.tsx)
      // decide sozinho, com base no que já está selecionado e se existe
      // outra carta de mesmo valor na mão (ou uma torre própria já formada
      // neste turno pra reforçar), se este clique deve entrar na seleção de
      // torre ou seguir a seleção normal de carta única - clique simples
      // resolve os dois casos, sem precisar de nenhuma tecla modificadora.
      onSelectCardForField(cardId);
    }
  };

  // FIX (pedido do usuário: variante "Fusão" - "selecionando duas cartas na
  // mão... vai aparecer a opção de fusão") - reaproveita a MESMA seleção já
  // usada para descarte (`selectedForDiscard`, clique em uma carta na fase
  // de Compra) - quando exatamente 2 estão marcadas, calcula se elas podem
  // ser fundidas AGORA e qual seria o resultado, para o botão "Fundir"
  // aparecer ao lado do "Descartar" já existente.
  const fusionSelectionIds = Array.from(selectedForDiscard);
  const fusionCard1 = fusionSelectionIds[0] ? playerState.hand.find((c) => c.id === fusionSelectionIds[0]) : undefined;
  const fusionCard2 = fusionSelectionIds[1] ? playerState.hand.find((c) => c.id === fusionSelectionIds[1]) : undefined;
  const canFuseSelection =
    selectedForDiscard.size === 2 &&
    canFuseCards(phase, fusionEnabled, playerState.fusesThisTurn, fusionLimit, monsterCardsEnabled, fusionCard1, fusionCard2);
  const fusionPreview = fusionCard1 && fusionCard2 ? computeFusionResult(fusionCard1, fusionCard2) : null;
  // FIX (pedido do usuário, mesma variante "Fusão"): agora que uma carta
  // revelada elegível pode entrar em `selectedForDiscard` (ver isFusableCard
  // acima), o botão "Descartar" precisa recusar explicitamente qualquer
  // seleção que inclua uma delas - senão descartaria só as outras cartas
  // selecionadas (o reducer já filtra a revelada, ver handleDiscardCards em
  // gameEngine.ts) e deixaria a revelada "presa" selecionada sem aviso.
  const hasRevealedInSelection = fusionSelectionIds.some((id) => playerState.hand.find((c) => c.id === id)?.revealed);

  const handlePlayFaceDown = () => {
    if (selectedCardId && selectedSlot && selectedSlot.player === playerNumber) {
      onPlayCard(selectedCardId, selectedSlot.slot, false);
    }
  };

  const handlePlayHorizontal = () => {
    if (selectedCardId && selectedSlot && selectedSlot.player === playerNumber) {
      onPlayCard(selectedCardId, selectedSlot.slot, true);
    }
  };

  const canPlayCard = selectedCardId && selectedSlot && selectedSlot.player === playerNumber;
  const selectedCard = selectedCardId ? playerState.hand.find((c) => c.id === selectedCardId) : undefined;

  // Calcular quantas cartas podem ser compradas
  // FIX (pedido do usuário: "opção no pré-jogo de limite de compra de
  // cartas... funcionando de forma similar a de descarte") - quando
  // `drawLimitEnabled` está ligado, o máximo também é limitado pelo que
  // ainda resta do `drawLimit` deste turno, além do espaço livre na mão.
  // FIX (checagem extensa por bugs - divergência real encontrada): faltava
  // o bônus de +1 do Modo Towers aqui (o motor já aplicava - ver
  // getEffectiveDrawLimit em gameEngine.ts) - o botão "Comprar" do jogador
  // humano ficava 1 carta aquém do que era realmente permitido nesse modo.
  const effectiveDrawLimit = getEffectiveDrawLimit({ drawLimit, towersMode });
  // FIX (checagem extensa por bugs - mesma divergência do drawLimit acima):
  // faltava o bônus de +1 do Modo Towers aqui também (ver
  // getEffectiveDiscardLimit em gameEngine.ts) - o botão/rótulo de descarte
  // do jogador humano ficava 1 carta aquém do permitido nesse modo.
  const effectiveDiscardLimit = getEffectiveDiscardLimit({ discardLimit, towersMode });
  const drawsRemainingThisTurn = drawLimitEnabled ? Math.max(0, effectiveDrawLimit - playerState.drawsThisTurn) : Infinity;
  const maxDrawCards = Math.max(
    1,
    Math.min(playerState.handLimit - playerState.hand.length, playerState.handLimit, drawsRemainingThisTurn)
  );

  // FIX (item 14): o seletor de quantidade de compra começava sempre fixo em
  // 1, obrigando o jogador a ajustá-lo manualmente toda vez mesmo quando o
  // normal é comprar até o máximo permitido. Agora ele acompanha o máximo
  // atual (que muda a cada turno, conforme o espaço livre na mão) - o
  // jogador ainda pode reduzir manualmente se quiser comprar menos.
  useEffect(() => {
    setDrawCount(maxDrawCards);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxDrawCards]);

  return (
    <div
      className={`border-2 rounded-lg p-3 ${isVictoryGlow ? 'animate-victory-glow' : ''}`}
      style={{
        backgroundColor: `${theme.dark}20`,
        borderColor: `${theme.primary}50`,
        '--glow-color': theme.primary,
      } as CSSProperties}
    >
      <div className="space-y-3">
        {/* Cabeçalho com informações do personagem e estatísticas */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="relative w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
              style={{
                background: getCharacterIconBackground(character),
                boxShadow: `0 0 20px ${theme.glow}`,
              }}
            >
              <Icon className="w-5 h-5 text-[#0F1113]" />
              {/* FIX (item 8 da 6ª rodada; motivo por personagem adicionado
                  depois - pedido do usuário): burst de "uma magia sem alvo
                  específico foi ativada por este jogador" - ver
                  selfEffectFlash acima. Sempre autolançada pelo PRÓPRIO
                  personagem, então `character` (a própria carta jogada) já é
                  o "caster" certo, sem precisar de activeMagicCaster aqui. */}
              <CharacterMagicBurst active={Boolean(selfEffectFlash)} character={character} />
              <MagicCalloutLabel active={Boolean(selfEffectFlash)} text={activeMagicLabel} character={character} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3
                  className="font-display text-[16px] leading-tight"
                  style={{ color: theme.light }}
                >
                  {theme.name}
                </h3>
                <div className="flex items-center gap-0.5">
                  {[...Array(3)].map((_, i) => {
                    const isBreaking = i === breakingHeartIndex;
                    const filled = i < playerState.lives;
                    return (
                      <div key={i} className="relative">
                        <motion.div
                          animate={isBreaking ? HEART_BREAK_ANIMATE : HEART_REST_ANIMATE}
                          transition={isBreaking ? HEART_BREAK_TRANSITION : HEART_REST_TRANSITION}
                        >
                          <HeartIcon
                            className={`w-3 h-3 ${filled || isBreaking ? 'fill-current' : 'opacity-20'}`}
                            style={{ color: isBreaking ? '#FF3B3B' : theme.primary }}
                          />
                        </motion.div>
                        {/* Estilhaços voando do coração no instante em que ele quebra. */}
                        {isBreaking && (
                          <div className="absolute inset-0 pointer-events-none">
                            {HEART_FRAGMENT_ANGLES.map((angle, fi) => (
                              <motion.span
                                key={fi}
                                className="absolute left-1/2 top-1/2 w-1 h-1 rounded-full"
                                style={{ backgroundColor: '#FF3B3B' }}
                                initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                                animate={{
                                  x: Math.cos(angle) * 16,
                                  y: Math.sin(angle) * 16,
                                  opacity: 0,
                                  scale: 0.3,
                                }}
                                transition={{ duration: 0.55, ease: 'easeOut' }}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              <p className="text-[10px] text-[#BFB6A6]">Jogador {playerNumber} • Vitórias: {playerState.combatWins}/2</p>
            </div>
          </div>

          <div className="flex gap-2">
            {/* Mosqueteiro (personagem novo, foco em descarte) - indicador
                próprio à ESQUERDA de "Pilha"/"Desc.", em bloco totalmente
                cinza/preto (não a cor do tema do personagem) de propósito,
                pra ficar visualmente óbvio que é um indicador ESPECÍFICO do
                Mosqueteiro, diferente dos blocos genéricos (Pilha/Desc.) que
                qualquer personagem tem.

                FIX (pedido do usuário: "ao invés de ter 2 contadores de
                descarte, faça ter apenas um só que diz o número de cartas
                descartadas nos últimos 3 turnos") - os 2 blocos separados
                (deste turno / do turno anterior) viraram só ESTE, somando a
                janela deslizante de 3 turnos inteira (este + os 2 anteriores
                - ver comentário completo de `mosqueteiroDiscardsThisTurn` em
                gameEngine.ts). O motor continua guardando os 3 valores
                separados por baixo (o Rei só usa 2 dos 3 - ver Tiro Certeiro
                em handleExecuteMagic), só a UI é que agora soma tudo num
                único número. */}
            {character === 'mosqueteiro' && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className="border rounded px-2 py-1 cursor-help"
                      style={{ backgroundColor: '#8C9199', borderColor: '#26282C' }}
                    >
                      <p className="text-[9px] text-[#0F1113]">Desc. (3 turnos)</p>
                      <p className="text-[13px] font-display leading-tight text-[#0F1113]">
                        {playerState.mosqueteiroDiscardsThisTurn + playerState.mosqueteiroDiscardsTurnMinus1 + playerState.mosqueteiroDiscardsTurnMinus2}
                      </p>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Cartas descartadas pelas suas magias (Valete/Rainha) nos últimos 3 turnos - alimenta o Rei (Tiro Certeiro, só este turno + o anterior) e a Magia Numeral (Munição Infinita, os 3 turnos)</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className="border rounded px-2 py-1 cursor-help"
                    style={{
                      backgroundColor: `${theme.dark}40`,
                      borderColor: `${theme.primary}50`,
                    }}
                  >
                    <p className="text-[9px] text-[#BFB6A6]">Pilha</p>
                    <p
                      className="text-[13px] font-display leading-tight"
                      style={{ color: theme.primary }}
                    >
                      {deckSize}
                    </p>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Cartas restantes no baralho</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className="border rounded px-2 py-1 cursor-help"
                    style={{
                      backgroundColor: `${theme.dark}40`,
                      borderColor: `${theme.primary}50`,
                    }}
                  >
                    <p className="text-[9px] text-[#BFB6A6]">Desc.</p>
                    <p
                      className="text-[13px] font-display leading-tight"
                      style={{ color: theme.primary }}
                    >
                      {discardPileSize}
                    </p>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Cartas no descarte</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {isAiControlled ? (
              <div
                className="flex items-center gap-1 h-auto py-1 px-3 rounded-md"
                style={{
                  backgroundColor: playerState.readyForNextPhase ? '#6CC47A' : `${theme.primary}40`,
                  color: playerState.readyForNextPhase ? '#0F1113' : theme.light,
                }}
                title="Controlado pela IA"
              >
                {playerState.readyForNextPhase ? <Check className="w-3 h-3" /> : <Bot className="w-3 h-3 animate-pulse" />}
                <span className="text-[11px]">
                  {playerState.readyForNextPhase ? 'Pronto!' : 'Pensando...'}
                </span>
              </div>
            ) : (
              <Button
                onClick={onToggleReady}
                size="sm"
                className="transition-all h-auto py-1 px-3"
                style={{
                  backgroundColor: playerState.readyForNextPhase ? '#6CC47A' : theme.primary,
                  color: '#0F1113',
                }}
              >
                <div className="flex items-center gap-1">
                  {playerState.readyForNextPhase && <Check className="w-3 h-3" />}
                  <span className="text-[11px]">
                    {playerState.readyForNextPhase ? 'Pronto!' : 'Pronto'}
                  </span>
                </div>
              </Button>
            )}
          </div>
        </div>

        {/* Botões de ação para a carta selecionada */}
        {!isAiControlled && canPlayCard && phase === 'strategy' && (
          <div
            className="border-2 rounded-lg p-2"
            style={{
              backgroundColor: `${theme.primary}10`,
              borderColor: theme.primary,
              boxShadow: `0 0 20px ${theme.glow}`,
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <p
                className="text-[11px]"
                style={{ color: theme.light }}
              >
                Slot <span style={{ color: theme.primary, fontWeight: 'bold' }}>{selectedSlot.slot + 1}</span>:
              </p>
              <div className="flex gap-2">
                {/* FIX (item 6 da 2ª rodada): "Posicionar" só faz sentido para
                    um slot ainda VAZIO - antes ele aparecia sempre, mesmo com
                    o slot já ocupado, onde clicar nele não fazia nada útil
                    (a única ação válida ali é "Troca"). Agora ele só aparece
                    quando o slot selecionado ainda não tem carta principal. */}
                {!playerState.field[selectedSlot.slot].faceDownCard && (
                  <button
                    onClick={handlePlayFaceDown}
                    className="px-3 py-1 rounded-lg transition-all hover:scale-105 shadow-lg"
                    style={{
                      backgroundColor: theme.primary,
                      color: '#0F1113',
                    }}
                  >
                    <div className="flex items-center gap-1">
                      <span className="text-[14px]">🃏</span>
                      {/* FIX (item 4 da 1ª rodada): o botão sempre mostra
                          "Posicionar" agora - cartas reveladas (por alguma
                          magia, ou um Ás transformado) são posicionadas com a
                          face para cima normalmente, e cartas não reveladas
                          são posicionadas viradas para baixo; "Posicionar"
                          descreve os dois casos corretamente, sem sugerir que
                          a carta é sempre "virada" (o que não é verdade para
                          uma já revelada). */}
                      <span className="text-[10px]">Posicionar</span>
                    </div>
                  </button>
                )}
                {(() => {
                  // FIX (itens 3 e 5): o botão "Horizontal" desabilitava
                  // incondicionalmente para QUALQUER carta já revelada
                  // (Boolean(selectedCard?.revealed)) - isso incluía o Ás
                  // transformado, que fica sempre revelado, e também
                  // qualquer carta revelada por magia. Não há razão para
                  // impedir isso: uma carta revelada pode virar reforço
                  // horizontal normalmente, só que já mostrando a face. Agora
                  // o botão só desabilita quando o slot ainda não tem carta
                  // principal, ou quando o limite de cartas horizontais já
                  // foi atingido.
                  // FIX (item 1, revisado): o limite (1, +1 a cada ativação
                  // do Reforço Angelical do Anjo) é por TURNO, contando o
                  // campo inteiro - não só o slot selecionado - senão o botão
                  // continuava habilitado para colocar uma horizontal em cada
                  // um dos outros slots vazios de reforço, mesmo sem a magia
                  // ativa.
                  const targetSlot = playerState.field[selectedSlot.slot];
                  const maxHorizontal = 1 + playerState.horizontalStackBonus;
                  const horizontalPlacedThisTurn = playerState.field.reduce((n, s) => n + s.horizontalCards.length, 0);
                  const horizontalDisabled = !targetSlot.faceDownCard || horizontalPlacedThisTurn >= maxHorizontal;
                  return (
                    <button
                      onClick={handlePlayHorizontal}
                      disabled={horizontalDisabled}
                      className="px-3 py-1 rounded-lg transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{
                        backgroundColor: horizontalDisabled ? theme.primary : theme.secondary,
                        color: theme.light,
                      }}
                    >
                      <div className="flex items-center gap-1">
                        <span className="text-[14px]">➕</span>
                        <span className="text-[10px]">Horizontal</span>
                      </div>
                    </button>
                  );
                })()}
                {/* FIX (item 9 da 1ª rodada): quando o slot selecionado já tem
                    uma carta principal, um botão "Troca" aparece para
                    substituí-la pela carta da mão selecionada (que volta para
                    a mão, em vez de ser descartada) - antes não havia nenhuma
                    forma de trocar uma carta já posicionada por outra da mão.
                    FIX (item 5 da 2ª rodada): removida a exigência de
                    "!revealed" - a troca também precisa aparecer/funcionar
                    quando a carta já posicionada está revelada (por magia, ou
                    um Ás transformado); ela só deixa de fazer sentido depois
                    que o slot já foi para o combate, o que sai da fase de
                    Estratégia de qualquer forma. */}
                {playerState.field[selectedSlot.slot].faceDownCard && (
                  <button
                    onClick={() => selectedCardId && onSwapFieldCard(selectedCardId, selectedSlot.slot)}
                    className="px-3 py-1 rounded-lg transition-all hover:scale-105 shadow-lg"
                    style={{
                      backgroundColor: theme.secondary,
                      color: theme.light,
                    }}
                  >
                    <div className="flex items-center gap-1">
                      <Repeat className="w-3.5 h-3.5" />
                      <span className="text-[10px]">Troca</span>
                    </div>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Botão de Magia Numeral */}
        {!isAiControlled && phase === 'strategy' && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={`w-full ${canActivateNumeral ? 'animate-pulse' : ''}`}
                  style={{
                    animation: canActivateNumeral ? 'pulse 1.5s ease-in-out infinite' : 'none',
                  }}
                >
                  <button
                    onClick={canActivateNumeral ? onActivateNumeralSpell : undefined}
                    disabled={!canActivateNumeral}
                    className={`w-full px-3 py-2 rounded-lg transition-all border-2 ${
                      canActivateNumeral
                        ? 'cursor-pointer hover:scale-105 shadow-lg'
                        : 'cursor-not-allowed opacity-40'
                    }`}
                    style={{
                      backgroundColor: canActivateNumeral ? '#C0C0C0' : '#505050',
                      borderColor: canActivateNumeral ? '#E8E8E8' : '#404040',
                      color: canActivateNumeral ? '#1F1F1F' : '#808080',
                      boxShadow: canActivateNumeral ? '0 0 30px rgba(192, 192, 192, 0.6), 0 0 15px rgba(232, 232, 232, 0.4)' : 'none',
                      animation: canActivateNumeral ? 'shake 0.5s ease-in-out infinite' : 'none',
                    }}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <Sparkles className="w-4 h-4" />
                      <span className="text-[11px]">
                        Magia Numeral ({formatNumeralRequirement(spellInfo)},{formatNumeralRequirement(spellInfo)},{formatNumeralRequirement(spellInfo)})
                      </span>
                      <Sparkles className="w-4 h-4" />
                    </div>
                  </button>
                </div>
              </TooltipTrigger>
              {/* FIX (item 5 da 6ª rodada): "melhore a escolha de cores de
                  fonte contrastantes na descrição do efeito da magia
                  numeral do anjo, não está fácil de ler" - causa raiz: este
                  era o ÚNICO TooltipContent do jogo sem um `className` de
                  fundo escuro (`bg-[#1E1A16] border-[#C59E4F]`, usado em
                  todos os outros tooltips - ver BattleField.tsx,
                  CharacterMagicReference.tsx etc.). Sem isso, ele cai no
                  fundo CLARO padrão do componente (`bg-primary`, que vem de
                  `--primary: #C59E4F` em globals.css - um dourado). O nome
                  da magia logo abaixo é colorido com `theme.primary`, que
                  pro Anjo é `#E2B84A` - outro dourado, quase idêntico ao do
                  fundo. Resultado: texto dourado sobre fundo dourado,
                  ilegível. Pra Mago/Besta o problema existia mas era menos
                  grave (azul/vermelho sobre dourado ainda contrasta um
                  pouco); o Anjo é o caso onde as duas cores quase coincidem.
                  Com o mesmo fundo escuro usado em todo o resto do jogo, o
                  texto dourado do Anjo volta a ficar legível (mesma
                  combinação que já funciona em CharacterMagicReference.tsx). */}
              <TooltipContent className="bg-[#1E1A16] border-[#C59E4F] max-w-[300px]">
                <div className="space-y-2">
                  <p className="text-[12px]">
                    <span style={{ color: theme.primary }}>{spellInfo.name}</span>
                  </p>
                  <p className="text-[11px] text-[#BFB6A6]">
                    {spellInfo.description}
                  </p>
                  <div className="text-[10px] text-[#8F6A30] border-t border-[#8F6A30] pt-2 mt-2">
                    <p>Requisitos:</p>
                    <ul className="list-disc list-inside space-y-1 mt-1">
                      <li>3 cartas {formatNumeralRequirement(spellInfo)} na mão</li>
                      <li>Sem cartas no seu campo</li>
                      <li>Sem magia numeral ativa</li>
                    </ul>
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* Ações da Fase de Compra */}
        {phase === 'draw' && isAiControlled && (
          <div
            className="border-2 rounded-lg p-2 flex items-center gap-2"
            style={{ backgroundColor: '#6CC47A10', borderColor: '#6CC47A50' }}
          >
            <Bot className="w-3.5 h-3.5 text-[#6CC47A] animate-pulse" />
            <p className="text-[10px] text-[#6CC47A]">A IA está comprando e ajustando sua mão...</p>
          </div>
        )}
        {phase === 'draw' && !isAiControlled && (
          <div
            className="border-2 rounded-lg p-2"
            style={{
              backgroundColor: '#6CC47A10',
              borderColor: '#6CC47A50',
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[10px] text-[#6CC47A]">
                  Descartes: {discardsThisTurn}/{effectiveDiscardLimit} (selecione até {Math.max(0, effectiveDiscardLimit - discardsThisTurn)})
                </p>
                {/* QoL da mão, ideia "prévia de saldo do descarte": mostra o
                    que sobraria na mão SE a seleção atual fosse descartada
                    agora - ajuda a não descartar sem querer a última cópia
                    de um valor que o jogador estava de olho pra Torre/Fusão. */}
                {handAfterDiscardCounts && (
                  <p className="text-[9px] text-[#BFB6A6] mt-0.5">
                    Fica: {handAfterDiscardCounts.length > 0 ? handAfterDiscardCounts.map((c) => `${c.label}×${c.count}`).join(' ') : 'nada'}
                  </p>
                )}
                {/* FIX (pedido do usuário: "opção no pré-jogo de limite de
                    compra de cartas") - mesma linguagem do contador de
                    descartes acima, só aparece quando o limite está ligado
                    (desligado = compra livre até a mão encher, como sempre). */}
                {drawLimitEnabled && (
                  <p className="text-[10px]" style={{ color: '#6CC47A' }}>
                    Compras: {playerState.drawsThisTurn}/{effectiveDrawLimit}
                  </p>
                )}
                {/* FIX (pedido do usuário: "limite de fusões... podendo
                    selecionar quantas fusões os jogadores poderão fazer
                    cada turno") - mesma linguagem do contador de descartes
                    acima, só aparece com a variante ligada. */}
                {fusionEnabled && (
                  <p className="text-[10px]" style={{ color: '#C59E4F' }}>
                    Fusões: {playerState.fusesThisTurn}/{fusionLimit}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={onDiscardCards}
                  size="sm"
                  disabled={
                    selectedForDiscard.size === 0 ||
                    selectedForDiscard.size > effectiveDiscardLimit ||
                    discardsThisTurn + selectedForDiscard.size > effectiveDiscardLimit ||
                    hasRevealedInSelection
                  }
                  className="h-auto py-1 px-3 bg-[#D45D4A] hover:bg-[#8A2E2E] text-[#EFE7D6] disabled:opacity-30"
                >
                  <Trash2 className="w-3 h-3 mr-1" />
                  <span className="text-[10px]">Descartar ({selectedForDiscard.size})</span>
                </Button>
                {/* FIX (pedido do usuário: variante "Fusão" - "selecionando
                    duas cartas na mão... vai aparecer a opção de fusão") -
                    só aparece quando a variante está ligada e exatamente 2
                    cartas estão selecionadas (mesma seleção do descarte
                    acima) - fica desabilitado (mas visível) se as 2 não
                    forem elegíveis agora, com o resultado em prévia quando
                    forem. */}
                {fusionEnabled && selectedForDiscard.size === 2 && (
                  <Button
                    onClick={() => onFuseCards(fusionSelectionIds[0], fusionSelectionIds[1])}
                    size="sm"
                    disabled={!canFuseSelection}
                    className="h-auto py-1 px-3 bg-[#C59E4F] hover:bg-[#8F6A30] text-[#0F1113] disabled:opacity-30"
                  >
                    <Combine className="w-3 h-3 mr-1" />
                    <span className="text-[10px]">
                      {fusionPreview && canFuseSelection
                        ? `Fundir (${fusionPreview.sum} → ${fusionPreview.isMonster ? 'Monstro' : fusionPreview.value})`
                        : 'Fundir'}
                    </span>
                  </Button>
                )}
                <div className="flex gap-1 items-center">
                  <Select
                    value={drawCount.toString()}
                    onValueChange={(val) => setDrawCount(parseInt(val, 10))}
                    disabled={playerState.hand.length >= playerState.handLimit || drawsRemainingThisTurn <= 0}
                  >
                    <SelectTrigger className="h-auto py-1 px-2 w-[50px] bg-[#1E1A16] border-[#6CC47A]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1E1A16] border-[#6CC47A]">
                      {Array.from({ length: maxDrawCards }, (_, i) => i + 1).map((num) => (
                        <SelectItem key={num} value={num.toString()} className="text-[#EFE7D6]">
                          {num}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={() => onDrawCards(drawCount)}
                    size="sm"
                    disabled={playerState.hand.length >= playerState.handLimit || drawsRemainingThisTurn <= 0}
                    className="h-auto py-1 px-3 bg-[#6CC47A] hover:bg-[#4A8A5A] text-[#0F1113] disabled:opacity-50"
                  >
                    <ShoppingCart className="w-3 h-3 mr-1" />
                    <span className="text-[10px]">Comprar</span>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Mão - rolagem horizontal */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <p className="text-[11px] text-[#BFB6A6]">
                {isAiControlled ? 'Mão da IA' : 'Mão'} ({playerState.hand.length}/{playerState.handLimit})
              </p>
              {/* QoL da mão, ideia "reordenar manualmente" vs "agrupamento
                  automático por valor": alterna entre os dois modos - ver
                  `displayHand`/`customOrderIds` acima. Só um por vez, pra não
                  competir entre si. */}
              {!isAiControlled && playerState.hand.length > 1 && (
                <button
                  onClick={() => setHandSortMode((m) => (m === 'auto' ? 'manual' : 'auto'))}
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 border transition-colors"
                  style={{ borderColor: `${theme.primary}50`, color: theme.primary }}
                  title={
                    handSortMode === 'auto'
                      ? 'Ordenação automática por valor (clique para reordenar manualmente)'
                      : 'Ordem manual (clique para voltar à ordenação automática)'
                  }
                >
                  {handSortMode === 'auto' ? <ArrowUpDown className="w-2.5 h-2.5" /> : <Move className="w-2.5 h-2.5" />}
                  <span className="text-[9px]">{handSortMode === 'auto' ? 'Auto' : 'Manual'}</span>
                </button>
              )}
            </div>
            {!isAiControlled && selectedCardId && phase === 'strategy' && (
              <p className="text-[10px]" style={{ color: theme.primary }}>
                {/* FIX (itens 4 e 7 da 3ª rodada): uma carta Monstro nunca
                    vai para um dos 3 slots numerados - ela tem sua própria
                    zona dedicada (ver BattleField.tsx), então a dica precisa
                    apontar para lá em vez de "um slot no campo". */}
                {selectedCard?.isMonster ? '→ Clique na Zona do Monstro' : '→ Clique em um slot no campo'}
              </p>
            )}
            {!isAiControlled && phase === 'draw' && selectedForDiscard.size > 0 && (
              <p className="text-[10px] text-[#D45D4A]">
                {selectedForDiscard.size} selecionada(s)
              </p>
            )}
          </div>
          {/* QoL da mão, ideia "mini-resumo no topo da mão": dashboard
              compacto de "o que eu tenho", sem precisar escanear carta por
              carta pra achar duplicatas (útil pra Torres) ou avaliar Fusão. */}
          {!isAiControlled && handValueCounts.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {handValueCounts.map((c) => (
                <span
                  key={c.key}
                  className="text-[9px] px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}
                >
                  {c.label}×{c.count}
                </span>
              ))}
            </div>
          )}
          {/* QoL da mão, ideia "torre disponível proativo": aparece SOZINHO
              assim que 2+ cartas do mesmo valor entram na mão, em vez de o
              jogador só descobrir isso ao clicar - ver hasTowerComboAvailable
              em handQol.ts. */}
          {hasTowerCombo && (
            <div
              className="text-[10px] rounded px-2 py-1 mb-2 animate-pulse"
              style={{ backgroundColor: '#7AA7C420', color: '#7AA7C4', border: '1px solid #7AA7C450' }}
            >
              🗼 Torre disponível - você tem cartas suficientes pra formar uma
            </div>
          )}
          <div className="relative" style={{ zoom: isCompactHand ? 0.82 : 1 } as CSSProperties}>
            {/* FIX (item 3 da 4ª rodada): reserva a altura de 1 carta
                (h-40/10rem) como piso - com a mão vazia ("Mão vazia" abaixo)
                a linha não fica visivelmente mais baixa que com cartas.

                FIX (pedido do usuário: "quando o anjo fica com muitas cartas
                na mão, ao invés de fazer uma barra de rolagem, faça com que
                a mão se estenda verticalmente, mostrando todas as cartas ao
                invés de outra barra de rolagem") - antes a mão era UMA linha
                com `overflow-x-auto` (rolagem horizontal quando não cabia
                tudo - ver o histórico do FIX acima, já resolvido, sobre essa
                rolagem vazar pra página). O Anjo pode empilhar o bônus
                permanente de mão indefinidamente (Benção Eterna, a Magia
                Numeral do Anjo - 3,3,3 - sem teto; não mais o Valete/Benção
                Divina, que agora busca um Ás em vez de mexer no limite de
                mão - ver PlayerState.permanentDrawBonus), então a mão dele
                cresce
                além de qualquer limite fixo. Em vez de rolar horizontalmente,
                `flex-wrap` quebra pra uma nova linha quando as cartas não
                cabem mais na largura disponível - a mão cresce VERTICALMENTE
                (empurrando o resto da página pra baixo, que já rola
                verticalmente sem problema - ver `overflow-auto` no container
                principal de GameBoard.tsx) até mostrar todas as cartas de
                uma vez, sem nenhuma rolagem própria. */}
            <div className="flex flex-wrap gap-3 select-none" style={{ minHeight: '10rem' }}>
              {/* FIX (bug reproduzido manualmente): a combinação
                  `AnimatePresence` + `exit` chegou a deixar um nó fantasma
                  (invisível, preso para sempre no estado `initial`, nunca
                  desmontado) toda vez que uma carta saía da mão - tanto com
                  `mode="popLayout"` quanto no modo padrão. Sem uma forma
                  robusta de reproduzir a causa raiz exata dentro do prazo,
                  optamos pela versão sem risco: `layout` sozinho (sem
                  `AnimatePresence`/`exit`) já faz as cartas restantes
                  deslizarem suavemente até a nova posição quando uma sai, e
                  `initial`/`animate` (que não dependem de AnimatePresence)
                  seguem animando a entrada de uma carta nova comprada. Só a
                  saída em si (jogar/descartar) volta a ser instantânea, como
                  era antes desta rodada - um preço pequeno por não vazar um
                  nó de card por carta pelo resto da partida. */}
              {isAiControlled ? (
                playerState.hand.map((card) => {
                  // Modo Reações (pedido do usuário) - a mão da IA usa este
                  // branch de renderização SEPARADO de HandCardView.tsx (mais
                  // simples, sem drag/clique/seleção - nada disso se aplica a
                  // uma mão controlada pela IA), então o destaque
                  // elegível/obscurecido precisa da MESMA lógica aplicada
                  // aqui também - senão o Modo Espectador (os dois lados IA)
                  // nunca mostraria nada disso, mesmo com a decisão real
                  // (decideReactionToMagic) acontecendo normalmente por
                  // baixo. Só afeta a EXIBIÇÃO aqui - a mão da IA nunca é
                  // clicável mesmo (a reação dela é sempre automática).
                  // FIX (checagem extensa por bugs - vazamento de informação
                  // real encontrado): destacar especificamente UMA carta
                  // ainda NÃO revelada (mostrada de costas pra quem está
                  // vendo) denunciaria qual carta virada é a elegível -
                  // exatamente a informação que este mesmo branch já esconde
                  // de propósito (`card.revealed ? <PlayingCard value=.../>
                  // : <PlayingCard faceDown />` logo abaixo). Só vira
                  // 'eligible' quando a carta JÁ é pública; uma elegível
                  // ainda escondida cai em 'dimmed' como qualquer outra, sem
                  // se destacar - preserva o segredo.
                  const cardReactionState: 'eligible' | 'dimmed' | undefined = !isReactionTarget
                    ? undefined
                    : card.value === pendingReaction!.cardValue && card.revealed
                    ? 'eligible'
                    : 'dimmed';
                  return (
                    // Cartas ainda não reveladas mostram só as costas - o
                    // jogador humano não deve ver a mão da IA, do contrário
                    // teria uma vantagem de informação que um oponente real
                    // jamais teria. Cartas já reveladas por alguma magia (ex.:
                    // Revelação Forçada do Mago, Visão Celestial do Anjo)
                    // continuam visíveis normalmente - foi o próprio jogador
                    // humano quem as revelou.
                    <motion.div
                      key={card.id}
                      data-card-id={card.id}
                      layout
                      initial={{ opacity: 0, y: -36, scale: 0.7 }}
                      animate={{
                        opacity: cardReactionState === 'dimmed' ? 0.3 : 1,
                        y: 0,
                        scale: cardReactionState === 'eligible' ? 1.06 : 1,
                        filter: cardReactionState === 'dimmed' ? 'grayscale(1) brightness(0.5)' : 'none',
                      }}
                      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                      className={`flex-shrink-0 relative ${
                        cardReactionState === 'eligible' ? 'ring-4 ring-[#F2C94C] rounded-lg shadow-xl animate-pulse' : ''
                      }`}
                    >
                      {card.revealed ? (
                        <PlayingCard value={card.value} suit={card.suit} card={card} />
                      ) : (
                        <PlayingCard faceDown />
                      )}
                      <CharacterMagicBurst
                        active={Boolean(effectFlashCardIds?.includes(card.id))}
                        character={activeMagicCaster ?? character}
                      />
                      <MagicCalloutLabel
                        active={Boolean(effectFlashCardIds?.includes(card.id))}
                        text={activeMagicLabel}
                        character={activeMagicCaster}
                      />
                    </motion.div>
                  );
                })
              ) : (
                displayHand.map((card, displayIndex) => {
                  const isSelectedForDiscard = selectedForDiscard.has(card.id);
                  const isSelectedForPlay = selectedCardId === card.id;
                  const isMagic = (card.value === 'J' || card.value === 'Q' || card.value === 'K') && !(character === 'coringa' && card.coringaTransformedToNumeral);
                  // FIX (item 3 da 6ª rodada): true por ~0.5s logo após o
                  // jogador tentar (por clique ou drag-and-drop) posicionar
                  // esta carta na Zona Monstro sem ela ser uma carta Monstro -
                  // dispara o tremor + flash vermelho (CardRejectFlash.tsx,
                  // dentro de HandCardView.tsx).
                  const isRejected = Boolean(rejectedCardIds?.includes(card.id));

                  // FIX (item 2): permite arrastar a carta da mão diretamente
                  // até um slot do campo (ver BattleField.tsx/FieldSlotView.tsx),
                  // além do fluxo por clique já existente (selecionar carta →
                  // clicar no slot). Só faz sentido na fase de Estratégia e
                  // para cartas que podem ir para o campo (mágicas nunca podem).
                  // FIX (pedido do usuário, variante "Fusão"): também
                  // arrastável na fase de Compra, quando é uma candidata
                  // numeral pura válida - único jeito de "arrastar uma carta
                  // em cima da outra" pra fundir.
                  // FIX (pedido do usuário: "permita o jogador de fusionar 2
                  // ÁS para obter um monstro... sem o monstro habilitado, não
                  // permita fusão de ás") - um Ás ainda não transformado
                  // também é elegível, mas só quando Cartas Monstro está
                  // ligado na partida (a checagem de verdade, incluindo que
                  // os DOIS lados precisam ser Áses entre si, acontece no
                  // motor - ver canFuseCards em fusion.ts).
                  // FIX (pedido do usuário: "permita que cartas reveladas
                  // pelo próprio jogador... de serem possíveis de se
                  // fusionar também, corrija o drag & drop") - removido o
                  // `!card.revealed` que existia aqui: o motor nunca exigiu
                  // isso (canFuseCards não olha pra `.revealed`), então uma
                  // carta revelada por uma fusão anterior ou por transformar
                  // um Ás (o alvo da transformação também fica `revealed`,
                  // ver handleTransformAce em gameEngine.ts) volta a poder
                  // ser arrastada/receber outra arrastada normalmente - só o
                  // DESCARTE de uma carta revelada continua bloqueado (ver
                  // isFusableCard/handleCardClick acima).
                  const canDragToFuse = isFusableCard(card);
                  // Coringa (redesenho completo, pedido do usuário) - suas
                  // cartas de magia (J/Q/K) NÃO são "ativadas" como as dos
                  // outros 4 personagens - são POSICIONADAS no campo como
                  // armadilhas (Valete só horizontal, Rainha/Rei só
                  // principal - a checagem exata de qual posição fica a
                  // cargo do motor, aqui só decide SE é arrastável) - a
                  // ÚNICA exceção é durante a janela da Magia Numeral "Mão
                  // de Ferro" (`coringaTransformWindowUntilTurn`), quando a
                  // carta ainda não transformada mostra um botão de
                  // transformar em vez de ficar arrastável (mesmo padrão
                  // visual dos outros personagens, reaproveitado só nesse
                  // momento específico - ver onActivateMagic/
                  // canActivateMagicNow abaixo).
                  const isCoringaTrapCard = character === 'coringa' && isMagic && !card.coringaTransformedToNumeral;
                  const coringaTransformWindowOpen = character === 'coringa' && playerState.coringaTransformWindowUntilTurn !== undefined;
                  const coringaFieldPlaceable =
                    character === 'coringa' && isMagic && (!isCoringaTrapCard || !coringaTransformWindowOpen);
                  const isDraggable =
                    !isAiControlled && ((phase === 'strategy' && (!isMagic || coringaFieldPlaceable)) || canDragToFuse);
                  // FIX (pedido do usuário, variante "Fusão"): esta carta
                  // pode RECEBER outra arrastada em cima agora? Mesma
                  // elegibilidade de quem está sendo arrastada (isso é só
                  // pra decidir se mostra o destaque de "solte aqui" - a
                  // checagem de verdade acontece de novo no reducer).
                  const canFuseTarget = canDragToFuse && playerState.fusesThisTurn < fusionLimit;
                  // FIX (pedido do usuário: "forma rápida com drag n drop de
                  // transformar Ás... arrastando o Ás encima do número 2 a
                  // 10 que o jogador quiser") - mesma elegibilidade que o
                  // motor exige em handleTransformAce (gameEngine.ts) para
                  // um alvo válido: nunca magia, nunca Monstro, nunca um Ás
                  // CRU (sem transformedValue - não tem valor pra copiar).
                  // FIX (pedido do usuário: "não consegue transformar um Ás
                  // em outro número (que era um Ás e foi transformado)") - um
                  // Ás JÁ transformado agora também é um alvo válido (na
                  // prática já "é" um número normal), por isso a exclusão é
                  // só para o Ás cru, não para `card.value === 'A'` inteiro.
                  // Não precisa checar se HÁ um Ás na mão agora - igual a
                  // canFuseTarget, isso só controla o destaque visual; a
                  // checagem de verdade é refeita no reducer.
                  const canAceTransformTarget =
                    phase === 'strategy' && !isMagic && !card.isMonster && !(card.value === 'A' && card.transformedValue === undefined);

                  // QoL da mão, ideia "leque em arco": rotação/deslocamento
                  // conforme a distância desta carta ao CENTRO da mão exibida
                  // - a do meio fica mais alta e reta, as pontas "descem" e
                  // giram um pouco, como um leque de baralho de verdade.
                  // Faixa pequena de propósito (±8°) pra continuar discreto
                  // mesmo numa mão de 9+ cartas.
                  const arcMid = (displayHand.length - 1) / 2;
                  const arcOffset = displayIndex - arcMid;
                  const arcRotateDeg = Math.max(-8, Math.min(8, arcOffset * 1.6));
                  const arcLiftPx = Math.min(8, Math.abs(arcOffset) * 1.4);

                  const deckRemainingCount = countRemainingInDeck(deck, card);
                  const deckRemainingLabel = `${getDisplayValue(card)}${card.suit} · Restam ${deckRemainingCount} no baralho`;

                  return (
                    <div key={card.id} className="relative">
                      <HandCardView
                        card={card}
                        phase={phase}
                        character={character}
                        themeColor={theme.primary}
                        isSelectedForPlay={isSelectedForPlay}
                        isSelectedForDiscard={isSelectedForDiscard}
                        isRejected={isRejected}
                        isEffectFlashing={Boolean(effectFlashCardIds?.includes(card.id))}
                        magicCaster={activeMagicCaster}
                        magicLabel={activeMagicLabel}
                        isAceTransformFlashing={card.id === aceTransformFlashCardId}
                        isDraggable={isDraggable}
                        onClick={() => handleCardClick(card.id)}
                        isSelectedForTower={selectedForTower.has(card.id)}
                        onDragStart={() => onCardSelect(card.id)}
                        onTransformAce={() => onTransformAce(card.id)}
                        onActivateMagic={() => onActivateMagic(card.id)}
                        canActivateMagicNow={
                          isCoringaTrapCard
                            ? coringaTransformWindowOpen
                            : isMagic && canActivateMagic(phase, character, card.value as 'J' | 'Q' | 'K', magicContext)
                        }
                        // FIX (pedido do usuário: "os botões e o tooltip do
                        // botão ainda aparecem pra ele mesmo sem a magia
                        // numeral estar ativa") - faltava a MESMA checagem de
                        // `coringaTransformWindowOpen` que `canActivateMagicNow`
                        // já fazia logo acima: sem ela, QUALQUER carta-
                        // armadilha do Coringa (`isCoringaTrapCard`) sempre
                        // recebia o tooltip de "Mão de Ferro", mesmo fora da
                        // janela - e como PlayingCard.tsx mostra o botão
                        // (semi-transparente) de ativar magia sempre que há
                        // tooltip + hover, ele aparecia (sem função nenhuma,
                        // já que `canActivateMagicNow` continuava `false`)
                        // toda vez que o jogador passava o mouse sobre uma
                        // armadilha comum, fora da janela de transformação.
                        magicTooltip={
                          isCoringaTrapCard
                            ? coringaTransformWindowOpen
                              ? 'Mão de Ferro: transforma permanentemente esta carta em uma carta de número 11 (Valete), 12 (Rainha) ou 13 (Rei).'
                              : undefined
                            : isMagic
                            ? getMagicCardInfo(character, card.value as 'J' | 'Q' | 'K').description
                            : undefined
                        }
                        magicPhase={isCoringaTrapCard ? undefined : isMagic ? getMagicCardInfo(character, card.value as 'J' | 'Q' | 'K').phase : undefined}
                        spotlight={spotlight}
                        reactionState={
                          !isReactionTarget ? undefined : card.value === pendingReaction!.cardValue ? 'eligible' : 'dimmed'
                        }
                        canFuseTarget={canFuseTarget}
                        onFuseDrop={(droppedCardId) => onFuseCards(droppedCardId, card.id)}
                        canAceTransformTarget={canAceTransformTarget}
                        onAceTransformDrop={(droppedAceCardId) => onAceTransformDrop(droppedAceCardId, card.id)}
                        arcRotateDeg={handSortMode === 'manual' ? 0 : arcRotateDeg}
                        arcLiftPx={handSortMode === 'manual' ? 0 : arcLiftPx}
                        fusionPreview={fusionPartnerPreviews?.get(card.id)}
                        onHoverChange={(hovering) => setHoveredCardId((prev) => (hovering ? card.id : prev === card.id ? null : prev))}
                        isNew={newCardIds.has(card.id)}
                        deckRemainingLabel={deckRemainingLabel}
                      />
                      {/* QoL da mão, ideia "reordenar manualmente": setas pra
                          mover a carta uma posição pra cada lado - escolhido
                          no lugar de arrastar pra não competir com os OUTROS
                          dois papéis de arraste que a mesma carta já tem
                          (jogar no campo / fundir com outra) - ver
                          HandCardView.tsx, que já usa `useDrag`/`useDrop` no
                          mesmo nó pra isso. */}
                      {!isAiControlled && handSortMode === 'manual' && (
                        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex gap-1 z-30">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              moveCardInCustomOrder(card.id, -1);
                            }}
                            disabled={displayIndex === 0}
                            className="w-4 h-4 flex items-center justify-center rounded-full disabled:opacity-30"
                            style={{ backgroundColor: '#1E1A16', border: `1px solid ${theme.primary}80` }}
                            title="Mover pra esquerda"
                          >
                            <ChevronLeft className="w-2.5 h-2.5" style={{ color: theme.primary }} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              moveCardInCustomOrder(card.id, 1);
                            }}
                            disabled={displayIndex === displayHand.length - 1}
                            className="w-4 h-4 flex items-center justify-center rounded-full disabled:opacity-30"
                            style={{ backgroundColor: '#1E1A16', border: `1px solid ${theme.primary}80` }}
                            title="Mover pra direita"
                          >
                            <ChevronRight className="w-2.5 h-2.5" style={{ color: theme.primary }} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              {playerState.hand.length === 0 && (
                <div className="w-full text-center py-4 text-[#BFB6A6]">
                  <p className="text-[12px]">Mão vazia</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Dicas de fase */}
        {phase === 'draw' && (
          <div
            className="border rounded p-2"
            style={{
              backgroundColor: '#6CC47A10',
              borderColor: '#6CC47A50',
            }}
          >
            <p className="text-[10px] text-[#6CC47A]">
              📥 Fase de Compra: Gerencie sua mão
            </p>
          </div>
        )}
        {phase === 'strategy' && (
          <div
            className="border rounded p-2"
            style={{
              backgroundColor: `${theme.primary}10`,
              borderColor: `${theme.primary}50`,
            }}
          >
            <p
              className="text-[10px]"
              style={{ color: theme.primary }}
            >
              💡 Estratégia: Selecione carta → slot → tipo (magias ativam pelo botão ✨ na própria carta)
            </p>
          </div>
        )}
        {phase === 'combat' && (
          <div
            className="border rounded p-2"
            style={{
              backgroundColor: '#D45D4A10',
              borderColor: '#D45D4A50',
            }}
          >
            <p className="text-[10px] text-[#D45D4A]">
              ⚡ Combate: Selecione um slot para revelar
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
