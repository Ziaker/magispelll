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
import { DEFAULT_GAME_CONFIG, type GameConfig as GameConfigType } from './lib/gameConfig';
import { loadLastGameConfig } from './lib/gamePreferences';
import type { CharacterId } from './lib/gameEngine';
import { CharacterSelection } from './components/CharacterSelection';
import { GameSummary } from './components/GameSummary';
import { Rules } from './components/Rules';
import { CharactersList } from './components/CharactersList';
import { CharacterSheet } from './components/CharacterSheet';
import { Settings } from './components/Settings';
import { DebugPanel } from './components/DebugPanel';
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
  | 'character-selection' // Seleção dos 2 personagens (mesma tela, ver CharacterSelection.tsx)
  | 'summary'             // Resumo da partida antes de "Iniciar" (ver GameSummary.tsx)
  | 'game'                // Tabuleiro de jogo principal
  | 'rules'               // Regras completas do jogo
  | 'characters'          // Lista de personagens disponíveis
  | 'character-sheet'     // Ficha detalhada de um personagem
  | 'settings'            // Configurações do jogo
  | 'debug';              // Modo debug/playtest (semi-escondido, ver DebugPanel.tsx)

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
  const [selectedCharacter, setSelectedCharacter] = useState<CharacterId | null>(null);
  /**
   * FIX (pedido do usuário: "link direto Regras -> Ficha do personagem") -
   * de onde a Ficha foi aberta - `character-sheet`'s onBack precisa saber
   * pra voltar pro lugar CERTO (Regras.tsx, se foi de lá; Lista de
   * Personagens, se foi do fluxo normal) em vez de sempre assumir a Lista,
   * que perderia o contexto (posição de rolagem, busca) de quem estava lendo
   * as Regras e só queria espiar a ficha de um personagem específico.
   */
  const [characterSheetOrigin, setCharacterSheetOrigin] = useState<'characters' | 'rules'>('characters');
  /**
   * FIX (item 30b do Grupo H da lista de afazeres, "link direto do diálogo
   * 'Visão completa' pra seção correspondente em Rules.tsx") - mesmo padrão
   * de `characterSheetOrigin` acima: pra onde "Voltar" leva depois de sair
   * de Regras (normalmente 'home', mas 'character-selection' quando veio de
   * lá) e o texto pra pré-preencher a busca de Regras (o próprio filtro de
   * texto já existente na tela, reaproveitado em vez de inventar um
   * mecanismo de "rolar até a seção X" à parte).
   */
  const [rulesOrigin, setRulesOrigin] = useState<Screen>('home');
  const [rulesInitialSearch, setRulesInitialSearch] = useState('');
  
  /**
   * Armazena os personagens escolhidos por cada jogador
   * Usado para iniciar a partida quando ambos tiverem escolhido
   * EXTENSÃO: Para suportar mais jogadores, expandir esta estrutura
   */
  const [selectedCharacters, setSelectedCharacters] = useState<{
    player1?: CharacterId;
    player2?: CharacterId;
  }>({});

  /**
   * FIX (pedido do usuário: "atalho de Partida Rápida") - `true` só durante
   * o atalho de Partida Rápida (ver handleQuickStart): faz o "Continuar" de
   * CharacterSelection pular direto pra 'game', sem passar pela tela de
   * Resumo - o ponto inteiro do atalho é ter o MÍNIMO de telas entre "Novo
   * Jogo" e jogar de fato. O fluxo normal (via GameConfig) sempre passa
   * pelo Resumo.
   */
  const [quickStart, setQuickStart] = useState(false);

  // ===== HANDLERS =====

  /**
   * Processa a seleção de personagem por um jogador - CharacterSelection.tsx
   * agora escolhe os 2 jogadores na MESMA tela (ver comentário completo lá),
   * então isto só grava a escolha; navegar pra frente é responsabilidade de
   * `handleCharacterSelectionContinue` (botão "Continuar" da própria tela,
   * só habilitado quando os 2 slots já têm personagem).
   *
   * MODO IA: quando gameConfig.mode === 'vsAI', o slot 2 é sempre a IA
   * (rotulado "IA" na própria tela via a prop `aiPlayers`) - a lógica de
   * decisão da IA em si vive em lib/aiPlayer.ts e é acionada de dentro de
   * GameBoard.tsx, não aqui.
   */
  const handleCharacterSelect = (character: CharacterId, playerNumber: 1 | 2) => {
    setSelectedCharacters((prev) => ({ ...prev, [playerNumber === 1 ? 'player1' : 'player2']: character }));
  };

  /**
   * "Continuar" de CharacterSelection.tsx (só chamável quando os 2 slots já
   * têm personagem) - vai pro Resumo no fluxo normal, ou direto pro jogo no
   * atalho de Partida Rápida (ver `quickStart` acima).
   */
  const handleCharacterSelectionContinue = () => {
    setCurrentScreen(quickStart ? 'game' : 'summary');
  };

  /**
   * Inicia o processo de novo jogo após configuração
   *
   * @param config - Configuração da partida (vidas, modo)
   *
   * FLUXO:
   * 1. Salva configuração
   * 2. Reseta seleção de personagens
   * 3. Vai para tela de seleção de personagens
   */
  const handleStartGame = (config: GameConfigType) => {
    setGameConfig(config);
    setQuickStart(false);
    setSelectedCharacters({}); // Limpa seleções anteriores
    setCurrentScreen('character-selection');
  };

  /**
   * FIX (pedido do usuário: "atalho de Partida Rápida... pula direto pra
   * escolha de personagem") - pula a tela de Configuração inteira, usando a
   * última config salva (ver gamePreferences.ts) ou o padrão de sempre se
   * não houver nenhuma - vai direto pra CharacterSelection, e de lá direto
   * pro jogo (`quickStart: true`, ver handleCharacterSelectionContinue),
   * sem passar pelo Resumo. O jogador ainda escolhe os 2 personagens - só
   * as telas de CONFIGURAÇÃO (variantes, modo, baralho) e RESUMO são
   * puladas, não a escolha de quem vai jogar.
   */
  const handleQuickStart = () => {
    setGameConfig(loadLastGameConfig() ?? DEFAULT_GAME_CONFIG);
    setQuickStart(true);
    setSelectedCharacters({});
    setCurrentScreen('character-selection');
  };

  /**
   * Modo de debug/playtest (pedido do usuário original: "crie um modo de
   * debug ou playtest semi-escondido no menu principal que vai ser usado por
   * você pra testar as coisas"; depois: "quero que faça um debug mode melhor
   * pra você testar as coisas mais rápido, leve tudo em consideração") -
   * pula direto pras telas de Configuração/Seleção de Personagem, indo pro
   * DebugPanel.tsx (personagens + modo + variantes escolhidos ali, não mais
   * fixos em Coringa vs Mago). `handleDebugStart` recebe a escolha já pronta
   * do painel e vai direto pra 'game', igual o fluxo normal fazia depois de
   * character-selection.
   */
  const handleDebugStart = (
    player1: CharacterId,
    player2: CharacterId,
    config: GameConfigType
  ) => {
    setGameConfig(config);
    setSelectedCharacters({ player1, player2 });
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
            onRules={() => {
              setRulesOrigin('home');
              setRulesInitialSearch('');
              setCurrentScreen('rules');
            }}
          />
        );

      // MENU PRINCIPAL
      case 'home':
        return (
          <Home
            onNewGame={() => setCurrentScreen('config')}
            onQuickStart={handleQuickStart}
            onRules={() => {
              setRulesOrigin('home');
              setRulesInitialSearch('');
              setCurrentScreen('rules');
            }}
            onCharacters={() => setCurrentScreen('characters')}
            onSettings={() => setCurrentScreen('settings')}
            onDebugStart={() => setCurrentScreen('debug')}
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

      // SELEÇÃO DOS 2 PERSONAGENS (mesma tela, ver CharacterSelection.tsx)
      case 'character-selection':
        return (
          <CharacterSelection
            onBack={() => setCurrentScreen(quickStart ? 'home' : 'config')}
            onSelect={handleCharacterSelect}
            onContinue={handleCharacterSelectionContinue}
            selectedCharacters={selectedCharacters}
            aiPlayers={gameConfig?.mode === 'vsAI' ? [2] : gameConfig?.mode === 'spectator' ? [1, 2] : []}
            showSteps={!quickStart}
            onOpenRules={(searchTerm) => {
              setRulesOrigin('character-selection');
              setRulesInitialSearch(searchTerm);
              setCurrentScreen('rules');
            }}
          />
        );

      // RESUMO DA PARTIDA (pedido do usuário: "tela de resumo final antes
      // de começar") - pulado no atalho de Partida Rápida (ver quickStart).
      case 'summary':
        if (!selectedCharacters.player1 || !selectedCharacters.player2 || !gameConfig) {
          setCurrentScreen('home');
          return null;
        }
        return (
          <GameSummary
            config={gameConfig}
            selectedCharacters={{ player1: selectedCharacters.player1, player2: selectedCharacters.player2 }}
            aiPlayers={gameConfig.mode === 'vsAI' ? [2] : gameConfig.mode === 'spectator' ? [1, 2] : []}
            onEditConfig={() => setCurrentScreen('config')}
            onEditCharacters={() => setCurrentScreen('character-selection')}
            onBack={() => setCurrentScreen('character-selection')}
            onStart={() => setCurrentScreen('game')}
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
        return (
          <Rules
            onBack={() => setCurrentScreen(rulesOrigin)}
            initialSearch={rulesInitialSearch}
            onViewCharacter={(character) => {
              setSelectedCharacter(character);
              setCharacterSheetOrigin('rules');
              setCurrentScreen('character-sheet');
            }}
          />
        );

      // LISTA DE PERSONAGENS
      case 'characters':
        return (
          <CharactersList
            onBack={() => setCurrentScreen('home')}
            onSelectCharacter={(character) => {
              setSelectedCharacter(character);
              setCharacterSheetOrigin('characters');
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
            onBack={() => setCurrentScreen(characterSheetOrigin)}
          />
        );

      // CONFIGURAÇÕES
      case 'settings':
        return <Settings onBack={() => setCurrentScreen('home')} />;

      // MODO DEBUG/PLAYTEST (semi-escondido, ver DebugPanel.tsx)
      case 'debug':
        return <DebugPanel onBack={() => setCurrentScreen('home')} onStart={handleDebugStart} />;

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
