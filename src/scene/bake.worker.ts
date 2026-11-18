/** Runs the cloth bake off the main thread, one garment kind per message. */
import { bakeKind, type BakeJob } from './bake';

const scope = self as unknown as { onmessage: ((e: MessageEvent<BakeJob>) => void) | null; postMessage(message: unknown, transfer: Transferable[]): void };

scope.onmessage = (e) => {
  const result = bakeKind(e.data);
  scope.postMessage(result, [result.normal.buffer, result.height.buffer, ...result.albedo.map((a) => a.data.buffer)]);
};
