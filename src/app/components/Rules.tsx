import { useEffect, useRef, useState, type ComponentType } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ArrowLeft, Search, Check, Wand2, Crosshair, Flame, Sprout } from 'lucide-react';
import { ScrollArea } from './ui/scroll-area';
import { AngelHaloIcon, BeastFaceIcon, JesterHatIcon } from './CharacterGlyphIcons';
import { getCharacterTheme } from '../lib/characterThemes';
import type { CharacterId } from '../lib/gameEngine';

interface RulesProps {
  onBack: () => void;
  /**
   * FIX (pedido do usuário: "link direto Regras -> Ficha do personagem") -
   * as fichas completas (CharacterSheet.tsx) já cobrem cada personagem em
   * detalhe e ficam atualizadas automaticamente; em vez de duplicar esse
   * conteúdo aqui, os selos de personagem de cada seção (ver
   * SECTION_CHARACTER_ICONS abaixo) levam direto pra lá.
   */
  onViewCharacter?: (character: CharacterId) => void;
}

/** Mesmo mapa de ícones por personagem usado em CharacterSelection.tsx - reconstruído aqui (não exportado de lá) por ser só isto, um lookup pequeno. */
const CHARACTER_ICONS: Record<CharacterId, ComponentType<{ className?: string }>> = {
  mago: Wand2,
  besta: BeastFaceIcon,
  anjo: AngelHaloIcon,
  mosqueteiro: Crosshair,
  coringa: JesterHatIcon,
  piromante: Flame,
  druida: Sprout,
};

const READ_SECTIONS_KEY = 'magispelll:rulesRead';

