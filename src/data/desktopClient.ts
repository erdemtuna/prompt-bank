import { invoke } from '@tauri-apps/api/core';
import type { PromptSourceInput } from './loaders';

// These DTO shapes mirror the golden serialization tested in the Rust core crate
// (src-tauri/crates/prompt-bank-core/tests/dto.rs). Keep them in sync.
export type PromptFileDto = { relativePath: string; contents: string };
export type GlobalPromptsDto = { files: PromptFileDto[] };
export type OpenedWorkspaceDto = { workspaceId: string; label: string; files: PromptFileDto[] };
export type WorkspaceSummaryDto = { id: string; label: string; displayPath: string; lastOpened: string | null };
export type CommandErrorDto = { kind: string; message: string };

export type OpenedWorkspace = {
  workspaceId: string;
  label: string;
  source: PromptSourceInput;
};

/** True when running inside the Tauri desktop shell (or a test that mocks it). */
export function isDesktop(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function filesToMap(files: PromptFileDto[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const file of files) {
    map[file.relativePath] = file.contents;
  }
  return map;
}

function toOpenedWorkspace(dto: OpenedWorkspaceDto): OpenedWorkspace {
  return {
    workspaceId: dto.workspaceId,
    label: dto.label,
    source: { source: 'folder', sourceLabel: 'Folder', instanceId: dto.workspaceId, files: filesToMap(dto.files) }
  };
}

export async function readGlobalPrompts(): Promise<PromptSourceInput> {
  const dto = await invoke<GlobalPromptsDto>('read_global_prompts');
  return { source: 'global', sourceLabel: 'Global', files: filesToMap(dto.files) };
}

export async function listWorkspaces(): Promise<WorkspaceSummaryDto[]> {
  return invoke<WorkspaceSummaryDto[]>('list_workspaces');
}

export async function pickWorkspace(): Promise<OpenedWorkspace | null> {
  const dto = await invoke<OpenedWorkspaceDto | null>('pick_workspace');
  return dto ? toOpenedWorkspace(dto) : null;
}

export async function openWorkspace(id: string): Promise<OpenedWorkspace> {
  const dto = await invoke<OpenedWorkspaceDto>('open_workspace', { id });
  return toOpenedWorkspace(dto);
}

export async function removeWorkspace(id: string): Promise<WorkspaceSummaryDto[]> {
  return invoke<WorkspaceSummaryDto[]>('remove_workspace', { id });
}

export async function setWindowTitle(title: string): Promise<void> {
  await invoke('set_window_title', { title });
}

/** Extract a structured command error, or a generic fallback. */
export function toCommandError(error: unknown): CommandErrorDto {
  if (error && typeof error === 'object' && 'kind' in error && 'message' in error) {
    const candidate = error as CommandErrorDto;
    if (typeof candidate.kind === 'string' && typeof candidate.message === 'string') {
      return candidate;
    }
  }
  return { kind: 'unknown', message: 'Something went wrong reading prompts.' };
}
