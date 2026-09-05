import { Button } from './ui/button';
import { ArrowLeft, Pencil, Bot } from 'lucide-react';
import { getCharacterTheme } from '../lib/characterThemes';
import type { GameConfig as GameConfigType } from '../lib/gameConfig';
import type { CharacterId } from '../lib/gameEngine';
import { PreGameSteps } from './PreGameSteps';

interface GameSummaryProps {
  config: GameConfigType;
  selectedCharacters: { player1: CharacterId; player2: CharacterId };
  aiPlayers: (1 | 2)[];
  onEditConfig: () => void;
  onEditCharacters: () => void;
  onBack: () => void;
  onStart: () => void;
}

const MODE_LABEL: Record<GameConfigType['mode'], string> = {
  hotseat: 'Hotseat (Local)',
  vsAI: 'Contra a IA (Solo)',
  spectator: 'Modo Espectador (IA vs IA)',
  online: 'Online',
};

const DECK_LABEL: Record<GameConfigType['deckType'], string> = {
  common: 'Comum (52/54 cartas)',
  thematic: 'Temático (62 cartas)',
};

/**
 * GameSummary - tela de resumo antes de "Iniciar Partida" (pedido do
 * usuário: "tela de resumo final... antes de começar"). Mostra tudo que foi
 * escolhido (modo, baralho, variantes ativas, os 2 personagens) numa lista
 * só, com "Editar" voltando pra tela certa em vez de ter que navegar de
 * volta tela por tela pra conferir/corrigir algo. Só lê `config`/
 * `selectedCharacters` (nunca os modifica) - toda edição de verdade
 * acontece nas telas de origem (GameConfig.tsx/CharacterSelection.tsx),
 * pra nunca ter 2 fontes de verdade divergentes sobre a mesma escolha.
 */
export function GameSummary({ config, selectedCharacters, aiPlayers, onEditConfig, onEditCharacters, onBack, onStart }: GameSummaryProps) {
  // Só lista variantes de fato LIGADAS - uma lista vazia (config totalmente
  // padrão) mostra "Nenhuma" em vez de sumir a seção inteira, pelo mesmo
  // motivo do "Modo Clássico" em PhaseTransition.tsx: presença/ausência da
  // seção nunca deve parecer um bug.
  const activeVariants: string[] = [];
  if (config.monsterCards) activeVariants.push('Cartas Monstro');
  if (config.fusion) activeVariants.push(`Fusão (até ${config.fusionLimit}x/turno)`);
  if (config.towersMode) activeVariants.push('Towers');
  if (config.spotlightMode) {
    const polarity = config.spotlightPositive && config.spotlightNegative ? 'positivo e negativo' : config.spotlightPositive ? 'positivo' : 'negativo';
    activeVariants.push(`Spotlight (${config.spotlightCount}x, ${polarity})`);
  }
  if (config.reactionsMode) activeVariants.push(`Reações (até ${config.reactionsLimit}x/fase)`);
  if (config.drawLimitEnabled) activeVariants.push(`Limite de compras: ${config.drawLimit}/turno`);

  const players = ([1, 2] as const).map((slot) => ({
    slot,
    character: slot === 1 ? selectedCharacters.player1 : selectedCharacters.player2,
    isAi: aiPlayers.includes(slot),
  }));

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 parchment">
      <div className="w-full max-w-2xl space-y-8">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack} className="text-[#C59E4F] hover:text-[#8F6A30]">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h2 className="font-display text-[40px] text-[#C59E4F]">Resumo da Partida</h2>
        </div>

        {/* FIX (item 28 do Grupo G, "indicador de progresso 1/2/3") - esta
            tela nunca aparece no atalho de Partida Rápida (App.tsx pula
            direto pra 'game'), então o indicador vale sempre aqui, sem
            precisar de um prop condicional como em GameConfig/CharacterSelection. */}
        <PreGameSteps current={3} />

        <div className="bg-[#1E1A16] border border-[#C59E4F]/30 rounded-lg p-8 space-y-8">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Configuração</Label>
              <Button variant="ghost" size="sm" onClick={onEditConfig} className="text-[#8F6A30] hover:text-[#C59E4F] h-auto py-1">
                <Pencil className="w-3.5 h-3.5 mr-1.5" />
                Editar
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-[13px]">
              <SummaryRow label="Modo" value={MODE_LABEL[config.mode]} />
              <SummaryRow label="Baralho" value={DECK_LABEL[config.deckType]} />
              <SummaryRow label="Limite de descartes" value={`${config.discardLimit}/turno`} />
            </div>
            <div className="space-y-1.5">
              <p className="text-[11px] uppercase tracking-wide text-[#8F6A30] font-semibold">Variantes</p>
              {activeVariants.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {activeVariants.map((v) => (
                    <span key={v} className="text-[12px] px-2.5 py-1 rounded-full bg-[#C59E4F]/10 border border-[#C59E4F]/40 text-[#C59E4F]">
                      {v}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-[13px] text-[#8F6A30] italic">Nenhuma</p>
              )}
            </div>
          </div>

          <div className="border-t border-[#C59E4F]/20" />

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Personagens</Label>
              <Button variant="ghost" size="sm" onClick={onEditCharacters} className="text-[#8F6A30] hover:text-[#C59E4F] h-auto py-1">
                <Pencil className="w-3.5 h-3.5 mr-1.5" />
                Editar
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {players.map(({ slot, character, isAi }) => {
                const theme = getCharacterTheme(character);
                return (
                  <div
                    key={slot}
                    className="flex items-center gap-3 rounded-lg border-2 px-4 py-3"
                    style={{ borderColor: `${theme.primary}50`, backgroundColor: `${theme.primary}10` }}
                  >
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-[#8F6A30] font-semibold flex items-center gap-1">
                        {isAi && <Bot className="w-3 h-3" />}
                        {isAi ? 'IA' : `Jogador ${slot}`}
                      </p>
                      <p className="text-[18px] font-display" style={{ color: theme.primary }}>
                        {theme.name}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <Button
            onClick={onStart}
            className="w-full bg-[#C59E4F] hover:bg-[#8F6A30] text-[#0F1113] h-14 text-[18px] rune-glow"
          >
            Iniciar Partida
          </Button>
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[18px] text-[#EFE7D6]">{children}</p>;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-[#8F6A30] font-semibold">{label}</p>
      <p className="text-[#EFE7D6]">{value}</p>
    </div>
  );
}
