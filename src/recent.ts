/** Recently opened projects, kept in the webview's local storage. */
export interface Recent {
  path: string;
  name: string;
}

const KEY = 'tack.recent';
const LIMIT = 10;

export function loadRecent(): Recent[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((r) => typeof r?.path === 'string' && typeof r?.name === 'string') : [];
  } catch {
    return [];
  }
}

/** Moves a project to the top of the list. The first entry is reopened on launch. */
export function rememberRecent(entry: Recent): Recent[] {
  const list = [entry, ...loadRecent().filter((r) => r.path !== entry.path)].slice(0, LIMIT);
  localStorage.setItem(KEY, JSON.stringify(list));
  return list;
}
