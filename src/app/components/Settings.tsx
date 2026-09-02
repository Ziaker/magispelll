import { Button } from './ui/button';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Slider } from './ui/slider';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { ArrowLeft, Check } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { useState } from 'react';
import { useSettings } from '../context/SettingsContext';
import type { HandInteractionMode } from '../lib/settings';

interface SettingsProps {
  onBack: () => void;
}

/**
 * Tela de Configurações.
 *
 * Toda alteração é aplicada e persistida imediatamente através do
 * SettingsContext (useSettings) - não existe estado "não salvo" separado.
 * O botão "Salvar e Voltar" existe apenas para dar uma confirmação visual
 * explícita ao jogador antes de retornar ao menu; ele não faz nenhum
 * trabalho adicional de persistência (que já aconteceu a cada mudança).
 */
export function Settings({ onBack }: SettingsProps) {
  const { settings, updateSetting } = useSettings();
  const [justSaved, setJustSaved] = useState(false);

  const handleSaveAndBack = () => {
    setJustSaved(true);
    setTimeout(() => {
      setJustSaved(false);
      onBack();
    }, 600);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 parchment">
      <div className="w-full max-w-3xl space-y-8">
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
            Configurações
          </h2>
        </div>

        <div className="space-y-6">
          {/* Áudio */}
          <Card className="bg-[#1E1A16] border border-[#C59E4F]/30">
            <CardContent className="p-8 space-y-6">
              <h3 className="font-display text-[24px] text-[#EFE7D6]">Áudio</h3>
              <div className="h-px bg-gradient-to-r from-[#8F6A30] via-[#C59E4F] to-[#8F6A30]" />

              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <Label htmlFor="soundEffects" className="text-[#BFB6A6]">
                    Efeitos Sonoros
                  </Label>
                  <Switch
                    id="soundEffects"
                    checked={settings.soundEffects}
                    onCheckedChange={(checked) => updateSetting('soundEffects', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="backgroundMusic" className="text-[#BFB6A6]">
                    Música de Fundo
                  </Label>
                  <Switch
                    id="backgroundMusic"
                    checked={settings.backgroundMusic}
                    onCheckedChange={(checked) => updateSetting('backgroundMusic', checked)}
                  />
                </div>

                <div className="space-y-3">
                  <Label htmlFor="volume" className="text-[#BFB6A6]">
                    Volume: {settings.volume}%
                  </Label>
                  <Slider
                    id="volume"
                    value={[settings.volume]}
                    onValueChange={([value]) => updateSetting('volume', value)}
                    max={100}
                    step={1}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Visual */}
          <Card className="bg-[#1E1A16] border border-[#C59E4F]/30">
            <CardContent className="p-8 space-y-6">
              <h3 className="font-display text-[24px] text-[#EFE7D6]">Visual</h3>
              <div className="h-px bg-gradient-to-r from-[#8F6A30] via-[#C59E4F] to-[#8F6A30]" />

              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <Label htmlFor="animations" className="text-[#BFB6A6]">
                    Animações
                  </Label>
                  <Switch
                    id="animations"
                    checked={settings.animations}
                    onCheckedChange={(checked) => updateSetting('animations', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="particleEffects" className="text-[#BFB6A6]">
                    Efeitos de Partículas
                  </Label>
                  <Switch
                    id="particleEffects"
                    checked={settings.particleEffects}
                    onCheckedChange={(checked) => updateSetting('particleEffects', checked)}
                  />
                </div>

                <div className="space-y-3">
                  <Label htmlFor="animationSpeed" className="text-[#BFB6A6]">
                    Velocidade de Animação: {settings.animationSpeed}%
                  </Label>
                  <Slider
                    id="animationSpeed"
                    value={[settings.animationSpeed]}
                    onValueChange={([value]) => updateSetting('animationSpeed', value)}
                    min={50}
                    max={200}
                    step={10}
                    disabled={!settings.animations}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Jogabilidade (pedido do usuário: "opção para só usar drag & drop
              e uma para só usar cliques... deixe a cargo do jogador") -
              controla só o posicionamento de carta no campo (ver
              HandInteractionMode em lib/settings.ts para o que exatamente
              cada modo afeta) - também disponível como botão alternador
              direto ao lado da mão durante a partida (ver PlayerZone.tsx),
              pra não precisar sair do jogo pra trocar. */}
          <Card className="bg-[#1E1A16] border border-[#C59E4F]/30">
            <CardContent className="p-8 space-y-6">
              <h3 className="font-display text-[24px] text-[#EFE7D6]">Jogabilidade</h3>
              <div className="h-px bg-gradient-to-r from-[#8F6A30] via-[#C59E4F] to-[#8F6A30]" />

              <div className="space-y-3">
                <Label className="text-[#BFB6A6]">Posicionar carta no campo</Label>
                <RadioGroup
                  value={settings.handInteractionMode}
                  onValueChange={(value) => updateSetting('handInteractionMode', value as HandInteractionMode)}
                >
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="both" id="handInteractionBoth" />
                    <Label htmlFor="handInteractionBoth" className="text-[#BFB6A6]">
                      Arrastar e clicar (padrão)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="dragOnly" id="handInteractionDrag" />
                    <Label htmlFor="handInteractionDrag" className="text-[#BFB6A6]">
                      Só arrastar (drag &amp; drop)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="clickOnly" id="handInteractionClick" />
                    <Label htmlFor="handInteractionClick" className="text-[#BFB6A6]">
                      Só clicar
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            </CardContent>
          </Card>

          {/* Acessibilidade */}
          <Card className="bg-[#1E1A16] border border-[#C59E4F]/30">
            <CardContent className="p-8 space-y-6">
              <h3 className="font-display text-[24px] text-[#EFE7D6]">Acessibilidade</h3>
              <div className="h-px bg-gradient-to-r from-[#8F6A30] via-[#C59E4F] to-[#8F6A30]" />

              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label htmlFor="highContrast" className="text-[#BFB6A6]">
                      Alto Contraste
                    </Label>
                    <p className="text-[12px] text-[#BFB6A6]/70">
                      Melhora a legibilidade para usuários com deficiência visual
                    </p>
                  </div>
                  <Switch
                    id="highContrast"
                    checked={settings.highContrast}
                    onCheckedChange={(checked) => updateSetting('highContrast', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label htmlFor="screenReader" className="text-[#BFB6A6]">
                      Suporte a Leitor de Tela
                    </Label>
                    <p className="text-[12px] text-[#BFB6A6]/70">
                      Adiciona descrições ARIA para leitores de tela
                    </p>
                  </div>
                  <Switch
                    id="screenReader"
                    checked={settings.screenReader}
                    onCheckedChange={(checked) => updateSetting('screenReader', checked)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-4">
            <Button
              onClick={onBack}
              variant="outline"
              className="flex-1 border-[#C59E4F] text-[#C59E4F] h-14"
            >
              Voltar
            </Button>
            <Button
              onClick={handleSaveAndBack}
              className="flex-1 bg-[#C59E4F] hover:bg-[#8F6A30] text-[#0F1113] h-14"
            >
              {justSaved ? (
                <span className="flex items-center gap-2">
                  <Check className="w-4 h-4" /> Salvo!
                </span>
              ) : (
                'Salvar Configurações'
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
