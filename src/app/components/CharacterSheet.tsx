import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { ArrowLeft, Wand2, Crosshair, Flame } from 'lucide-react';
import { AngelHaloIcon, BeastFaceIcon, JesterHatIcon } from './CharacterGlyphIcons';
import { CharacterDivider } from './CharacterDivider';
import { ScrollArea } from './ui/scroll-area';
import { getCharacterIconBackground } from '../lib/characterThemes';
import type { CharacterId } from '../lib/gameEngine';

interface CharacterSheetProps {
  character: CharacterId;
  onBack: () => void;
}

export function CharacterSheet({ character, onBack }: CharacterSheetProps) {
  const characterData = {
    mago: {
      name: 'MAGO',
      // FIX (pedido do usuário: ícones de Mago/Besta/Anjo) - ver motivo
      // completo em CharacterSelection.tsx.
      icon: Wand2,
      color: '#4A90E2',
      profile: 'Mestre da manipulação de informação e controle tático. O Mago domina através da revelação de cartas inimigas e substituição estratégica de recursos.',
      spells: [
        { 
          card: 'Valete (J)', 
          phase: 'Compra',
          name: 'Revelação Forçada',
          description: 'Escolha e revele 1 carta da mão do oponente. Se todas já estão reveladas, descarte 1 ao invés.',
        },
        { 
          card: 'Rainha (Q)', 
          phase: 'Estratégia',
          name: 'Substituição Arcana',
          description: 'Substitua 1 carta no campo (seu ou do oponente se revelada) por carta numeral (2-10) da mão - sua ou do oponente, também se revelada. Ela fica revelada.',
        },
        { 
          card: 'Rei (K)', 
          phase: 'Combate',
          name: 'Destruição de Reforço',
          description: 'Descarte 1 carta horizontal do campo do oponente.',
        },
      ],
      strategies: [
        { 
          title: 'Controle de Informação', 
          description: 'Use Revelação Forçada para expor a mão do oponente e planejar seus movimentos com precisão.',
        },
        { 
          title: 'Substituição Tática', 
          description: 'Troque cartas fracas do campo por cartas fortes da mão para garantir vantagem em combate.',
        },
        { 
          title: 'Visão Arcana', 
          description: 'Ative a Magia Numeral (9,9,9) cedo para ter visão completa das cartas do oponente por 1 turno.',
        },
        { 
          title: 'Quebra de Reforços', 
          description: 'Use Destruição de Reforço no momento crítico para enfraquecer o slot mais perigoso do oponente.',
        },
      ],
      numericSpell: {
        cards: '9, 9, 9',
        name: 'Visão Arcana',
        effect: 'No próximo turno, todas as cartas do oponente ficam reveladas (inclui cartas que comprar).',
      },
      monsterEffect: {
        name: 'Ilusão Arcana',
        effect: 'Copia o valor de qualquer carta revelada (sua ou do oponente) para uma carta numeral já posicionada no seu campo.',
      },
    },
    besta: {
      name: 'BESTA',
      icon: BeastFaceIcon,
      color: '#E24A4A',
      profile: 'Guerreiro agressivo que recicla recursos e pressiona constantemente. A Besta vence através de reciclagem do descarte e roubos devastadores.',
      spells: [
        { 
          card: 'Valete (J)', 
          phase: 'Compra',
          name: 'Recuperação Selvagem',
          description: 'Pegue até 2 cartas numerais (2-10) do descarte ao invés de comprar do baralho - Ás, Monstro e magias não podem ser recuperados. Elas ficam reveladas.',
        },
        { 
          card: 'Rainha (Q)', 
          phase: 'Estratégia',
          name: 'Troca Predatória',
          description: 'Troque 1 carta do seu campo (virada ou revelada) por 1 do descarte. A carta fica revelada.',
        },
        { 
          card: 'Rei (K)', 
          phase: 'Combate',
          name: 'Roubo Brutal',
          description: 'Troque 1 carta do seu campo por 1 do oponente (antes de virar). Mantém face down.',
        },
      ],
      strategies: [
        { 
          title: 'Reciclagem Agressiva', 
          description: 'Use Recuperação Selvagem e Troca Predatória para reutilizar cartas poderosas do descarte.',
        },
        { 
          title: 'Roubo Estratégico', 
          description: 'Roube a carta mais forte do oponente com Roubo Brutal antes do combate para virar o jogo.',
        },
        { 
          title: 'Fúria Sanguinária', 
          description: 'Ative a Magia Numeral (6,6,6) para forçar o oponente a descartar cartas altas por 1 turno.',
        },
        { 
          title: 'Pressão Constante', 
          description: 'Mantenha o oponente sob pressão com ataques frequentes e reciclagem de recursos.',
        },
      ],
      numericSpell: {
        cards: '6, 6, 6',
        name: 'Fúria Sanguinária',
        // FIX ("magias numerais" - texto ficou desatualizado): esta descrição
        // ainda falava do mecanismo ANTIGO da Fúria Sanguinária (um filtro
        // que descartava, aos poucos, só as cartas >6 que o oponente comprava
        // ao longo do turno seguinte). O efeito foi reescrito para ser
        // imediato e único no momento da ativação (ver numeralSpells.ts e
        // handleFinalizeNumeralSpell em gameEngine.ts) - esta ficha nunca
        // tinha sido atualizada para acompanhar a mudança, então mostrava um
        // efeito diferente do que realmente acontece no jogo.
        effect: 'Efeito imediato: o oponente descarta toda a mão que possui e compra de volta mais de 6 cartas (o maior entre o limite de mão dele e 7).',
      },
      monsterEffect: {
        name: 'Fúria Selvagem',
        effect: 'Escolhe uma carta do seu campo (a principal de um slot ou uma horizontal) e dobra o valor dela durante o combate.',
      },
    },
    anjo: {
      name: 'ANJO',
      icon: AngelHaloIcon,
      color: '#E2B84A',
      profile: 'Estrategista de longo prazo que acumula vantagens permanentes. O Anjo vence através de crescimento sustentado e proteção de recursos.',
      spells: [
        { 
          card: 'Valete (J)', 
          phase: 'Compra',
          name: 'Benção Divina',
          description: 'Compre um Ás. Busca um Ás no baralho (reembaralhando o descarte de volta se necessário) e coloca ele direto na sua mão.',
        },
        { 
          card: 'Rainha (Q)', 
          phase: 'Estratégia',
          name: 'Visão Celestial',
          description: 'Revele 1 carta do campo ou mão do oponente. A carta revelada não pode ser descartada.',
        },
        { 
          card: 'Rei (K)', 
          phase: 'Estratégia',
          name: 'Reforço Angelical',
          description: 'Permite adicionar 1 carta horizontal extra no campo (pode empilhar múltiplas no mesmo slot).',
        },
      ],
      strategies: [
        { 
          title: 'Crescimento Permanente', 
          description: 'Ative Benção Eterna (3,3,3) o mais cedo possível para comprar mais cartas permanentemente.',
        },
        { 
          title: 'Acumulação de Cartas',
          description: 'Use Benção Divina pra garantir um Ás sempre que precisar de um coringa numeral.',
        },
        { 
          title: 'Empilhamento de Reforços', 
          description: 'Combine Reforço Angelical com múltiplas horizontais para criar slots imbatíveis.',
        },
        { 
          title: 'Proteção de Recursos', 
          description: 'Revele cartas importantes com Visão Celestial para protegê-las de descarte.',
        },
      ],
      numericSpell: {
        cards: '3, 3, 3',
        name: 'Benção Eterna',
        effect: 'PERMANENTE: Compre 1 carta a mais na fase de compra. Limite de mão também aumenta em 1. (Acumulativo)',
      },
      monsterEffect: {
        name: 'Proteção Divina',
        effect: 'Ativa direto (sem escolher slot) e protege TODO o seu campo contra magias do oponente (Valete, Rainha ou Rei) até o fim do turno.',
      },
    },
    mosqueteiro: {
      name: 'MOSQUETEIRO',
      icon: Crosshair,
      color: '#8C9199',
      profile: 'Atirador focado em descarte. O Mosqueteiro troca cartas da própria mão (ou, sob efeito da Recarga Rápida, da mão do oponente) por reforço de campo, informação e precisão de combate - quanto mais descarta com suas magias, mais forte fica seu Rei.',
      spells: [
        {
          card: 'Valete (J)',
          phase: 'Estratégia',
          name: 'Tiro de Cobertura',
          description: 'Descarte 1 carta (sua, ou do oponente às cegas por posição se a Recarga Rápida estiver ativa) para poder posicionar 1 carta horizontal extra no seu campo neste turno.',
        },
        {
          card: 'Rainha (Q)',
          phase: 'Estratégia',
          name: 'Rajada Reveladora',
          description: 'Descarte até 3 cartas (mesma fonte do Valete acima) e revele essa mesma quantidade de cartas ocultas do oponente (mão ou campo), escolhidas às cegas por posição.',
        },
        {
          card: 'Rei (K)',
          phase: 'Combate',
          name: 'Tiro Certeiro',
          description: 'Uma carta sua no campo (revelada ou não) recebe +1 de valor para cada carta que suas magias descartaram neste turno e no anterior.',
        },
      ],
      strategies: [
        {
          title: 'Acumule Antes de Atirar',
          description: 'Use Tiro de Cobertura e Rajada Reveladora cedo na Estratégia para inflar o contador de descartes antes de reforçar uma carta com o Rei no Combate.',
        },
        {
          title: 'Recarga Rápida Ofensiva',
          description: 'Ative o Monstro antes do Valete/Rainha para descartar cartas da mão do OPONENTE em vez da sua - você carrega o Rei de graça e ainda enfraquece a mão dele.',
        },
        {
          title: 'Munição Infinita',
          description: 'Ative a Magia Numeral (9,9,9) num turno de muitos descartes - o bônus de limite de mão do turno seguinte escala com quanto você descartou nos últimos 3 turnos.',
        },
        {
          title: 'Rajada Certeira',
          description: 'Use Rajada Reveladora pra escolher às cegas cartas do campo do oponente antes de decidir onde reforçar sua própria carta com o Rei.',
        },
      ],
      numericSpell: {
        cards: '9, 9, 9',
        name: 'Munição Infinita',
        effect: 'No próximo turno, seu limite de mão aumenta em 1 para cada carta que suas magias (Valete/Rainha) descartaram nos últimos 3 turnos.',
      },
      monsterEffect: {
        name: 'Recarga Rápida',
        effect: 'Ativa direto (sem escolher slot). O próximo Valete ou Rainha que você ativar neste turno descarta cartas da mão do OPONENTE (às cegas por posição) em vez da sua própria mão.',
      },
    },
    coringa: {
      name: 'CORINGA',
      icon: JesterHatIcon,
      color: '#3B4CCB',
      profile: 'Trapaceiro que planta armadilhas no próprio campo. As cartas de magia do Coringa não ativam efeito nenhum na mão - elas são posicionadas viradas para baixo e só revelam sua verdadeira natureza quando reveladas, seja por um golpe do oponente na Estratégia ou na hora do Combate.',
      spells: [
        {
          card: 'Valete (J)',
          phase: 'Estratégia',
          name: 'Isca de Fumaça',
          description: 'Posicione como carta horizontal em cima de uma carta sua - vale 1 fixo se chegar ao Combate. Se o oponente revelar essa carta ainda na Estratégia, ela se dissipa em fumaça (descartada, com riso) e você compra 1 carta.',
        },
        {
          card: 'Rainha (Q)',
          phase: 'Estratégia',
          name: 'Disfarce Duplo',
          description: 'Posicione como carta principal. Se o oponente revelar essa carta ainda na Estratégia, ela volta oculta pra sua mão e embaralha a mão inteira. Se chegar viva ao Combate, copia o valor de uma carta revelada do campo do oponente (você escolhe qual); sem alvo disponível, vale 1.',
        },
        {
          card: 'Rei (K)',
          phase: 'Estratégia',
          name: 'Explosão de Fumaça',
          description: 'Posicione virado no seu campo. Se o oponente revelar essa carta ainda na Estratégia, ela explode em fumaça e nuvens (descartada) e você compra um Ás. Se chegar viva ao Combate, força um EMPATE na disputa e devolve a carta selecionada do oponente (incluindo a horizontal dela) de volta pra mão dele.',
        },
      ],
      strategies: [
        {
          title: 'Campo Minado',
          description: 'Espalhe Valetes, Rainhas e Reis pelo seu campo sem medo - eles não fazem nada sozinhos, então o oponente nunca sabe qual carta é uma armadilha até acionar uma.',
        },
        {
          title: 'Detonação Tardia',
          description: 'Deixe o Rei chegar intacto ao Combate: ele força um empate e ainda devolve a carta que o oponente escolheu pra batalhar de volta pra mão dele, anulando o ataque por completo.',
        },
        {
          title: 'Cópia Oportunista',
          description: 'Deixe a Rainha sobreviver até o Combate e mire na carta de maior valor já revelada no campo do oponente - ela copia esse valor na hora.',
        },
        {
          title: 'Mão de Ferro',
          description: 'Reúna três 7s pra abrir a janela de transformação: vire Valete, Rainha e/ou Rei em cartas de número 11, 12 e 13 de verdade, permanentemente, largando o comportamento de armadilha.',
        },
      ],
      numericSpell: {
        cards: '7, 7, 7',
        name: 'Mão de Ferro',
        effect: 'No próximo turno, suas cartas de magia (Valete/Rainha/Rei) podem ser transformadas permanentemente (um botão surge em cada uma) em cartas de número 11, 12 e 13, deixando de agir como armadilhas.',
      },
      monsterEffect: {
        name: 'Carta Coringa',
        effect: 'Não usa a Zona Monstro - é posicionada no campo (principal ou horizontal) como uma carta numeral comum, valendo 15 fixo no Combate. Se for revelada pelo oponente ainda na Estratégia, volta oculta pra sua mão, que é embaralhada.',
      },
    },
    piromante: {
      name: 'PIROMANTE',
      icon: Flame,
      color: '#CC5500',
      profile: 'Acumula uma Bola de Fogo visível no próprio campo, queimando cartas (suas ou do oponente) como combustível. Cada uma das 3 magias sempre oferece uma escolha: alimentar a Bola de Fogo mais um pouco, ou lançá-la de vez contra o campo do oponente.',
      spells: [
        {
          card: 'Valete (J)',
          phase: 'Compra',
          name: 'Combustão',
          description: 'Todas as suas cartas de valor menor que 5 (2, 3 ou 4) na mão se juntam e viram combustível - a soma delas vai pra Bola de Fogo (até o teto) e essas cartas são descartadas. Ou: lance a Bola de Fogo já acumulada.',
        },
        {
          card: 'Rainha (Q)',
          phase: 'Estratégia',
          name: 'Roubo Flamejante',
          description: 'Escolha uma carta revelada do oponente (mão ou campo, valor 2 a 10) - ela é queimada (descartada) e seu valor vai pra Bola de Fogo. Ou: lance a Bola de Fogo já acumulada.',
        },
        {
          card: 'Rei (K)',
          phase: 'Combate',
          name: 'Queima do Reforço',
          description: 'Queime uma carta horizontal do campo do oponente (descartada) - seu valor vai pra Bola de Fogo. Ou: lance a Bola de Fogo já acumulada.',
        },
      ],
      strategies: [
        {
          title: 'Fogo Cruzado',
          description: 'A Rainha e o Rei sabotam o campo do oponente enquanto alimentam sua Bola de Fogo ao mesmo tempo - cada carta queimada é uma dupla vantagem.',
        },
        {
          title: 'Tudo ou Nada',
          description: 'Uma Bola de Fogo igual ou maior que o total de um slot oblitera ele por completo - meça o campo do oponente antes de decidir lançar.',
        },
        {
          title: 'Chama Repartida',
          description: 'Reúna três 6s pra armar o próximo lançamento pra atingir os 3 slots do oponente de uma vez, com o valor dividido - ótimo contra um campo cheio de cartas fracas.',
        },
      ],
      numericSpell: {
        cards: '6, 6, 6',
        name: 'Chama Repartida',
        effect: 'Não altera a Bola de Fogo em si - só arma o PRÓXIMO lançamento dela pra atingir os 3 slots do campo do oponente de uma vez, com o valor dividido entre eles em vez do total.',
      },
      monsterEffect: {
        name: 'Brasa',
        effect: 'Ativa direto (sem escolher alvo) e adiciona 5 à sua Bola de Fogo, até o teto atual.',
      },
    },
  };

  const data = characterData[character];
  const Icon = data.icon;

  return (
    <div className="min-h-screen flex flex-col p-4 parchment">
      <div className="w-full max-w-5xl mx-auto space-y-8 py-8">
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
            Ficha de Personagem
          </h2>
        </div>

        <ScrollArea className="h-[calc(100vh-200px)]">
          <div className="space-y-8 pr-4">
            {/* Header Card */}
            <Card className="border-2 bg-[#1E1A16]" style={{ borderColor: data.color }}>
              <CardContent className="p-8">
                <div className="flex items-center gap-6">
                  <div
                    className="w-24 h-24 rounded-full flex items-center justify-center"
                    style={
                      character === 'coringa'
                        ? { background: getCharacterIconBackground('coringa'), border: `3px solid ${data.color}` }
                        : { backgroundColor: `${data.color}20`, border: `3px solid ${data.color}` }
                    }
                  >
                    <Icon className="w-12 h-12" style={{ color: character === 'coringa' ? '#0F1113' : data.color }} />
                  </div>
                  <div className="flex-1 space-y-2">
                    <h1 className="font-display text-[48px]" style={{ color: data.color }}>
                      {data.name}
                    </h1>
                    <CharacterDivider />
                    <p className="text-[#EFE7D6] text-[16px] leading-relaxed">
                      {data.profile}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Spells Section */}
            <div className="space-y-4">
              <h3 className="font-display text-[28px] text-[#C59E4F]">
                Magias (J, Q, K)
              </h3>
              <div className="grid grid-cols-1 gap-4">
                {data.spells.map((spell, index) => (
                  <Card key={index} className="border border-[#8F6A30]/30 bg-[#1E1A16]">
                    <CardContent className="p-6 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-display text-[20px]" style={{ color: data.color }}>
                          {spell.card}
                        </h4>
                        <span className="text-[#BFB6A6] text-[14px] px-3 py-1 rounded-full border border-[#8F6A30]/30">
                          Fase de {spell.phase}
                        </span>
                      </div>
                      <p className="text-[#C59E4F] text-[16px] font-semibold">
                        {spell.name}
                      </p>
                      <p className="text-[#EFE7D6] text-[15px] leading-relaxed">
                        {spell.description}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* Numeral Spell */}
            <div className="space-y-4">
              <h3 className="font-display text-[28px] text-[#C59E4F]">
                Magia Numeral
              </h3>
              <Card className="border-2 bg-[#1E1A16]" style={{ borderColor: data.color }}>
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center gap-4">
                    <div 
                      className="px-4 py-2 rounded-lg font-display text-[24px]"
                      style={{ backgroundColor: `${data.color}20`, color: data.color }}
                    >
                      {data.numericSpell.cards}
                    </div>
                    <h4 className="font-display text-[22px]" style={{ color: data.color }}>
                      {data.numericSpell.name}
                    </h4>
                  </div>
                  <p className="text-[#EFE7D6] text-[16px] leading-relaxed">
                    {data.numericSpell.effect}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Monster Effect */}
            <div className="space-y-4">
              <h3 className="font-display text-[28px] text-[#C59E4F]">
                Efeito de Monstro (Coringa)
              </h3>
              <Card className="border border-[#8F6A30]/30 bg-[#1E1A16]">
                <CardContent className="p-6 space-y-3">
                  <h4 className="font-display text-[20px]" style={{ color: data.color }}>
                    🃏 {data.monsterEffect.name}
                  </h4>
                  <p className="text-[#EFE7D6] text-[15px] leading-relaxed">
                    {data.monsterEffect.effect}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Strategies */}
            <div className="space-y-4">
              <h3 className="font-display text-[28px] text-[#C59E4F]">
                Estratégias Recomendadas
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data.strategies.map((strategy, index) => (
                  <Card key={index} className="border border-[#8F6A30]/30 bg-[#1E1A16]">
                    <CardContent className="p-5 space-y-2">
                      <h4 className="text-[18px]" style={{ color: data.color }}>
                        {strategy.title}
                      </h4>
                      <p className="text-[#EFE7D6] text-[14px] leading-relaxed">
                        {strategy.description}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
