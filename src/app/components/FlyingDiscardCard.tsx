import { useMemo } from 'react';
import { motion } from 'motion/react';
import { PlayingCard } from './PlayingCard';
import type { Card } from '../lib/cardUtils';
import { useZoomEscapeFactor } from '../lib/useZoomEscapeFactor';

export interface FlyingDiscardSpec {
  key: string;
  card: Card;
  /** Posição inicial (getBoundingClientRect da carta no instante em que ainda estava em campo/mão/zona própria). */
  from: { left: number; top: number; width: number; height: number };
  /** Posição final (getBoundingClientRect do próprio painel "Pilha de Descarte"). */
  to: { left: number; top: number; width: number; height: number };
  /** Fase 1 (overhaul de animações) - escala de duração vinda de `getAnimationDurationScale(settings)`, ver useDiscardReshuffleAnimations.ts - antes a duração (0.4s) era fixa e ignorava a preferência "Velocidade de Animação". */
  scale: number;
  /** Fase 1 - índice desta carta dentro do MESMO lote de descarte (0, 1, 2...) - escalona o início do voo de cada uma (ver `transition.delay` abaixo) para múltiplos descartes da mesma cadeia não saírem todos exatamente no mesmo instante ("respeitar sequence" do contrato de evento, gameLogTypes.ts). */
  staggerIndex: number;
}

// FIX (histórico de ajustes de tamanho, 3 rodadas):
// 1ª: o fantasma nascia do tamanho REAL da carta de origem (carta de
//     campo/mão inteira, w-28 h-40 = 112×160px) - grande demais.
// 2ª: reduzido para 56×78, mas um bug na escala final (`to.width /
//     GHOST_WIDTH`, que na verdade CRESCIA a carta perto do fim, já que o
//     alvo de 80px é maior que os 56px iniciais) ainda deixava "grande" -
//     tentando corrigir só o tamanho base, reduzi demais (40×56, encolhendo
//     até 0.55) - ficou minúsculo.
// 3ª (atual): tamanho base perto do da própria carta já exibida na pilha de
//     descarte (80×112, ver o painel "Pilha de Descarte" em GameBoard.tsx) -
//     nem maior que o normal do jogo, nem pequeno demais pra reconhecer o
//     valor/naipe - encolhendo só um pouco ao pousar (não mais que 20%).
const GHOST_WIDTH = 64;
const GHOST_HEIGHT = 90;
const LANDING_SCALE = 0.8;

/**
 * FlyingDiscardCard - pedido do usuário: "quando uma carta fosse movida para
 * o descarte, pós combate ou pós utilização de algum efeito, uma animação
 * visual dela indo girando até o descarte". Renderiza um "fantasma" da carta
 * em `position: fixed`, ancorado na posição exata de onde ela estava
 * (`from`, capturada por GameBoard.tsx um instante antes dela sumir do
 * campo/mão/zona própria - ver cardPositionsRef/discardWatcher lá) e anima
 * até a posição real do painel "Pilha de Descarte" (`to`), girando durante o
 * trajeto - a MESMA carta que o jogador via um instante atrás, não uma cópia
 * genérica, então sempre corresponde ao valor/naipe reais.
 *
 * Puramente decorativo: a carta JÁ está no estado real (discardPile) assim
 * que este componente monta - ele só cobre visualmente a distância entre
 * "onde ela estava" e "onde ela terminou", desaparecendo sozinho ao fim da
 * animação (ver EFEITO_DURATION_MS em GameBoard.tsx).
 */
/** Quantos pontos amostrar ao longo da curva - mais pontos = curva mais suave. */
const ARC_SAMPLES = 7;

