import { useState, type ComponentType, type CSSProperties } from 'react';
import { Button } from './ui/button';
import { ArrowLeft, Wand2, Bot, Dices, Info, Crosshair, Flame } from 'lucide-react';
import { AngelHaloIcon, BeastFaceIcon, JesterHatIcon } from './CharacterGlyphIcons';
import { CharacterDivider } from './CharacterDivider';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { ScrollArea } from './ui/scroll-area';
import { getCharacterTheme } from '../lib/characterThemes';
import { getMagicCardInfo, type MagicCardType } from '../lib/magicCards';
import { getMonsterEffect } from '../lib/monsterCards';
import { getNumeralSpellInfo, formatNumeralRequirement } from '../lib/numeralSpells';
import { PHASE_DISPLAY } from './PlayingCard';

type CharacterId = 'mago' | 'besta' | 'anjo' | 'mosqueteiro' | 'coringa' | 'piromante';

interface CharacterSelectionProps {
  onBack: () => void;
  onSelect: (character: 'mago' | 'besta' | 'anjo' | 'mosqueteiro' | 'coringa' | 'piromante', playerNumber: 1 | 2) => void;
  currentPlayer: 1 | 2;
  selectedCharacters: {
    player1?: 'mago' | 'besta' | 'anjo' | 'mosqueteiro' | 'coringa' | 'piromante';
    player2?: 'mago' | 'besta' | 'anjo' | 'mosqueteiro' | 'coringa' | 'piromante';
  };
  /**
   * Quais jogadores (nenhum, um ou os dois) são a IA nesta partida - vazio no
   * Hotseat, `[2]` em "Contra a IA", `[1, 2]` no Modo Espectador (pedido do
   * usuário: "modo espectador... IA vs IA" - os dois lados são escolhidos
   * aqui do mesmo jeito, só que ambos rotulados como IA). Só muda textos/
   * labels desta tela - a lógica de seleção em si é idêntica pros três casos
   * (a IA joga com o personagem escolhido aqui, ver GameBoard.tsx).
   */
  aiPlayers?: (1 | 2)[];
}

// FIX (pedido do usuário: "use esses ícones" - imagem de referência com
// halo, rosto de fera com presas e chapéu de bobo da corte, todos em
// estilo sólido/preenchido) - `Wand2` (cajado com brilho, lucide) continua
// pro Mago; Besta/Anjo/Coringa agora usam os 3 ícones customizados de
// CharacterGlyphIcons.tsx (lucide-react não tem nenhum equivalente pronto,
// e mesmo se tivesse seria no estilo de contorno, não sólido como a
// referência). Tipo relaxado pra `ComponentType<{ className?: string }>`
// (em vez de `typeof Crown`, específico do lucide) porque os 3 ícones
// customizados não são ícones lucide - só precisam aceitar `className`, o
// único prop que este mapa realmente usa em qualquer um deles (ver
// renderização abaixo).
const CHARACTER_ICONS: Record<CharacterId, ComponentType<{ className?: string }>> = {
  mago: Wand2,
  besta: BeastFaceIcon,
  anjo: AngelHaloIcon,
  mosqueteiro: Crosshair,
  coringa: JesterHatIcon,
  piromante: Flame,
};

/**
 * FIX (pedido do usuário: "resuma os efeitos e permita que a pessoa clique
 * em um botão de 'visão completa das habilidades'") - frase curta de
 * identidade por personagem, mesma classificação já usada como comentário
 * de design em magicCards.ts ("DESIGN DOS PERSONAGENS") - não é um resumo
 * inventado à parte, é a mesma categorização de sempre, só citada aqui.
 */
const CHARACTER_TAGLINE: Record<CharacterId, string> = {
  mago: 'Informação e controle',
  besta: 'Agressão e recuperação',
  anjo: 'Crescimento e suporte',
  mosqueteiro: 'Descarte e precisão',
  coringa: 'Armadilhas e sabotagem',
  piromante: 'Combustível e destruição em área',
};

/**
 * Miniatura visual de uma carta de Magia (Valete/Rainha/Rei), no mesmo
 * estilo escuro/dourado usado na carta de verdade (ver PlayingCard.tsx,
 * ramo `isMagic`) - só que estática/sem interação, usada só dentro do
 * diálogo de "Visão completa" (ver DetailsDialog abaixo).
 */
function MiniMagicCard({ type }: { type: MagicCardType }) {
  return (
    <div className="w-14 h-20 flex-shrink-0 bg-gradient-to-br from-[#1E1A16] to-[#0F1113] border-2 border-[#C59E4F] rounded-md flex items-center justify-center relative overflow-hidden shadow-md">
      <span className="absolute top-1 left-1 text-[#C59E4F] text-[8px] font-display opacity-40">✦</span>
      <span className="absolute bottom-1 right-1 text-[#C59E4F] text-[8px] font-display opacity-40">✦</span>
      <span className="text-[#C59E4F] text-[24px] font-display font-bold">{type}</span>
    </div>
  );
}

