import { Button } from './ui/button';
import { RuneParticles } from './RuneParticles';
import { Play, BookOpen, Users, Settings } from 'lucide-react';

interface HomeProps {
  onNewGame: () => void;
  onRules: () => void;
  onCharacters: () => void;
  onSettings: () => void;
  /** Modo de debug/playtest (pedido do usuário) - ver comentário completo em App.tsx (handleDebugQuickStart). */
  onDebugStart?: () => void;
}

export function Home({ onNewGame, onRules, onCharacters, onSettings, onDebugStart }: HomeProps) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden parchment">
      <RuneParticles />
      
      <div className="relative z-10 w-full max-w-2xl px-4 space-y-12">
        <div className="text-center space-y-4">
          <h1 className="font-display text-[64px] md:text-[80px] tracking-wider drop-shadow-[0_0_20px_rgba(197,158,79,0.4)]">
            <span className="text-[#C59E4F]">MAGISPE</span>
            <span className="text-[#4A90E2]">L</span>
            <span className="text-[#E24A4A]">L</span>
            <span className="text-[#E2B84A]">L</span>
          </h1>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Button 
            onClick={onNewGame}
            size="lg"
            className="bg-[#C59E4F] hover:bg-[#8F6A30] text-[#0F1113] h-20 text-[18px] rune-glow flex items-center justify-center gap-3 group"
          >
            <Play className="w-5 h-5 group-hover:scale-110 transition-transform" />
            Novo Jogo
          </Button>
          
          <Button 
            onClick={onRules}
            size="lg"
            variant="outline"
            className="border-[#C59E4F] text-[#C59E4F] hover:bg-[#C59E4F]/10 h-20 text-[18px] flex items-center justify-center gap-3 group"
          >
            <BookOpen className="w-5 h-5 group-hover:scale-110 transition-transform" />
            Regras
          </Button>
          
          <Button 
            onClick={onCharacters}
            size="lg"
            variant="outline"
            className="border-[#C59E4F] text-[#C59E4F] hover:bg-[#C59E4F]/10 h-20 text-[18px] flex items-center justify-center gap-3 group"
          >
            <Users className="w-5 h-5 group-hover:scale-110 transition-transform" />
            Personagens
          </Button>
          
          <Button 
            onClick={onSettings}
            size="lg"
            variant="outline"
            className="border-[#C59E4F] text-[#C59E4F] hover:bg-[#C59E4F]/10 h-20 text-[18px] flex items-center justify-center gap-3 group"
          >
            <Settings className="w-5 h-5 group-hover:scale-110 transition-transform" />
            Configurações
          </Button>
        </div>
      </div>

      {/* Decorative corners */}
      <div className="absolute top-0 left-0 w-32 h-32 border-l-2 border-t-2 border-[#C59E4F]/30" />
      <div className="absolute top-0 right-0 w-32 h-32 border-r-2 border-t-2 border-[#C59E4F]/30" />
      <div className="absolute bottom-0 left-0 w-32 h-32 border-l-2 border-b-2 border-[#C59E4F]/30" />
      <div className="absolute bottom-0 right-0 w-32 h-32 border-r-2 border-b-2 border-[#C59E4F]/30" />

      {/* Modo de debug/playtest (pedido do usuário: "semi-escondido") - texto
          pequeno e discreto no canto, sem ícone/glow, só pra não competir
          visualmente com o menu de verdade. Pula direto pra uma partida
          jogável (Coringa vs Mago, Contra a IA) - ver handleDebugQuickStart
          em App.tsx. */}
      {onDebugStart && (
        <button
          onClick={onDebugStart}
          className="absolute bottom-2 right-3 text-[10px] text-[#8F6A30]/40 hover:text-[#C59E4F]/70 transition-colors z-20"
        >
          debug
        </button>
      )}
    </div>
  );
}
