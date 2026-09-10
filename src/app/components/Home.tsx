import { Button } from './ui/button';
import { RuneParticles } from './RuneParticles';
import { GameTitle } from './GameTitle';
import { Play, BookOpen, Users, Settings, Zap, Trophy } from 'lucide-react';

interface HomeProps {
  onNewGame: () => void;
  /**
   * FIX (pedido do usuário: "atalho de Partida Rápida") - pula a tela de
   * Configuração inteira (usa a última config salva ou o padrão) e vai
   * direto pra escolha de personagem, sem passar pelo Resumo depois - ver
   * handleQuickStart em App.tsx.
   */
  onQuickStart: () => void;
  onRules: () => void;
  onCharacters: () => void;
  onSettings: () => void;
  /** FIX (pedido do usuário, QoL: "histórico/estatísticas entre partidas - tela nova no menu principal") - ver MatchStatsScreen.tsx. */
  onStats: () => void;
  /** Modo de debug/playtest (pedido do usuário) - ver comentário completo em App.tsx (handleDebugQuickStart). */
  onDebugStart?: () => void;
}

export function Home({ onNewGame, onQuickStart, onRules, onCharacters, onSettings, onStats, onDebugStart }: HomeProps) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden parchment">
      <RuneParticles />
      
      <div className="relative z-10 w-full max-w-2xl px-4 space-y-12">
        <div className="text-center space-y-4">
          {/* FIX (pesquisa de desempenho, achado ao vivo em viewport mobile:
              "MAGISPELLLLLLL cortado, só ISPELLLLL aparece") - o título tinha
              só 2 tamanhos fixos (64px abaixo de `md`, 80px a partir dali) e
              `tracking-wider` (letter-spacing extra) sempre ligado - em
              375px de largura, "MAGISPE" + 1 L por personagem (13+ letras)
              nesse tamanho excede a viewport, cortando o "MAG" inicial. Novos
              degraus abaixo de `md` (28px/40px) cabem em telas estreitas; o
              tracking largo só entra a partir de `sm` (640px), onde já sobra
              espaço de verdade pra ele. */}
          <GameTitle className="font-display text-[28px] sm:text-[40px] md:text-[64px] lg:text-[80px] tracking-normal sm:tracking-wider drop-shadow-[0_0_20px_rgba(197,158,79,0.4)]" />
          {/* FIX (item 31 do Grupo H da lista de afazeres, "número da versão
              abaixo do título") - texto puramente informativo, sem link/ação
              nenhuma (diferente do atalho de Partida Rápida logo abaixo) -
              por isso mais discreto ainda, sem hover nem ícone.
              FIX (pedido do usuário: "a partir de agora sempre atualize o
              número de versão na tela inicial" + "v0.8888888.1 e assim por
              diante") - mantém a base "0.8888888" (nunca muda) e só soma um
              contador (.1, .2, .3...) depois dela a cada commit/deploy, mesmo
              pra uma correção pequena - também serve pra confirmar visualmente
              que um deploy realmente chegou (o index.html do GitHub Pages
              cacheia por ~10min). */}
          <p className="text-[11px] text-[#8F6A30]/70">v0.8888888.24</p>
          {/* FIX (pedido do usuário: "atalho de Partida Rápida") - pula
              Configuração (usa a última usada ou o padrão) e Resumo, indo
              direto pra escolha de personagem - ver handleQuickStart em
              App.tsx. Fica junto do título, discreto (texto, não um botão
              cheio como "Novo Jogo" abaixo) - é um atalho pra quem já
              conhece o jogo, não a porta de entrada principal. */}
          <button
            onClick={onQuickStart}
            className="inline-flex items-center gap-1.5 text-[13px] text-[#8F6A30] hover:text-[#C59E4F] transition-colors"
          >
            <Zap className="w-3.5 h-3.5" />
            Partida Rápida
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Button 
            onClick={onNewGame}
            size="lg"
            className="bg-[#C59E4F] hover:bg-[#8F6A30] text-[#0F1113] h-20 text-[18px] rune-glow flex items-center justify-center gap-3 group"
          >
            <Play className="w-5 h-5 group-hover:scale-110 transition-transform" />
            Novo Jogo
          </Button>
          
          <Button 
            onClick={onRules}
            size="lg"
            variant="outline"
            className="border-[#C59E4F] text-[#C59E4F] hover:bg-[#C59E4F]/10 h-20 text-[18px] flex items-center justify-center gap-3 group"
          >
            <BookOpen className="w-5 h-5 group-hover:scale-110 transition-transform" />
            Regras
          </Button>
          
          <Button 
            onClick={onCharacters}
            size="lg"
            variant="outline"
            className="border-[#C59E4F] text-[#C59E4F] hover:bg-[#C59E4F]/10 h-20 text-[18px] flex items-center justify-center gap-3 group"
          >
            <Users className="w-5 h-5 group-hover:scale-110 transition-transform" />
            Personagens
          </Button>
          
          <Button 
            onClick={onSettings}
            size="lg"
            variant="outline"
            className="border-[#C59E4F] text-[#C59E4F] hover:bg-[#C59E4F]/10 h-20 text-[18px] flex items-center justify-center gap-3 group"
          >
            <Settings className="w-5 h-5 group-hover:scale-110 transition-transform" />
            Configurações
          </Button>
        </div>

        {/* FIX (pedido do usuário, QoL: "histórico/estatísticas entre
            partidas - tela nova no menu principal") - linha própria, fora
            da grade 2x2 acima (5 itens quebraria a simetria), largura
            cheia. */}
        <Button
          onClick={onStats}
          size="lg"
          variant="outline"
          className="w-full border-[#C59E4F] text-[#C59E4F] hover:bg-[#C59E4F]/10 h-20 text-[18px] flex items-center justify-center gap-3 group"
        >
          <Trophy className="w-5 h-5 group-hover:scale-110 transition-transform" />
          Estatísticas
        </Button>
      </div>

      {/* Decorative corners */}
      <div className="absolute top-0 left-0 w-32 h-32 border-l-2 border-t-2 border-[#C59E4F]/30" />
      <div className="absolute top-0 right-0 w-32 h-32 border-r-2 border-t-2 border-[#C59E4F]/30" />
      <div className="absolute bottom-0 left-0 w-32 h-32 border-l-2 border-b-2 border-[#C59E4F]/30" />
      <div className="absolute bottom-0 right-0 w-32 h-32 border-r-2 border-b-2 border-[#C59E4F]/30" />

      {/* Modo de debug/playtest (pedido do usuário: "semi-escondido") - texto
          pequeno e discreto no canto, sem ícone/glow, só pra não competir
          visualmente com o menu de verdade. Pula direto pra uma partida
          jogável (Coringa vs Mago, Contra a IA) - ver handleDebugQuickStart
          em App.tsx. */}
      {onDebugStart && (
        <button
          onClick={onDebugStart}
          className="absolute bottom-2 right-3 text-[10px] text-[#8F6A30]/40 hover:text-[#C59E4F]/70 transition-colors z-20"
        >
          debug
        </button>
      )}
    </div>
  );
}
