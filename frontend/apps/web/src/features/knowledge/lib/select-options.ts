import { colorForLabel } from './tag-colors';
import { readJson, writeJson } from './storage';

/**
 * Select / multi-select options are free strings in the contract (§9.3 has no per-property option
 * registry), so the picker remembers every option it has seen per workspace + property name.
 */
export interface SelectOption {
  value: string;
  color: string;
}

type Registry = Record<string, SelectOption[]>;
const key = (workspaceId: string) => `nook.knowledge.select-options:${workspaceId}`;

export function getSelectOptions(workspaceId: string, property: string, current: string[] = []): SelectOption[] {
  const reg = readJson<Registry>(key(workspaceId), {});
  const known = reg[property] ?? [];
  const out = [...known];
  for (const v of current) if (!out.some((o) => o.value === v)) out.push({ value: v, color: colorForLabel(v) });
  return out;
}

export function rememberSelectOption(workspaceId: string, property: string, option: SelectOption): void {
  const reg = readJson<Registry>(key(workspaceId), {});
  const list = reg[property] ?? [];
  const i = list.findIndex((o) => o.value === option.value);
  if (i >= 0) list[i] = option;
  else list.push(option);
  reg[property] = list;
  writeJson(key(workspaceId), reg);
}

export function forgetSelectOption(workspaceId: string, property: string, value: string): void {
  const reg = readJson<Registry>(key(workspaceId), {});
  reg[property] = (reg[property] ?? []).filter((o) => o.value !== value);
  writeJson(key(workspaceId), reg);
}
