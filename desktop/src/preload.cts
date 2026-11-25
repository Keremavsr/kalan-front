/**
 * Preload (sandboxed, CommonJS). Exposes `window.kalan` to the renderer:
 * - `apiBase`: URL of the local back end chosen by the main process (null in mock mode or before it is ready);
 * - status helpers used only by the desktop status page (starting / back end stopped / restart).
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

interface DesktopStatus {
  state: 'starting' | 'ready' | 'error';
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
});
