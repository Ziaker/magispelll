import { cn } from './ui/utils';
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { getDisplayValue, getDisplaySuit, type Card } from '../lib/cardUtils';
import { getMonsterEffect } from '../lib/monsterCards';
import { getSpotlightEntry, type SpotlightState } from '../lib/spotlight';
import { CardKeywords, type CardKeywordId } from './CardKeywords';
import type { CharacterId } from '../lib/gameEngine';

interface PlayingCardProps {
  value?: string;
  suit?: string;
  faceDown?: boolean;
  slot?: boolean;
  horizontal?: boolean;
  winner?: boolean;
  className?: string;
  card?: Card;
  phase?: 'draw' | 'strategy' | 'combat';
  onTransformAce?: () => void;
  onActivateMagic?: () => void;
  canActivateMagic?: boolean;
  magicTooltip?: string;
  /** FIX (item 8): fase em que esta carta de magia pode ser ativada, usada para mostrar um selo colorido no tooltip. */
  magicPhase?: 'draw' | 'strategy' | 'combat';
  playerCharacter?: CharacterId;
  isInHand?: boolean;
  /**
   * FIX (item 10 da 2ª rodada): na fase de Combate, um slot vazio agora vale
   * 1 (ver handleResolveCombat em gameEngine.ts) em vez de ficar fora do
   * combate - mostra essa dica junto do placeholder "vazio" para deixar
   * claro que ele pode ser escolhido e o que ele vale.
   */
  emptySlotCombatHint?: boolean;
  /**
   * FIX (item 3 da 2ª rodada de correções): quando esta carta é a carta
   * principal de um slot do campo E o slot tem uma carta horizontal
   * empilhada em cima, o selo de "revelada" (olho) precisa ir para o lado
   * ESQUERDO em vez do direito - o lado direito é onde a carta horizontal
   * (e seu valor, quando revelada) já é desenhada, então os dois se
   * sobrepunham. Só quem chama de dentro de BattleField.tsx sabe se o slot
   * tem carta horizontal; PlayingCard não tem acesso a isso sozinho.
   */
  hasHorizontalOverlay?: boolean;
  /**
   * Modo Spotlight (pedido do usuário) - números em destaque neste turno,
   * `undefined`/`null` quando o modo está desligado. Usado só pra decidir se
   * mostra o selo de palavra-chave (cubo) - o valor REAL já ajustado pelo
   * Spotlight é resolvido em gameEngine.ts/aiPlayer.ts, nunca aqui (este
   * componente só exibe, nunca calcula regra). Ver spotlight.ts.
   */
  spotlight?: SpotlightState | null;
  /**
   * FIX (pedido do usuário: "consegue fazer com que a cor da face para baixo
   * de cada personagem pode ser de outra cor?" + "um equivalente mais
   * escuro da cor de cada personagem? a cor normal de hoje em dia use para
   * o anjo") - cor das costas da carta (virada pra baixo), derivada do tema
   * do personagem DONO da carta (`theme.primary`/`theme.secondary` de
   * characterThemes.ts - o mesmo par já usado nas bordas/painéis desse
   * jogador em toda a UI). `undefined` cai no dourado genérico de sempre
   * (mesmos valores hardcoded que já existiam) - nenhum call site quebra
   * por não passar isso. Deliberadamente um objeto de cores já resolvido
   * (não `playerCharacter`/`CharacterId`, que já existe pra outro fim -
   * ver `card?.isMonster` abaixo): quem chama de dentro do campo
   * (FieldSlotView.tsx) só tem o `CharacterTheme` já resolvido à mão, nunca
   * o `CharacterId` cru.
   */
  backTheme?: { primary: string; secondary: string };
}

/** Gradiente dourado genérico de sempre - usado quando `backTheme` não é passado (ver comentário acima). */
const DEFAULT_BACK_THEME = { primary: '#C59E4F', secondary: '#8F6A30' };

