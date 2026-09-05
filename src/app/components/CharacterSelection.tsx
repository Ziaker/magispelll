import { useState, type ComponentType, type CSSProperties } from 'react';
import { Button } from './ui/button';
import { ArrowLeft, Wand2, Bot, Dices, Info, Crosshair, Flame, Sprout } from 'lucide-react';
import { AngelHaloIcon, BeastFaceIcon, JesterHatIcon } from './CharacterGlyphIcons';
import { CharacterDivider } from './CharacterDivider';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { ScrollArea } from './ui/scroll-area';
import { getCharacterTheme } from '../lib/characterThemes';
import { getMagicCardInfo, type MagicCardType } from '../lib/magicCards';
import { getMonsterEffect } from '../lib/monsterCards';
import { getNumeralSpellInfo, formatNumeralRequirement, numeralDisplayLabel } from '../lib/numeralSpells';
import { PHASE_DISPLAY } from './PlayingCard';
import type { CharacterId } from '../lib/gameEngine';
import { PreGameSteps } from './PreGameSteps';

interface CharacterSelectionProps {
  onBack: () => void;
  onSelect: (character: CharacterId, playerNumber: 1 | 2) => void;
  /**
   * FIX (pedido do usuário: "escolher os 2 personagens na mesma tela") -
   * antes esta tela tinha 2 ETAPAS (App.tsx trocava `currentPlayer` de 1
   * pra 2 e re-renderizava a tela inteira do zero); agora os dois jogadores
   * são escolhidos na MESMA tela (um grid só, um "slot ativo" decide pra
   * quem o próximo clique vale) - `onContinue` é chamado quando os dois já
   * têm personagem, substituindo o antigo avanço automático pra 'game' ao
   * escolher o 2º personagem (App.tsx decide pra onde ir - 'summary' no
   * fluxo normal, 'game' direto no atalho de Partida Rápida).
   */
  onContinue: () => void;
  selectedCharacters: {
    player1?: CharacterId;
    player2?: CharacterId;
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
  /** FIX (item 28 do Grupo G): omitido no atalho de Partida Rápida (App.tsx). */
  showSteps?: boolean;
  /** FIX (item 30b do Grupo G): "Ver nas Regras" no diálogo de Visão completa - navega pra Regras já com esse termo de busca preenchido. */
  onOpenRules?: (searchTerm: string) => void;
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
  druida: Sprout,
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
  druida: 'Crescimento e simbiose',
};

/**
 * FIX (item 30c do Grupo G da lista de afazeres, "filtro/agrupamento por
 * mecânica"): com 7 personagens de mecânicas bem diferentes numa grade só,
 * fica denso pra quem não conhece todos ainda. Uma categoria PRINCIPAL por
 * personagem (a mecânica que mais o define, não uma lista exaustiva) alimenta
 * um filtro rápido acima do grid - "Todos" continua mostrando os 7.
 */
const CHARACTER_MECHANIC: Record<CharacterId, string> = {
  mago: 'Informação',
  besta: 'Recursos',
  anjo: 'Recursos',
  mosqueteiro: 'Descarte',
  coringa: 'Armadilhas',
  piromante: 'Área',
  druida: 'Campo',
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

/**
 * Miniatura representando a Magia Numeral - uma carta numeral (estilo claro,
 * como as cartas comuns) com o(s) valor(es) exigido(s). FIX (Druida,
 * personagem novo - Fotossíntese, primeira Magia Numeral a exigir 3 valores
 * DIFERENTES em vez de 3 cópias do mesmo): antes recebia só o texto já
 * formatado e sempre mostrava um "× 3" fixo embaixo (correto quando os 3
 * números são iguais, enganoso pro Druida - "A, 3, 7 × 3" pareceria pedir 9
 * cartas). Agora recebe `requiredNumbers` bruto e decide sozinho: valores
 * iguais mostram o número grande + "× 3" (como antes); valores diferentes
 * mostram a lista inteira formatada, sem badge de multiplicação nenhuma.
 */
function MiniNumeralCard({ requiredNumbers }: { requiredNumbers: number[] }) {
  const allSame = requiredNumbers.every((n) => n === requiredNumbers[0]);
  const label = allSame ? numeralDisplayLabel(requiredNumbers[0]) : requiredNumbers.map(numeralDisplayLabel).join(', ');
  return (
    <div className="w-14 h-20 flex-shrink-0 bg-[#EFE7D6] border-2 border-[#8F6A30] rounded-md flex flex-col items-center justify-center gap-0.5 shadow-md">
      <span className={`text-[#0F1113] font-bold leading-none ${allSame ? 'text-[24px]' : 'text-[15px]'}`}>{label}</span>
      {allSame && <span className="text-[10px] text-[#8F6A30] font-semibold">× 3</span>}
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
  onOpenRules,
}: {
  character: CharacterId;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenRules?: (searchTerm: string) => void;
}) {
  const theme = getCharacterTheme(character);
  const monsterEffect = getMonsterEffect(character);
  const numeralSpell = getNumeralSpellInfo(character);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1E1A16] border-[#C59E4F] max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pr-6">
            <div>
              <DialogTitle className="font-display text-[28px]" style={{ color: theme.primary }}>
                {theme.name}
              </DialogTitle>
              <DialogDescription className="text-[#BFB6A6]">Visão completa das habilidades</DialogDescription>
            </div>
            {/* FIX (item 30b do Grupo G, "link direto do diálogo pra seção
                correspondente em Rules.tsx") - reaproveita a busca já
                existente em Regras em vez de duplicar a descrição aqui de
                outro jeito; qualquer seção que cite o nome do personagem
                aparece, sem precisar de um mecanismo de "rolar até a seção
                X" novo. */}
            {onOpenRules && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenRules(theme.name)}
                className="flex-shrink-0 border-[#C59E4F]/50 text-[#C59E4F] hover:bg-[#C59E4F]/10 text-[11px]"
              >
                Ver nas Regras
              </Button>
            )}
          </div>
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
                card={<MiniNumeralCard requiredNumbers={numeralSpell.requiredNumbers} />}
                name={numeralSpell.name}
                phases={['strategy']}
                description={`Requer as cartas ${formatNumeralRequirement(numeralSpell)} na mão. ${numeralSpell.description}`}
              />
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export function CharacterSelection({ onBack, onSelect, onContinue, selectedCharacters, aiPlayers = [], showSteps = true, onOpenRules }: CharacterSelectionProps) {
  // FIX (pedido do usuário: "escolher os 2 personagens na mesma tela") -
  // substitui o antigo `currentPlayer` (prop controlada por App.tsx,
  // trocando de tela inteira entre as 2 etapas) por um "slot ativo" local -
  // decide só pra QUEM o próximo clique num personagem do grid vale. Não
  // precisa vir de fora porque nada além desta tela precisa saber disso.
  const [activeSlot, setActiveSlot] = useState<1 | 2>(1);
  const isSpectatorMode = aiPlayers.length >= 2;
  // FIX (endurecimento pedido pelo usuário: "está pronto para mais um
  // personagem?") - antes um array literal solto, podendo divergir de
  // CHARACTER_ICONS/CHARACTER_TAGLINE acima sem nenhum aviso (esquecer um
  // personagem aqui só o tirava desta tela, em silêncio). Derivado das
  // chaves de CHARACTER_ICONS (já `Record<CharacterId, ...>`, compilador
  // exige as 6/7/N chaves) - as duas listas nunca podem mais divergir.
  const characterIds = Object.keys(CHARACTER_ICONS) as CharacterId[];
  // FIX (pedido do usuário: "as informações... são repulsivas a novos
  // jogadores, resuma os efeitos e permita que a pessoa clique em um botão
  // de 'visão completa das habilidades'") - qual personagem (se algum) tem o
  // diálogo de detalhes aberto agora.
  const [detailsOpenFor, setDetailsOpenFor] = useState<CharacterId | null>(null);
  // FIX (item 30c do Grupo G, "filtro por mecânica") - 'Todos' (padrão) não
  // esconde ninguém; qualquer outro valor restringe o grid aos personagens
  // daquela categoria (ver CHARACTER_MECHANIC acima).
  const [mechanicFilter, setMechanicFilter] = useState<string>('Todos');
  const mechanicOptions = ['Todos', ...Array.from(new Set(Object.values(CHARACTER_MECHANIC)))];

  const slotKey = (slot: 1 | 2): 'player1' | 'player2' => (slot === 1 ? 'player1' : 'player2');
  const slotCharacter = (slot: 1 | 2) => selectedCharacters[slotKey(slot)];
  const isAiSlot = (slot: 1 | 2) => aiPlayers.includes(slot);
  const slotLabel = (slot: 1 | 2) => (isAiSlot(slot) ? (isSpectatorMode ? `IA ${slot}` : 'IA') : `Jogador ${slot}`);

  // Um personagem já escolhido pelo OUTRO slot fica bloqueado no slot ativo
  // (ninguém joga contra si mesmo) - o próprio slot ativo pode "reselecionar"
  // a própria escolha à vontade, sem problema.
  const isTakenByOther = (charId: CharacterId) => slotCharacter(activeSlot === 1 ? 2 : 1) === charId;

  const handlePick = (charId: CharacterId) => {
    onSelect(charId, activeSlot);
    // QoL: depois de escolher pro slot ativo, pula automaticamente pro
    // outro slot SE ele ainda não tiver personagem - deixa escolher os 2
    // seguidos sem precisar clicar na aba manualmente. Se os 2 já estão
    // preenchidos (trocando uma escolha já feita), fica onde está.
    const otherSlot: 1 | 2 = activeSlot === 1 ? 2 : 1;
    if (!slotCharacter(otherSlot)) setActiveSlot(otherSlot);
  };

  const bothPicked = Boolean(selectedCharacters.player1 && selectedCharacters.player2);

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
          <h2 className="font-display text-[40px] text-[#C59E4F]">Escolha os Personagens</h2>
        </div>

        {/* FIX (item 28 do Grupo G da lista de afazeres, "indicador de
            progresso 1/2/3") - só quando `showSteps` é true (fluxo completo,
            não o atalho de Partida Rápida - ver App.tsx). */}
        {showSteps && <PreGameSteps current={2} />}

        {/* FIX (pedido do usuário: "escolher os 2 personagens na mesma
            tela") - as 2 abas de slot substituem as antigas 2 telas
            sequenciais: cada uma mostra quem já foi escolhido (ícone +
            nome, na cor do personagem) ou um placeholder vazio, e clicar
            numa aba troca pra quem os próximos cliques no grid abaixo vão
            valer. A aba ativa ganha o anel dourado - o mesmo destaque que
            já indicava seleção em outras telas do jogo. */}
        <div className="grid grid-cols-2 gap-4">
          {([1, 2] as const).map((slot) => {
            const charId = slotCharacter(slot);
            const theme = charId ? getCharacterTheme(charId) : null;
            const Icon = charId ? CHARACTER_ICONS[charId] : null;
            const isActive = activeSlot === slot;
            return (
              <button
                key={slot}
                onClick={() => setActiveSlot(slot)}
                className={`flex items-center gap-4 rounded-lg border-2 px-6 py-4 text-left transition-all ${
                  isActive ? 'ring-4 ring-[#C59E4F]/60' : ''
                }`}
                style={{
                  borderColor: isActive ? '#C59E4F' : theme ? `${theme.primary}50` : '#8F6A30',
                  backgroundColor: '#1E1A16',
                }}
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{
                    backgroundColor: theme ? `${theme.primary}20` : 'rgba(197,158,79,0.1)',
                    color: theme?.primary,
                  }}
                >
                  {isAiSlot(slot) && !Icon ? (
                    <Bot className="w-6 h-6 text-[#C59E4F]" />
                  ) : Icon ? (
                    <Icon className="w-6 h-6" />
                  ) : (
                    <span className="text-[#8F6A30] text-[18px] font-display">?</span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wide text-[#8F6A30] font-semibold flex items-center gap-1.5">
                    {isAiSlot(slot) && <Bot className="w-3 h-3" />}
                    {slotLabel(slot)}
                  </p>
                  <p className="text-[18px] font-display truncate" style={{ color: theme?.primary ?? '#BFB6A6' }}>
                    {theme?.name ?? 'Escolha um personagem'}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* FIX (item 30d do Grupo G da lista de afazeres, "estender o
            Sortear personagem também pro jogador humano") - antes só existia
            pra slots de IA (`isAiSlot`) - o mesmo botão/lógica agora vale
            pros dois casos, só o texto muda pra deixar claro de quem é a
            escolha em cada caso. */}
        <div className="flex items-center justify-between gap-4 bg-[#1E1A16] border border-[#C59E4F]/30 rounded-lg px-6 py-4">
          <p className="text-[#BFB6A6] text-[14px]">
            {isAiSlot(activeSlot)
              ? `A IA vai jogar com o personagem escolhido aqui (${slotLabel(activeSlot)}). Prefere não decidir? Deixe o destino escolher.`
              : `Não sabe qual personagem escolher (${slotLabel(activeSlot)})? Deixe o destino decidir por você.`}
          </p>
          <Button
            onClick={() => {
              const available = characterIds.filter((id) => !isTakenByOther(id));
              const pick = available[Math.floor(Math.random() * available.length)];
              handlePick(pick);
            }}
            variant="outline"
            className="border-[#C59E4F] text-[#C59E4F] hover:bg-[#C59E4F]/10 flex-shrink-0"
          >
            <Dices className="w-4 h-4 mr-2" />
            {isAiSlot(activeSlot) ? 'Sortear personagem da IA' : 'Sortear meu personagem'}
          </Button>
        </div>

        {/* FIX (item 30c do Grupo G, "filtro/agrupamento por mecânica") -
            chips simples, "Todos" sempre disponível pra desfazer o filtro.
            Não esconde um personagem já escolhido em outro slot - só afeta
            o QUE é mostrado no grid pra escolher, nunca o estado real de
            seleção. */}
        <div className="flex flex-wrap gap-2">
          {mechanicOptions.map((option) => (
            <button
              key={option}
              onClick={() => setMechanicFilter(option)}
              className={`px-3 py-1 rounded-full text-[12px] border transition-colors ${
                mechanicFilter === option
                  ? 'bg-[#C59E4F] border-[#C59E4F] text-[#0F1113] font-semibold'
                  : 'border-[#C59E4F]/40 text-[#BFB6A6] hover:border-[#C59E4F]'
              }`}
            >
              {option}
            </button>
          ))}
        </div>

        {/* FIX (pedido do usuário: "volte atrás com a ideia da escolha de
            personagem ser horizontal") - de volta ao grid original (1
            coluna em telas estreitas, empilhando verticalmente, até 4
            colunas lado a lado em telas largas). O fix do "(i)" que vazava
            do botão "Visão completa" continua de pé, só que agora
            independente da largura do card - ver `whitespace-normal` no
            próprio botão, mais abaixo. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-8">
          {characterIds
            .filter((id) => mechanicFilter === 'Todos' || CHARACTER_MECHANIC[id] === mechanicFilter)
            .map((charId) => {
            const Icon = CHARACTER_ICONS[charId];
            const theme = getCharacterTheme(charId);
            const disabled = isTakenByOther(charId);
            const assignedSlot = ([1, 2] as const).find((s) => slotCharacter(s) === charId);
            const isActiveSlotPick = assignedSlot === activeSlot;
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
                className={`relative bg-[#1E1A16] border-2 rounded-lg p-8 space-y-6 transition-all character-card ${
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
                {/* FIX (pedido do usuário: "escolher os 2 personagens na
                    mesma tela") - selo indicando QUAL slot já escolheu este
                    personagem (no máximo um, já que a mesma pessoa nunca
                    pode ir pros 2 lados ao mesmo tempo - ver isTakenByOther)
                    - substitui o antigo texto "Já Selecionado" do botão,
                    que só fazia sentido quando só existia 1 outro slot fixo
                    (sempre o Jogador 1). */}
                {assignedSlot && (
                  <span
                    className="absolute top-3 right-3 text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full"
                    style={{ backgroundColor: `${theme.primary}25`, color: theme.primary, border: `1px solid ${theme.primary}60` }}
                  >
                    {slotLabel(assignedSlot)}
                  </span>
                )}
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
                    onClick={() => handlePick(charId)}
                    disabled={disabled}
                    className="w-full bg-[#C59E4F] hover:bg-[#8F6A30] text-[#0F1113] h-12 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {disabled
                      ? `Já escolhido por ${slotLabel(assignedSlot ?? (activeSlot === 1 ? 2 : 1))}`
                      : isActiveSlotPick
                      ? 'Selecionado'
                      : `Selecionar para ${slotLabel(activeSlot)}`}
                  </Button>
                </div>

                <DetailsDialog
                  character={charId}
                  open={detailsOpenFor === charId}
                  onOpenChange={(open) => setDetailsOpenFor(open ? charId : null)}
                  onOpenRules={onOpenRules}
                />
              </div>
            );
          })}
        </div>

        {/* FIX (pedido do usuário: "escolher os 2 personagens na mesma
            tela") - "Continuar" substitui o antigo avanço automático pra
            'game' assim que o Jogador 2/IA era escolhido - agora só
            habilita quando os 2 slots têm personagem, dando tempo de trocar
            de ideia em qualquer um dos dois antes de seguir. */}
        <div className="flex justify-end">
          <Button
            onClick={onContinue}
            disabled={!bothPicked}
            className="bg-[#C59E4F] hover:bg-[#8F6A30] text-[#0F1113] h-14 px-12 text-[18px] rune-glow disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Continuar
          </Button>
        </div>
      </div>
    </div>
  );
}
