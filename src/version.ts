/** Plugin version. The index sends it in every handshake so a popup can detect a stale running index. */
export const VERSION = '0.4.20';

/** Shown when the popup was updated but RemNote still runs the previous index (background) code. */
export const staleIndexMessage = (running: string | undefined) =>
  `RemNote is still running ${running ? `RR Tools ${running}` : 'an older RR Tools version'} in the background, while this window is ${VERSION}. `
  + 'Disable and re-enable RR Tools (or reload RemNote), then open this command again. Nothing was changed.';
