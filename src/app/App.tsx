/**
 * App.tsx - Componente Principal do Magispelll
 * 
 * Este é o ponto de entrada da aplicação, gerenciando a navegação entre todas as telas
 * do jogo através de um sistema de roteamento baseado em estado.
 * 
 * NOME DO JOGO: Magispelll (3 L's)
 * Cada "L" representa um personagem jogável (MAGO, BESTA, ANJO).
 * Se novos personagens forem adicionados, adicione mais L's ao nome.
 * 
 * RESPONSABILIDADES:
 * - Controlar qual tela está sendo exibida
 * - Gerenciar o fluxo de configuração e seleção de personagens
 * - Manter o estado global da aplicação (configuração de jogo, personagens selecionados)
 * - Inicializar o jogo após configuração completa
 * 
 * PONTOS DE EXTENSÃO:
 * - Adicionar novas telas: incluir no type Screen e adicionar case no renderScreen
 * - Adicionar novos personagens: atualizar o tipo 'mago' | 'besta' | 'anjo' em toda a aplicação
 * - Implementar sistema de salvamento: adicionar estados para save/load
 */

import { Suspense, lazy, useState } from 'react';
import { DndProvider } from 'react-dnd';
import { TouchBackend } from 'react-dnd-touch-backend';
import { Splash } from './components/Splash';
import { Home } from './components/Home';
import { GameConfig } from './components/GameConfig';
import type { GameConfig as GameConfigType } from './lib/gameConfig';
import { DEFAULT_GAME_CONFIG } from './lib/gameConfig';
import { CharacterSelection } from './components/CharacterSelection';
import { Rules } from './components/Rules';
import { CharactersList } from './components/CharactersList';
import { CharacterSheet } from './components/CharacterSheet';
import { Settings } from './components/Settings';
import { SettingsProvider } from './context/SettingsContext';

// FIX (pedido do usuário: "itens de performance") - GameBoard.tsx sozinho
// arrasta praticamente todo o "peso" do jogo (party-js, canvas-confetti,
// todos os bursts de magia, BattleField/FieldSlotView/HandCardView, os 9
// sons) para dentro do bundle inicial, mesmo que o jogador ainda esteja só
// na tela de abertura/menu. `lazy()` + `Suspense` (ver renderScreen abaixo)
// separa isso num chunk próprio, carregado sob demanda só quando a tela
// 'game' é alcançada de verdade - splash/home/config/seleção de personagem
// carregam mais rápido, sem baixar nada disso à toa.
const GameBoard = lazy(() => import('./components/GameBoard').then((m) => ({ default: m.GameBoard })));

/**
 * Tipo que define todas as telas possíveis na aplicação
 * EXTENSÃO: Adicione novos valores aqui para criar novas telas
 */
type Screen =
  | 'splash'              // Tela inicial com logo e animação
  | 'home'                // Menu principal
  | 'config'              // Configuração de partida (vidas, modo)
  | 'character-selection' // Seleção de personagens (2 etapas)
  | 'game'                // Tabuleiro de jogo principal
  | 'rules'               // Regras completas do jogo
  | 'characters'          // Lista de personagens disponíveis
  | 'character-sheet'     // Ficha detalhada de um personagem
  | 'settings';           // Configurações do jogo

