// Đồng hồ nghỉ giữa set (chỉ lưu cục bộ trên thiết bị).
export interface RestState {
  endsAt: number;
  total: number;
  label?: string;
}

const KEY = "nl_rest";
let state: RestState | null = load();
const listeners = new Set<(s: RestState | null) => void>();

function load(): RestState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as RestState;
    return s.endsAt > Date.now() - 60000 ? s : null;
  } catch {
    return null;
  }
}

function emit() {
  try {
    if (state) localStorage.setItem(KEY, JSON.stringify(state));
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  listeners.forEach((fn) => fn(state));
}

export function getRest(): RestState | null {
  return state;
}

export function subscribeRest(fn: (s: RestState | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function startRest(seconds: number, label?: string) {
  if (seconds <= 0) return;
  state = { endsAt: Date.now() + seconds * 1000, total: seconds, label };
  unlockAudio();
  emit();
}

export function adjustRest(deltaSec: number) {
  if (!state) return;
  state = { ...state, endsAt: Math.max(Date.now(), state.endsAt + deltaSec * 1000), total: Math.max(1, state.total + deltaSec) };
  emit();
}

export function stopRest() {
  state = null;
  emit();
}

// ---------- Âm báo ----------
let ctx: AudioContext | undefined;
export function unlockAudio() {
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
  } catch {
    /* ignore */
  }
}

export function beep() {
  try {
    unlockAudio();
    if (!ctx) return;
    const t0 = ctx.currentTime;
    [0, 0.25, 0.5].forEach((dt, i) => {
      const o = ctx!.createOscillator();
      const g = ctx!.createGain();
      o.type = "sine";
      o.frequency.value = i === 2 ? 1320 : 880;
      g.gain.setValueAtTime(0.0001, t0 + dt);
      g.gain.exponentialRampToValueAtTime(0.35, t0 + dt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.18);
      o.connect(g).connect(ctx!.destination);
      o.start(t0 + dt);
      o.stop(t0 + dt + 0.2);
    });
  } catch {
    /* ignore */
  }
}
