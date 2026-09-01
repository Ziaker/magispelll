/**
 * soundManager.ts - Ponto único para tocar efeitos sonoros e música de fundo.
 *
 * FIX (pedido do usuário: "som" - áudio real): os arquivos agora existem, em
 * src/assets/sfx/ (9 sons CC0 da Kenney - ver LICENSE.txt na mesma pasta).
 * Importados via `import` (não caminho de string solto) para que o Vite
 * resolva o hash/URL final do build automaticamente - o mesmo padrão que
 * qualquer outro asset estático do projeto.
 */
import { Howl } from 'howler';
import type { Settings } from './settings';
import cardPlaySrc from '../../assets/sfx/card-play.ogg';
import cardFlipSrc from '../../assets/sfx/card-flip.ogg';
import combatWinSrc from '../../assets/sfx/combat-win.ogg';
import combatTieSrc from '../../assets/sfx/combat-tie.ogg';
import magicActivateSrc from '../../assets/sfx/magic-activate.ogg';
import phaseChangeSrc from '../../assets/sfx/phase-change.ogg';
import cardShatterSrc from '../../assets/sfx/card-shatter.ogg';
import aceTransformSrc from '../../assets/sfx/ace-transform.ogg';
import victorySrc from '../../assets/sfx/victory.ogg';
// FIX (pedido do usuário: "eu gostaria que o áudio fosse diferente para cada
// magia e para cada magia de personagem") - um som próprio para cada uma das
// 9 combinações personagem+magia (J/Q/K), temáticos por personagem (ver
// LICENSE.txt para a origem CC0 de cada arquivo): Mago = relíquias/magia,
// Besta = monstro/animal, Anjo = sinos/celestial (o mais próximo de "ópera"
// disponível em bibliotecas CC0 de jogos). A Destruição de Reforço do Mago
// (K) continua usando 'card-shatter' (já era um som dedicado e combina
// melhor com "destruir/quebrar" do que qualquer som de magia genérico).
import magoJSrc from '../../assets/sfx/mago-j.ogg';
import magoQSrc from '../../assets/sfx/mago-q.ogg';
import bestaJSrc from '../../assets/sfx/besta-j.ogg';
import bestaQSrc from '../../assets/sfx/besta-q.ogg';
import bestaKSrc from '../../assets/sfx/besta-k.ogg';
import anjoJSrc from '../../assets/sfx/anjo-j.ogg';
import anjoQSrc from '../../assets/sfx/anjo-q.ogg';
import anjoKSrc from '../../assets/sfx/anjo-k.ogg';
import reactionAlertSrc from '../../assets/sfx/reaction-alert.ogg';
// FIX (pedido do usuário: "checkout em todos sons do jogo... caso há sons
// faltando, adicione para tais personagens") - auditoria encontrou os
// Monstros (Ilusão Arcana/Fúria Selvagem/Proteção Divina) e as Magias
// Numerais (Visão Arcana/Fúria Sanguinária/Benção Eterna) tocando todos o
// mesmo som genérico 'magic-activate', sem distinção por personagem -
// diferente das 9 magias J/Q/K, que já tinham áudio próprio (ver acima). 6
// sons novos completam a mesma cobertura para os 2 outros tipos de
// habilidade por personagem - ver LICENSE.txt para a origem CC0 de cada um.
import magoMonsterSrc from '../../assets/sfx/mago-monster.ogg';
import magoNumeralSrc from '../../assets/sfx/mago-numeral.ogg';
import bestaMonsterSrc from '../../assets/sfx/besta-monster.ogg';
import bestaNumeralSrc from '../../assets/sfx/besta-numeral.ogg';
import anjoMonsterSrc from '../../assets/sfx/anjo-monster.ogg';
import anjoNumeralSrc from '../../assets/sfx/anjo-numeral.ogg';
// Mosqueteiro (personagem novo, pedido do usuário: "sons de gatilho, de
// disparo e de manuseio") - as 5 combinações próprias (Valete/Rainha/Rei +
// Monstro + Magia Numeral), mesma cobertura completa dos outros 3
// personagens - ver LICENSE.txt para a origem CC0 de cada arquivo.
import mosqueteiroJSrc from '../../assets/sfx/mosqueteiro-j.ogg';
import mosqueteiroQSrc from '../../assets/sfx/mosqueteiro-q.ogg';
import mosqueteiroKSrc from '../../assets/sfx/mosqueteiro-k.ogg';
import mosqueteiroMonsterSrc from '../../assets/sfx/monster-mosqueteiro.ogg';
import mosqueteiroNumeralSrc from '../../assets/sfx/numeral-mosqueteiro.ogg';
// Coringa (personagem novo) - Valete/Rainha/Rei vieram de 3 arquivos que o
// PRÓPRIO usuário enviou (jester-laughing.mp3->J, 2-tlktbmuk-2.mp3->Q,
// sonic-exe-laugh.mp3->K - mapeamento confirmado pelo usuário), só
// convertidos/aparados pro padrão .ogg do projeto. Monstro e Magia Numeral
// pesquisados e baixados (CC0, Kenney - ver LICENSE.txt) por não terem sido
// enviados: "Troca de Máscaras" usa um som de embaralhar cartas (mesmo
// pacote Casino Audio já usado alhures no projeto) e "Grande Final" usa um
// jingle curto de vitória (pacote Music Jingles), ambos combinando com o
// tema de espetáculo/circo pedido pelo usuário.
import coringaJSrc from '../../assets/sfx/coringa-j.ogg';
import coringaQSrc from '../../assets/sfx/coringa-q.ogg';
import coringaKSrc from '../../assets/sfx/coringa-k.ogg';
import coringaMonsterSrc from '../../assets/sfx/coringa-monster.ogg';
import coringaNumeralSrc from '../../assets/sfx/coringa-numeral.ogg';

