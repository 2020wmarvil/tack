import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

// macOS keeps its own traffic lights over the content (tauri.macos.conf.json).
const isMac = navigator.userAgent.includes('Mac');

/**
 * The window has no system frame, so the app draws the window controls and
 * leaves a strip along the top for dragging. Elements marked with
 * data-tauri-drag-region also move the window, and double-clicking them
 * maximizes it.
 */
export function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (isMac) return;
    const win = getCurrentWindow();
    const update = () => void win.isMaximized().then(setMaximized);
    update();
    const unlisten = win.onResized(update);
    return () => void unlisten.then((stop) => stop());
  }, []);

  const win = getCurrentWindow();
  return (
    <>
      <div className="drag-strip" data-tauri-drag-region />
      {!isMac && (
        <div className="window-controls">
          <button aria-label="Minimize" tabIndex={-1} onClick={() => win.minimize()}>
            <svg viewBox="0 0 10 10" aria-hidden="true">
              <path d="M0 5h10" />
            </svg>
          </button>
          <button aria-label={maximized ? 'Restore' : 'Maximize'} tabIndex={-1} onClick={() => win.toggleMaximize()}>
            <svg viewBox="0 0 10 10" aria-hidden="true">
              {maximized ? <path d="M2.5 2.5V.5h7v7h-2M.5 2.5h7v7h-7z" /> : <path d="M.5.5h9v9h-9z" />}
            </svg>
          </button>
          <button className="close" aria-label="Close" tabIndex={-1} onClick={() => win.close()}>
            <svg viewBox="0 0 10 10" aria-hidden="true">
              <path d="m.5.5 9 9m0-9-9 9" />
            </svg>
          </button>
        </div>
      )}
    </>
  );
}
