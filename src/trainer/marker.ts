import fs from "node:fs/promises";
import path from "node:path";

/**
 * Read the last-trained marker timestamp.
 * Returns null if marker file does not exist or is unreadable.
 */
export async function readMarker(memoryDir: string): Promise<Date | null> {
  const markerPath = path.join(memoryDir, ".train_marker");
  try {
    const raw = (await fs.readFile(markerPath, "utf8")).trim();
    if (!raw) return null;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

/**
 * Write the last-trained marker timestamp (ISO string).
 */
export async function writeMarker(
  memoryDir: string,
  ts: Date,
): Promise<void> {
  const markerPath = path.join(memoryDir, ".train_marker");
  await fs.mkdir(memoryDir, { recursive: true });
  await fs.writeFile(markerPath, ts.toISOString() + "\n", "utf8");
}
