import { Eye, Wand2, ShieldCheck, Combine, Box, Lock, type LucideIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { cn } from './ui/utils';

/**
 * CardKeywords.tsx - Sistema de Palavras-chave da carta (pedido do usuário:
 * "re-faça do zero o sistema de palavras-chave... com suporte a outros
 * ícones e outras palavras-chave no futuro").
 *
 * ANTES: cada palavra-chave (Revelada, Ás Transformado, Proteção Divina) era
 * um componente separado, feito à mão, cada um com seu próprio JSX de selo +
 * tooltip quase idêntico (só cor/ícone/texto/posição mudavam) - PlayingCard.tsx
 * tinha `RevealedEyeBadge`/`TransformedAceBadge`, FieldSlotView.tsx tinha um
 * `<ShieldCheck>` cru direto no JSX, sem nenhuma ligação entre os três.
 * Adicionar uma 4ª palavra-chave (Fusão, pedido nesta mesma rodada) exigiria
 * copiar e colar mais um componente quase idêntico.
 *
 * AGORA: uma única fonte de verdade (CARD_KEYWORDS abaixo) - cada
 * palavra-chave é uma ENTRADA de dados (ícone, cor, texto curto, descrição
 * completa, canto padrão onde o selo nasce), e um único componente
 * (`CardKeywords`) sabe renderizar QUALQUER lista de palavras-chave ativas,
 * em qualquer contexto (carta na mão, no campo, ou até um selo "maior" fora
 * da própria carta, como a Proteção Divina no slot inteiro - ver `size`).
 * Adicionar uma nova palavra-chave no futuro = só uma nova entrada aqui,
 * nenhum componente novo.
 */

export type CardKeywordId = 'revealed' | 'transformedAce' | 'divineProtection' | 'fused' | 'spotlightPositive' | 'spotlightNegative' | 'magicLocked';

export interface CardKeywordDef {
  icon: LucideIcon;
  /** Cor do selo (fundo) e do acento no tooltip. */
  color: string;
  /** Título curto, mostrado em destaque no tooltip. */
  label: string;
  /** Explicação completa, mostrada no corpo do tooltip. */
  description: string;
  /** Canto padrão onde o selo nasce quando nenhum `overrides` é passado. */
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

export const CARD_KEYWORDS: Record<CardKeywordId, CardKeywordDef> = {
  revealed: {
    icon: Eye,
    color: '#4FA8E0',
    label: 'Revelada',
    description: 'Revelada: o oponente também pode ver o valor desta carta.',
    position: 'top-right',
  },
  transformedAce: {
    icon: Wand2,
    color: '#6CC47A',
    label: 'Ás Transformado',
    description: 'Ás transformado: este valor foi escolhido pelo jogador, não é a face original da carta.',
    position: 'bottom-right',
  },
  divineProtection: {
    icon: ShieldCheck,
    color: '#6CC47A',
    label: 'Proteção Divina',
    description: 'Protegida por Proteção Divina: não pode ser alvo de magias do oponente.',
    position: 'top-left',
  },
  // FIX (pedido do usuário: "adicione uma palavra-chave para mostrar que a
  // carta foi fruto de uma fusão") - ver fusion.ts para a mecânica completa.
  fused: {
    icon: Combine,
    color: '#C59E4F',
    label: 'Fusão',
    description: 'Fruto de Fusão: nasceu da soma de 2 cartas numerais da mão.',
    position: 'bottom-left',
  },
  // FIX (pedido do usuário, Modo Spotlight: "o modo adiciona uma palavra
  // chave com ícone que é um cubo") - ver spotlight.ts para a mecânica
  // completa. `top-left` de propósito: é o único canto que nenhuma das
  // outras palavras-chave DESTA carta (revealed/transformedAce/fused) usa
  // por padrão, minimizando sobreposição - só colide em casos raros (ex.:
  // esta mesma carta também sob a Proteção Divina do Anjo, que usa esse
  // canto num selo À PARTE, maior, direto em FieldSlotView.tsx).
  spotlightPositive: {
    icon: Box,
    color: '#F2C94C',
    label: 'Spotlight (+)',
    description: 'Spotlight positivo: o valor desta carta vale 3x mais em tudo (combate, Magia Numeral, Torres).',
    position: 'top-left',
  },
  spotlightNegative: {
    icon: Box,
    color: '#8A5A5A',
    label: 'Spotlight (-)',
    description: 'Spotlight negativo: o valor desta carta está fixado em 1 em tudo (combate, Magia Numeral, Torres).',
    position: 'top-left',
  },
  // FIX (pedido do usuário: "a rainha do anjo agora impede a ativação de um
  // efeito caso a carta revelada por ela seja uma carta mágica até o fim do
  // turno... adicione um efeito visual de correntes ou de aureola") - ver
  // Card.magicLocked (cardUtils.ts) e o guard em canActivateMagic/
  // handleExecuteMagic.
  magicLocked: {
    icon: Lock,
    color: '#9B6BD1',
    label: 'Trancada',
    description: 'Trancada pela Visão Celestial do Anjo: esta magia não pode ser ativada até o fim do turno.',
    position: 'bottom-right',
  },
};

const POSITION_CLASS: Record<CardKeywordDef['position'], string> = {
  'top-left': 'top-1 left-1',
  'top-right': 'top-1 right-1',
  'bottom-left': 'bottom-1 left-1',
  'bottom-right': 'bottom-1 right-1',
};

interface CardKeywordsProps {
  /** Quais palavras-chave estão ativas AGORA nesta carta/slot - a ordem não importa, cada uma já sabe seu próprio canto. */
  active: CardKeywordId[];
  /**
   * Sobrescreve o canto padrão de uma ou mais palavras-chave específicas
   * neste contexto - ex.: o selo de "Revelada" precisa ir para a esquerda
   * quando há uma carta horizontal empilhada por cima (que ocupa a direita).
   */
  overrides?: Partial<Record<CardKeywordId, CardKeywordDef['position']>>;
  /**
   * 'sm' (padrão) = selo pequeno, para dentro da própria carta (mão/campo).
   * 'md' = selo maior, para quando a palavra-chave descreve um SLOT inteiro
   * em vez de uma carta específica (ex.: Proteção Divina, que protege a
   * carta principal E qualquer reforço horizontal empilhado em cima).
   */
  size?: 'sm' | 'md';
}

/** Renderiza todos os selos de palavra-chave ATIVOS para este contexto - cada um com seu próprio ícone/cor/tooltip/canto, vindos de CARD_KEYWORDS. */
export function CardKeywords({ active, overrides, size = 'sm' }: CardKeywordsProps) {
  if (active.length === 0) return null;
  return (
    <>
      {active.map((id) => (
        <KeywordBadge key={id} id={id} position={overrides?.[id]} size={size} />
      ))}
    </>
  );
}

function KeywordBadge({
  id,
  position,
  size,
}: {
  id: CardKeywordId;
  position?: CardKeywordDef['position'];
  size: 'sm' | 'md';
}) {
  const def = CARD_KEYWORDS[id];
  const Icon = def.icon;
  const positionClass = POSITION_CLASS[position ?? def.position];

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'absolute z-20 rounded-full flex items-center justify-center cursor-help',
              positionClass,
              size === 'md' ? 'w-6 h-6' : 'p-1'
            )}
            style={{ backgroundColor: def.color }}
            aria-label={def.label}
          >
            <Icon className={size === 'md' ? 'w-3.5 h-3.5 text-[#0F1113]' : 'w-3 h-3 text-[#0F1113]'} />
          </div>
        </TooltipTrigger>
        <TooltipContent className="bg-[#1E1A16] max-w-[200px]" style={{ borderColor: def.color }}>
          <p className="text-[11px] font-semibold mb-0.5" style={{ color: def.color }}>
            {def.label}
          </p>
          <p className="text-[#EFE7D6] text-[11px]">{def.description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
