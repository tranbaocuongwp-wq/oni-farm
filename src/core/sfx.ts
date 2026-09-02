/* ============================================================================
   SFX — âm thanh TỔNG HỢP bằng WebAudio, không có file âm thanh nào.

   Cùng lý do với pixel art sinh bằng code: không asset ngoài → thật sự offline,
   không lo bản quyền, bundle không phình. Đổi lại âm thanh đơn giản kiểu 8-bit,
   vốn cũng hợp với mỹ thuật pixel.

   AudioContext chỉ được tạo sau cử chỉ đầu tiên của người dùng (luật autoplay
   của trình duyệt), nên mọi hàm ở đây đều an toàn khi gọi trước lúc đó.
============================================================================ */

type Voice = "till" | "water" | "plant" | "harvest" | "coin" | "build" | "sleep" | "deny";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;

export function initAudio() {
  if (ctx) return;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.25;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
}

export function setMuted(m: boolean) {
  enabled = !m;
  if (master) master.gain.value = m ? 0 : 0.25;
}

export function isMuted() {
  return !enabled;
}

function tone(
  freq: number,
  dur: number,
  type: OscillatorType,
  gain: number,
  slideTo?: number,
) {
  if (!ctx || !master || !enabled) return;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
  // bao hình: lên nhanh, tắt mượt — tránh tiếng "click" ở hai đầu
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur: number, gain: number, from: number, to: number) {
  if (!ctx || !master || !enabled) return;
  const t0 = ctx.currentTime;
  const n = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filt = ctx.createBiquadFilter();
  filt.type = "bandpass";
  filt.frequency.setValueAtTime(from, t0);
  filt.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  filt.Q.value = 1.2;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filt).connect(g).connect(master);
  src.start(t0);
}

export function play(v: Voice) {
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();
  switch (v) {
    case "till":
      noise(0.16, 0.5, 900, 180);
      tone(90, 0.12, "square", 0.12, 55);
      break;
    case "water":
      noise(0.34, 0.28, 300, 2400);
      break;
    case "plant":
      tone(520, 0.09, "triangle", 0.18, 720);
      break;
    case "harvest":
      tone(660, 0.09, "square", 0.14);
      setTimeout(() => tone(880, 0.12, "square", 0.13), 70);
      break;
    case "coin":
      tone(1050, 0.07, "square", 0.12);
      setTimeout(() => tone(1400, 0.12, "square", 0.1), 60);
      break;
    case "build":
      tone(220, 0.07, "square", 0.14);
      setTimeout(() => tone(330, 0.07, "square", 0.13), 60);
      setTimeout(() => tone(440, 0.14, "square", 0.12), 120);
      break;
    case "sleep":
      tone(330, 0.5, "sine", 0.16, 110);
      break;
    case "deny":
      tone(160, 0.14, "sawtooth", 0.09, 110);
      break;
  }
}