export default function App() {
  // ===== ESTADOS PRINCIPAIS =====
  
  /**
   * Controla qual tela está sendo exibida atualmente
   * Inicia em 'splash' para mostrar a tela de abertura
   */
  const [currentScreen, setCurrentScreen] = useState<Screen>('splash');
  
  /**
   * Armazena a configuração escolhida pelo jogador (vidas iniciais, modo de jogo)
   * null até que o jogador complete a tela de configuração
   */
  const [gameConfig, setGameConfig] = useState<GameConfigType | null>(null);
  
  /**
   * Personagem selecionado para visualizar a ficha detalhada
   * Usado apenas no fluxo: characters -> character-sheet
   */
  const [selectedCharacter, setSelectedCharacter] = useState<'mago' | 'besta' | 'anjo' | 'mosqueteiro' | 'coringa' | 'piromante' | null>(null);
  
  /**
   * Controla em qual etapa da seleção de personagem estamos
   * Etapa 1: Jogador 1 escolhe
   * Etapa 2: Jogador 2 escolhe
   */
  const [characterSelectionStep, setCharacterSelectionStep] = useState<1 | 2>(1);
  
  /**
   * Armazena os personagens escolhidos por cada jogador
   * Usado para iniciar a partida quando ambos tiverem escolhido
   * EXTENSÃO: Para suportar mais jogadores, expandir esta estrutura
   */
  const [selectedCharacters, setSelectedCharacters] = useState<{
    player1?: 'mago' | 'besta' | 'anjo' | 'mosqueteiro' | 'coringa' | 'piromante';
    player2?: 'mago' | 'besta' | 'anjo' | 'mosqueteiro' | 'coringa' | 'piromante';
  }>({});

  // ===== HANDLERS =====

  /**
   * Processa a seleção de personagem por um jogador
   * 
   * FLUXO:
   * - Jogador 1 seleciona -> avança para etapa 2
   * - Jogador 2 seleciona -> inicia o jogo
   * 
   * @param character - Personagem escolhido (MAGO, BESTA ou ANJO)
   * @param playerNumber - Qual jogador está escolhendo (1 ou 2)
   *
   * MODO IA: quando gameConfig.mode === 'vsAI', esta mesma tela ainda é usada
   * para a etapa 2 (agora rotulada "Escolha o Personagem da IA" via a prop
   * aiOpponent) - o Jogador 2 é sempre a IA nesse modo. A lógica de decisão
   * da IA em si vive em lib/aiPlayer.ts e é acionada de dentro de
   * GameBoard.tsx, não aqui.
   */
  const handleCharacterSelect = (character: 'mago' | 'besta' | 'anjo' | 'mosqueteiro' | 'coringa' | 'piromante', playerNumber: 1 | 2) => {
    if (playerNumber === 1) {
      // Jogador 1 escolheu - salva escolha e avança para próxima etapa
      setSelectedCharacters({ ...selectedCharacters, player1: character });
      setCharacterSelectionStep(2);
    } else {
      // Jogador 2 escolheu - salva e inicia o jogo imediatamente
      setSelectedCharacters({ ...selectedCharacters, player2: character });
      setCurrentScreen('game');
    }
  };

  /**
   * Inicia o processo de novo jogo após configuração
   * 
   * @param config - Configuração da partida (vidas, modo)
   * 
   * FLUXO:
   * 1. Salva configuração
   * 2. Reseta seleção de personagens
   * 3. Vai para tela de seleção de personagens (etapa 1)
   */
  const handleStartGame = (config: GameConfigType) => {
    setGameConfig(config);
    setCharacterSelectionStep(1);
    setSelectedCharacters({}); // Limpa seleções anteriores
    setCurrentScreen('character-selection');
  };

  /**
   * Modo de debug/playtest (pedido do usuário: "crie um modo de debug ou
   * playtest semi-escondido no menu principal que vai ser usado por você pra
   * testar as coisas") - pula direto pra uma partida jogável (Contra a IA,
   * todas as variantes ligadas, Coringa vs Mago) sem passar pelas telas de
   * Configuração/Seleção de Personagem - eliminam os ~8-10 cliques repetidos
   * que cada rodada de teste manual exigia até aqui. `player1`/`player2` são
   * fixos de propósito (não é um formulário) - o objetivo é velocidade pra
   * testar, não flexibilidade; ajuste os valores aqui mesmo se precisar
   * testar outra combinação específica de personagens/variantes.
   */
  const handleDebugQuickStart = () => {
    setGameConfig({
      ...DEFAULT_GAME_CONFIG,
      mode: 'vsAI',
      monsterCards: true,
      fusion: true,
      towersMode: false,
      spotlightMode: false,
      reactionsMode: false,
    });
    setSelectedCharacters({ player1: 'coringa', player2: 'mago' });
    setCurrentScreen('game');
  };

  /**
   * Renderiza a tela atual baseado no estado currentScreen
   * 
   * PADRÃO DE NAVEGAÇÃO:
   * - Cada tela recebe callbacks onBack, onNext, etc.
   * - Callbacks mudam o currentScreen para navegar
   * 
   * EXTENSÃO: Adicionar novo case para cada nova tela
   */
  const renderScreen = () => {
    switch (currentScreen) {
      // TELA DE ABERTURA
      case 'splash':
        return (
          <Splash
            onStart={() => setCurrentScreen('home')}
            onRules={() => setCurrentScreen('rules')}
          />
        );

      // MENU PRINCIPAL
      case 'home':
        return (
          <Home
            onNewGame={() => setCurrentScreen('config')}
            onRules={() => setCurrentScreen('rules')}
            onCharacters={() => setCurrentScreen('characters')}
            onSettings={() => setCurrentScreen('settings')}
            onDebugStart={handleDebugQuickStart}
          />
        );

      // CONFIGURAÇÃO DE PARTIDA
      case 'config':
        return (
          <GameConfig
            onBack={() => setCurrentScreen('home')}
            onStartGame={handleStartGame}
          />
        );

      // SELEÇÃO DE PERSONAGENS (2 ETAPAS)
      case 'character-selection':
        return (
          <CharacterSelection
            onBack={() => {
              // Lógica de voltar depende da etapa atual
              if (characterSelectionStep === 1) {
                // Etapa 1 -> volta para configuração
                setCurrentScreen('config');
              } else {
                // Etapa 2 -> volta para etapa 1 (mantém escolha do jogador 1)
                setCharacterSelectionStep(1);
                setSelectedCharacters({ player1: selectedCharacters.player1 });
              }
            }}
            onSelect={handleCharacterSelect}
            currentPlayer={characterSelectionStep}
            selectedCharacters={selectedCharacters}
            aiPlayers={gameConfig?.mode === 'vsAI' ? [2] : gameConfig?.mode === 'spectator' ? [1, 2] : []}
          />
        );

      // TABULEIRO DE JOGO PRINCIPAL
      case 'game':
        // Validação: só renderiza se tudo foi configurado
        if (!selectedCharacters.player1 || !selectedCharacters.player2 || !gameConfig) {
          setCurrentScreen('home');
          return null;
        }
        return (
          <GameBoard
            onBack={() => setCurrentScreen('home')}
            player1Character={selectedCharacters.player1}
            player2Character={selectedCharacters.player2}
            gameConfig={gameConfig}
          />
        );

      // REGRAS COMPLETAS
      case 'rules':
        return <Rules onBack={() => setCurrentScreen('home')} />;

      // LISTA DE PERSONAGENS
      case 'characters':
        return (
          <CharactersList
            onBack={() => setCurrentScreen('home')}
            onSelectCharacter={(character) => {
              setSelectedCharacter(character);
              setCurrentScreen('character-sheet');
            }}
          />
        );

      // FICHA DETALHADA DE PERSONAGEM
      case 'character-sheet':
        // Validação: precisa ter um personagem selecionado
        if (!selectedCharacter) {
          setCurrentScreen('characters');
          return null;
        }
        return (
          <CharacterSheet
            character={selectedCharacter}
            onBack={() => setCurrentScreen('characters')}
          />
        );

      // CONFIGURAÇÕES
      case 'settings':
        return <Settings onBack={() => setCurrentScreen('home')} />;

      // Fallback: não deveria acontecer
      default:
        return null;
    }
  };

  // ===== RENDERIZAÇÃO =====
  return (
    <SettingsProvider>
      {/* DndProvider (react-dnd): já era uma dependência instalada mas não
          utilizada - o manuseio de cartas (arrastar da mão até o campo) usava
          drag-and-drop nativo do HTML5 antes. Envolve o app inteiro (mais
          simples que só GameBoard, e sem custo real fora da tela de jogo) -
          ver HandCardView.tsx (fonte do arraste), FieldSlotView.tsx (alvo) e
          CardDragLayer.tsx (preview customizado seguindo o cursor).

          FIX (pedido do usuário: "quando eu seguro a carta, a posição dela
          não é a mesma do mouse") - o `HTML5Backend` (usado antes) delega o
          arraste pro drag-and-drop NATIVO do navegador, cujo evento `drag`
          contínuo é disparado pelo próprio motor do browser em intervalos
          limitados (throttled, não a cada movimento real do mouse) - o
          preview (CardDragLayer.tsx) só recebe uma posição nova quando esse
          evento nativo dispara, então em telas mais lentas ou no runtime
          WebView2 do executável (Go+WebView2, ver scripts/build-exe.mjs) a
          carta "atrasa" visivelmente atrás do cursor real, dando a
          impressão de estar presa numa posição errada. `TouchBackend`
          nunca usa o DnD nativo do browser - ele escuta `pointermove`/
          `mousemove` diretamente (a cada movimento real do sistema, sem
          throttling do navegador), então o preview acompanha o cursor
          com a mesma frequência de qualquer outra animação controlada por
          JS. `enableMouseEvents: true` é necessário porque, por padrão,
          `TouchBackend` só reage a toque - sem essa opção o arraste pelo
          mouse (o único método usado neste jogo, sem suporte a touch)
          pararia de funcionar por completo. */}
      <DndProvider backend={TouchBackend} options={{ enableMouseEvents: true, delayTouchStart: 0, delayMouseStart: 0 }}>
        {/* Container principal que preenche toda a tela */}
        <div className="size-full">
          {/* FIX (pedido do usuário: "itens de performance") - cobre o
              carregamento sob demanda do chunk de GameBoard.tsx (ver
              lazy() acima) - só aparece na primeira vez que a tela 'game' é
              alcançada nesta sessão (chunk fica em cache do navegador
              depois disso), pelo tempo de download da rede, tipicamente
              rápido demais pra ser percebido em conexões normais. */}
          <Suspense
            fallback={
              <div className="size-full flex items-center justify-center bg-[#0F1113] text-[#C59E4F] font-display text-[18px]">
                Preparando o campo de batalha...
              </div>
            }
          >
            {renderScreen()}
          </Suspense>
        </div>
      </DndProvider>
      {/* FIX (checagem extensa por bugs - "vários efeitos... mal
          posicionados" sob o zoom atual): o <Toaster> (sistema de
          notificações toast) morava AQUI, fora da árvore com `zoom: 0.85`
          aplicada dentro de GameBoard.tsx (única tela que chama `toast()`
          neste app - ver MagicToast.tsx/GameBoard.tsx). Como o Toaster fica
          de fora do zoom, ele sempre se posiciona em coordenadas de tela
          REAIS (não-zoomadas) - mas o cabeçalho do jogo ao seu redor
          encolheu 15% (zoom), ficando mais perto do topo de verdade da
          janela do que estava quando "top-center" foi ajustado - o cartão de
          notificação (bem alto, com ícone grande) passou a nascer
          PARCIALMENTE ACIMA do topo real da tela, cortado e sobrepondo o
          cabeçalho por baixo. Movido pra dentro do wrapper zoomado em
          GameBoard.tsx (ver lá), onde participa da MESMA escala que o resto
          do jogo - nunca mais desalinha dele, com zoom em qualquer valor.
      */}
    </SettingsProvider>
  );
}
