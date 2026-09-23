/**
 * characterRegistry.ts - fachada canônica de identidade dos personagens.
 *
 * A lista/tipo ainda são reexportados do gameEngine durante esta etapa para
 * preservar compatibilidade e evitar mexer no arquivo monolítico de regras
 * antes da decomposição do motor. Novos consumidores devem importar daqui.
 */
import { ALL_CHARACTER_IDS, type CharacterId } from './gameEngine';

export { ALL_CHARACTER_IDS, type CharacterId };

/** Metadados mínimos derivados da única lista canônica existente hoje. */
export const CHARACTER_DEFINITIONS = ALL_CHARACTER_IDS.map((id) => ({ id })) as readonly {
  readonly id: CharacterId;
}[];

/** Validação segura para CLI, localStorage e outras entradas string. */
export function isCharacterId(value: string): value is CharacterId {
  return (ALL_CHARACTER_IDS as readonly string[]).includes(value);
}
