// Throwaway demo engine for the homepage prototype: mock library, fuzzy search,
// and WebAudio-synthesized previews so the "demo" actually makes sound.
// PROTOTYPE — do not ship.

export type DemoSound = {
  id: string;
  name: string;
  category: string;
  tags: string[];
  dur: number;
  seed: number;
};

const DUR: Record<string, number> = {
  gravel: 1.2,
  wood: 1.4,
  whoosh: 0.9,
  impact: 1.0,
  ambience: 2.2,
  music: 1.8,
};

const LIB: Array<[string, string, string]> = [
  ["footstep_gravel_01.wav", "gravel", "footsteps steps walk crunch"],
  ["footstep_gravel_02.wav", "gravel", "footsteps steps walk crunch"],
  ["boot_scuff_dry_a.wav", "gravel", "boot scuff grit scrape"],
  ["pebble_roll_medium.wav", "gravel", "pebble roll stone tumble"],
  ["gravel_drag_slow.wav", "gravel", "drag scrape gravel"],
  ["gravel_crunch_close.wav", "gravel", "crunch close walk"],
  ["footstep_wood_creak.wav", "wood", "footsteps wood creak step"],
  ["wooden_stair_up.wav", "wood", "wood stairs steps climb"],
  ["heel_knock_hollow.wav", "wood", "knock heel wood hollow"],
  ["whoosh_impact_heavy.wav", "whoosh", "whoosh impact heavy"],
  ["whoosh_short_fast.wav", "whoosh", "whoosh fast short"],
  ["cloth_swish_soft.wav", "whoosh", "cloth swish soft whoosh"],
  ["arrow_pass_by.wav", "whoosh", "arrow pass fly whoosh"],
  ["cape_flap_wind.wav", "whoosh", "cape flap wind whoosh"],
  ["whip_crack_snap.wav", "whoosh", "whip crack snap"],
  ["impact_metal_hit_04.wav", "impact", "metal hit impact clang"],
  ["door_slam_heavy.wav", "impact", "door slam heavy impact"],
  ["body_fall_thud.wav", "impact", "body fall thud impact"],
  ["crate_drop_wood.wav", "impact", "crate drop wood impact"],
  ["glass_break_shatter.wav", "impact", "glass break shatter"],
  ["rain_ext_medium.wav", "ambience", "rain exterior medium weather"],
  ["rain_window_loop.wav", "ambience", "rain window loop weather"],
  ["crowd_bar_murmur.wav", "ambience", "crowd bar room murmur"],
  ["wind_howling_gust.wav", "ambience", "wind howling gust weather"],
  ["city_traffic_loop.wav", "ambience", "city traffic loop street"],
  ["forest_birds_dawn.wav", "ambience", "forest birds dawn nature"],
  ["fire_crackle_close.wav", "ambience", "fire crackle campfire"],
  ["room_tone_office.wav", "ambience", "room tone office hum"],
  ["bgm_tension_loop_c.wav", "music", "bgm tension loop score"],
  ["drone_dark_bed.wav", "music", "drone dark bed underscore"],
  ["stinger_hit_riser.wav", "music", "stinger hit riser score"],
  ["pulse_drum_loop.wav", "music", "pulse drum loop rhythm"],
  ["cello_sustain_note.wav", "music", "cello sustain note strings"],
  ["clock_tick_loop.wav", "music", "clock tick loop time"],
];

export const LIBRARY: DemoSound[] = LIB.map(([name, category, tags], i) => ({
  id: `s${i}`,
  name,
  category,
  tags: tags.split(" "),
  dur: DUR[category] ?? 1,
  seed: i * 7 + 3,
}));

export const FAKE_TOTAL = 1_284_312;

export function search(q: string): DemoSound[] {
  const tokens = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const scored = LIBRARY.map((s) => {
    const hay = `${s.name} ${s.category} ${s.tags.join(" ")}`.toLowerCase();
    let score = 0;
    let ok = true;
    for (const t of tokens) {
      if (s.name.toLowerCase().startsWith(t)) score += 3;
      else if (s.name.toLowerCase().includes(t)) score += 2;
      else if (s.tags.some((tag) => tag.startsWith(t))) score += 1;
      else if (s.tags.some((tag) => tag.includes(t))) score += 0.5;
      else ok = false;
    }
    return ok ? { s, score } : null;
  }).filter((x): x is { s: DemoSound; score: number } => x !== null);
  scored.sort((a, b) => b.score - a.score || a.s.id.localeCompare(b.s.id));
  return scored.slice(0, 8).map((x) => x.s);
}