export function FlyingDiscardCard({ spec }: { spec: FlyingDiscardSpec }) {
  const { card } = spec;
  // FIX (achado testando ao vivo, auditando "Descarte com trajetória" no
  // backlog de animações - "já existe, mas ficou desatualizado"): com
  // `settings.interfaceZoom` (padrão 85%, aplicado via `zoom` no wrapper de
  // GameBoard.tsx) ativo, este fantasma `position: fixed` aterrissava longe
  // da Pilha de Descarte de verdade - medido ao vivo: aterrissagem ~1.18x
  // mais perto do canto (0,0) do que devia, quase exatamente 1/0.85. Causa:
  // `zoom` num ancestral cria um novo "containing block" pra descendentes
  // fixed (Chromium) - `left`/`top`/`transform: translate()` passam a ser
  // interpretados no espaço de coordenadas PRÉ-zoom desse ancestral, não em
  // pixels reais de tela (que é o que `getBoundingClientRect()` já entrega).
  // `posCompensation` (1/zoomFactor) escala de volta ANTES de usar esses
  // valores - abordagem escolhida depois de confirmar ao vivo que um Portal
  // pra `document.body` (a fuga "óbvia", mesma que zoomContainerContext.tsx
  // usa pro problema OPOSTO) quebra a animação de `x`/`y` por keyframes do
  // Framer Motion neste componente por um motivo não identificado - esta
  // correção pura de matemática evita mexer na árvore de renderização.
  const zoomFactor = useZoomEscapeFactor();
  const posCompensation = 1 / zoomFactor;
  const from = {
    left: spec.from.left * posCompensation,
    top: spec.from.top * posCompensation,
    width: spec.from.width * posCompensation,
    height: spec.from.height * posCompensation,
  };
  const to = {
    left: spec.to.left * posCompensation,
    top: spec.to.top * posCompensation,
    width: spec.to.width * posCompensation,
    height: spec.to.height * posCompensation,
  };
  const originLeft = from.left + from.width / 2 - GHOST_WIDTH / 2;
  const originTop = from.top + from.height / 2 - GHOST_HEIGHT / 2;
  const deltaX = to.left + to.width / 2 - (originLeft + GHOST_WIDTH / 2);
  const deltaY = to.top + to.height / 2 - (originTop + GHOST_HEIGHT / 2);
  const isThrownFar = Math.abs(deltaX) + Math.abs(deltaY) > 40;

  // FIX (pedido do usuário: "consegue fazer o movimento ser radial
  // aleatório indo até a área de descarte ao invés de um diagonal
  // estático?") - antes `x`/`y` só tinham DOIS pontos (início e fim), então
  // o Framer Motion interpolava em LINHA RETA entre eles - sempre a mesma
  // diagonal previsível para o mesmo par de posições. Agora o trajeto é uma
  // curva de Bézier quadrática com um ponto de controle DESLOCADO
  // aleatoriamente para um dos lados da linha reta (perpendicular a ela,
  // magnitude e lado sorteados a cada carta) - sorteado uma única vez por
  // carta (useMemo, travado por `spec.key`) para a curva não "trocar de
  // forma" no meio da própria animação. `x`/`y` viram arrays de 7 pontos
  // amostrados ao longo dessa curva, dando um arco em vez de uma reta.
  // FIX (achado auditando a Fase 1 do overhaul de animações - mesma classe de
  // bug já documentada e corrigida em DeckReshuffleBurst.tsx/ShuffleCard):
  // `rotate` vivia SOLTO dentro do objeto `animate` do JSX, fora deste
  // `useMemo` - parecia seguro ("só monta 1x por carta", já que `spec.key` é
  // único por carta), mas isso só impede REMONTAGEM, não RE-RENDER.
  // GameBoard.tsx re-renderiza o tempo todo (hover, outros toasts, outras
  // animações concorrentes) - cada re-render enquanto esta carta ainda
  // estava girando recalculava um alvo `rotate` novo via `Math.random()`
  // solto, e o Framer Motion reinterpolava a rotação já em andamento pro
  // novo alvo, visível como um "salto" no giro. Movido pra dentro do mesmo
  // `useMemo` travado por `spec.key` que já protege x/y/opacity.
  const { xPoints, yPoints, opacityPoints, scalePoints, rotateTarget } = useMemo(() => {
    const midT = 0.35 + Math.random() * 0.3; // ponto de controle não fica sempre bem no meio
    const baseX = deltaX * midT;
    const baseY = deltaY * midT;
    const distance = Math.hypot(deltaX, deltaY) || 1;
    const perpX = -deltaY / distance;
    const perpY = deltaX / distance;
    const side = Math.random() < 0.5 ? -1 : 1;
    // Magnitude do arco proporcional à distância percorrida (curvas maiores
    // para arremessos mais longos), com um piso/teto pra nunca ficar
    // exagerado demais nem sumir num trajeto curto (ex.: carta já perto da
    // pilha).
    const arcMagnitude = side * Math.min(140, Math.max(28, distance * 0.4)) * (0.6 + Math.random() * 0.6);
    const controlX = baseX + perpX * arcMagnitude;
    const controlY = baseY + perpY * arcMagnitude;

    const xs: number[] = [];
    const ys: number[] = [];
    const opacities: number[] = [];
    // Fase 1 (overhaul de animações, "pouso perceptível... com pequeno
    // impacto/squash") - fica em 1 até quase o fim do trajeto, depois um
    // pequeno EXCESSO acima do tamanho de pouso final antes de assentar -
    // mesma amostragem de 7 pontos que x/y/opacity já usam, pra ficar
    // sincronizado com o exato instante em que a carta encosta na pilha.
    const scales: number[] = [];
    for (let i = 0; i < ARC_SAMPLES; i++) {
      const t = i / (ARC_SAMPLES - 1);
      const inv = 1 - t;
      // Bézier quadrática: P(t) = (1-t)²·P0 + 2(1-t)t·Pc + t²·P1 (P0 = origem, na posição 0,0 relativa).
      xs.push(2 * inv * t * controlX + t * t * deltaX);
      ys.push(2 * inv * t * controlY + t * t * deltaY);
      opacities.push(i >= ARC_SAMPLES - 2 ? (i === ARC_SAMPLES - 1 ? 0 : 0.6) : 1);
      if (i < ARC_SAMPLES - 2) scales.push(1);
      else if (i === ARC_SAMPLES - 2) scales.push(LANDING_SCALE * 1.12);
      else scales.push(LANDING_SCALE);
    }
    const rotate = isThrownFar ? (Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 180) : 0;
    return { xPoints: xs, yPoints: ys, opacityPoints: opacities, scalePoints: scales, rotateTarget: rotate };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec.key]);

  return (
    <motion.div
      className="fixed z-[80] pointer-events-none"
      style={{ left: originLeft, top: originTop, width: GHOST_WIDTH, height: GHOST_HEIGHT }}
      initial={{ x: 0, y: 0, rotate: 0, scale: 1, opacity: 1 }}
      animate={{
        x: xPoints,
        y: yPoints,
        rotate: rotateTarget,
        scale: scalePoints,
        opacity: opacityPoints,
      }}
      transition={{ duration: 0.4 * spec.scale, delay: spec.staggerIndex * 0.05 * spec.scale, ease: 'easeOut' }}
    >
      {/* FIX (checagem extensa por bugs - vazamento de informação real
          encontrado): esta carta pode ser da IA/oponente e ainda não estar
          revelada (ex.: descarte comum de mão na fase de Compra, ou uma
          horizontal destruída pelo Rei do Mago antes de ser revelada) - só
          mostra a face real quando `card.revealed` já é verdadeiro, senão
          a animação de voo até o descarte entregava o valor/naipe reais de
          relance antes mesmo da carta pousar. */}
      {card.revealed ? <PlayingCard value={card.value} suit={card.suit} card={card} className="w-full h-full" /> : <PlayingCard faceDown className="w-full h-full" />}
    </motion.div>
  );
}