export type SoundEffectName =
  | 'card-play'
  | 'card-flip'
  | 'combat-win'
  | 'combat-tie'
  | 'magic-activate'
  | 'phase-change'
  /** FIX (item 5): Rei do Mago (Destruição de Reforço) destruindo uma carta - ver CardShatterBurst.tsx. */
  | 'card-shatter'
  /** FIX (item 7): assentar da roleta de números na transformação do Ás - ver AceTransformBurst.tsx. */
  | 'ace-transform'
  /** FIX (item 8): fim de partida (Diálogo de Vitória) - distinto de 'combat-win' (fecha só UMA disputa). */
  | 'victory'
  /** FIX (pedido do usuário: som distinto por magia/personagem) - Valete/Rainha do Mago (o Rei usa 'card-shatter'). */
  | 'magic-mago-j'
  | 'magic-mago-q'
  /** Valete/Rainha/Rei da Besta. */
  | 'magic-besta-j'
  | 'magic-besta-q'
  | 'magic-besta-k'
  /** Valete/Rainha/Rei do Anjo. */
  | 'magic-anjo-j'
  | 'magic-anjo-q'
  | 'magic-anjo-k'
  /** Modo Reações (pedido do usuário): alerta tocado quando o contador de 3s de reação aparece - ver reactions.ts/GameBoard.tsx. */
  | 'reaction-alert'
  /** Efeito do Monstro (🃏) de cada personagem - Ilusão Arcana/Fúria Selvagem/Proteção Divina. */
  | 'monster-mago'
  | 'monster-besta'
  | 'monster-anjo'
  /** Magia Numeral de cada personagem - Visão Arcana/Fúria Sanguinária/Benção Eterna/Munição Infinita. */
  | 'numeral-mago'
  | 'numeral-besta'
  | 'numeral-anjo'
  | 'numeral-mosqueteiro'
  /** Mosqueteiro (personagem novo) - Valete/Rainha/Rei. */
  | 'magic-mosqueteiro-j'
  | 'magic-mosqueteiro-q'
  | 'magic-mosqueteiro-k'
  | 'monster-mosqueteiro'
  /** Coringa (personagem novo) - Valete/Rainha/Rei + Monstro + Magia Numeral. */
  | 'magic-coringa-j'
  | 'magic-coringa-q'
  | 'magic-coringa-k'
  | 'monster-coringa'
  | 'numeral-coringa';

const SOUND_SOURCES: Record<SoundEffectName, string> = {
  'card-play': cardPlaySrc,
  'card-flip': cardFlipSrc,
  'combat-win': combatWinSrc,
  'combat-tie': combatTieSrc,
  'magic-activate': magicActivateSrc,
  'phase-change': phaseChangeSrc,
  'card-shatter': cardShatterSrc,
  'ace-transform': aceTransformSrc,
  'victory': victorySrc,
  'magic-mago-j': magoJSrc,
  'magic-mago-q': magoQSrc,
  'magic-besta-j': bestaJSrc,
  'magic-besta-q': bestaQSrc,
  'magic-besta-k': bestaKSrc,
  'magic-anjo-j': anjoJSrc,
  'magic-anjo-q': anjoQSrc,
  'magic-anjo-k': anjoKSrc,
  'reaction-alert': reactionAlertSrc,
  'monster-mago': magoMonsterSrc,
  'monster-besta': bestaMonsterSrc,
  'monster-anjo': anjoMonsterSrc,
  'numeral-mago': magoNumeralSrc,
  'numeral-besta': bestaNumeralSrc,
  'numeral-anjo': anjoNumeralSrc,
  'numeral-mosqueteiro': mosqueteiroNumeralSrc,
  'magic-mosqueteiro-j': mosqueteiroJSrc,
  'magic-mosqueteiro-q': mosqueteiroQSrc,
  'magic-mosqueteiro-k': mosqueteiroKSrc,
  'monster-mosqueteiro': mosqueteiroMonsterSrc,
  'magic-coringa-j': coringaJSrc,
  'magic-coringa-q': coringaQSrc,
  'magic-coringa-k': coringaKSrc,
  'monster-coringa': coringaMonsterSrc,
  'numeral-coringa': coringaNumeralSrc,
};

