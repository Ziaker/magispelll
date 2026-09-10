import { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { ArrowLeft, Trash2, Trophy } from 'lucide-react';
import { getCharacterTheme } from '../lib/characterThemes';
import { loadMatchHistory, clearMatchHistory, getStatsByCharacter } from '../lib/matchStats';
import type { CharacterId } from '../lib/gameEngine';

interface MatchStatsScreenProps {
  onBack: () => void;
}

/** Mesma ordem/lista usada em todo o resto do jogo (CharacterSelection.tsx, Rules.tsx). */
const ALL_CHARACTERS: CharacterId[] = ['mago', 'besta', 'anjo', 'mosqueteiro', 'coringa', 'piromante', 'druida', 'glacial'];

/**
 * MatchStatsScreen.tsx - QoL (pedido do usuário: "histórico/estatísticas
 * entre partidas - tela nova no menu principal"). Lê matchStats.ts
 * (localStorage), só partidas "Contra a IA" (ver o comentário completo no
 * useEffect que grava em GameBoard.tsx - Hotseat/Espectador nunca gravam
 * aqui). Recalcula a agregação por personagem toda vez que a tela abre
 * (getStatsByCharacter), nunca guarda nada pré-agregado - a lista bruta em
 * localStorage é a única fonte de verdade.
 */
export function MatchStatsScreen({ onBack }: MatchStatsScreenProps) {
  const [history, setHistory] = useState(() => loadMatchHistory());
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const statsByCharacter = getStatsByCharacter(history);
  const totalGames = history.length;
  const totalWins = history.filter((r) => r.won).length;
  const overallWinRate = totalGames > 0 ? totalWins / totalGames : 0;

  const playedCharacters = ALL_CHARACTERS.filter((id) => statsByCharacter[id]).sort(
    (a, b) => (statsByCharacter[b]?.total ?? 0) - (statsByCharacter[a]?.total ?? 0)
  );

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 parchment">
      <div className="w-full max-w-3xl space-y-8">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack} className="text-[#C59E4F] hover:text-[#8F6A30]">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h2 className="font-display text-[40px] text-[#C59E4F]">Estatísticas</h2>
        </div>

        {totalGames === 0 ? (
          <Card className="bg-[#1E1A16] border border-[#C59E4F]/30">
            <CardContent className="p-8 text-center">
              <p className="text-[#BFB6A6]">Nenhuma partida registrada ainda. Jogue uma partida "Contra a IA" pra começar a acumular estatísticas.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <Card className="bg-[#1E1A16] border border-[#C59E4F]/30">
              <CardContent className="p-8 space-y-2">
                <div className="flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-[#C59E4F]" />
                  <h3 className="font-display text-[20px] text-[#EFE7D6]">Geral</h3>
                </div>
                <p className="text-[#BFB6A6] text-[14px]">
                  {totalGames} partida{totalGames !== 1 ? 's' : ''} · {totalWins} vitória{totalWins !== 1 ? 's' : ''} ·{' '}
                  <span className="text-[#6CC47A] font-semibold">{Math.round(overallWinRate * 100)}%</span> de aproveitamento
                </p>
              </CardContent>
            </Card>

            <Card className="bg-[#1E1A16] border border-[#C59E4F]/30">
              <CardContent className="p-8 space-y-4">
                <h3 className="font-display text-[20px] text-[#EFE7D6]">Por Personagem</h3>
                <div className="h-px bg-gradient-to-r from-[#8F6A30] via-[#C59E4F] to-[#8F6A30]" />
                <div className="space-y-3">
                  {playedCharacters.map((id) => {
                    const theme = getCharacterTheme(id);
                    const stat = statsByCharacter[id]!;
                    return (
                      <div key={id} className="space-y-1">
                        <div className="flex items-center justify-between text-[13px]">
                          <span className="font-semibold" style={{ color: theme.primary }}>
                            {theme.name}
                          </span>
                          <span className="text-[#BFB6A6]">
                            {stat.wins}V / {stat.losses}D ({Math.round(stat.winRate * 100)}%)
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-[#0F1113] overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${stat.winRate * 100}%`, backgroundColor: theme.primary }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Button
              onClick={() => setShowClearConfirm(true)}
              variant="outline"
              className="w-full border-[#C4574A]/60 text-[#C4574A] hover:bg-[#C4574A]/10"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Limpar Histórico
            </Button>
          </div>
        )}
      </div>

      <Dialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <DialogContent className="bg-[#1E1A16] border-[#C59E4F]">
          <DialogHeader>
            <DialogTitle className="text-[#EFE7D6] font-display text-[24px]">Limpar Histórico?</DialogTitle>
            <DialogDescription className="text-[#BFB6A6]">Todo o histórico de partidas registrado neste dispositivo será apagado. Isso não pode ser desfeito.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-4 pt-2">
            <Button onClick={() => setShowClearConfirm(false)} variant="outline" className="flex-1 border-[#C59E4F] text-[#C59E4F]">
              Cancelar
            </Button>
            <Button
              onClick={() => {
                clearMatchHistory();
                setHistory([]);
                setShowClearConfirm(false);
              }}
              className="flex-1 bg-[#C4574A] hover:bg-[#A8493D] text-[#EFE7D6]"
            >
              Limpar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