/** Miniatura da carta Monstro (Coringa) - mesmo estilo escuro/dourado das cartas de Magia, com o glifo de Coringa no centro. */
function MiniMonsterCard() {
  return (
    <div className="w-14 h-20 flex-shrink-0 bg-gradient-to-br from-[#1E1A16] to-[#0F1113] border-2 border-[#C59E4F] rounded-md flex items-center justify-center shadow-md">
      <span className="text-[26px]">🃏</span>
    </div>
  );
}

/** Miniatura representando a Magia Numeral - uma carta numeral (estilo claro, como as cartas comuns) com o número exigido e um "×3" indicando que são 3 cópias. Recebe o valor já formatado para exibição (ver formatNumeralRequirement em numeralSpells.ts), nunca o `requiredNumber` numérico bruto direto. */
function MiniNumeralCard({ requirementLabel }: { requirementLabel: string }) {
  return (
    <div className="w-14 h-20 flex-shrink-0 bg-[#EFE7D6] border-2 border-[#8F6A30] rounded-md flex flex-col items-center justify-center gap-0.5 shadow-md">
      <span className="text-[#0F1113] text-[24px] font-bold leading-none">{requirementLabel}</span>
      <span className="text-[10px] text-[#8F6A30] font-semibold">× 3</span>
    </div>
  );
}

/** Selo colorido de fase, reaproveitando exatamente as mesmas cores/rótulos já usados nos tooltips de carta durante o jogo (PHASE_DISPLAY, PlayingCard.tsx) - a mesma cor sempre significa a mesma fase em toda a interface. */
function PhasePill({ phase }: { phase: 'draw' | 'strategy' | 'combat' }) {
  const info = PHASE_DISPLAY[phase];
  return (
    <span
      className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded whitespace-nowrap"
      style={{ color: info.color, backgroundColor: `${info.color}1A`, border: `1px solid ${info.color}40` }}
    >
      {info.label}
    </span>
  );
}

