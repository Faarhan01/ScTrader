import fs from 'fs';
import path from 'path';

const DEFAULT_FILE = path.resolve(process.cwd(), 'data/daemon-events.jsonl');
const MAX_LINES = 10000;

let filePath: string = DEFAULT_FILE;
let initialized = false;

function ensureDir() {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function configureEventBuffer(file?: string) {
  filePath = file ? path.resolve(process.cwd(), file) : DEFAULT_FILE;
  ensureDir();
  initialized = true;
}

export function ensureInitialized() {
  if (!initialized) {
    ensureDir();
    initialized = true;
  }
}

export interface DaemonEvent {
  ts: number;
  type: string;
  payload: any;
}

export function append(event: { type: string; payload: any }) {
  ensureInitialized();
  const entry: DaemonEvent = { ts: Date.now(), type: event.type, payload: event.payload };
  fs.appendFileSync(filePath, JSON.stringify(entry) + '\n');
  rotate();
}

export function read(limit?: number): DaemonEvent[] {
  ensureInitialized();
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n').filter((l) => l.trim().length > 0);
  const parsed = lines
    .map((l) => {
      try {
        return JSON.parse(l) as DaemonEvent;
      } catch {
        return null;
      }
    })
    .filter((e): e is DaemonEvent => e !== null);
  return limit ? parsed.slice(-limit) : parsed;
}

export function rotate() {
  ensureInitialized();
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length <= MAX_LINES) return;
  const trimmed = lines.slice(lines.length - MAX_LINES);
  fs.writeFileSync(filePath, trimmed.join('\n') + '\n');
}

export function clear() {
  ensureInitialized();
  fs.writeFileSync(filePath, '');
}

export function getFilePath() {
  return filePath;
}