/**
 * characterThemes.ts - Cores e Temas Visuais dos Personagens
 * 
 * Define o sistema de cores único de cada personagem, usado em toda a interface
 * para identificação visual (bordas, botões, ícones, etc).
 * 
 * PALETA DE CORES:
 * - MAGO: Azul (sabedoria, magia arcana)
 * - BESTA: Vermelho (força, fúria)
 * - ANJO: Amarelo/Dourado (luz divina, proteção)
 * 
 * APLICAÇÃO:
 * - Bordas de cartas e slots
 * - Botões de ação
 * - Ícones de personagem
 * - Indicadores visuais
 * - Efeitos de brilho (glow)
 * 
 * EXTENSÃO: Para adicionar novo personagem, escolha uma paleta única e adicione aqui
 */

/**
 * Personagens jogáveis
 * EXTENSÃO: Sincronize com outros arquivos ao adicionar novos
 */
export type Character = 'mago' | 'besta' | 'anjo' | 'mosqueteiro' | 'coringa' | 'piromante';

/**
 * Estrutura de tema de cores de um personagem
 * 
 * PROPRIEDADES:
 * @property name - Nome do personagem em CAIXA ALTA (exibição)
 * @property primary - Cor principal (usada em elementos primários)
 * @property secondary - Cor secundária (usada em backgrounds escuros)
 * @property accent - Cor de destaque (usada em hover/focus)
 * @property light - Tom claro (usada em backgrounds claros)
 * @property dark - Tom escuro (usada em sombras)
 * @property glow - Cor de brilho com transparência (efeitos visuais)
 * @property border - Cor de borda (geralmente igual à primary)
 */
export interface CharacterTheme {
  name: string;
  primary: string;
  secondary: string;
  accent: string;
  light: string;
  dark: string;
  glow: string;
  border: string;
  /**
   * FIX (pedido do usuário, 2ª vez: "no seu fundo ainda é só azul... coloque
   * ambas azul e vermelho estáticos, sem degradê") - versão bem escura de
   * `accent` (o mesmo papel que `dark` já tem pra `primary`), usada só pelo
   * fundo do painel do jogador em campo (ver getCharacterPanelBackground
   * abaixo) - uma divisão NÍTIDA de 50/50 entre `dark` e `darkAccent`
   * (`linear-gradient` com os dois stops NO MESMO PONTO - 50% e 50% - não
   * produz nenhum degradê/mistura entre eles, só um corte reto de uma cor
   * pra outra) é o que finalmente torna o vermelho do Coringa visível no
   * fundo da própria zona de jogo, não só no selo do ícone (ver
   * getCharacterIconBackground, que já usava as duas cores desde antes,
   * mas só ali). Pros outros 4 personagens, `darkAccent` é idêntico a
   * `dark` (mesmo motivo do `accent` deles ser só um tom mais claro da
   * própria `primary` - a divisão fica imperceptível, sem precisar de
   * nenhum `if` especial só pro Coringa).
   */
  darkAccent: string;
}

/**
 * Definição de todos os temas de personagens
 * 
 * ESCOLHA DE CORES:
 * - Cores distintas entre si para fácil identificação
 * - Contraste suficiente com o fundo escuro (#0F1113)
 * - Harmonia com a estética medieval/mágica
 * 
 * ACESSIBILIDADE:
 * - Todas as cores primárias têm contraste adequado com texto claro (#EFE7D6)
 * - Cores secundárias usadas apenas em backgrounds
 * 
 * EXTENSÃO: Para novo personagem, copie a estrutura e escolha nova paleta:
 * novoPersonagem: {
 *   name: 'NOME',
 *   primary: '#RRGGBB',      // Cor vibrante principal
 *   secondary: '#RRGGBB',    // Tom mais escuro da primary
 *   accent: '#RRGGBB',       // Tom mais claro/vibrante da primary
 *   light: '#RRGGBB',        // Tom pastel da primary
 *   dark: '#RRGGBB',         // Tom muito escuro da primary
 *   glow: 'rgba(R, G, B, 0.3)', // Primary com 30% opacidade
 *   border: '#RRGGBB',       // Geralmente igual à primary
 * }
 */