function loadReadSections(): Set<string> {
  try {
    const raw = localStorage.getItem(READ_SECTIONS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

interface RuleSection {
  id: string;
  title: string;
  content: string;
  /** FIX (pedido do usuário: "prévia visual... selo/ícone de personagem ao lado de cada seção específica") - só as seções que falam de personagem(ns) específico(s) ganham selos; seções gerais (Objetivo, Fases do Turno etc.) ficam sem. */
  characters?: CharacterId[];
}

export function Rules({ onBack, onViewCharacter }: RulesProps) {
  const [searchTerm, setSearchTerm] = useState('');
  // FIX (pedido do usuário: "indicador de seção lida") - persistido em
  // localStorage (preferência de dispositivo, mesmo padrão de settings.ts/
  // gamePreferences.ts) - uma seção entra aqui quando fica >=50% visível na
  // tela por um instante (ver IntersectionObserver abaixo), não só ao
  // passar o olho rapidamente rolando.
  const [readIds, setReadIds] = useState<Set<string>>(() => loadReadSections());
  const sectionElsRef = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    try {
      localStorage.setItem(READ_SECTIONS_KEY, JSON.stringify(Array.from(readIds)));
    } catch {
      // localStorage pode falhar (modo privado, cota excedida) - o indicador
      // simplesmente não persiste entre sessões, sem quebrar a tela.
    }
  }, [readIds]);

  const sections: RuleSection[] = [
    {
      id: 'intro',
      title: 'Introdução',
      content:
        'Magispelll é um jogo de duelo estratégico para dois jogadores usando cartas de baralho. Cada jogador escolhe um personagem (MAGO, BESTA, ANJO, MOSQUETEIRO, CORINGA, PIROMANTE ou DRUIDA) com magias e habilidades únicas.',
    },
    {
      id: 'objetivo',
      title: 'Objetivo',
      content:
        'Faça o oponente perder 3 vidas. Cada jogador começa com 3 vidas. Cada combate vencido conta 1 ponto numa disputa - ao completar 2 pontos, a disputa fecha e o oponente perde 1 vida (ver "Sistema de Combate" para detalhes). Quando um jogador chega a 0 vidas, o jogo termina.',
    },
    {
      id: 'setup',
      title: 'Preparação',
      content: `1. Embaralhe o baralho (52 cartas + 2 Monstros/Coringas, ou 62 cartas no baralho Temático - ver abaixo)
2. Cada jogador compra 8 cartas iniciais
3. O jogador 1 começa sendo o primeiro a virar carta no combate
4. O jogo inicia na Fase de Compra do turno 1

VARIANTE - BARALHO TEMÁTICO (62 cartas): escolhido na tela de Configuração antes de iniciar a partida. Soma 8 cartas ao baralho Comum completo (54): 2 Valetes, 2 Rainhas e 2 Reis a mais (cada cópia funciona exatamente como o original - o efeito nunca depende do naipe) e 2 Monstros a mais. A opção "Cartas Monstro" continua funcionando: ligada, o Temático tem 4 Monstros no total; desligada, os Monstros "base" viram Ases extras em vez de sumir - o total continua 52/62 cartas de qualquer forma.

Outras variantes opcionais (Fusão, Towers, Spotlight, Reações) também são escolhidas nesta tela - ver seção "Variantes de Jogo".`,
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
• Valete (J) e Rainha (Q) do Mosqueteiro, e as 3 cartas do Coringa (posicionadas, não ativadas - ver seção própria), também são de Estratégia
• Magias Numerais podem ser ativadas aqui

═══════════════════════════════════════
⚔️ FASE DE COMBATE
═══════════════════════════════════════
• Magias de Rei (K) podem ser usadas
• As 3 magias do Piromante também podem ser usadas aqui, só pra LANÇAR a Bola de Fogo já acumulada (ver seção própria)
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
• Monstro (JOKER): nunca entra em combate diretamente - vira uma carta de valor 15 fixo se for do Coringa (posicionada no campo normal), ou fica na Zona Monstro própria pros outros personagens (ver seção "Cartas Monstro")

EXEMPLO:
Jogador 1: Carta 10 + horizontal 5 = 15
Jogador 2: Carta K (13) + horizontal 3 = 16
→ Jogador 2 vence o combate e ganha 1 ponto na disputa (1/2)
→ Se Jogador 2 vencer mais 1 combate antes de a disputa fechar de outra forma, ele fecha a disputa e Jogador 1 perde 1 vida`,
    },
    {
      id: 'magias',
      title: 'Magias (J, Q, K)',
      characters: ['mago', 'besta', 'anjo', 'mosqueteiro'],
      content: `Cada personagem tem 3 magias únicas. Ao usar uma magia, descarte a carta e aplique o efeito imediatamente. (Coringa e Piromante funcionam diferente - ver as 2 seções próprias logo abaixo desta.)

═══════════════════════════════════════
🔵 MAGO - Controle e Informação
═══════════════════════════════════════
VALETE (Fase de Estratégia):
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
• Pode empilhar múltiplas horizontais no mesmo slot

═══════════════════════════════════════
⚪ MOSQUETEIRO - Descarte e Precisão
═══════════════════════════════════════
VALETE (Fase de Estratégia):
• Tiro de Cobertura
• Descarte 1 carta da mão (sua, ou do oponente às cegas por posição se "Recarga Rápida" estiver ativa)
• Ganha 1 carta horizontal extra pra posicionar neste turno

RAINHA (Fase de Estratégia):
• Rajada Reveladora
• Descarte até 3 cartas da mão (mesma regra de "às cegas" do Valete acima)
• Revele a mesma quantidade de cartas ocultas do oponente (mão ou campo, escolhidas às cegas por posição)

REI (Fase de Combate):
• Tiro Certeiro
• 1 carta sua no campo recebe +1 de valor pra cada carta que suas magias descartaram neste turno e no anterior
• Reativar mirando a MESMA carta soma ao marcador já ali; mirando outra carta, cria um marcador independente - dá pra ter mais de 1 carta reforçada ao mesmo tempo`,
    },
    {
      id: 'coringa-armadilhas',
      title: 'Coringa - Cartas-Armadilha',
      characters: ['coringa'],
      content: `Diferente de todos os outros personagens, as 3 cartas de magia do Coringa NUNCA são ativadas na mão - elas são POSICIONADAS no campo (na Fase de Estratégia, como qualquer carta normal) e ficam disfarçadas entre suas cartas verdadeiras. O efeito só acontece quando a carta é REVELADA, e esse efeito muda dependendo de QUEM revelou e QUANDO.

═══════════════════════════════════════
🟣 VALETE - Isca de Fumaça
═══════════════════════════════════════
• Só pode ser posicionado como carta HORIZONTAL (vale 1 enquanto disfarçada)
• Revelada pelo OPONENTE ainda na Estratégia: se dissipa em fumaça (descartada) e você compra 1 carta
• Revelada normalmente no Combate: luta valendo 1

═══════════════════════════════════════
🟣 RAINHA - Disfarce Duplo
═══════════════════════════════════════
• Só pode ser posicionada como carta PRINCIPAL
• Revelada pelo OPONENTE ainda na Estratégia: volta oculta pra sua mão (que é embaralhada)
• Revelada no Combate: copia o valor de uma carta já revelada do campo do oponente

═══════════════════════════════════════
🟣 REI - Explosão de Fumaça
═══════════════════════════════════════
• Só pode ser posicionado como carta PRINCIPAL
• Revelado pelo OPONENTE ainda na Estratégia: explode em fumaça (descartado) e você compra um Ás
• Revelado no Combate: a disputa vira EMPATE e a carta do oponente volta pra mão dele (no Modo Towers, só o topo da torre dele é removido)

DICA: nada impede posicionar uma carta-armadilha do lado de cartas numerais normais no mesmo turno - a confusão sobre qual slot é qual é a ideia central do personagem.`,
    },
    {
      id: 'piromante-fireball',
      title: 'Piromante - Bola de Fogo',
      characters: ['piromante'],
      content: `A Bola de Fogo é um medidor de combustível visível no seu próprio campo, PERSISTENTE entre turnos (não zera sozinha) - só o Piromante tem isso.

COMO ACUMULAR:
• Toda vez que você ativa uma das 3 magias (Valete/Rainha/Rei), escolhe entre o efeito próprio (alimenta a Bola de Fogo) OU lançar a Bola já acumulada (ver abaixo)
• VALETE - Combustão (Fase de Compra): suas cartas de valor menor que 5 (2, 3, 4) na mão se juntam - a soma vira combustível e elas são descartadas
• RAINHA - Roubo Flamejante (Fase de Compra): escolha uma carta revelada do oponente (2 a 10) - ela é queimada e seu valor vira combustível
• REI - Queima do Reforço (Fase de Combate): queime uma carta horizontal do oponente - seu valor vira combustível
• Teto: 20 (ou 30 com a variante Towers ligada)

COMO LANÇAR:
• Em QUALQUER fase (Compra, Estratégia ou Combate), ao ativar uma das 3 magias, escolha lançar em vez do efeito próprio
• Alvo: 1 slot do campo do oponente
• Slot com valor total (carta + horizontais) MENOR OU IGUAL à Bola de Fogo: é OBLITERADO por completo, tudo vai pro descarte
• Slot com valor total MAIOR que a Bola de Fogo: vira uma carta-token valendo o RESTANTE (ex.: slot de 11 contra Bola de 5 → carta-token de 6) - essa carta é sintética, nunca vai pro descarte (nem se perder um combate depois) e não conta na conservação de cartas do baralho
• A Bola de Fogo é sempre consumida por completo ao lançar (volta a 0), mesmo se o alvo resistir (a Proteção Divina do Anjo bloqueia o efeito, mas a Bola é gasta do mesmo jeito)

CHAMA REPARTIDA (Magia Numeral, 6, 6, 6):
• Não altera a Bola de Fogo em si - arma o PRÓXIMO lançamento pra se espalhar pelos 3 slots do oponente de uma vez, com o valor DIVIDIDO entre eles em vez do total mirando 1 slot só`,
    },
    {
      id: 'mosqueteiro-discard-counter',
      title: 'Mosqueteiro - Contador de Descarte',
      characters: ['mosqueteiro'],
      content: `O contador de descarte é o recurso próprio do Mosqueteiro: quantas cartas as PRÓPRIAS magias (nunca uma compra/descarte manual) mandaram pro descarte recentemente - só ele tem isso, e ele alimenta 2 efeitos diferentes, cada um com sua própria janela de tempo.

COMO ACUMULAR:
• VALETE - Tiro de Cobertura (Fase de Estratégia): descarta 1 carta (sua, ou do oponente às cegas se "Recarga Rápida" estiver ativa) - conta 1 pro contador
• RAINHA - Rajada Reveladora (Fase de Estratégia): descarta até 3 cartas de uma vez - cada uma conta pro contador
• O contador NUNCA soma por descarte manual (fase de Compra) nem por efeito de outro personagem - só Valete/Rainha do próprio Mosqueteiro

REI - TIRO CERTEIRO (Fase de Combate):
• Usa uma janela de 2 turnos: cartas descartadas NESTE turno + no ANTERIOR
• Reforça uma carta do seu campo em +1 por carta contada nessa janela
• Reativar mirando a mesma carta ACUMULA no marcador; mirando outra, cria um marcador independente (dá pra reforçar mais de 1 carta ao mesmo tempo)

MUNIÇÃO INFINITA (Magia Numeral, 9, 9, 9):
• Usa uma janela maior, de 3 turnos: cartas descartadas neste turno + nos 2 anteriores
• No PRÓXIMO turno, aumenta seu limite de mão em 1 pra cada carta contada nessa janela de 3 turnos
• Com poucas cartas acumuladas (menos de 3), o bônus (0-2) raramente compensa gastar as 3 cartas numerais (Ás, 9, 9) - vale segurar a ativação até acumular mais`,
    },
    {
      id: 'druida-broto',
      title: 'Druida - Broto e Simbiose',
      characters: ['druida'],
      content: `O Broto é uma carta que cresce SOZINHA a cada troca de fase - só o Druida tem isso. Diferente de uma carta comum, ele permanece em campo entre turnos (não é descartado quando o resto do campo é) e só some sendo combatido ou removido por um efeito.

═══════════════════════════════════════
🟢 VALETE - Broto (Fase de Estratégia)
═══════════════════════════════════════
• Posicione no campo virado para cima, valendo 1
• A cada troca de fase (Compra→Estratégia→Combate→Compra), seu valor cresce sozinho
• Plantar outro Valete SEMPRE empilha no Broto já existente (só 1 Broto por vez) - aumenta o valor E a taxa de crescimento
• Não recebe cartas horizontais
• É removido apenas sendo combatido ou por efeito - nunca por passar o turno

═══════════════════════════════════════
🟢 RAINHA - Simbiose (Fase de Estratégia)
═══════════════════════════════════════
Sempre oferece 2 formas de ativar (precisa de um Broto ativo):
• Reduza o Broto pela metade para adicionar um marcador de combate (vale a metade reduzida) numa carta SUA no campo
• OU: aumente o Broto em 2

═══════════════════════════════════════
🟢 REI - Urtiga (Fase de Combate)
═══════════════════════════════════════
Mesma escolha de Simbiose, mas mirando o OPONENTE:
• Reduza o Broto pela metade para adicionar um marcador de combate NEGATIVO numa carta do OPONENTE
• OU: aumente o Broto em 2

═══════════════════════════════════════
🟢 MONSTRO - Broto Espelhado
═══════════════════════════════════════
• Não usa a Zona Monstro - é jogada no campo como uma carta numeral comum
• Vale o mesmo valor do Broto no instante em que é jogada (TRAVADO - não muda se o Broto continuar crescendo depois)
• Só pode ser jogada com um Broto ativo em algum slot do seu campo

FOTOSSÍNTESE (Magia Numeral, A, 3, 7):
• Única Magia Numeral do jogo que exige 3 VALORES DIFERENTES (Ás, 3 e 7), não 3 cópias do mesmo número
• PERMANENTE e REATIVÁVEL: cada ativação soma +1 a um nível que nunca reseta, empilhando o bônus em TODOS os efeitos relacionados ao Broto - crescimento por turno, marcador da Rainha/Rei, e a redução do Rei/Rainha`,
    },
    {
      id: 'numeral',
      title: 'Magias Numerais',
      characters: ['mago', 'besta', 'anjo', 'mosqueteiro', 'coringa', 'piromante', 'druida'],
      content: `Reúna 3 cartas de números específicos para ativar efeitos poderosos - na maioria dos personagens as 3 são o MESMO número, mas o Druida (Fotossíntese) exige 3 valores DIFERENTES.

CONDIÇÕES:
• Só pode ativar na Fase de Estratégia
• Campo deve estar vazio (sem cartas posicionadas)
• Precisa de exatamente 1 carta de cada valor exigido
• Apenas 1 Magia Numeral ativa por vez

AO ATIVAR:
1. As 3 cartas são posicionadas no campo (reveladas)
2. Cartas do campo oponente voltam para a mão
3. Animação especial é exibida (3 segundos)
4. As 3 cartas são descartadas
5. Efeito é aplicado - imediato para a maioria, no turno seguinte para outros (ver detalhes de cada um abaixo)
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
• PERMANECE ativa até o fim do turno seguinte: qualquer carta acima de 6 que o oponente comprar nesse período também é queimada na hora

═══════════════════════════════════════
🟡 ANJO - BENÇÃO ETERNA (3, 3, 3)
═══════════════════════════════════════
• PERMANENTE: +1 carta na fase de compra
• PERMANENTE: +1 limite de mão (sem limite máximo)
• Efeito é acumulativo (pode ativar múltiplas vezes)
• Não precisa esperar próximo turno

═══════════════════════════════════════
⚪ MOSQUETEIRO - MUNIÇÃO INFINITA (9, 9, 9)
═══════════════════════════════════════
• No próximo turno, seu limite de mão aumenta em 1 pra cada carta que suas magias (Valete/Rainha) descartaram nos últimos 3 turnos

═══════════════════════════════════════
🟣 CORINGA - MÃO DE FERRO (7, 7, 7)
═══════════════════════════════════════
• No próximo turno, suas cartas de magia (Valete/Rainha/Rei) podem ser transformadas PERMANENTEMENTE em cartas de número 11, 12 ou 13 (um botão surge em cada uma)
• Uma vez transformada, a carta vira numeral de verdade - para de funcionar como armadilha

═══════════════════════════════════════
🟠 PIROMANTE - CHAMA REPARTIDA (6, 6, 6)
═══════════════════════════════════════
• Não altera a Bola de Fogo em si - arma o PRÓXIMO lançamento pra se espalhar pelos 3 slots do oponente de uma vez, com o valor dividido entre eles (ver seção "Piromante - Bola de Fogo")

═══════════════════════════════════════
🟢 DRUIDA - FOTOSSÍNTESE (A, 3, 7)
═══════════════════════════════════════
• Única exigindo 3 valores DIFERENTES (Ás, 3 e 7), não 3 cópias do mesmo número
• PERMANENTE e REATIVÁVEL: cada ativação soma +1 a um nível que nunca reseta, aprimorando TODOS os efeitos relacionados ao Broto pelo resto da partida (ver seção "Druida - Broto e Simbiose")`,
    },
    {
      id: 'monstro',
      title: 'Cartas Monstro (Coringas)',
      characters: ['mago', 'besta', 'anjo', 'mosqueteiro', 'coringa', 'piromante', 'druida'],
      content: `Existem 2 Monstros no baralho Comum (4 no Temático). O nome "Coringas" aqui é sobre as cartas físicas JOKER do baralho - não confundir com o personagem CORINGA, que tem seu próprio efeito de Monstro chamado "Carta Coringa" logo abaixo.

Cada jogador (exceto o próprio Coringa - ver abaixo) tem uma ZONA PRÓPRIA e separada pro seu Monstro (ao lado do Slot 3) - ele NUNCA entra em disputa de combate sozinho, só fica ali para ativar sua habilidade.

USOS E DESCARTE (não vale para o Coringa, que não usa a Zona Monstro):
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
• Escolha 1 slot do seu campo
• Esse slot fica protegido contra magias (J, Q, K) do oponente até o fim do turno
• Pode ativar MAIS DE UMA VEZ no mesmo turno, cada vez protegendo um slot diferente, enquanto durar a carga da carta (até 3 usos no total)
• Precisa ativar (não é passiva)

═══════════════════════════════════════
⚪ MOSQUETEIRO - Recarga Rápida
═══════════════════════════════════════
• Ativa direto, sem escolher slot
• O PRÓXIMO Valete ou Rainha que você ativar neste turno descarta cartas da mão do OPONENTE (escolhidas às cegas por posição) em vez da sua própria mão

═══════════════════════════════════════
🟣 CORINGA - Carta Coringa
═══════════════════════════════════════
• NÃO usa a Zona Monstro - é posicionada no campo (principal ou horizontal) como uma carta numeral comum, valendo 15 fixo no combate
• Revelada pelo oponente ainda na Estratégia, volta oculta pra sua mão (que é embaralhada) - mesma regra da Rainha (Disfarce Duplo)

═══════════════════════════════════════
🟠 PIROMANTE - Brasa
═══════════════════════════════════════
• Ativa direto, sem escolher alvo
• Adiciona 5 à sua Bola de Fogo, até o teto atual

═══════════════════════════════════════
🟢 DRUIDA - Broto Espelhado
═══════════════════════════════════════
• NÃO usa a Zona Monstro - é jogada no campo como uma carta numeral comum
• Vale o mesmo valor do Broto no instante em que é jogada (travado - não muda se o Broto continuar crescendo)
• Só pode ser jogada com um Broto ativo em algum slot do seu campo`,
    },
    {
      id: 'as',
      title: 'Transformação de Ás',
      content: `Ases podem ser transformados em qualquer número de 2 a 10.

COMO TRANSFORMAR:
• Na Fase de Estratégia
• Clique no Ás na sua mão (ou arraste sobre a carta numeral que já tem o valor desejado)
• Escolha um número de 2 a 10
• Ás assume esse valor permanentemente

VALOR EM COMBATE:
• Ás transformado: valor escolhido
• Ás não transformado: 14 (maior valor)

IMPORTANTE:
• Transformação é permanente até carta ser descartada
• Ás transformado conta para Magias Numerais
• Exemplo: Ás virou 9 → conta para MAGO (9,9,9)
• Com a variante Fusão + Cartas Monstro ligadas, 2 Ases (transformados ou não) também podem ser fundidos entre si pra virar uma carta Monstro de verdade - ver "Variantes de Jogo"`,
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
• Mosqueteiro Q: Revela cartas ocultas do oponente
• Coringa: uma carta-armadilha revelada no Combate deixa de estar disfarçada, mas o efeito dela é o que importa - ver "Coringa - Cartas-Armadilha"
• Magia Numeral do Mago: Revela cartas compradas`,
    },
    {
      id: 'variantes',
      title: 'Variantes de Jogo',
      content: `Ligadas na tela de Configuração antes de iniciar a partida - todas opcionais e desligadas por padrão (exceto Cartas Monstro, ligada por padrão).

═══════════════════════════════════════
🔗 FUSÃO
═══════════════════════════════════════
• Na Fase de Compra, selecione 2 cartas numerais (2-10) da mão (ou arraste uma sobre a outra) pra somar seus valores
• Soma de 11, 12 ou 13 vira um Valete, Rainha ou Rei de verdade do seu personagem
• Soma acima de 13 vira um Ás
• Fundir 2 Ases entre si (com Cartas Monstro ligado) vira uma carta Monstro de verdade
• Limite de fusões por turno configurável (1 a 4, padrão 1)

═══════════════════════════════════════
🗼 TOWERS
═══════════════════════════════════════
• Na Fase de Estratégia, selecione 2 ou mais cartas de mesmo número na mão e empilhe num único slot do campo - o valor do slot vira a SOMA de todas
• Só 1 slot pode virar torre por turno (mas pode ser reforçado à vontade dentro do mesmo turno)
• Uma torre nasce sempre revelada e nunca recebe carta horizontal
• Aumenta mão, compra e descarte em 1, e soma 20 cartas numerais + 2 Ases extras ao baralho
• Também aumenta o teto da Bola de Fogo do Piromante (de 20 para 30)

═══════════════════════════════════════
🔦 SPOTLIGHT
═══════════════════════════════════════
• No início de cada turno, 1 a 3 números (2 a 10) são sorteados em destaque
• Positivo: o valor da carta vale 3x mais
• Negativo: o valor da carta fica fixado em 1
• Vale para tudo que usa o valor da carta - combate, Magias Numerais, Torres
• Cartas em destaque ganham um selo visual (cubo)

═══════════════════════════════════════
⚡ REAÇÕES
═══════════════════════════════════════
• Toda vez que uma magia (Valete, Rainha ou Rei) é ativada, se o OPONENTE tiver uma carta mágica do MESMO valor na mão, a ativação é anunciada e um contador de 3 segundos aparece
• O oponente pode reagir com a carta dele, negando o efeito (as duas cartas são descartadas)
• Sem nenhuma carta elegível na mão do oponente, a magia ativa normalmente, sem pausa nenhuma`,
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
      characters: ['mago', 'besta', 'anjo', 'mosqueteiro', 'coringa', 'piromante', 'druida'],
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
• Visão Celestial (Q) protege cartas importantes

MOSQUETEIRO:
• Descarte estratégico é sua fonte de poder - toda magia sua fica mais forte quanto mais você já descartou
• Recarga Rápida (Monstro) antes de um Valete ou Rainha vira o descarte contra o oponente
• Tiro Certeiro (K) recompensa um turno inteiro de descartes calculados

CORINGA:
• Suas magias são armadilhas, não ativações - pense em ONDE e QUANDO elas vão ser reveladas, não só no efeito
• Misture cartas-armadilha entre cartas numerais comuns pra confundir o oponente sobre qual é qual
• Mão de Ferro (7,7,7) transforma armadilhas em cartas de valor alto permanente - ótimo quando o disfarce já não engana mais

PIROMANTE:
• A Bola de Fogo é permanente entre turnos - não tenha pressa de lançar cedo demais
• Chama Repartida (6,6,6) é devastadora contra um campo cheio, mas divide o dano entre os 3 slots - calcule se vale mais lançar concentrado
• Cada magia sempre te dá a escolha de alimentar OU lançar - não fique preso num só plano

DRUIDA:
• Plante o Broto o quanto antes - cada troca de fase que ele passa em campo é valor acumulado, e ele nunca se descarta sozinho
• Empilhar outro Valete no Broto acelera o crescimento (aumenta a taxa, não só o valor de uma vez)
• Simbiose (Q) e Urtiga (K) sempre oferecem a escolha: sacrificar metade do Broto por um marcador imediato, ou deixá-lo crescer +2 pra colher mais depois
• Fotossíntese (A,3,7) é permanente e reativável - reunir A, 3 e 7 de novo (com campo vazio) empilha ainda mais o bônus em tudo relacionado ao Broto`,
    },
  ];

  const filteredSections = sections.filter(
    (section) =>
      section.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      section.content.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // FIX (pedido do usuário: "indicador de seção lida") - um IntersectionObserver
  // só marca uma seção como lida quando ela realmente passa pela tela (>=50%
  // visível), não quando ela só existe no DOM - refeito sempre que a lista
  // filtrada muda (busca), porque os nós observados mudam junto.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const newlyVisible = entries
          .filter((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.5)
          .map((entry) => entry.target.getAttribute('data-section-id'))
          .filter((id): id is string => Boolean(id));
        if (newlyVisible.length === 0) return;
        setReadIds((prev) => {
          const next = new Set(prev);
          newlyVisible.forEach((id) => next.add(id));
          return next;
        });
      },
      { threshold: 0.5 }
    );
    sectionElsRef.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [filteredSections]);

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
          <span className="ml-auto text-[12px] text-[#BFB6A6]">
            {readIds.size}/{sections.length} seções lidas
          </span>
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
              data-section-id={section.id}
              ref={(el) => {
                if (el) sectionElsRef.current.set(section.id, el);
                else sectionElsRef.current.delete(section.id);
              }}
              className="bg-[#1E1A16] border border-[#8F6A30]/30 rounded-lg p-6 space-y-4"
            >
              <div className="flex items-center gap-3 border-b border-[#8F6A30]/50 pb-2">
                <h2 className="font-display text-[24px] text-[#C59E4F]">{section.title}</h2>
                {readIds.has(section.id) && (
                  <span title="Você já leu esta seção" className="text-[#6CC47A]">
                    <Check className="w-4 h-4" />
                  </span>
                )}
                {/* FIX (pedido do usuário: "prévia visual... selo de
                    personagem" + "link direto Regras -> Ficha do
                    personagem") - os dois viram o MESMO selo: um ícone
                    colorido por personagem que, além de identificar
                    visualmente do que a seção fala, já leva direto pra
                    ficha completa dele ao clicar. */}
                {section.characters && section.characters.length > 0 && (
                  <div className="ml-auto flex items-center gap-1.5">
                    {section.characters.map((charId) => {
                      const theme = getCharacterTheme(charId);
                      const Icon = CHARACTER_ICONS[charId];
                      return (
                        <button
                          key={charId}
                          onClick={() => onViewCharacter?.(charId)}
                          disabled={!onViewCharacter}
                          title={`Ver ficha completa de ${theme.name}`}
                          className="w-7 h-7 rounded-full flex items-center justify-center transition-transform hover:scale-110 disabled:hover:scale-100 disabled:cursor-default"
                          style={{ backgroundColor: `${theme.primary}20`, border: `1px solid ${theme.primary}60`, color: theme.primary }}
                        >
                          <Icon className="w-3.5 h-3.5" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="text-[#EFE7D6] whitespace-pre-line leading-relaxed">{section.content}</div>
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