/**
 * Cor e nome de exibição de cada fase - usados no selo do tooltip de magia
 * (item 8) e, agora, também no tooltip da Zona Monstro (item 2 da 4ª rodada -
 * ver BattleField.tsx), por isso é exportado em vez de ficar só neste arquivo.
 */
export const PHASE_DISPLAY: Record<'draw' | 'strategy' | 'combat', { label: string; color: string }> = {
  draw: { label: 'Fase de Compra', color: '#6CC47A' },
  strategy: { label: 'Fase de Estratégia', color: '#C59E4F' },
  combat: { label: 'Fase de Combate', color: '#D45D4A' },
};

/**
 * FIX (pedido do usuário: "re-faça do zero o sistema de palavras-chave, com
 * suporte a outros ícones e outras palavras-chave no futuro") - os selos
 * "Revelada"/"Ás Transformado" (que viviam aqui como dois componentes quase
 * idênticos, feitos à mão) agora vêm do sistema unificado em
 * CardKeywords.tsx - ver os `activeKeywords`/`<CardKeywords>` espalhados
 * pelas ramificações abaixo (cada contexto - magia, Ás na mão, carta normal -
 * calcula sua própria lista de palavras-chave ativas).
 */

/**
 * PlayingCard - Renderiza uma carta em qualquer um dos contextos do jogo
 * (mão, campo virado, campo revelado, reforço horizontal, placeholder vazio).
 *
 * FIX: a variante `horizontal` (carta de reforço empilhada sobre um slot do
 * campo) tinha dois bugs na versão anterior:
 * 1. Ela só renderizava algo quando a carta era uma magia (J/Q/K) - uma
 *    carta numeral horizontal (o caso normal, já que magias nunca podem mais
 *    ser posicionadas no campo) simplesmente não aparecia (retornava null).
 * 2. Quando renderizava, sempre mostrava o valor/naipe reais da carta, mesmo
 *    quando o slot ainda não tinha sido revelado - vazando informação que o
 *    oponente não deveria conseguir ver antes do combate.
 * Agora a variante horizontal sempre renderiza (uma carta pequena), e quem
 * decide se mostra o valor real ou as costas da carta é o chamador (via
 * `faceDown`), da mesma forma que o slot principal do campo já funcionava.
 */