export const characterThemes: Record<Character, CharacterTheme> = {
  // MAGO: Tons de azul (magia arcana, conhecimento, controle)
  mago: {
    name: 'MAGO',
    primary: '#4A90E2',      // Azul médio vibrante
    secondary: '#2E5C8A',    // Azul escuro
    accent: '#6BB6FF',       // Azul claro brilhante
    light: '#A8D5FF',        // Azul pastel
    dark: '#1A3A5C',         // Azul muito escuro
    glow: 'rgba(74, 144, 226, 0.3)', // Brilho azul translúcido
    border: '#4A90E2',
    darkAccent: '#1A3A5C', // Igual a `dark` (accent é só um tom claro da própria primary)
  },
  
  // BESTA: Tons de vermelho (força, agressão, fúria)
  besta: {
    name: 'BESTA',
    primary: '#E24A4A',      // Vermelho médio vibrante
    secondary: '#8A2E2E',    // Vermelho escuro
    accent: '#FF6B6B',       // Vermelho claro brilhante
    light: '#FFA8A8',        // Vermelho pastel
    dark: '#5C1A1A',         // Vermelho muito escuro
    glow: 'rgba(226, 74, 74, 0.3)', // Brilho vermelho translúcido
    border: '#E24A4A',
    darkAccent: '#5C1A1A', // Igual a `dark`
  },
  
  // ANJO: Tons de dourado/amarelo (luz divina, proteção, crescimento)
  anjo: {
    name: 'ANJO',
    primary: '#E2B84A',      // Dourado médio
    secondary: '#8A742E',    // Dourado escuro
    accent: '#FFD76B',       // Dourado claro brilhante
    light: '#FFEBA8',        // Dourado pastel
    dark: '#5C4A1A',         // Dourado muito escuro
    glow: 'rgba(226, 184, 74, 0.3)', // Brilho dourado translúcido
    border: '#E2B84A',
    darkAccent: '#5C4A1A', // Igual a `dark`
  },

  // MOSQUETEIRO: Tons de cinza/aço (armas, metal, pólvora - pedido do usuário)
  mosqueteiro: {
    name: 'MOSQUETEIRO',
    primary: '#8C9199',      // Cinza-aço médio
    secondary: '#4A4E54',    // Cinza-chumbo escuro
    accent: '#C3C9D1',       // Prata clara brilhante
    light: '#DEE2E7',        // Cinza quase branco (pastel)
    dark: '#26282C',         // Cinza-ferro muito escuro (quase preto)
    glow: 'rgba(140, 145, 153, 0.3)', // Brilho metálico translúcido
    border: '#8C9199',
    darkAccent: '#26282C', // Igual a `dark`
  },

  // CORINGA: pedido do usuário ("cor: azul e vermelho") - DUAS cores, não
  // um único matiz como os outros 4 personagens (o "duotone" arlequim é de
  // propósito - accent usa VERMELHO de verdade, não um tom mais claro do
  // mesmo azul, pra reforçar visualmente "ilusão/dualidade" mesmo antes de
  // qualquer efeito específico entrar em jogo).
  coringa: {
    name: 'CORINGA',
    primary: '#3B4CCB',      // Azul-arlequim vibrante
    secondary: '#8A1F3D',    // Vermelho-vinho escuro
    accent: '#E23F5C',       // Vermelho vivo (a 2ª cor de verdade, não um tom de azul)
    light: '#B9C2FF',        // Azul pastel
    dark: '#1A1F5C',         // Azul quase preto
    glow: 'rgba(59, 76, 203, 0.3)', // Brilho azul translúcido
    border: '#3B4CCB',
    darkAccent: '#5C1024', // Vermelho bem escuro (mesmo "peso" visual do azul `dark` acima) - a 2ª metade do fundo duotone, ver getCharacterPanelBackground
  },

  // PIROMANTE (personagem novo, pedido do usuário: "laranja escuro") - tom de
  // laranja queimado bem saturado, escolhido de propósito mais escuro/intenso
  // que o vermelho da Besta e o dourado do Anjo pra não se confundir com
  // nenhum dos dois lado a lado.
  piromante: {
    name: 'PIROMANTE',
    primary: '#CC5500',      // Laranja queimado
    secondary: '#7A3300',    // Laranja escuro
    accent: '#FF8033',       // Laranja vivo brilhante
    light: '#FFB380',        // Laranja pastel
    dark: '#3D1900',         // Laranja quase preto
    glow: 'rgba(204, 85, 0, 0.3)', // Brilho laranja translúcido
    border: '#CC5500',
    darkAccent: '#3D1900', // Igual a `dark` (personagem de matiz único, sem duotone como o Coringa)
  },
};

