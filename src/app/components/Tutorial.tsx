import { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { ArrowLeft, ArrowRight, Play } from 'lucide-react';

interface TutorialProps {
  onBack: () => void;
}

const tutorialSteps = [
  {
    title: 'Introdução',
    content: 'Bem-vindo a Daispell. Este tutorial guia você pelas três fases do jogo: Compra, Estratégia e Combate. Pressione "Próximo" para começar.',
    visual: '📖',
  },
  {
    title: 'Fase de Compra',
    content: 'Na Fase de Compra você pode manter ou descartar cartas para comprar até 8 cartas na mão. Se você for MAGO (Valete), compra 3 e descarta 1; BESTA (Valete) pode pegar 2 do descarte; ANJO (Valete) compra um Ás.',
    visual: '🃏',
  },
  {
    title: 'Fase de Estratégia — Preparação do campo',
    content: 'Coloque três cartas viradas para baixo no campo. Opcionalmente, posicione uma carta horizontal sobre uma delas (adiciona valor).',
    visual: '⚔️',
  },
  {
    title: 'Fase de Estratégia — Magias',
    content: 'Use magias de Rainha/Rei aqui: ex.: Mago (Rainha) troca carta revelada; Anjo (Rei) adiciona carta horizontal extra.',
    visual: '✨',
  },
  {
    title: 'Fase de Combate',
    content: 'Escolha um slot para revelar. A carta de maior valor vence; cartas horizontais somam. Quem vencer força o oponente a descartar 1 carta.',
    visual: '⚡',
  },
  {
    title: 'Magias Numéricas — Exemplos',
    content: 'Combinações 3x iguais ativam efeitos: (9,9,9) do Mago revela e permite descartar; (6,6,6) da Besta força descarte de cartas >6; (3,3,3) do Anjo aumenta o limite de mão +1.',
    visual: '🔮',
  },
  {
    title: 'Exercício prático',
    content: 'Execute um exemplo: faça um Mago executar (9,9,9). O tutorial demonstra as cartas reveladas e o descarte.',
    visual: '🎯',
  },
  {
    title: 'Fim do tutorial',
    content: 'Você terminou o tutorial. Volte a qualquer momento para rever. Pronto para jogar?',
    visual: '🏆',
  },
];

export function Tutorial({ onBack }: TutorialProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const nextStep = () => {
    if (currentStep < tutorialSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const step = tutorialSteps[currentStep];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 parchment">
      <div className="w-full max-w-4xl space-y-8">
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
            Tutorial Interativo
          </h2>
        </div>

        <Card className="bg-[#1E1A16] border-2 border-[#C59E4F]/50 shadow-2xl">
          <CardHeader className="text-center space-y-4 pb-8">
            <div className="text-[80px]">{step.visual}</div>
            <CardTitle className="font-display text-[32px] text-[#EFE7D6]">
              {step.title}
            </CardTitle>
            <div className="flex justify-center gap-2">
              {tutorialSteps.map((_, index) => (
                <div
                  key={index}
                  className={`w-2 h-2 rounded-full ${
                    index === currentStep ? 'bg-[#C59E4F]' : 'bg-[#C59E4F]/30'
                  }`}
                />
              ))}
            </div>
          </CardHeader>
          <CardContent className="space-y-8">
            <p className="text-[18px] text-[#BFB6A6] leading-relaxed text-center">
              {step.content}
            </p>

            {currentStep === 6 && (
              <div className="bg-[#C59E4F]/10 border border-[#C59E4F]/30 rounded-lg p-6 space-y-4">
                <p className="text-[14px] text-[#C59E4F]">
                  Exemplo Prático: Mago executa (9,9,9)
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-[#EFE7D6] rounded p-3 text-center text-[#0F1113]">9♠</div>
                  <div className="bg-[#EFE7D6] rounded p-3 text-center text-[#0F1113]">9♥</div>
                  <div className="bg-[#EFE7D6] rounded p-3 text-center text-[#0F1113]">9♣</div>
                </div>
                <Button
                  variant="outline"
                  className="w-full border-[#C59E4F] text-[#C59E4F]"
                >
                  <Play className="w-4 h-4 mr-2" />
                  Executar Exemplo
                </Button>
              </div>
            )}

            <div className="flex justify-between pt-4">
              <Button
                onClick={prevStep}
                disabled={currentStep === 0}
                variant="outline"
                className="border-[#C59E4F] text-[#C59E4F] disabled:opacity-30"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Anterior
              </Button>
              
              {currentStep === tutorialSteps.length - 1 ? (
                <Button
                  onClick={onBack}
                  className="bg-[#C59E4F] hover:bg-[#8F6A30] text-[#0F1113]"
                >
                  Concluir
                </Button>
              ) : (
                <Button
                  onClick={nextStep}
                  className="bg-[#C59E4F] hover:bg-[#8F6A30] text-[#0F1113]"
                >
                  Próximo
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