export function PlayingCard({
  value,
  suit: suitProp,
  faceDown,
  slot,
  horizontal,
  winner,
  className,
  card,
  phase,
  onTransformAce,
  onActivateMagic,
  canActivateMagic,
  magicTooltip,
  magicPhase,
  playerCharacter,
  isInHand,
  hasHorizontalOverlay,
  emptySlotCombatHint,
  spotlight,
  backTheme = DEFAULT_BACK_THEME,
}: PlayingCardProps) {
  const [hovering, setHovering] = useState(false);
  const suit = card ? getDisplaySuit(card) : suitProp;

  if (slot) {
    return (
      <div className={cn(
        "w-28 h-40 border-2 border-dashed border-[#C59E4F]/30 rounded-lg flex flex-col items-center justify-center gap-2",
        "hover:border-[#C59E4F] hover:bg-[#C59E4F]/5 transition-all",
        className
      )}>
        <div className="text-[#C59E4F]/50 text-[24px]">+</div>
        <p className="text-[10px] text-[#BFB6A6]">vazio</p>
        {emptySlotCombatHint && <p className="text-[9px] text-[#D45D4A]">vale 1 no combate</p>}
      </div>
    );
  }

  // Carta de reforço horizontal (pequena, sobreposta ao slot principal)
  if (horizontal) {
    if (faceDown) {
      return (
        <div
          className={cn("w-16 h-10 rounded-md border shadow-md flex items-center justify-center", className)}
          style={{
            background: `linear-gradient(135deg, ${backTheme.primary}, ${backTheme.secondary})`,
            borderColor: backTheme.secondary,
          }}
        >
          <span className="text-[#0F1113] text-[16px] font-display opacity-40">✦</span>
        </div>
      );
    }

    const isRed = suit === '♥' || suit === '♦';
    const isMagic = value === 'J' || value === 'Q' || value === 'K';
    // FIX (pedido do usuário): uma carta horizontal (reforço) exibia sempre
    // `value` cru ("A"), ignorando `card.transformedValue` - diferente da
    // carta principal do slot (normalCardBody, mais abaixo), que já mostrava
    // o valor transformado. Um Ás transformado jogado como reforço
    // horizontal aparecia como "A" em vez do número (2-10) que ele realmente
    // vale no combate, mesmo já revelado.
    const horizontalHasTransformedValue = card?.transformedValue !== undefined;
    const horizontalDisplayValue = card ? getDisplayValue(card) : value;

    return (
      <div className={cn(
        "w-16 h-10 rounded-md flex items-center justify-center border shadow-md",
        isMagic
          ? "bg-gradient-to-br from-[#1E1A16] to-[#0F1113] border-[#C59E4F] text-[#C59E4F]"
          : "bg-[#EFE7D6] border-[#8F6A30]",
        horizontalHasTransformedValue && "border-[#6CC47A]",
        className
      )}>
        <span className={cn("font-bold text-[13px]", !isMagic && (isRed ? "text-[#D45D4A]" : "text-[#0F1113]"))}>
          {horizontalDisplayValue}
          <span className="ml-0.5">{suit}</span>
        </span>
      </div>
    );
  }

  if (faceDown) {
    return (
      <div
        className={cn(
          "w-28 h-40 rounded-lg flex items-center justify-center border-2 shadow-lg relative overflow-hidden",
          className
        )}
        style={{
          background: `linear-gradient(135deg, ${backTheme.primary}, ${backTheme.secondary})`,
          borderColor: backTheme.secondary,
        }}
      >
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-3 left-3 text-[#0F1113] text-[18px] font-display">ᚱ</div>
          <div className="absolute top-3 right-3 text-[#0F1113] text-[18px] font-display">ᛟ</div>
          <div className="absolute bottom-3 left-3 text-[#0F1113] text-[18px] font-display">ᚻ</div>
          <div className="absolute bottom-3 right-3 text-[#0F1113] text-[18px] font-display">ᛗ</div>
        </div>
        <div className="text-[#0F1113] text-[48px] font-display opacity-30">✦</div>
      </div>
    );
  }

  const isRed = suit === '♥' || suit === '♦';
  const isMagic = value === 'J' || value === 'Q' || value === 'K';
  const isAce = value === 'A';
  const hasTransformedValue = card?.transformedValue !== undefined;
  const isRevealed = card?.revealed === true;
  const isFused = card?.fused === true;
  // FIX (pedido do usuário, Modo Spotlight): computado aqui incondicionalmente
  // (não vaza nada por si só) - a mesma proteção que já existe pro resto da
  // carta (`value`/`suit`/`transformedValue`) via FlipCard (só troca pra
  // "front", com tudo isso, quando `faceUp` é true) também cobre este selo,
  // já que ele nasce dentro do MESMO "front" - nenhum caminho novo de vazar
  // informação além dos que já existiam.
  const spotlightEntry = card ? getSpotlightEntry(card, spotlight) : null;
  const spotlightKeyword: CardKeywordId | null = spotlightEntry
    ? spotlightEntry.polarity === 'positive'
      ? 'spotlightPositive'
      : 'spotlightNegative'
    : null;

  // Mostrar valor transformado se existir
  const displayValue = card ? getDisplayValue(card) : value;

  // FIX (pedido do usuário: "re-faça do zero o sistema de palavras-chave") -
  // cada ramificação abaixo (magia, Ás na mão, carta normal) monta sua
  // própria lista de palavras-chave ativas a partir das MESMAS flags já
  // calculadas acima - uma única fonte de verdade por flag, várias listas
  // possíveis dependendo de qual variante da carta está sendo desenhada.
  // FIX (pedido do usuário: "a rainha do anjo impede a ativação de um efeito
  // caso a carta revelada por ela seja mágica até o fim do turno") - ver
  // Card.magicLocked (cardUtils.ts).
  const isMagicLocked = card?.magicLocked === true;
  const magicKeywords: CardKeywordId[] = [
    ...(isRevealed ? (['revealed'] as const) : []),
    ...(isFused ? (['fused'] as const) : []),
    ...(isMagicLocked ? (['magicLocked'] as const) : []),
  ];
  const aceKeywords: CardKeywordId[] = [
    ...(isRevealed ? (['revealed'] as const) : []),
    ...(hasTransformedValue ? (['transformedAce'] as const) : []),
    ...(isFused ? (['fused'] as const) : []),
    ...(spotlightKeyword ? [spotlightKeyword] : []),
  ];
  const normalKeywords: CardKeywordId[] = [
    ...(isRevealed ? (['revealed'] as const) : []),
    // FIX (pedido do usuário): só pra Ás transformado - NÃO para uma carta
    // numeral com valor copiado pela Ilusão Arcana do Mago (mesmo
    // `hasTransformedValue`, mas `isAce` distingue os dois casos).
    ...(isAce && hasTransformedValue ? (['transformedAce'] as const) : []),
    ...(isFused ? (['fused'] as const) : []),
    ...(spotlightKeyword ? [spotlightKeyword] : []),
  ];

  if (isMagic) {
    // Cartas mágicas: fundo escuro com texto/naipe dourado. Só saem da mão
    // ativando o efeito de magia (nunca são posicionadas no campo).
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn(
                "w-28 h-40 bg-gradient-to-br from-[#1E1A16] to-[#0F1113] rounded-lg flex flex-col items-center justify-between p-3",
                "border-2 shadow-lg transition-all relative overflow-hidden cursor-pointer",
                isMagicLocked ? "border-[#9B6BD1]" : winner ? "border-[#C59E4F] rune-glow animate-pulse" : "border-[#C59E4F]",
                canActivateMagic && !isMagicLocked && !hovering && "animate-pulse rune-glow",
                className
              )}
              onMouseEnter={() => setHovering(true)}
              onMouseLeave={() => setHovering(false)}
              // FIX (item 9 da 2ª rodada): o clique de ativar magia vivia
              // aqui, no card INTEIRO - isso incluía a fase de Compra, onde
              // esse mesmo clique deveria poder selecionar a carta para
              // descarte. Como um Valete costuma estar ativável logo na fase
              // de Compra (mesma fase do descarte), esse clique sempre
              // interceptava (stopPropagation) antes de chegar no handler do
              // pai que faz a seleção de descarte - na prática, um Valete
              // ativável nunca podia ser selecionado para descartar. Agora o
              // clique de ativação fica só no ícone/botão de raio central
              // (ver abaixo); clicar em qualquer outra parte do card deixa o
              // clique passar normalmente para o pai (seleção/descarte).
            >
              {/* Padrão de fundo mágico */}
              <div className="absolute inset-0 opacity-10">
                <div className="absolute top-2 left-2 text-[#C59E4F] text-[16px] font-display">✦</div>
                <div className="absolute top-2 right-2 text-[#C59E4F] text-[16px] font-display">✦</div>
                <div className="absolute bottom-2 left-2 text-[#C59E4F] text-[16px] font-display">✦</div>
                <div className="absolute bottom-2 right-2 text-[#C59E4F] text-[16px] font-display">✦</div>
              </div>

              {/* FIX (pedido do usuário: "efeito visual de correntes... para
                  indicar" a Visão Celestial do Anjo) - duas correntes em X
                  cruzando a carta, por cima de tudo (z-20), com um véu
                  violeta translúcido reforçando que a magia está trancada. */}
              {isMagicLocked && (
                <div className="absolute inset-0 z-20 pointer-events-none">
                  <div className="absolute inset-0 bg-[#2A1A3D]/35" />
                  <div
                    className="absolute top-1/2 left-1/2 w-[135%] h-[3px] -translate-x-1/2 -translate-y-1/2 rotate-45"
                    style={{ background: 'repeating-linear-gradient(90deg, #9B6BD1 0 8px, #6B4A96 8px 12px)', boxShadow: '0 0 6px #9B6BD1' }}
                  />
                  <div
                    className="absolute top-1/2 left-1/2 w-[135%] h-[3px] -translate-x-1/2 -translate-y-1/2 -rotate-45"
                    style={{ background: 'repeating-linear-gradient(90deg, #9B6BD1 0 8px, #6B4A96 8px 12px)', boxShadow: '0 0 6px #9B6BD1' }}
                  />
                </div>
              )}

              <CardKeywords active={magicKeywords} />

              <div className="text-[18px] font-bold text-[#C59E4F] z-10">
                {value}
                <span className="ml-0.5">{suit}</span>
              </div>

              {/* Ícone/botão central - único ponto que ativa a magia (ver FIX
                  item 9 acima); o resto do overlay é só decorativo e deixa o
                  clique passar para o pai. */}
              {/* FIX (pedido do usuário: "os botões... ainda aparecem pra
                  ele mesmo sem a magia numeral estar ativa") - antes bastava
                  `hovering` sozinho pra este botão aparecer, mesmo sem
                  nenhuma ação de verdade por trás dele (armadilhas do
                  Coringa fora da janela "Mão de Ferro" nunca tinham
                  `magicTooltip` preenchido nesse caso - ver PlayerZone.tsx -
                  mas o botão aparecia mesmo assim, só que sem função,
                  clicável só na aparência). Exigir `magicTooltip` também no
                  caso de hover não muda nada pros outros 4 personagens (a
                  descrição da magia deles sempre vem preenchida enquanto
                  `isMagic`), só impede este popup fantasma nas armadilhas do
                  Coringa fora da janela. */}
              {(canActivateMagic || (hovering && magicTooltip)) && isInHand && (
                <div className={cn(
                  "absolute inset-0 flex items-center justify-center z-20 bg-[#0F1113]/80",
                  !canActivateMagic && "opacity-30"
                )}>
                  <div
                    onClick={(e) => {
                      if (onActivateMagic && canActivateMagic) {
                        e.stopPropagation();
                        onActivateMagic();
                      }
                    }}
                    className={cn(
                      "w-12 h-12 rounded-full flex items-center justify-center",
                      canActivateMagic ? "bg-[#C59E4F] cursor-pointer hover:scale-110 transition-transform" : "bg-[#8F6A30]"
                    )}
                  >
                    <Sparkles className="w-6 h-6 text-[#0F1113]" />
                  </div>
                </div>
              )}

              <div className="text-[48px] leading-none text-[#C59E4F] z-10">
                {suit}
              </div>
              <div className="text-[18px] font-bold rotate-180 text-[#C59E4F] z-10">
                {value}
                <span className="ml-0.5">{suit}</span>
              </div>
            </div>
          </TooltipTrigger>
          {magicTooltip && (
            <TooltipContent className="bg-[#1E1A16] border-[#C59E4F] max-w-[220px]">
              {/* FIX (item 8): mostra em qual fase (com a cor correspondente
                  usada em todo o resto da interface) esta carta de magia pode
                  ser ativada, além da descrição do efeito. */}
              {magicPhase && (
                <p
                  className="text-[10px] font-semibold mb-1 uppercase tracking-wide"
                  style={{ color: PHASE_DISPLAY[magicPhase].color }}
                >
                  {PHASE_DISPLAY[magicPhase].label}
                </p>
              )}
              <p className="text-[#EFE7D6] text-[11px]">{magicTooltip}</p>
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Carta Ás com transformação
  if (isAce && isInHand && phase === 'strategy') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn(
                "w-28 h-40 bg-[#EFE7D6] rounded-lg flex flex-col items-center justify-between p-3",
                "border-2 shadow-lg transition-all relative overflow-hidden cursor-pointer",
                winner ? "border-[#C59E4F] rune-glow animate-pulse" : "border-[#8F6A30]",
                hasTransformedValue && "border-[#6CC47A]",
                className
              )}
              onMouseEnter={() => setHovering(true)}
              onMouseLeave={() => setHovering(false)}
              onClick={(e) => {
                // FIX (pedido do usuário: "remova a possibilidade de
                // re-transformar Ás... depois que transforma uma vez, não é
                // pra poder re-transformar em outra carta") - reverte o FIX
                // anterior que deliberadamente reabria o diálogo mesmo com
                // `hasTransformedValue` true. Agora, de novo, só um Ás AINDA
                // NÃO transformado abre o diálogo - um já transformado fica
                // fixo naquele valor pelo resto da partida (a mesma trava já
                // reforçada no motor - ver handleTransformAce em
                // gameEngine.ts - e no drag-and-drop - ver HandCardView.tsx).
                if (onTransformAce && !hasTransformedValue) {
                  e.stopPropagation();
                  onTransformAce();
                }
              }}
            >
              {/* FIX (item 4 da 1ª rodada; itens 2 e 3 da 2ª rodada): selos de
                  palavra-chave (Revelada/Ás Transformado/Fusão) - ver
                  CardKeywords.tsx. O de Revelada vai para o lado esquerdo
                  quando há uma carta horizontal empilhada em cima (evita
                  sobrepor o valor dela). */}
              <CardKeywords active={aceKeywords} overrides={hasHorizontalOverlay ? { revealed: 'top-left' } : undefined} />

              <div className={cn("text-[18px] font-bold", isRed ? "text-[#D45D4A]" : "text-[#0F1113]")}>
                {displayValue}
                <span className="ml-0.5">{suit}</span>
              </div>

              {/* Indicador de transformação do Ás */}
              {hovering && !hasTransformedValue && (
                <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-[#0F1113]/90 gap-2 p-2">
                  <Sparkles className="w-8 h-8 text-[#C59E4F]" />
                  <p className="text-[#C59E4F] text-[10px] text-center">Clique para transformar</p>
                </div>
              )}
              {hasTransformedValue && hovering && (
                <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-[#0F1113]/80 gap-1 p-2">
                  <p className="text-[#6CC47A] text-[10px] text-center">Transformado em {displayValue}</p>
                  <p className="text-[#C59E4F] text-[9px] text-center">Clique para transformar de novo</p>
                </div>
              )}

              <div className={cn("text-[48px] leading-none", isRed ? "text-[#D45D4A]" : "text-[#0F1113]")}>
                {suit}
              </div>
              <div className={cn("text-[18px] font-bold rotate-180", isRed ? "text-[#D45D4A]" : "text-[#0F1113]")}>
                {displayValue}
                <span className="ml-0.5">{suit}</span>
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent className="bg-[#1E1A16] border-[#C59E4F]">
            <p className="text-[#EFE7D6] text-[11px]">
              Ás: Escolha um valor de 2 a 10. A carta ficará <span className="text-[#6CC47A]">Revelada</span> ao ser posicionada.
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Cartas normais: fundo claro com vermelho/preto
  const normalCardBody = (
    <div className={cn(
      "w-28 h-40 bg-[#EFE7D6] rounded-lg flex flex-col items-center justify-between p-3",
      "border-2 shadow-lg transition-all relative overflow-hidden",
      winner ? "border-[#C59E4F] rune-glow animate-pulse" : "border-[#8F6A30]",
      hasTransformedValue && "border-[#6CC47A]",
      hasTransformedValue && "cursor-help",
      className
    )}>
      {/* FIX (item 4 da 1ª rodada; itens 2 e 3 da 2ª rodada): selos de
          palavra-chave (Revelada/Ás Transformado/Fusão) - ver
          CardKeywords.tsx e normalKeywords acima. */}
      <CardKeywords active={normalKeywords} overrides={hasHorizontalOverlay ? { revealed: 'top-left' } : undefined} />

      <div className={cn("text-[18px] font-bold", isRed ? "text-[#D45D4A]" : "text-[#0F1113]")}>
        {displayValue}
        <span className="ml-0.5">{suit}</span>
      </div>
      <div className={cn("text-[48px] leading-none", isRed ? "text-[#D45D4A]" : "text-[#0F1113]")}>
        {suit}
      </div>
      <div className={cn("text-[18px] font-bold rotate-180", isRed ? "text-[#D45D4A]" : "text-[#0F1113]")}>
        {displayValue}
        <span className="ml-0.5">{suit}</span>
      </div>
    </div>
  );

  // FIX ("o texto da carta monstro deve ser o efeito do personagem, não a
  // descrição da carta"): a carta Monstro (Coringa) enquanto ainda está na
  // MÃO nunca tinha nenhum tooltip - `magicTooltip` só é preenchido pelo
  // chamador (PlayerZone.tsx) para cartas de magia J/Q/K (`isMagic
  // ? getMagicCardInfo(...) : undefined`), e o Coringa não é J/Q/K nem Ás,
  // então caía direto no `normalCardBody` puro, sem tooltip nenhum. A única
  // informação sobre o efeito de Monstro existia depois de POSICIONADA na
  // Zona Monstro (ver MonsterZone.tsx) - na mão, o jogador não tinha como
  // saber o que a carta faz para o personagem que está usando. Agora, com a
  // carta ainda na mão, o hover mostra o mesmo efeito específico do
  // personagem (nome + descrição detalhada, vindos de getMonsterEffect - a
  // mesma fonte de dados já usada pela Zona Monstro), nunca uma descrição
  // genérica de "o que é uma carta Monstro" (essa explicação genérica fica só
  // nas Regras - ver Rules.tsx).
  if (card?.isMonster && isInHand && playerCharacter) {
    const monsterEffect = getMonsterEffect(playerCharacter);
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{normalCardBody}</TooltipTrigger>
          <TooltipContent className="bg-[#1E1A16] border-[#C59E4F] max-w-[220px]">
            <p className="text-[10px] font-semibold mb-1 uppercase tracking-wide" style={{ color: '#C59E4F' }}>
              🃏 {monsterEffect.name}
            </p>
            <p className="text-[10px] font-semibold mb-1 uppercase tracking-wide flex gap-2">
              <span style={{ color: PHASE_DISPLAY.strategy.color }}>{PHASE_DISPLAY.strategy.label}</span>
              <span className="text-[#BFB6A6]">ou</span>
              <span style={{ color: PHASE_DISPLAY.combat.color }}>{PHASE_DISPLAY.combat.label}</span>
            </p>
            <p className="text-[#EFE7D6] text-[11px]">{monsterEffect.detailedDescription}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // FIX (item 4 da 4ª rodada): "no efeito da carta monstro do mago, deve ser
  // mostrado no tooltip da carta que ela se transformou em outra e qual era
  // o valor antes" - esta é a carta como ela aparece no CAMPO (não na mão,
  // esse caso já tem tooltip próprio no ramo "Carta Ás com transformação"
  // acima). Uma carta de campo com `transformedValue` já ganhava uma borda
  // verde, mas nenhum tooltip explicava o que aconteceu - nem para um Ás
  // transformado, nem (o caso deste item) para uma carta numeral que recebeu
  // um valor copiado pela Ilusão Arcana do Mago. `value` aqui ainda é o valor
  // ORIGINAL da carta (só `displayValue` usa o transformado), então dá para
  // distinguir os dois casos e mostrar o valor original certo em cada um.
  if (hasTransformedValue) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{normalCardBody}</TooltipTrigger>
          <TooltipContent className="bg-[#1E1A16] border-[#C59E4F] max-w-[220px]">
            <p className="text-[#EFE7D6] text-[11px]">
              {isAce
                ? <>Ás transformado: vale <span className="text-[#6CC47A] font-semibold">{displayValue}</span> no combate.</>
                : <>Transformada pela Ilusão Arcana do Mago: valor original <span className="font-semibold">{value}</span>, agora vale <span className="text-[#6CC47A] font-semibold">{displayValue}</span> no combate.</>}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return normalCardBody;
}