/**
 * FIX (pedido do usuário, 2ª vez: "no seu fundo ainda é só azul... coloque
 * ambas azul e vermelho estáticos, sem degradê, se não é capaz deixe
 * verde") - fundo do painel do jogador em campo (PlayerZone.tsx), com um
 * corte NÍTIDO 50/50 entre `dark` e `darkAccent` em vez de misturar as duas
 * cores - os dois "color stops" do `linear-gradient` ficam no MESMO ponto
 * (50%), o que produz uma transição instantânea (sem nenhum pixel de
 * blend/degradê entre elas), diferente de getCharacterIconBackground
 * (stops em 40%/100%, com blend de propósito pro selo pequeno do ícone).
 * `alphaHex` é o mesmo sufixo hex-alpha (`"20"`, `"40"` etc.) já usado em
 * todo o resto do arquivo pra opacidade (`${theme.dark}20`) - aplicado nos
 * dois stops igualmente, então a opacidade do fundo inteiro continua a
 * mesma de antes, só a cor é que passa a ser as DUAS de verdade.
 */
export function getCharacterPanelBackground(character: Character, alphaHex: string): string {
  const theme = characterThemes[character];
  return `linear-gradient(135deg, ${theme.dark}${alphaHex} 50%, ${theme.darkAccent}${alphaHex} 50%)`;
}

/**
 * Retorna o tema de cores de um personagem
 * 
 * USO COMUM:
 * ```tsx
 * const theme = getCharacterTheme('mago');
 * <div style={{ borderColor: theme.primary }}>...</div>
 * ```
 * 
 * @param character - Personagem (MAGO, BESTA ou ANJO)
 * @returns Objeto com todas as cores do tema
 */
export function getCharacterTheme(character: Character): CharacterTheme {
  return characterThemes[character];
}

/**
 * FIX (pedido do usuário: "me diga se você realmente é capaz de dar duas
 * cores para o personagem, in-game ele só está usando azul ao invés de
 * vermelho E azul ao mesmo tempo") - resposta curta: sim, é possível, mas
 * exige trabalho de verdade - `theme.accent` (o vermelho de verdade do
 * Coringa) sempre existiu como DADO, mas nunca foi CONSUMIDO em nenhum
 * lugar da interface (auditoria completa: `theme.primary` aparece em 60+
 * pontos da UI; `theme.accent` não aparecia em NENHUM antes desta função) -
 * por isso o jogo só mostrava azul: o dado das duas cores existia, só
 * faltava algo realmente usá-lo.
 *
 * Retrofit-lo em TODOS os 60+ usos de `theme.primary` quebraria a
 * convenção de "1 matiz por personagem" que os outros 4 personagens usam
 * (e a maioria desses usos são `color`/`border-color`, propriedades CSS que
 * não aceitam gradiente - só `background`/`background-image` aceitam) - em
 * vez disso, esta função dá um background de DUAS cores (gradiente
 * primary->accent) só para os "selos"/círculos de ícone do personagem (ver
 * usos em PlayerZone.tsx/CharacterSelection.tsx/CharacterSheet.tsx/
 * CharactersList.tsx/MonsterZone.tsx) - o ponto mais visível e recorrente
 * da identidade visual de um personagem, inclusive DURANTE a partida (não
 * só nas telas de menu). Para os outros 4 personagens (`accent` é só um tom
 * mais claro da própria `primary`), o gradiente é praticamente
 * imperceptível - então não precisa de nenhum `if` especial aqui, funciona
 * igual pra todo mundo, só o Coringa é que realmente parece "duotone".
 */
export function getCharacterIconBackground(character: Character): string {
  const theme = characterThemes[character];
  return `linear-gradient(135deg, ${theme.primary} 40%, ${theme.accent} 100%)`;
}
