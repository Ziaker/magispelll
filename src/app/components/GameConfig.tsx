import { Button } from './ui/button';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Badge } from './ui/badge';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Slider } from './ui/slider';
import { ArrowLeft, HelpCircle } from 'lucide-react';
import { useState } from 'react';
import { DEFAULT_GAME_CONFIG, MIN_DISCARD_LIMIT, type GameConfig as GameConfigType } from '../lib/gameConfig';
import { loadLastGameConfig, saveLastGameConfig } from '../lib/gamePreferences';
import { useSettings } from '../context/SettingsContext';
import { PreGameSteps } from './PreGameSteps';

interface GameConfigProps {
  onBack: () => void;
  onStartGame: (config: GameConfigType) => void;
  /** FIX (item 28 do Grupo G): omitido no atalho de Partida Rápida (pula esta tela). */
  showSteps?: boolean;
}

/** Selo compacto "Básico"/"Avançado" ao lado do nome de uma variante (pedido do usuário: "badge de complexidade nas variantes") - só orienta o jogador novo sobre qual variante mexe mais na regra do jogo; não afeta nada funcional. */
function ComplexityBadge({ level }: { level: 'basico' | 'avancado' }) {
  return (
    <Badge
      variant="outline"
      className={
        level === 'basico'
          ? 'text-[9px] uppercase tracking-wide border-[#6CC47A]/50 text-[#6CC47A] px-1.5 py-0'
          : 'text-[9px] uppercase tracking-wide border-[#C59E4F]/50 text-[#C59E4F] px-1.5 py-0'
      }
    >
      {level === 'basico' ? 'Básico' : 'Avançado'}
    </Badge>
  );
}

type VariantPreset = 'basico' | 'avancado' | 'completo';

/**
 * FIX (item 26 do Grupo G da lista de afazeres, "perfis rápidos") - liga
 * várias variantes de uma vez pra quem não quer configurar toggle por
 * toggle; só mexe nos 5 booleanos de variante (Cartas Monstro/Fusão/Towers/
 * Spotlight/Reações), nunca em modo/baralho/limites/ritmo - continua
 * plenamente ajustável manualmente depois de aplicar um preset.
 */
const VARIANT_PRESETS: Record<VariantPreset, Pick<GameConfigType, 'monsterCards' | 'fusion' | 'towersMode' | 'spotlightMode' | 'reactionsMode'>> = {
  basico: { monsterCards: true, fusion: false, towersMode: false, spotlightMode: false, reactionsMode: false },
  avancado: { monsterCards: true, fusion: true, towersMode: true, spotlightMode: false, reactionsMode: false },
  completo: { monsterCards: true, fusion: true, towersMode: true, spotlightMode: true, reactionsMode: true },
};

