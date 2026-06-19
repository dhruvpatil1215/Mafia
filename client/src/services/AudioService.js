/**
 * Audio Service
 * Uses Web Audio API to generate synthesised sound effects and Web Speech API for announcements.
 */

let audioCtx = null;
let enabled = true;
let speechEnabled = true;

function getContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

function ensureResumed() {
  const ctx = getContext();
  if (ctx.state === 'suspended') {
    ctx.resume();
  }
}

function playTone(frequency, duration, type = 'sine', volume = 0.15) {
  if (!enabled) return;
  try {
    ensureResumed();
    const ctx = getContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);

    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch (e) {
    // Fail silently
  }
}

function playSequence(notes, type = 'sine', volume = 0.12) {
  if (!enabled) return;
  let time = 0;
  notes.forEach(([freq, dur]) => {
    setTimeout(() => playTone(freq, dur, type, volume), time * 1000);
    time += dur * 0.7; // slight overlap
  });
}

const AudioService = {
  phaseChange() {
    playSequence([
      [440, 0.2],
      [554, 0.2],
      [659, 0.4]
    ], 'sine', 0.1);
  },

  nightStart() {
    playSequence([
      [523, 0.3],
      [440, 0.3],
      [349, 0.5]
    ], 'triangle', 0.08);
  },

  dayStart() {
    playSequence([
      [349, 0.2],
      [440, 0.2],
      [523, 0.2],
      [659, 0.4]
    ], 'sine', 0.1);
  },

  voteClick() {
    playTone(800, 0.08, 'square', 0.06);
  },

  elimination() {
    playSequence([
      [440, 0.3],
      [415, 0.3],
      [392, 0.3],
      [349, 0.6]
    ], 'sawtooth', 0.06);
  },

  playerJoin() {
    playSequence([
      [523, 0.1],
      [659, 0.15]
    ], 'sine', 0.08);
  },

  victory() {
    playSequence([
      [523, 0.15],
      [659, 0.15],
      [784, 0.15],
      [1047, 0.4]
    ], 'sine', 0.12);
  },

  error() {
    playTone(200, 0.2, 'square', 0.08);
  },

  tick() {
    playTone(1000, 0.05, 'sine', 0.06);
  },

  messageReceive() {
    playTone(600, 0.06, 'sine', 0.04);
  },

  roleReveal() {
    playSequence([
      [300, 0.3],
      [400, 0.3],
      [500, 0.3],
      [600, 0.5]
    ], 'triangle', 0.1);
  },

  saved() {
    playSequence([
      [523, 0.15],
      [659, 0.15],
      [784, 0.35]
    ], 'sine', 0.1);
  },

  speak(text) {
    if (!enabled || !speechEnabled) return;
    try {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        
        const cleanText = text
          .replace(/\*\*/g, '')
          .replace(/🎙️/g, '')
          .replace(/🐺/g, '')
          .replace(/☀️/g, '')
          .replace(/🌙/g, '')
          .replace(/🩺/g, '')
          .replace(/🔍/g, '')
          .replace(/⚖️/g, '')
          .replace(/🗳️/g, '')
          .replace(/🎮/g, '')
          .replace(/💬/g, '');

        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.rate = 0.95;
        utterance.pitch = 0.85; // Low voice for God/Moderator
        utterance.volume = 0.85;

        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
          const enVoice = voices.find(v => v.lang.startsWith('en') && v.name.toLowerCase().includes('google'));
          if (enVoice) {
            utterance.voice = enVoice;
          }
        }

        window.speechSynthesis.speak(utterance);
      }
    } catch (e) {
      // Fail silently
    }
  },

  toggleSpeech() {
    speechEnabled = !speechEnabled;
    return speechEnabled;
  },

  isSpeechEnabled() {
    return speechEnabled;
  },

  toggle() {
    enabled = !enabled;
    return enabled;
  },

  isEnabled() {
    return enabled;
  }
};

export default AudioService;
