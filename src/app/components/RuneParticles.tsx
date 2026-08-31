import { useEffect, useState } from 'react';
import { useSettings } from '../context/SettingsContext';

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  duration: number;
  delay: number;
  /** FIX (pedido do usuário: "quero que tenha mais efeitos") - metade das
   *  partículas agora são runas (mesmos glifos usados nas costas da carta em
   *  PlayingCard.tsx: ᚱ ᛟ ᚻ ᛗ), não só pontos de luz lisos - dá mais
   *  personalidade "mágica" ao fundo sem pesar a cena (mesma contagem de
   *  elementos de antes). */
  glyph: string | null;
}

const RUNE_GLYPHS = ['ᚱ', 'ᛟ', 'ᚻ', 'ᛗ', '✦'];

export function RuneParticles() {
  const { settings } = useSettings();
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    if (!settings.particleEffects) {
      setParticles([]);
      return;
    }
    const newParticles: Particle[] = [];
    for (let i = 0; i < 26; i++) {
      const isGlyph = i % 3 === 0;
      newParticles.push({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: isGlyph ? Math.random() * 6 + 10 : Math.random() * 3 + 1,
        duration: Math.random() * 10 + 10,
        delay: Math.random() * 5,
        glyph: isGlyph ? RUNE_GLYPHS[i % RUNE_GLYPHS.length] : null,
      });
    }
    setParticles(newParticles);
  }, [settings.particleEffects]);

  if (!settings.particleEffects || particles.length === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden">
      {particles.map((particle) =>
        particle.glyph ? (
          <div
            key={particle.id}
            className={`absolute text-accent/15 font-display select-none ${settings.animations ? 'animate-float animate-glow' : ''}`}
            style={{
              left: `${particle.x}%`,
              top: `${particle.y}%`,
              fontSize: `${particle.size}px`,
              animationDuration: `${particle.duration}s`,
              animationDelay: `${particle.delay}s`,
            }}
          >
            {particle.glyph}
          </div>
        ) : (
          <div
            key={particle.id}
            className={`absolute rounded-full bg-accent/20 ${settings.animations ? 'animate-float animate-glow' : ''}`}
            style={{
              left: `${particle.x}%`,
              top: `${particle.y}%`,
              width: `${particle.size}px`,
              height: `${particle.size}px`,
              animationDuration: `${particle.duration}s`,
              animationDelay: `${particle.delay}s`,
            }}
          />
        )
      )}
    </div>
  );
}