export function GameConfig({ onBack, onStartGame, showSteps = true }: GameConfigProps) {
  // FIX (pedido do usuário: "lembrar a última configuração") - pré-preenche
  // com a última config salva (ver gamePreferences.ts), caindo pro padrão
  // de sempre (`DEFAULT_GAME_CONFIG`) só na primeira vez que o jogador abre
  // esta tela neste dispositivo (ou se o localStorage não tiver nada
  // válido salvo). O `() =>` (inicializador preguiçoso do useState) evita
  // reler o localStorage a cada re-render, só na primeira montagem.
  const [config, setConfig] = useState<GameConfigType>(() => loadLastGameConfig() ?? DEFAULT_GAME_CONFIG);
  // FIX (item 22 do Grupo F da lista de afazeres, "velocidade de pensamento
  // da IA ajustável no pré-jogo") - a ÚNICA preferência de jogador (não de
  // regra de partida) nesta tela; usa a mesma config persistida do resto do
  // app (`Settings`/`updateSetting`, ver GameBoard.tsx/Settings.tsx) em vez
  // de um valor próprio do `GameConfigType` - assim ajustar aqui ou durante
  // a partida é literalmente a mesma preferência, nunca diverge.
  const { settings, updateSetting } = useSettings();

  const applyPreset = (preset: VariantPreset) => setConfig({ ...config, ...VARIANT_PRESETS[preset] });

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 parchment">
      <div className="w-full max-w-2xl space-y-8">
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
            Configuração do Jogo
          </h2>
        </div>

        {showSteps && <PreGameSteps current={1} />}

        <div className="bg-[#1E1A16] border border-[#C59E4F]/30 rounded-lg p-8">
        {/* FIX (item 24 do Grupo G da lista de afazeres, "overhaul do
            pré-jogo... abas em vez de coluna única") - a tela cresceu,
            feature após feature, misturando regras de partida (modo,
            baralho, variantes) com preferências de ritmo (velocidade da IA,
            pausa pós-magia) na mesma lista vertical. 3 abas separam essas
            categorias de verdade; cada uma guarda seu próprio scroll
            interno em vez de uma coluna gigante só. */}
        <Tabs defaultValue="mode" className="w-full">
          <TabsList className="grid grid-cols-3 w-full bg-[#0F1113]">
            <TabsTrigger value="mode">Modo &amp; Baralho</TabsTrigger>
            <TabsTrigger value="variants">Variantes</TabsTrigger>
            <TabsTrigger value="pacing">Ritmo &amp; IA</TabsTrigger>
          </TabsList>

          <TabsContent value="mode" className="space-y-8 pt-6">
            {/* Modo */}
            <div className="space-y-4">
              <Label className="text-[18px] text-[#EFE7D6]">Modo de Jogo</Label>
              <RadioGroup
                value={config.mode}
                onValueChange={(value) => setConfig({ ...config, mode: value as 'hotseat' | 'vsAI' | 'spectator' | 'online' })}
              >
                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="hotseat" id="hotseat" />
                  <Label htmlFor="hotseat" className="text-[#BFB6A6]">
                    Hotseat (Local) - 2 jogadores no mesmo dispositivo
                  </Label>
                </div>
                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="vsAI" id="vsAI" />
                  <Label htmlFor="vsAI" className="text-[#BFB6A6]">
                    Contra a IA (Solo) - Jogue sozinho contra o computador
                  </Label>
                </div>
                {/* FIX (pedido do usuário: "modo espectador abaixo do vs IA que
                    é apenas IA vs IA") - os dois personagens são escolhidos pra
                    IA (mesma tela de seleção, ver App.tsx/CharacterSelection.tsx)
                    e a partida joga sozinha do início ao fim, sem nenhum
                    controle humano - ver `aiPlayers` em GameBoard.tsx. */}
                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="spectator" id="spectator" />
                  <Label htmlFor="spectator" className="text-[#BFB6A6]">
                    Modo Espectador - IA contra IA, apenas assista
                  </Label>
                </div>
                <div className="flex items-center space-x-3 opacity-50">
                  <RadioGroupItem value="online" id="online" disabled />
                  <Label htmlFor="online" className="text-[#BFB6A6]">
                    Online (Em breve)
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Tipo de Baralho */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Label className="text-[18px] text-[#EFE7D6]">Tipo de Baralho</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-4 h-4 text-[#C59E4F] cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[300px] bg-[#1E1A16] border-[#C59E4F]">
                      <p className="text-[#EFE7D6] text-[12px]">
                        Comum: 52 cartas + 2 Coringas opcionais (Cartas Monstro, ver Variantes). Temático: o baralho Comum
                        completo (54 cartas) + 8 cartas extras (2 Valetes, 2 Rainhas, 2 Reis e até 4 Coringas a mais) -
                        mais magias e efeitos de Monstro disponíveis na mesma partida. Com "Cartas Monstro" desligada,
                        TODOS os Coringas viram Ases extras em vez de sumir - o Temático sempre tem 62 cartas, ligado ou
                        não.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <RadioGroup
                value={config.deckType}
                onValueChange={(value) => setConfig({ ...config, deckType: value as 'common' | 'thematic' })}
              >
                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="common" id="common" />
                  <Label htmlFor="common" className="text-[#BFB6A6]">
                    Comum (52/54 cartas)
                  </Label>
                </div>
                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="thematic" id="thematic" />
                  <Label htmlFor="thematic" className="text-[#BFB6A6]">
                    Temático (62 cartas)
                  </Label>
                </div>
              </RadioGroup>
            </div>
          </TabsContent>

          <TabsContent value="variants" className="space-y-6 pt-6">
            {/* FIX (item 26 do Grupo G, "perfis rápidos") */}
            <div className="space-y-2">
              <Label className="text-[#BFB6A6] text-[12px] uppercase tracking-wide">Perfis rápidos</Label>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => applyPreset('basico')} className="flex-1 border-[#6CC47A]/50 text-[#6CC47A] hover:bg-[#6CC47A]/10">
                  Básico
                </Button>
                <Button variant="outline" size="sm" onClick={() => applyPreset('avancado')} className="flex-1 border-[#C59E4F]/50 text-[#C59E4F] hover:bg-[#C59E4F]/10">
                  Avançado
                </Button>
                <Button variant="outline" size="sm" onClick={() => applyPreset('completo')} className="flex-1 border-[#C59E4F] text-[#C59E4F] hover:bg-[#C59E4F]/10">
                  Completo
                </Button>
              </div>
            </div>

            {/* FIX (item 25 do Grupo G, "variantes como accordion recolhível")
                - cada variante agora é seu PRÓPRIO item, fechado por padrão -
                antes eram 5 blocos sempre expandidos numa lista só. O Switch
                mora FORA do <button> do AccordionTrigger (Radix renderiza o
                trigger inteiro como um único <button>, e aninhar outro
                elemento interativo dentro dele é HTML inválido) - ver a
                estrutura de irmãos abaixo, não filhos. */}
            <Accordion type="multiple" className="space-y-1">
              <AccordionItem value="monster" className="border-b border-[#C59E4F]/10">
                <div className="flex items-center gap-2">
                  <AccordionTrigger className="flex-1 py-2">
                    <span className="flex items-center gap-2 text-[#BFB6A6]">
                      Cartas Monstro
                      <ComplexityBadge level="basico" />
                    </span>
                  </AccordionTrigger>
                  <Switch
                    id="monster"
                    checked={config.monsterCards}
                    onCheckedChange={(checked) => setConfig({ ...config, monsterCards: checked })}
                  />
                </div>
                <AccordionContent>
                  <p className="text-[#EFE7D6] text-[12px]">
                    Coringas são considerados cartas monstro, estas cartas quando postas em campo, permitem que o
                    personagem ative um efeito único (veja a ficha de cada) uma vez por turno. Veja as regras de
                    funcionamento destas cartas na sessão de tutorial.
                    {config.deckType === 'thematic' &&
                      ' No baralho Temático, desligar esta opção troca os 4 Coringas por 4 Ases extras (nenhum Coringa entra no baralho) - o total continua 62 cartas.'}
                  </p>
                </AccordionContent>
              </AccordionItem>

              {/* FIX (pedido do usuário: "crie uma nova opção... abaixo do
                  botão que decide se aceita carta monstro") - variante
                  Fusão: junta 2 cartas numerais da mão em 1, na fase de
                  Compra, uma vez por turno - ver fusion.ts. */}
              <AccordionItem value="fusion" className="border-b border-[#C59E4F]/10">
                <div className="flex items-center gap-2">
                  <AccordionTrigger className="flex-1 py-2">
                    <span className="flex items-center gap-2 text-[#BFB6A6]">
                      Fusão
                      <ComplexityBadge level="basico" />
                    </span>
                  </AccordionTrigger>
                  <Switch
                    id="fusion"
                    checked={config.fusion}
                    onCheckedChange={(checked) => setConfig({ ...config, fusion: checked })}
                  />
                </div>
                <AccordionContent className="space-y-3">
                  <p className="text-[#EFE7D6] text-[12px]">
                    Na fase de Compra, junte 2 cartas numerais (2-10) da mão para somar seus valores (até o limite de
                    vezes por turno configurado abaixo): selecione as 2 cartas (ou arraste uma sobre a outra) para ver a
                    opção de Fundir. Somas de 11, 12 ou 13 viram um Valete, Rainha ou Rei de verdade do seu personagem;
                    qualquer soma acima de 13 vira um Ás. Fundir 2 Áses entre si (com Cartas Monstro habilitado) vira uma
                    carta Monstro de verdade.
                  </p>
                  {/* FIX (pedido do usuário: "abaixo da opção de fusão,
                      implemente a possibilidade de limite de fusões,
                      podendo selecionar quantas fusões os jogadores poderão
                      fazer cada turno, com o limite normal sendo de 1 e o
                      limite de vezes indo até 4") - só aparece (e só
                      importa) com a variante Fusão ligada. */}
                  {config.fusion && (
                    <div className="flex items-center justify-between">
                      <Label htmlFor="fusionLimit" className="text-[#BFB6A6]">
                        Limite de fusões por turno
                      </Label>
                      <Select
                        value={config.fusionLimit.toString()}
                        onValueChange={(val) => setConfig({ ...config, fusionLimit: parseInt(val, 10) })}
                      >
                        <SelectTrigger id="fusionLimit" className="h-auto py-1 px-2 w-[70px] bg-[#0F1113] border-[#C59E4F]/50 text-[#EFE7D6]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#1E1A16] border-[#C59E4F]">
                          {[1, 2, 3, 4].map((n) => (
                            <SelectItem key={n} value={n.toString()} className="text-[#EFE7D6]">
                              {n}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>

              {/* FIX (pedido do usuário: novo modo Towers) - empilhar cartas
                  numerais de mesmo valor num único slot do campo por turno. */}
              <AccordionItem value="towers" className="border-b border-[#C59E4F]/10">
                <div className="flex items-center gap-2">
                  <AccordionTrigger className="flex-1 py-2">
                    <span className="flex items-center gap-2 text-[#BFB6A6]">
                      Towers
                      <ComplexityBadge level="avancado" />
                    </span>
                  </AccordionTrigger>
                  <Switch
                    id="towersMode"
                    checked={config.towersMode}
                    onCheckedChange={(checked) => setConfig({ ...config, towersMode: checked })}
                  />
                </div>
                <AccordionContent>
                  <p className="text-[#EFE7D6] text-[12px]">
                    Na fase de Estratégia, selecione 2+ cartas de mesmo número (Ctrl/Shift+clique na mão) e use o botão
                    Towers para empilhá-las num slot do campo - o valor do slot vira a soma de todas. Só 1 slot pode
                    virar torre por turno (mas pode ser reforçado à vontade dentro do mesmo turno). Uma torre nasce
                    sempre revelada e nunca recebe carta horizontal. Aumenta a mão, a compra e o descarte em 1, e soma
                    +20 numerais e +2 Áses ao baralho.
                  </p>
                </AccordionContent>
              </AccordionItem>

              {/* FIX (pedido do usuário: novo modo Spotlight) - no início de
                  cada turno, 1-3 números de 2 a 10 valem 3x mais (ou ficam
                  fixados em 1, se negativo) em tudo que usa o valor da
                  carta - ver spotlight.ts. */}
              <AccordionItem value="spotlight" className="border-b border-[#C59E4F]/10">
                <div className="flex items-center gap-2">
                  <AccordionTrigger className="flex-1 py-2">
                    <span className="flex items-center gap-2 text-[#BFB6A6]">
                      Spotlight
                      <ComplexityBadge level="avancado" />
                    </span>
                  </AccordionTrigger>
                  <Switch
                    id="spotlightMode"
                    checked={config.spotlightMode}
                    onCheckedChange={(checked) => setConfig({ ...config, spotlightMode: checked })}
                  />
                </div>
                <AccordionContent className="space-y-3">
                  <p className="text-[#EFE7D6] text-[12px]">
                    No início de cada turno, 1-3 números de 2 a 10 são sorteados em destaque - positivo, o valor da
                    carta vale 3x mais; negativo, o valor fica fixado em 1. Vale pra tudo que usa o valor da carta
                    (combate, Magia Numeral, Torres). Cartas em destaque ganham um selo de cubo.
                  </p>
                  {config.spotlightMode && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="spotlightCount" className="text-[#BFB6A6]">
                          Quantidade de números
                        </Label>
                        <Select
                          value={config.spotlightCount.toString()}
                          onValueChange={(val) => setConfig({ ...config, spotlightCount: parseInt(val, 10) })}
                        >
                          <SelectTrigger id="spotlightCount" className="h-auto py-1 px-2 w-[70px] bg-[#0F1113] border-[#C59E4F]/50 text-[#EFE7D6]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-[#1E1A16] border-[#C59E4F]">
                            {[1, 2, 3].map((n) => (
                              <SelectItem key={n} value={n.toString()} className="text-[#EFE7D6]">
                                {n}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="spotlightPositive" className="text-[#BFB6A6]">
                          Spotlight positivo (valor x3)
                        </Label>
                        <Switch
                          id="spotlightPositive"
                          checked={config.spotlightPositive}
                          onCheckedChange={(checked) =>
                            // FIX (garantia de configuração válida): nunca deixa as duas
                            // polaridades desligadas ao mesmo tempo - desligar a única
                            // ligada liga a outra automaticamente no lugar.
                            setConfig({
                              ...config,
                              spotlightPositive: checked,
                              spotlightNegative: checked ? config.spotlightNegative : true,
                            })
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="spotlightNegative" className="text-[#BFB6A6]">
                          Spotlight negativo (valor fixo em 1)
                        </Label>
                        <Switch
                          id="spotlightNegative"
                          checked={config.spotlightNegative}
                          onCheckedChange={(checked) =>
                            setConfig({
                              ...config,
                              spotlightNegative: checked,
                              spotlightPositive: checked ? config.spotlightPositive : true,
                            })
                          }
                        />
                      </div>
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>

              {/* FIX (pedido do usuário: novo modo Reações) - toda vez que
                  uma magia é ativada, se o oponente tiver uma carta mágica
                  do mesmo valor na mão, a ativação é anunciada por 3s antes
                  de aplicar de verdade - o oponente pode reagir (nega o
                  efeito, descarta as duas cartas) - ver reações em
                  gameEngine.ts (pendingReaction). */}
              <AccordionItem value="reactions" className="border-b-0">
                <div className="flex items-center gap-2">
                  <AccordionTrigger className="flex-1 py-2">
                    <span className="flex items-center gap-2 text-[#BFB6A6]">
                      Reações
                      <ComplexityBadge level="avancado" />
                    </span>
                  </AccordionTrigger>
                  <Switch
                    id="reactionsMode"
                    checked={config.reactionsMode}
                    onCheckedChange={(checked) => setConfig({ ...config, reactionsMode: checked })}
                  />
                </div>
                <AccordionContent className="space-y-3">
                  <p className="text-[#EFE7D6] text-[12px]">
                    Toda vez que uma magia (Valete, Rainha ou Rei) é ativada, se o oponente tiver uma carta mágica do
                    MESMO valor na mão, a ativação é anunciada (revelada) e um contador de 3s aparece - o oponente pode
                    reagir com a carta dele, negando o efeito (as duas cartas são descartadas). Sem nenhuma carta
                    elegível, a magia ativa normalmente, sem pausa nenhuma.
                  </p>
                  {config.reactionsMode && (
                    <div className="flex items-center justify-between">
                      <Label htmlFor="reactionsLimit" className="text-[#BFB6A6]">
                        Reações por fase
                      </Label>
                      <Select
                        value={config.reactionsLimit.toString()}
                        onValueChange={(val) => setConfig({ ...config, reactionsLimit: parseInt(val, 10) })}
                      >
                        <SelectTrigger id="reactionsLimit" className="h-auto py-1 px-2 w-[70px] bg-[#0F1113] border-[#C59E4F]/50 text-[#EFE7D6]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#1E1A16] border-[#C59E4F]">
                          {[1, 2, 3].map((n) => (
                            <SelectItem key={n} value={n.toString()} className="text-[#EFE7D6]">
                              {n}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            {/* Regras gerais - não são variantes liga/desliga, sempre valem. */}
            <div className="space-y-4 pt-4 border-t border-[#C59E4F]/20">
              {/* FIX (pedido do usuário: "opção do pré-jogo para decidir o
                  limite de cartas que podem serem descartadas por turno...
                  com o mínimo sendo 4 como no jogo normal") - antes era um
                  valor fixo de 4 (sem opção nenhuma na tela) - agora
                  ajustável, sempre visível (não tem switch liga/desliga, só
                  o número muda) e nunca abaixo de MIN_DISCARD_LIMIT. */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label htmlFor="discardLimit" className="text-[#BFB6A6]">
                    Limite de descartes por turno
                  </Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-4 h-4 text-[#C59E4F] cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[300px] bg-[#1E1A16] border-[#C59E4F]">
                        <p className="text-[#EFE7D6] text-[12px]">
                          Quantas cartas cada jogador pode descartar por turno na fase de Compra. Padrão (e mínimo): 4,
                          como no jogo normal.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Select
                  value={config.discardLimit.toString()}
                  onValueChange={(val) => setConfig({ ...config, discardLimit: parseInt(val, 10) })}
                >
                  <SelectTrigger id="discardLimit" className="h-auto py-1 px-2 w-[70px] bg-[#0F1113] border-[#C59E4F]/50 text-[#EFE7D6]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1E1A16] border-[#C59E4F]">
                    {Array.from({ length: 5 }, (_, i) => MIN_DISCARD_LIMIT + i).map((n) => (
                      <SelectItem key={n} value={n.toString()} className="text-[#EFE7D6]">
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* FIX (pedido do usuário: "opção no pré-jogo de limite de
                  compra de cartas... se há ou não um limite de cartas que
                  são possíveis de se comprar (sem afetar efeitos de
                  magias) por turno... funcionando de forma similar a de
                  descarte") - desligado por padrão (compra livre até a mão
                  encher, comportamento histórico do jogo). */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label htmlFor="drawLimitEnabled" className="text-[#BFB6A6]">
                    Limite de compras por turno
                  </Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-4 h-4 text-[#C59E4F] cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[300px] bg-[#1E1A16] border-[#C59E4F]">
                        <p className="text-[#EFE7D6] text-[12px]">
                          Desligado (padrão): compra livre até a mão encher, como sempre. Ligado, limita quantas cartas
                          cada jogador pode comprar por turno na fase de Compra, independente do limite de mão - nunca
                          afeta cartas ganhas por efeito de magia (ex.: Recuperação Selvagem da Besta), só a compra
                          manual.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Switch
                  id="drawLimitEnabled"
                  checked={config.drawLimitEnabled}
                  onCheckedChange={(checked) => setConfig({ ...config, drawLimitEnabled: checked })}
                />
              </div>
              {config.drawLimitEnabled && (
                <div className="flex items-center justify-between pl-4">
                  <Label htmlFor="drawLimit" className="text-[#BFB6A6]">
                    Cartas compráveis por turno
                  </Label>
                  <Select
                    value={config.drawLimit.toString()}
                    onValueChange={(val) => setConfig({ ...config, drawLimit: parseInt(val, 10) })}
                  >
                    <SelectTrigger id="drawLimit" className="h-auto py-1 px-2 w-[70px] bg-[#0F1113] border-[#C59E4F]/50 text-[#EFE7D6]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1E1A16] border-[#C59E4F]">
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                        <SelectItem key={n} value={n.toString()} className="text-[#EFE7D6]">
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex items-center justify-between">
                <Label htmlFor="autoEffects" className="text-[#BFB6A6]">
                  Mostrar efeitos numéricos automaticamente
                </Label>
                <Switch
                  id="autoEffects"
                  checked={config.autoShowEffects}
                  onCheckedChange={(checked) => setConfig({ ...config, autoShowEffects: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label htmlFor="autoShuffle" className="text-[#BFB6A6]">
                    Shuffle automático
                  </Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-4 h-4 text-[#C59E4F] cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[300px] bg-[#1E1A16] border-[#C59E4F]">
                        <p className="text-[#EFE7D6] text-[12px]">
                          Quando houverem 20 ou mais cartas na pilha de descarte, metade delas são aleatoriamente
                          embaralhadas de volta ao baralho.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Switch
                  id="autoShuffle"
                  checked={config.autoShuffle}
                  onCheckedChange={(checked) => setConfig({ ...config, autoShuffle: checked })}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="pacing" className="space-y-6 pt-6">
            {/* FIX (item 22 do Grupo F, "velocidade de pensamento da IA
                ajustável no pré-jogo") - mesma preferência/convenção do
                slider já usado em Configurações (100% = padrão, maior =
                mais rápido) - baixar o valor aumenta o tempo de resposta. */}
            <div className="space-y-3">
              <Label htmlFor="aiThinkSpeedPreGame" className="text-[#BFB6A6]">
                Velocidade de Pensamento da IA: {settings.aiThinkSpeed}%
              </Label>
              <Slider
                id="aiThinkSpeedPreGame"
                value={[settings.aiThinkSpeed]}
                onValueChange={([value]) => updateSetting('aiThinkSpeed', value)}
                min={30}
                max={300}
                step={10}
              />
            </div>

            {/* FIX (item 23 do Grupo F, "intervalo mínimo pós ativação de
                magia... pop-up mostrando o efeito e os alvos, sem
                obscurecer... isso fica no pré-jogo apenas") - mesmo padrão
                toggle+Select de "Limite de compras". 0 (desligado) é o
                valor padrão - comportamento de sempre, sem pausa nenhuma. */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label htmlFor="postMagicPauseEnabled" className="text-[#BFB6A6]">
                  Pausa após magias
                </Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-4 h-4 text-[#C59E4F] cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[300px] bg-[#1E1A16] border-[#C59E4F]">
                      <p className="text-[#EFE7D6] text-[12px]">
                        Ao ativar qualquer magia, trava as ações por um tempo mínimo e mostra um aviso com o efeito e os
                        alvos (sem esconder o campo) - dá tempo de acompanhar o que aconteceu antes de seguir. Só
                        ajustável aqui, no pré-jogo.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Switch
                id="postMagicPauseEnabled"
                checked={config.postMagicPauseMs > 0}
                onCheckedChange={(checked) => setConfig({ ...config, postMagicPauseMs: checked ? 1500 : 0 })}
              />
            </div>
            {config.postMagicPauseMs > 0 && (
              <div className="flex items-center justify-between pl-4">
                <Label htmlFor="postMagicPauseMs" className="text-[#BFB6A6]">
                  Duração da pausa
                </Label>
                <Select
                  value={config.postMagicPauseMs.toString()}
                  onValueChange={(val) => setConfig({ ...config, postMagicPauseMs: parseInt(val, 10) })}
                >
                  <SelectTrigger id="postMagicPauseMs" className="h-auto py-1 px-2 w-[90px] bg-[#0F1113] border-[#C59E4F]/50 text-[#EFE7D6]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1E1A16] border-[#C59E4F]">
                    {[1000, 1500, 2000, 3000, 5000].map((ms) => (
                      <SelectItem key={ms} value={ms.toString()} className="text-[#EFE7D6]">
                        {(ms / 1000).toString().replace('.0', '')}s
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </TabsContent>
        </Tabs>

          <div className="flex gap-4 pt-6">
            <Button
              onClick={() => {
                // FIX (pedido do usuário: "lembrar a última configuração") -
                // salva no exato momento de começar a partida, não a cada
                // troca de campo (ver saveLastGameConfig, gamePreferences.ts).
                saveLastGameConfig(config);
                onStartGame(config);
              }}
              className="flex-1 bg-[#C59E4F] hover:bg-[#8F6A30] text-[#0F1113] h-14 text-[18px] rune-glow"
            >
              Iniciar Partida
            </Button>
            <Button
              onClick={onBack}
              variant="outline"
              className="flex-1 border-[#C59E4F] text-[#C59E4F] hover:bg-[#C59E4F]/10 h-14 text-[18px]"
            >
              Cancelar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
