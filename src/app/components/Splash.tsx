import { Button } from './ui/button';
import { RuneParticles } from './RuneParticles';
import { GameTitle } from './GameTitle';

interface SplashProps {
  onStart: () => void;
  onRules: () => void;
}

export function Splash({ onStart, onRules }: SplashProps) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden parchment">
      <RuneParticles />
      
      <div className="relative z-10 text-center space-y-8 px-4">
        <div className="space-y-4">
          <GameTitle className="font-display text-[80px] md:text-[120px] tracking-wider animate-float drop-shadow-[0_0_30px_rgba(197,158,79,0.5)]" />
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center pt-8">
          <Button 
            onClick={onStart}
            size="lg"
            className="bg-[#C59E4F] hover:bg-[#8F6A30] text-[#0F1113] px-12 py-6 text-[20px] rune-glow transition-all"
          >
            Iniciar
          </Button>
          <Button 
            onClick={onRules}
            size="lg"
            variant="outline"
            className="border-[#C59E4F] text-[#C59E4F] hover:bg-[#C59E4F]/10 px-12 py-6 text-[20px]"
          >
            Regras
          </Button>
        </div>
      </div>

      {/* Decorative runes */}
      <div className="absolute top-10 left-10 text-[#C59E4F]/20 text-[60px] font-display animate-glow">
        ᚱ
      </div>
      <div className="absolute top-20 right-20 text-[#C59E4F]/20 text-[80px] font-display animate-glow" style={{ animationDelay: '1s' }}>
        ᛟ
      </div>
      <div className="absolute bottom-20 left-1/4 text-[#C59E4F]/20 text-[70px] font-display animate-glow" style={{ animationDelay: '2s' }}>
        ᚻ
      </div>
      <div className="absolute bottom-10 right-1/3 text-[#C59E4F]/20 text-[90px] font-display animate-glow" style={{ animationDelay: '1.5s' }}>
        ᛗ
      </div>
    </div>
  );
}
