import { invoke } from '@tauri-apps/api/core';

export const readFile = (path: string) => invoke<string>('read_file', { path });
export const writeFileAtomic = (path: string, contents: string) => invoke<void>('write_file_atomic', { path, contents });
export const createFile = (path: string, contents: string) => invoke<void>('create_file', { path, contents });
/** Size and modification time of a file, or an empty string when it is missing. */
export const fileStamp = (path: string) => invoke<string>('file_stamp', { path });

export const fileName = (path: string) => path.replaceAll('\\', '/').split('/').pop() ?? path;

/** Turns a Tauri command rejection into readable text. */
export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
