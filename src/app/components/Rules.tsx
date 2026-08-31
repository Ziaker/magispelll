import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ArrowLeft, Search } from 'lucide-react';
import { ScrollArea } from './ui/scroll-area';

interface RulesProps {
  onBack: () => void;
}

export function Rules({ onBack }: RulesProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const sections = [
    {
      id: 'intro',
      title: 'Introdução',
      content: 'Magispelll é um jogo de duelo estratégico para dois jogadores usando cartas de baralho. Cada jogador escolhe um personagem (MAGO, BESTA, ANJO ou MOSQUETEIRO) com magias e habilidades únicas.',
    },
    {
      id: 'objetivo',
      title: 'Objetivo',
      content: 'Faça o oponente perder 3 vidas. Cada jogador começa com 3 vidas. Cada combate vencido conta 1 ponto numa disputa - ao completar 2 pontos, a disputa fecha e o oponente perde 1 vida (ver "Sistema de Combate" para detalhes). Quando um jogador chega a 0 vidas, o jogo termina.',
    },
    {
      id: 'setup',
      title: 'Preparação',
      content: `1. Embaralhe o baralho (52 cartas + 2 Monstros/Coringas, ou 62 cartas no baralho Temático - ver abaixo)
2. Cada jogador compra 8 cartas iniciais
3. O jogador 1 começa sendo o primeiro a virar carta no combate
4. O jogo inicia na Fase de Compra do turno 1

VARIANTE - BARALHO TEMÁTICO (62 cartas): escolhido na tela de Configuração antes de iniciar a partida. Soma 8 cartas ao baralho Comum completo (54): 2 Valetes, 2 Rainhas e 2 Reis a mais (cada cópia funciona exatamente como o original - o efeito nunca depende do naipe) e 2 Monstros a mais. A opção "Cartas Monstro" continua funcionando: ligada, o Temático tem 4 Monstros no total; desligada, os 2 Monstros "base" viram 2 Ases extras em vez de sumir - o total continua 62 cartas de qualquer forma. Mais magias e efeitos de Monstro em circulação na mesma partida, sem nenhuma regra nova para aprender.`,
    },
    {
      id: 'fases',
      title: 'Fases do Turno',
      content: `Cada turno possui 3 fases obrigatórias:

═══════════════════════════════════════
📥 FASE DE COMPRA
═══════════════════════════════════════
• Cada jogador pode descartar até 4 cartas
• Cada jogador compra 1 carta do baralho
• Magias de Valete (J) podem ser usadas
• Limite de mão: 8 cartas (pode aumentar com habilidades)

═══════════════════════════════════════
⚔️ FASE DE ESTRATÉGIA
═══════════════════════════════════════
• Posicione cartas nos 3 slots do seu campo
• Cada slot aceita 1 carta virada (face down)
• Pode adicionar 1 carta horizontal por turno (reforço), em qualquer slot
• Magias de Rainha (Q) e Rei (K do Anjo) podem ser usadas
• Valete (J) e Rainha (Q) do Mosqueteiro também são de Estratégia (exceção às fases padrão)
• Magias Numerais podem ser ativadas aqui

═══════════════════════════════════════
⚔️ FASE DE COMBATE
═══════════════════════════════════════
• Magias de Rei (K) podem ser usadas
• Jogador que vira primeiro seleciona 1 dos 3 slots
• Outro jogador seleciona 1 dos 3 slots
• Cartas são reveladas simultaneamente
• Maior valor total vence (carta + horizontais)
• Vencedor ganha 1 ponto na DISPUTA (mostrado como "Vitórias: X/2")
• Ao alcançar 2 pontos na disputa, ela fecha: o perdedor perde 1 vida e os campos são descartados
• Se ninguém fechar a disputa (jogadores avançam de fase antes disso), os pontos zeram
• Empate: ninguém ganha ponto
• Quem vira primeiro alterna a cada turno`,
    },
    {
      id: 'combate',
      title: 'Sistema de Combate',
      content: `CÁLCULO DE VALOR:
• Carta virada (face down) = valor base
• Carta horizontal = bônus adicional
• Valor total = carta virada + todas horizontais

VALORES DAS CARTAS:
• Ás (A): 14 (ou 2-10 se transformado)
• Rei (K): 13
• Rainha (Q): 12
• Valete (J): 11
• 10 a 2: valor nominal
• Monstro (JOKER): nunca entra em combate - fica na zona própria (ver seção "Cartas Monstro")

EXEMPLO:
Jogador 1: Carta 10 + horizontal 5 = 15
Jogador 2: Carta K (13) + horizontal 3 = 16
→ Jogador 2 vence o combate e ganha 1 ponto na disputa (1/2)
→ Se Jogador 2 vencer mais 1 combate antes de a disputa fechar de outra forma, ele fecha a disputa e Jogador 1 perde 1 vida`,
    },
    {
      id: 'magias',
      title: 'Magias (J, Q, K)',
      content: `Cada personagem tem 3 magias únicas. Ao usar uma magia, descarte a carta e aplique o efeito imediatamente.

═══════════════════════════════════════
🔵 MAGO - Controle e Informação
═══════════════════════════════════════
VALETE (Fase de Compra):
• Revelação Forçada
• Escolha e revele 1 carta da mão do oponente
• Se todas já reveladas, descarte 1

RAINHA (Fase de Estratégia):
• Substituição Arcana
• Substitua 1 carta no campo por carta numeral (2-10) da mão
• O alvo no campo pode ser seu ou do oponente (se revelada)
• A carta numeral usada pode vir da sua mão ou da mão do oponente (também se revelada)
• Nova carta fica revelada

REI (Fase de Combate):
• Destruição de Reforço
• Descarte 1 carta horizontal do campo oponente

═══════════════════════════════════════
🔴 BESTA - Agressão e Reciclagem
═══════════════════════════════════════
VALETE (Fase de Compra):
• Recuperação Selvagem
• Pegue até 2 cartas do descarte
• Só cartas numerais (2 a 10) - Ás, Monstro e magias não podem ser recuperados
• Cartas ficam reveladas
• Só pode usar se tiver espaço na mão

RAINHA (Fase de Estratégia):
• Troca Predatória
• Troque 1 carta do seu campo por 1 do descarte
• Nova carta fica revelada

REI (Fase de Combate):
• Roubo Brutal
• Troque 1 carta do seu campo por 1 do oponente
• Antes de virar (mantém face down)

═══════════════════════════════════════
🟡 ANJO - Crescimento e Suporte
═══════════════════════════════════════
VALETE (Fase de Compra):
• Benção Divina
• Compre um Ás
• Busca um Ás no baralho e coloca direto na sua mão (reembaralha o descarte de volta se necessário)

RAINHA (Fase de Estratégia):
• Visão Celestial
• Revele 1 carta do campo ou mão do oponente
• Carta revelada não pode ser descartada

REI (Fase de Estratégia):
• Reforço Angelical
• Permite adicionar 1 horizontal extra
• Pode empilhar múltiplas horizontais no mesmo slot`,
    },
    // FIX ("magias numerais" - texto desatualizado): a seção da Besta aqui
    // ainda descrevia o mecanismo ANTIGO da Fúria Sanguinária (filtro que
    // descartava aos poucos, ao longo do turno seguinte, só as cartas >6 que
    // o oponente comprasse) - o efeito foi reescrito para ser imediato e
    // único (ver FIX item 16 em gameEngine.ts), mas este texto nunca tinha
    // sido atualizado, então explicava um comportamento diferente do que
    // realmente acontece. A claim "(máximo 9)" no limite de mão do Anjo
    // também era falsa - não existe (e nunca existiu) nenhum teto no bônus
    // permanente de limite de mão da Benção Eterna (ver
    // `handLimit: playerState.handLimit + 1` em handleFinalizeNumeralSpell,
    // sem nenhum Math.min/clamp).
    {
      id: 'numeral',
      title: 'Magias Numerais',
      content: `Reúna 3 cartas do mesmo número específico para ativar efeitos poderosos.

CONDIÇÕES:
• Só pode ativar na Fase de Estratégia
• Campo deve estar vazio (sem cartas posicionadas)
• Precisa de exatamente 3 cartas do número correto
• Apenas 1 Magia Numeral ativa por vez

AO ATIVAR:
1. As 3 cartas são posicionadas no campo (reveladas)
2. Cartas do campo oponente voltam para a mão
3. Animação especial é exibida (3 segundos)
4. As 3 cartas são descartadas
5. Efeito é aplicado - imediato para Besta e Anjo, no turno seguinte para o Mago (ver detalhes de cada um abaixo)
6. A fase de combate é PULADA
7. Avança direto para fase de compra

═══════════════════════════════════════
🔵 MAGO - VISÃO ARCANA (9, 9, 9)
═══════════════════════════════════════
• No próximo turno, todas as cartas do oponente ficam reveladas
• Inclui cartas que ele comprar
• Dura 1 turno completo

═══════════════════════════════════════
🔴 BESTA - FÚRIA SANGUINÁRIA (6, 6, 6)
═══════════════════════════════════════
• Efeito IMEDIATO (não espera o próximo turno)
• Oponente descarta a mão inteira que possui
• Oponente compra de volta mais de 6 cartas (o maior entre o limite de mão dele e 7)

═══════════════════════════════════════
🟡 ANJO - BENÇÃO ETERNA (3, 3, 3)
═══════════════════════════════════════
• PERMANENTE: +1 carta na fase de compra
• PERMANENTE: +1 limite de mão (sem limite máximo)
• Efeito é acumulativo (pode ativar múltiplas vezes)
• Não precisa esperar próximo turno`,
    },
    {
      id: 'monstro',
      title: 'Cartas Monstro (Coringas)',
      content: `Existem 2 Monstros no baralho. Cada jogador tem uma ZONA PRÓPRIA e separada para seu Monstro (ao lado do Slot 3) - ele NUNCA entra em disputa de combate sozinho, só fica ali para ativar sua habilidade (o que cada personagem escolhe ao ativar varia - veja abaixo).

USOS E DESCARTE:
• Pode ativar 1 vez por turno
• NÃO se descarta depois do 1º uso - continua na zona para os turnos seguintes
• Só se descarta depois de 3 usos NO TOTAL (contador visível ao passar o mouse na carta)

EFEITOS POR PERSONAGEM:
═══════════════════════════════════════
🔵 MAGO - Ilusão Arcana
═══════════════════════════════════════
• Escolha uma carta numeral já no seu campo
• Copie o valor de qualquer carta revelada
• Pode ser sua carta ou do oponente
• Pode usar 1 vez por turno

═══════════════════════════════════════
🔴 BESTA - Fúria Selvagem
═══════════════════════════════════════
• Escolha uma carta do seu campo (a principal de um slot OU uma horizontal)
• O valor dela é DOBRADO durante o combate
• Exemplo: carta principal 6 dobrada = 12

═══════════════════════════════════════
🟡 ANJO - Proteção Divina
═══════════════════════════════════════
• Ativa direto, sem escolher slot nenhum
• Protege TODO O SEU CAMPO (os 3 slots de uma vez) contra magias (J, Q, K) do oponente
• Precisa ativar (não é passiva)`,
    },
    {
      id: 'as',
      title: 'Transformação de Ás',
      content: `Ases podem ser transformados em qualquer número de 2 a 10.

COMO TRANSFORMAR:
• Na Fase de Estratégia
• Clique no Ás na sua mão
• Escolha um número de 2 a 10
• Ás assume esse valor permanentemente

VALOR EM COMBATE:
• Ás transformado: valor escolhido
• Ás não transformado: 14 (maior valor)

IMPORTANTE:
• Transformação é permanente até carta ser descartada
• Ás transformado conta para Magias Numerais
• Exemplo: Ás virou 9 → conta para MAGO (9,9,9)`,
    },
    {
      id: 'cartas-reveladas',
      title: 'Cartas Reveladas',
      content: `Algumas magias revelam cartas. Cartas reveladas têm propriedades especiais:

REGRAS:
• Não podem ser descartadas na Fase de Compra
• Ficam visíveis para ambos jogadores
• Podem ser alvo de magias específicas
• Podem ser substituídas ou trocadas por outras magias

FONTES DE REVELAÇÃO:
• Mago J: Revela carta da mão
• Anjo Q: Revela carta do campo/mão
• Besta J: Cartas do descarte ficam reveladas
• Besta Q: Carta trocada fica revelada
• Mago Q: Carta substituída fica revelada
• Magia Numeral do Mago: Revela cartas compradas`,
    },
    {
      id: 'fim',
      title: 'Fim de Jogo',
      content: `O jogo termina quando um jogador chega a 0 vidas.

VITÓRIA:
• Jogador que ainda tem vidas restantes vence
• Exibição de tela de vitória
• Estatísticas da partida são mostradas

EMPATE:
• Não há empate no Magispelll
• Sempre há um vencedor quando alguém perde 3 vidas

DESISTÊNCIA:
• Jogador pode voltar ao menu a qualquer momento
• Conta como derrota (não salva estatísticas)`,
    },
    {
      id: 'estrategias',
      title: 'Dicas e Estratégias',
      content: `GERAIS:
• Gerencie bem os descartes (máximo 4 por turno)
• Observe quais cartas o oponente descarta
• Cartas reveladas dão informação valiosa
• Horizontais são cruciais - proteja-as
• Timing das magias é tudo

MAGO:
• Use Visão Arcana (9,9,9) para planejar vários turnos
• Revelação Forçada (J) no momento certo revela estratégia
• Destruição de Reforço (K) enfraquece slots perigosos

BESTA:
• Fúria Sanguinária (6,6,6) força o oponente a descartar a mão inteira na hora
• Recuperação Selvagem (J) recicla cartas poderosas
• Roubo Brutal (K) vira jogo antes do combate

ANJO:
• Benção Eterna (3,3,3) o mais cedo possível
• Acumule vantagem de cartas ao longo do jogo
• Reforço Angelical (K) permite combos devastadores
• Visão Celestial (Q) protege cartas importantes`,
    },
  ];

  const filteredSections = sections.filter(
    (section) =>
      section.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      section.content.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#0F1113]">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#1E1A16] border-b-2 border-[#8F6A30] p-4">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <Button
            onClick={onBack}
            variant="ghost"
            size="icon"
            className="text-[#C59E4F] hover:bg-[#C59E4F]/10"
          >
            <ArrowLeft className="w-6 h-6" />
          </Button>
          <h1 className="font-display text-[32px] text-[#C59E4F]">Regras do Jogo</h1>
        </div>
      </div>

      {/* Search */}
      <div className="bg-[#1E1A16] border-b border-[#8F6A30]/30 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#BFB6A6]" />
            <Input
              type="text"
              placeholder="Buscar nas regras..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-[#2A2520] border-[#8F6A30]/30 text-[#EFE7D6] placeholder:text-[#BFB6A6]"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="max-w-4xl mx-auto p-6 space-y-8">
          {filteredSections.map((section) => (
            <div
              key={section.id}
              className="bg-[#1E1A16] border border-[#8F6A30]/30 rounded-lg p-6 space-y-4"
            >
              <h2 className="font-display text-[24px] text-[#C59E4F] border-b border-[#8F6A30]/50 pb-2">
                {section.title}
              </h2>
              <div className="text-[#EFE7D6] whitespace-pre-line leading-relaxed">
                {section.content}
              </div>
            </div>
          ))}

          {filteredSections.length === 0 && (
            <div className="text-center py-12">
              <p className="text-[#BFB6A6] text-[18px]">
                Nenhuma regra encontrada para "{searchTerm}"
              </p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="bg-[#1E1A16] border-t border-[#8F6A30]/30 p-4">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-[#BFB6A6] text-[14px]">
            Magispelll v1.0 • Protótipo de Alta Fidelidade
          </p>
        </div>
      </div>
    </div>
  );
}