let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function noise(c: AudioContext, seconds: number): AudioBuffer {
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * seconds), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function burst(
  c: AudioContext,
  dest: AudioNode,
  t: number,
  dur: number,
  freq: number,
  q: number,
  peak: number,
) {
  const src = c.createBufferSource();
  src.buffer = noise(c, dur + 0.05);
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = freq;
  bp.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(bp).connect(g).connect(dest);
  src.start(t);
  src.stop(t + dur + 0.05);
}

function playGravel(c: AudioContext, t: number, seed: number) {
  const count = 9 + (seed % 5);
  for (let i = 0; i < count; i++) {
    const jitter = Math.abs(Math.sin(seed * 3.7 + i * 1.9));
    burst(
      c,
      c.destination,
      t + i * (1.0 / count) + jitter * 0.03,
      0.07 + jitter * 0.04,
      550 + jitter * 1400,
      1.1,
      0.1 + jitter * 0.18,
    );
  }
}

function playWood(c: AudioContext, t: number, seed: number) {
  for (let i = 0; i < 5; i++) {
    const jitter = Math.abs(Math.sin(seed * 2.3 + i * 2.6));
    burst(
      c,
      c.destination,
      t + i * 0.24 + jitter * 0.02,
      0.05,
      250 + jitter * 500,
      2.5,
      0.16 + jitter * 0.1,
    );
    const osc = c.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(140 + jitter * 60, t + i * 0.24);
    const g = c.createGain();
    g.gain.setValueAtTime(0.12, t + i * 0.24);
    g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.24 + 0.12);
    osc.connect(g).connect(c.destination);
    osc.start(t + i * 0.24);
    osc.stop(t + i * 0.24 + 0.15);
  }
}

function playWhoosh(c: AudioContext, t: number, seed: number) {
  const dur = 0.9;
  const src = c.createBufferSource();
  src.buffer = noise(c, dur + 0.1);
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 1.4;
  const f0 = 300 + (seed % 3) * 120;
  bp.frequency.setValueAtTime(f0, t);
  bp.frequency.exponentialRampToValueAtTime(3200, t + dur * 0.4);
  bp.frequency.exponentialRampToValueAtTime(600, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.28, t + dur * 0.4);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(bp).connect(g).connect(c.destination);
  src.start(t);
  src.stop(t + dur + 0.1);
}

function playImpact(c: AudioContext, t: number, seed: number) {
  const osc = c.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(120 + (seed % 3) * 20, t);
  osc.frequency.exponentialRampToValueAtTime(42, t + 0.5);
  const g = c.createGain();
  g.gain.setValueAtTime(0.55, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
  osc.connect(g).connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.85);
  burst(c, c.destination, t, 0.14, 900, 0.8, 0.3);
}

function playAmbience(c: AudioContext, t: number, seed: number) {
  const dur = 2.2;
  const src = c.createBufferSource();
  src.buffer = noise(c, dur + 0.1);
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = seed % 2 === 0 ? 1600 : 4200;
  const g = c.createGain();
  g.gain.value = 0.09;
  const lfo = c.createOscillator();
  lfo.frequency.value = 0.6;
  const lg = c.createGain();
  lg.gain.value = 0.025;
  lfo.connect(lg).connect(g.gain);
  src.connect(lp).connect(g).connect(c.destination);
  src.start(t);
  src.stop(t + dur);
  lfo.start(t);
  lfo.stop(t + dur);
}

function playMusic(c: AudioContext, t: number) {
  const notes = [196, 233.08, 293.66, 349.23];
  notes.forEach((f, i) => {
    const osc = c.createOscillator();
    osc.type = "sine";
    osc.frequency.value = f;
    const g = c.createGain();
    const st = t + i * 0.4;
    g.gain.setValueAtTime(0.0001, st);
    g.gain.linearRampToValueAtTime(0.14, st + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, st + 1.3);
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1200;
    osc.connect(lp).connect(g).connect(c.destination);
    osc.start(st);
    osc.stop(st + 1.35);
  });
}

export function playPreview(sound: DemoSound): number {
  const c = ac();
  if (!c) return 0;
  const t = c.currentTime + 0.02;
  switch (sound.category) {
    case "gravel":
      playGravel(c, t, sound.seed);
      break;
    case "wood":
      playWood(c, t, sound.seed);
      break;
    case "whoosh":
      playWhoosh(c, t, sound.seed);
      break;
    case "impact":
      playImpact(c, t, sound.seed);
      break;
    case "ambience":
      playAmbience(c, t, sound.seed);
      break;
    default:
      playMusic(c, t);
  }
  return sound.dur;
}
