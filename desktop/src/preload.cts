/**
 * Preload (sandboxed, CommonJS). Exposes `window.kalan` to the renderer:
 * - `apiBase`: URL of the local back end chosen by the main process (null in mock mode or before it is ready);
 * - status helpers used only by the desktop status page (starting / back end stopped / screen crashed / restart);
 * - `openLogs`: opens the folder of the error log (Settings).
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

interface DesktopStatus {
  state: 'starting' | 'ready' | 'error' | 'recovering' | 'crashed';
  message: string | null;
  stderr: string[];
}

const apiBase = ipcRenderer.sendSync('kalan:api-base') as string | null;

contextBridge.exposeInMainWorld('kalan', {
  desktop: true,
  apiBase,
  getStatus: (): Promise<DesktopStatus> => ipcRenderer.invoke('kalan:status') as Promise<DesktopStatus>,
  onStatus: (callback: (status: DesktopStatus) => void): void => {
    ipcRenderer.on('kalan:status', (_event: IpcRendererEvent, status: DesktopStatus) => callback(status));
  },
  restartBackend: (): Promise<void> => ipcRenderer.invoke('kalan:restart') as Promise<void>,
  /** After a second renderer crash: start the whole app again. */
  relaunch: (): Promise<void> => ipcRenderer.invoke('kalan:relaunch') as Promise<void>,
  /** Opens the error log folder in the system file manager (Settings). */
  openLogs: (): Promise<void> => ipcRenderer.invoke('kalan:open-logs') as Promise<void>,
});
