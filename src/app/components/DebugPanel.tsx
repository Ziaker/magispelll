import { useState } from 'react';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { ArrowLeft } from 'lucide-react';
import { DEFAULT_GAME_CONFIG, type GameConfig } from '../lib/gameConfig';
import type { CharacterId } from '../lib/gameEngine';

const CHARACTER_IDS: CharacterId[] = ['mago', 'besta', 'anjo', 'mosqueteiro', 'coringa'];
const CHARACTER_LABELS: Record<CharacterId, string> = {
  mago: 'Mago',
  besta: 'Besta',
  anjo: 'Anjo',
  mosqueteiro: 'Mosqueteiro',
  coringa: 'Coringa',
};

interface DebugPanelProps {
  onBack: () => void;
  onStart: (player1: CharacterId, player2: CharacterId, config: GameConfig) => void;
}

/**
 * DebugPanel - modo de debug/playtest (pedido do usuário: "quero que faça um
 * debug mode melhor pra você testar as coisas mais rápido, leve tudo em
 * consideração"). Substitui o antigo `handleDebugQuickStart` (App.tsx, um
 * único atalho fixo pra Coringa vs Mago) por um painel de verdade - qualquer
 * combinação de personagens + variantes fica a 1 clique de distância, sem
 * precisar editar código-fonte pra testar outro cenário.
 *
 * Acessado pelo mesmo link discreto "debug" no canto do Menu Principal (ver
 * Home.tsx) - continua "semi-escondido", só ficou configurável. Complementa
 * (não substitui) `window.__debug` (ver GameBoard.tsx): este painel resolve
 * "chegar rápido numa PARTIDA com a config certa"; `window.__debug` resolve
 * "chegar rápido num ESTADO específico DENTRO dela" (mão/campo exatos, sem
 * depender de RNG) - os dois juntos cobrem o que motivou o pedido.
 *
 * Modo Espectador (IA vs IA) como padrão de propósito - é o cenário mais
 * rápido pra observar um bug acontecer sem precisar clicar em nada, o mesmo
 * modo que scripts/sanity-test.ts simula por script; os outros 2 modos
 * continuam disponíveis pra quando o teste exige interação humana de verdade.
 */
export function DebugPanel({ onBack, onStart }: DebugPanelProps) {
  const [player1, setPlayer1] = useState<CharacterId>('coringa');
  const [player2, setPlayer2] = useState<CharacterId>('anjo');
  const [mode, setMode] = useState<GameConfig['mode']>('spectator');
  const [monsterCards, setMonsterCards] = useState(true);
  const [fusion, setFusion] = useState(true);
  const [towersMode, setTowersMode] = useState(false);
  const [spotlightMode, setSpotlightMode] = useState(false);
  const [reactionsMode, setReactionsMode] = useState(false);

  const handleStart = () => {
    onStart(player1, player2, {
      ...DEFAULT_GAME_CONFIG,
      mode,
      monsterCards,
      fusion,
      towersMode,
      spotlightMode,
      reactionsMode,
    });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 parchment">
      <div className="w-full max-w-xl space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack} className="text-[#C59E4F] hover:text-[#8F6A30]">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h2 className="font-display text-[32px] text-[#C59E4F]">Modo Debug</h2>
        </div>

        <div className="bg-[#1E1A16] border border-[#C59E4F]/30 rounded-lg p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[14px] text-[#EFE7D6]">Jogador 1</Label>
              <Select value={player1} onValueChange={(v) => setPlayer1(v as CharacterId)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHARACTER_IDS.map((id) => (
                    <SelectItem key={id} value={id}>
                      {CHARACTER_LABELS[id]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[14px] text-[#EFE7D6]">Jogador 2</Label>
              <Select value={player2} onValueChange={(v) => setPlayer2(v as CharacterId)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHARACTER_IDS.map((id) => (
                    <SelectItem key={id} value={id}>
                      {CHARACTER_LABELS[id]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-[14px] text-[#EFE7D6]">Modo</Label>
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as GameConfig['mode'])}>
              <div className="flex items-center space-x-3">
                <RadioGroupItem value="spectator" id="dbg-spectator" />
                <Label htmlFor="dbg-spectator" className="text-[#BFB6A6] text-[13px]">
                  Espectador (IA vs IA, só observar - mais rápido pra reproduzir bugs)
                </Label>
              </div>
              <div className="flex items-center space-x-3">
                <RadioGroupItem value="vsAI" id="dbg-vsai" />
                <Label htmlFor="dbg-vsai" className="text-[#BFB6A6] text-[13px]">
                  Contra a IA (jogador 1 controlado manualmente)
                </Label>
              </div>
              <div className="flex items-center space-x-3">
                <RadioGroupItem value="hotseat" id="dbg-hotseat" />
                <Label htmlFor="dbg-hotseat" className="text-[#BFB6A6] text-[13px]">
                  Hotseat (os dois controlados manualmente)
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-3">
            <Label className="text-[14px] text-[#EFE7D6]">Variantes</Label>
            {([
              ['Cartas Monstro', monsterCards, setMonsterCards],
              ['Fusão', fusion, setFusion],
              ['Torres', towersMode, setTowersMode],
              ['Spotlight', spotlightMode, setSpotlightMode],
              ['Reações', reactionsMode, setReactionsMode],
            ] as const).map(([label, checked, setChecked]) => (
              <div key={label} className="flex items-center justify-between">
                <Label className="text-[#BFB6A6] text-[13px]">{label}</Label>
                <Switch checked={checked} onCheckedChange={setChecked} />
              </div>
            ))}
          </div>

          <Button
            onClick={handleStart}
            size="lg"
            className="w-full bg-[#C59E4F] hover:bg-[#8F6A30] text-[#0F1113] text-[16px]"
          >
            Iniciar Partida de Teste
          </Button>
        </div>
      </div>
    </div>
  );
}
