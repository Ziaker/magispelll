import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { ArrowLeft, Sparkles, Zap, Shield, Crosshair, Drama } from 'lucide-react';
import { getCharacterIconBackground } from '../lib/characterThemes';

interface CharactersListProps {
  onBack: () => void;
  onSelectCharacter: (character: 'mago' | 'besta' | 'anjo' | 'mosqueteiro' | 'coringa') => void;
}

export function CharactersList({ onBack, onSelectCharacter }: CharactersListProps) {
  const characters = [
    {
      id: 'mago' as const,
      name: 'MAGO',
      icon: Sparkles,
      color: '#4A90E2',
      description: 'Manipulador de informação que controla o campo de batalha através de revelação de cartas inimigas e substituição estratégica de recursos.',
    },
    {
      id: 'besta' as const,
      name: 'BESTA',
      icon: Zap,
      color: '#E24A4A',
      description: 'Guerreiro agressivo que recicla recursos e pressiona constantemente o oponente através de reciclagem do descarte e roubos devastadores.',
    },
    {
      id: 'anjo' as const,
      name: 'ANJO',
      icon: Shield,
      color: '#E2B84A',
      description: 'Estrategista de longo prazo que acumula vantagens permanentes através de crescimento sustentado e proteção de recursos.',
    },
    {
      id: 'mosqueteiro' as const,
      name: 'MOSQUETEIRO',
      icon: Crosshair,
      color: '#8C9199',
      description: 'Atirador focado em descarte que troca cartas próprias (ou do oponente, à força) por reforço de campo, informação e precisão de combate.',
    },
    {
      id: 'coringa' as const,
      name: 'CORINGA',
      icon: Drama,
      color: '#3B4CCB',
      description: 'Trapaceiro que planta armadilhas viradas para baixo no próprio campo, explodindo em fumaça, empates forçados e roubo de valor quando o oponente menos espera.',
    },
  ];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 parchment">
      <div className="w-full max-w-6xl space-y-8">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="text-[#C59E4F] hover:text-[#8F6A30]"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h2 className="font-display text-[40px] text-[#C59E4F]">
            Personagens
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-6">
          {characters.map((character) => {
            const Icon = character.icon;
            return (
              <Card
                key={character.id}
                className="bg-[#1E1A16] border-2 border-[#C59E4F]/30 hover:border-[#C59E4F] transition-all cursor-pointer group"
                onClick={() => onSelectCharacter(character.id)}
              >
                <CardContent className="p-8 space-y-6">
                  <div className="flex flex-col items-center space-y-4">
                    <div
                      className="w-24 h-24 rounded-full flex items-center justify-center"
                      style={
                        character.id === 'coringa'
                          ? { background: getCharacterIconBackground('coringa') }
                          : { backgroundColor: `${character.color}20` }
                      }
                    >
                      <Icon className="w-12 h-12" style={{ color: character.id === 'coringa' ? '#0F1113' : character.color }} />
                    </div>
                    <h3 className="font-display text-[28px] text-[#EFE7D6]">
                      {character.name}
                    </h3>
                  </div>

                  <div className="h-px bg-gradient-to-r from-transparent via-[#8F6A30] to-transparent" />

                  <p className="text-[14px] text-[#BFB6A6] text-center leading-relaxed">
                    {character.description}
                  </p>

                  <Button
                    className="w-full bg-[#C59E4F] hover:bg-[#8F6A30] text-[#0F1113] group-hover:scale-105 transition-transform"
                  >
                    Ver Ficha Completa
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