/** Uma linha de habilidade completa: miniatura da carta + nome + selo(s) de fase + descrição. Usado só dentro do diálogo de "Visão completa" - a prévia do card fica com uma versão bem mais compacta (ver CompactAbilityRow). */
function AbilityRow({
  card,
  name,
  phases,
  description,
}: {
  card: React.ReactNode;
  name: string;
  phases: Array<'draw' | 'strategy' | 'combat'>;
  description: string;
}) {
  return (
    <div className="flex gap-3 items-start">
      {card}
      <div className="space-y-1 flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-[13px] text-[#EFE7D6] font-semibold">{name}</p>
          {phases.map((phase) => (
            <PhasePill key={phase} phase={phase} />
          ))}
        </div>
        <p className="text-[12px] text-[#BFB6A6] leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

/** Selo compacto (letra/número) usado na prévia resumida do card - versão minúscula de MiniMagicCard/MiniMonsterCard/MiniNumeralCard, só a identidade visual, sem espaço para descrição. */
function CompactBadge({ label, light }: { label: string; light?: boolean }) {
  return (
    <span
      className={`w-6 h-6 flex-shrink-0 rounded flex items-center justify-center text-[11px] font-bold ${
        light
          ? 'bg-[#EFE7D6] border border-[#8F6A30] text-[#0F1113]'
          : 'bg-gradient-to-br from-[#1E1A16] to-[#0F1113] border border-[#C59E4F] text-[#C59E4F]'
      }`}
    >
      {label}
    </span>
  );
}

/**
 * DetailsDialog - "visão completa das habilidades" (pedido do usuário): o
 * conteúdo rico que antes ficava sempre visível em cada card (carta + fase +
 * descrição de cada Magia, do Monstro e da Magia Numeral) - agora só aparece
 * ao clicar no botão dedicado, em vez de sempre ocupar a tela toda. Dados
 * vindos direto de magicCards.ts/monsterCards.ts/numeralSpells.ts (mesma
 * fonte usada pelo jogo em si), então nunca ficam desatualizados em relação
 * às regras reais.
 */
function DetailsDialog({
  character,
  open,
  onOpenChange,
}: {
  character: CharacterId;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const theme = getCharacterTheme(character);
  const monsterEffect = getMonsterEffect(character);
  const numeralSpell = getNumeralSpellInfo(character);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1E1A16] border-[#C59E4F] max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-display text-[28px]" style={{ color: theme.primary }}>
            {theme.name}
          </DialogTitle>
          <DialogDescription className="text-[#BFB6A6]">Visão completa das habilidades</DialogDescription>
        </DialogHeader>
        <ScrollArea className="flex-1 pr-4 -mr-4">
          <div className="space-y-6 py-1">
            <div className="space-y-4">
              <p className="text-[11px] uppercase tracking-wider text-[#8F6A30] font-semibold">Magias</p>
              <div className="space-y-4">
                {(['J', 'Q', 'K'] as MagicCardType[]).map((type) => {
                  const info = getMagicCardInfo(character, type);
                  return (
                    <AbilityRow
                      key={type}
                      card={<MiniMagicCard type={type} />}
                      name={info.name}
                      phases={[info.phase]}
                      description={info.description}
                    />
                  );
                })}
              </div>
            </div>

            {/* Carta Monstro: o efeito pode ser ativado tanto na fase de
                Estratégia quanto na de Combate (mesma janela já documentada
                no tooltip da carta durante o jogo, ver PlayingCard.tsx). */}
            <div className="space-y-4">
              <p className="text-[11px] uppercase tracking-wider text-[#8F6A30] font-semibold">Carta Monstro</p>
              <AbilityRow
                card={<MiniMonsterCard />}
                name={`🃏 ${monsterEffect.name}`}
                phases={['strategy', 'combat']}
                description={monsterEffect.detailedDescription}
              />
            </div>

            {/* Magia Numeral: só pode ser ativada na fase de Estratégia
                (regra fixa, ver numeralSpells.ts). */}
            <div className="space-y-4">
              <p className="text-[11px] uppercase tracking-wider text-[#8F6A30] font-semibold">Magia Numeral</p>
              <AbilityRow
                card={<MiniNumeralCard requirementLabel={formatNumeralRequirement(numeralSpell)} />}
                name={numeralSpell.name}
                phases={['strategy']}
                description={`Requer 3 cartas de valor ${formatNumeralRequirement(numeralSpell)} na mão. ${numeralSpell.description}`}
              />
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export function CharacterSelection({ onBack, onSelect, currentPlayer, selectedCharacters, aiPlayers = [] }: CharacterSelectionProps) {
  const isAiStep = aiPlayers.includes(currentPlayer);
  // Modo Espectador (os 2 jogadores são IA): distingue "IA 1"/"IA 2" no
  // título, já que "Escolha o Personagem da IA" sozinho ficaria ambíguo com
  // as duas etapas idênticas - em "Contra a IA" (só um lado é IA) o título
  // genérico de sempre continua bastando.
  const isSpectatorMode = aiPlayers.length >= 2;
  const characterIds: CharacterId[] = ['mago', 'besta', 'anjo', 'mosqueteiro', 'coringa', 'piromante'];
  // FIX (pedido do usuário: "as informações... são repulsivas a novos
  // jogadores, resuma os efeitos e permita que a pessoa clique em um botão
  // de 'visão completa das habilidades'") - qual personagem (se algum) tem o
  // diálogo de detalhes aberto agora.
  const [detailsOpenFor, setDetailsOpenFor] = useState<CharacterId | null>(null);

  const isDisabled = (charId: string) => {
    if (currentPlayer === 1) return false;
    return selectedCharacters.player1 === charId;
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 parchment">
      <div className="w-full max-w-7xl space-y-8">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="text-[#C59E4F] hover:text-[#8F6A30]"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h2 className="font-display text-[40px] text-[#C59E4F] flex items-center gap-3">
            {isAiStep ? (
              <>
                <Bot className="w-8 h-8" />
                Escolha o Personagem da IA{isSpectatorMode ? ` ${currentPlayer}` : ''}
              </>
            ) : (
              `Seleção de Personagem - Jogador ${currentPlayer}`
            )}
          </h2>
        </div>

        {isAiStep && (
          <div className="flex items-center justify-between gap-4 bg-[#1E1A16] border border-[#C59E4F]/30 rounded-lg px-6 py-4">
            <p className="text-[#BFB6A6] text-[14px]">
              A IA vai jogar com o personagem escolhido aqui. Prefere não decidir? Deixe o destino escolher.
            </p>
            <Button
              onClick={() => {
                const available = characterIds.filter((id) => !isDisabled(id));
                const pick = available[Math.floor(Math.random() * available.length)];
                onSelect(pick, currentPlayer);
              }}
              variant="outline"
              className="border-[#C59E4F] text-[#C59E4F] hover:bg-[#C59E4F]/10 flex-shrink-0"
            >
              <Dices className="w-4 h-4 mr-2" />
              Sortear personagem da IA
            </Button>
          </div>
        )}

        {/* FIX (pedido do usuário: "volte atrás com a ideia da escolha de
            personagem ser horizontal") - de volta ao grid original (1
            coluna em telas estreitas, empilhando verticalmente, até 4
            colunas lado a lado em telas largas). O fix do "(i)" que vazava
            do botão "Visão completa" continua de pé, só que agora
            independente da largura do card - ver `whitespace-normal` no
            próprio botão, mais abaixo. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-8">
          {characterIds.map((charId) => {
            const Icon = CHARACTER_ICONS[charId];
            const theme = getCharacterTheme(charId);
            const disabled = isDisabled(charId);
            const monsterEffect = getMonsterEffect(charId);
            const numeralSpell = getNumeralSpellInfo(charId);

            return (
              <div
                key={charId}
                // FIX (pedido do usuário: "faça a borda de cada personagem
                // na seleção remeter a suas cores") - trocado o dourado
                // fixo pela cor de tema de cada personagem (ver
                // `.character-card`/`.character-card:hover` em
                // globals.css) - `theme.glow` já é uma string rgba pronta
                // (definida por personagem em characterThemes.ts), então o
                // brilho no hover também fica na cor certa, não só a borda.
                className={`bg-[#1E1A16] border-2 rounded-lg p-8 space-y-6 transition-all character-card ${
                  disabled ? 'opacity-50' : ''
                }`}
                style={
                  {
                    '--card-border-dim': disabled ? `${theme.primary}30` : `${theme.primary}60`,
                    '--card-border-hover': theme.primary,
                    '--card-glow': theme.glow,
                  } as CSSProperties
                }
              >
                <div className="text-center space-y-3">
                  <div className="flex justify-center">
                    <div className="w-24 h-24 rounded-full bg-[#C59E4F]/20 flex items-center justify-center">
                      <Icon className="w-12 h-12 text-[#C59E4F]" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h3 className="font-display text-[32px] text-[#EFE7D6] tracking-wider">
                      {theme.name}
                    </h3>
                    <CharacterDivider />
                    <p className="text-[13px] text-[#BFB6A6] italic">{CHARACTER_TAGLINE[charId]}</p>
                  </div>
                </div>

                {/* Resumo compacto (pedido do usuário: "resuma os efeitos") -
                    só o nome de cada habilidade, sem descrição nem selo de
                    fase - a versão completa fica no botão "Visão completa"
                    abaixo, num diálogo à parte. */}
                <div className="space-y-2">
                  {(['J', 'Q', 'K'] as MagicCardType[]).map((type) => (
                    <div key={type} className="flex items-center gap-2.5">
                      <CompactBadge label={type} />
                      <p className="text-[13px] text-[#EFE7D6] truncate">{getMagicCardInfo(charId, type).name}</p>
                    </div>
                  ))}
                  <div className="flex items-center gap-2.5">
                    <CompactBadge label="🃏" />
                    <p className="text-[13px] text-[#EFE7D6] truncate">{monsterEffect.name}</p>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <CompactBadge label={formatNumeralRequirement(numeralSpell)} light />
                    <p className="text-[13px] text-[#EFE7D6] truncate">{numeralSpell.name}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  {/* FIX (pedido do usuário: "ajeite o (i) para caber dentro
                      do retângulo") - causa raiz achada medindo o layout ao
                      vivo: o texto "Visão completa das habilidades" (que não
                      quebra linha por padrão, `whitespace-nowrap` vem do
                      Button base) é mais largo que o espaço disponível numa
                      coluna estreita do grid - com `justify-center`, o
                      conteúdo que não cabe vaza pros dois lados igualmente, e
                      o ícone (i), por ser o primeiro elemento, era o que
                      escapava visivelmente pela borda esquerda.
                      `whitespace-normal` deixa o texto quebrar pra uma 2ª
                      linha em vez de vazar - `h-auto min-h-10 py-2` solta a
                      altura fixa (que cortava a 2ª linha) sem forçar todo
                      botão a crescer quando cabe numa linha só. */}
                  <Button
                    onClick={() => setDetailsOpenFor(charId)}
                    variant="outline"
                    className="w-full border-[#8F6A30] text-[#BFB6A6] hover:bg-[#8F6A30]/10 h-auto min-h-10 py-2 whitespace-normal text-[13px]"
                  >
                    <Info className="w-4 h-4 mr-2 flex-shrink-0" />
                    Visão completa das habilidades
                  </Button>

                  <Button
                    onClick={() => onSelect(charId, currentPlayer)}
                    disabled={disabled}
                    className="w-full bg-[#C59E4F] hover:bg-[#8F6A30] text-[#0F1113] h-12 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {disabled ? 'Já Selecionado' : isAiStep ? 'Selecionar para a IA' : 'Selecionar'}
                  </Button>
                </div>

                <DetailsDialog
                  character={charId}
                  open={detailsOpenFor === charId}
                  onOpenChange={(open) => setDetailsOpenFor(open ? charId : null)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