/**
 * FIX (pedido do usuário: som distinto por magia/personagem) - centraliza
 * qual som cada uma das 9 combinações personagem+tipo deve tocar, para
 * GameBoard.tsx (clique humano) e triggerAiActionEffects (ação da IA) usarem
 * a MESMA fonte de verdade, em vez de duplicar esse mapeamento nos dois
 * lugares. O Rei do Mago não está aqui de propósito - ele continua com sua
 * própria lógica (som 'card-shatter', ver applyMagicEffectPresentation em
 * GameBoard.tsx), não passa por este mapeamento genérico.
 */
export function magicSoundFor(character: 'mago' | 'besta' | 'anjo' | 'mosqueteiro' | 'coringa', magicType: 'J' | 'Q' | 'K'): SoundEffectName {
  if (character === 'mago' && magicType === 'J') return 'magic-mago-j';
  if (character === 'mago' && magicType === 'Q') return 'magic-mago-q';
  if (character === 'besta' && magicType === 'J') return 'magic-besta-j';
  if (character === 'besta' && magicType === 'Q') return 'magic-besta-q';
  if (character === 'besta' && magicType === 'K') return 'magic-besta-k';
  if (character === 'anjo' && magicType === 'J') return 'magic-anjo-j';
  if (character === 'anjo' && magicType === 'Q') return 'magic-anjo-q';
  if (character === 'anjo' && magicType === 'K') return 'magic-anjo-k';
  if (character === 'mosqueteiro' && magicType === 'J') return 'magic-mosqueteiro-j';
  if (character === 'mosqueteiro' && magicType === 'Q') return 'magic-mosqueteiro-q';
  if (character === 'mosqueteiro' && magicType === 'K') return 'magic-mosqueteiro-k';
  if (character === 'coringa' && magicType === 'J') return 'magic-coringa-j';
  if (character === 'coringa' && magicType === 'Q') return 'magic-coringa-q';
  if (character === 'coringa' && magicType === 'K') return 'magic-coringa-k';
  return 'magic-activate'; // Mago K (Destruição de Reforço) - ver comentário acima.
}

/** Mesma ideia de magicSoundFor, para o efeito do Monstro (🃏) de cada personagem. */
export function monsterSoundFor(character: 'mago' | 'besta' | 'anjo' | 'mosqueteiro' | 'coringa'): SoundEffectName {
  if (character === 'mago') return 'monster-mago';
  if (character === 'besta') return 'monster-besta';
  if (character === 'mosqueteiro') return 'monster-mosqueteiro';
  if (character === 'coringa') return 'monster-coringa';
  return 'monster-anjo';
}

/** Mesma ideia de magicSoundFor, para a Magia Numeral de cada personagem. */
export function numeralSoundFor(character: 'mago' | 'besta' | 'anjo' | 'mosqueteiro' | 'coringa'): SoundEffectName {
  if (character === 'mago') return 'numeral-mago';
  if (character === 'besta') return 'numeral-besta';
  if (character === 'mosqueteiro') return 'numeral-mosqueteiro';
  if (character === 'coringa') return 'numeral-coringa';
  return 'numeral-anjo';
}

class SoundManager {
  private settings: Settings | null = null;
  // FIX (pedido do usuário: adicionar Howler.js) - antes cada play() criava um
  // `new Audio(src)` do zero, que o navegador precisa buscar+decodificar de
  // novo a cada chamada. Howler decodifica uma vez por som (Web Audio API por
  // baixo, com fallback automático pra <audio> quando indisponível) e reusa
  // esse buffer pra qualquer disparo seguinte - inclusive sobrepostos (o
  // mesmo som tocando 2x rápido, ex.: duas cartas viradas quase juntas),
  // que `.play()` do Howler já suporta nativamente por instância.
  private readonly howls = new Map<SoundEffectName, Howl>();

  configure(settings: Settings) {
    this.settings = settings;
  }

  private getHowl(name: SoundEffectName): Howl | null {
    const cached = this.howls.get(name);
    if (cached) return cached;
    const src = SOUND_SOURCES[name];
    if (!src) return null;
    const howl = new Howl({ src: [src] });
    this.howls.set(name, howl);
    return howl;
  }

  play(name: SoundEffectName) {
    if (!this.settings?.soundEffects) return;
    const howl = this.getHowl(name);
    if (!howl) return;
    try {
      const id = howl.play();
      howl.volume(Math.max(0, Math.min(100, this.settings.volume)) / 100, id);
    } catch {
      // Reprodução de áudio pode falhar por política do navegador (precisa de
      // interação do usuário) - falha silenciosamente, nunca quebra o jogo.
    }
  }
}

export const soundManager = new SoundManager();
