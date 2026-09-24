export type SoundCue =
  | 'dice'
  | 'card'
  | 'market'
  | 'payday'
  | 'purchase'
  | 'sale'
  | 'loan'
  | 'repay'
  | 'charity'
  | 'baby'
  | 'expense'
  | 'downsized'
  | 'risk'
  | 'milestone'
  | 'victory'
  | 'bankrupt'

type AudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext
}

type Note = [frequency: number, offset: number, duration: number, type: OscillatorType, volume: number]

const notePatterns: Partial<Record<SoundCue, Note[]>> = {
  card: [[440, 0, 0.08, 'sine', 0.07], [660, 0.07, 0.11, 'triangle', 0.08]],
  market: [[392, 0, 0.1, 'triangle', 0.07], [523, 0.08, 0.1, 'triangle', 0.08], [659, 0.16, 0.13, 'sine', 0.07]],
  payday: [[784, 0, 0.1, 'triangle', 0.08], [988, 0.08, 0.12, 'triangle', 0.09], [1319, 0.17, 0.2, 'sine', 0.08]],
  purchase: [[659, 0, 0.08, 'triangle', 0.08], [523, 0.07, 0.1, 'triangle', 0.08], [784, 0.15, 0.15, 'sine', 0.07]],
  sale: [[523, 0, 0.08, 'triangle', 0.08], [784, 0.07, 0.11, 'triangle', 0.09], [1047, 0.15, 0.16, 'sine', 0.07]],
  loan: [[262, 0, 0.12, 'triangle', 0.07], [392, 0.09, 0.14, 'triangle', 0.08]],
  repay: [[392, 0, 0.09, 'triangle', 0.07], [330, 0.08, 0.09, 'triangle', 0.07], [523, 0.16, 0.14, 'sine', 0.08]],
  charity: [[523, 0, 0.14, 'sine', 0.065], [659, 0.1, 0.18, 'sine', 0.07]],
  baby: [[988, 0, 0.08, 'sine', 0.065], [1319, 0.09, 0.08, 'sine', 0.07], [1175, 0.18, 0.13, 'triangle', 0.065]],
  expense: [[294, 0, 0.1, 'triangle', 0.075], [220, 0.09, 0.16, 'sawtooth', 0.055]],
  downsized: [[247, 0, 0.17, 'sawtooth', 0.055], [196, 0.14, 0.2, 'sawtooth', 0.06], [147, 0.3, 0.28, 'triangle', 0.075]],
  risk: [[330, 0, 0.09, 'square', 0.055], [247, 0.08, 0.12, 'square', 0.06], [165, 0.18, 0.2, 'sawtooth', 0.06]],
  milestone: [[523, 0, 0.18, 'triangle', 0.08], [659, 0.1, 0.2, 'triangle', 0.08], [784, 0.2, 0.22, 'triangle', 0.09], [1047, 0.32, 0.32, 'sine', 0.08]],
  victory: [[523, 0, 0.2, 'triangle', 0.08], [659, 0.1, 0.2, 'triangle', 0.08], [784, 0.2, 0.24, 'triangle', 0.09], [1047, 0.34, 0.24, 'sine', 0.08], [1319, 0.5, 0.42, 'sine', 0.075]],
  bankrupt: [[220, 0, 0.18, 'sawtooth', 0.06], [165, 0.14, 0.24, 'sawtooth', 0.065], [110, 0.34, 0.38, 'triangle', 0.08]],
}

export class GameAudio {
  private context: AudioContext | null = null
  private master: GainNode | null = null

  play(cue: SoundCue, delay = 0) {
    const context = this.getContext()
    if (!context) return
    if (context.state === 'suspended') void context.resume()
    const start = context.currentTime + delay

    if (cue === 'dice') {
      this.noise(context, start, 0.055, 0.1, 900)
      this.noise(context, start + 0.075, 0.06, 0.11, 700)
      this.noise(context, start + 0.16, 0.075, 0.12, 1100)
      this.note(context, 120, start + 0.16, 0.07, 'square', 0.07)
      return
    }

    notePatterns[cue]?.forEach(([frequency, offset, duration, type, volume]) => {
      this.note(context, frequency, start + offset, duration, type, volume)
    })
    if (cue === 'card') this.noise(context, start, 0.12, 0.045, 2400)
    if (cue === 'market') this.noise(context, start + 0.02, 0.18, 0.035, 1800)
    if (cue === 'payday' || cue === 'sale') this.coin(context, start + 0.05)
    if (cue === 'purchase' || cue === 'loan' || cue === 'repay') this.coin(context, start)
    if (cue === 'expense' || cue === 'downsized' || cue === 'risk' || cue === 'bankrupt') {
      this.noise(context, start, cue === 'bankrupt' ? 0.32 : 0.18, 0.04, 420)
    }
  }

  // Call from a user gesture: iOS leaves the context "interrupted" after backgrounding until then.
  unlock() {
    if (this.context && this.context.state !== 'running') void this.context.resume()
  }

  private getContext() {
    if (this.context) return this.context
    if (typeof window === 'undefined') return null
    const AudioContextConstructor = window.AudioContext || (window as AudioWindow).webkitAudioContext
    if (!AudioContextConstructor) return null
    this.context = new AudioContextConstructor()
    const compressor = this.context.createDynamicsCompressor()
    compressor.threshold.value = -18
    compressor.knee.value = 12
    compressor.ratio.value = 4
    compressor.attack.value = 0.004
    compressor.release.value = 0.16
    this.master = this.context.createGain()
    this.master.gain.value = 1.15
    this.master.connect(compressor)
    compressor.connect(this.context.destination)
    return this.context
  }

  private note(context: AudioContext, frequency: number, start: number, duration: number, type: OscillatorType, volume: number) {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = type
    oscillator.frequency.setValueAtTime(frequency, start)
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    oscillator.connect(gain)
    gain.connect(this.master ?? context.destination)
    oscillator.start(start)
    oscillator.stop(start + duration + 0.02)
  }

  private coin(context: AudioContext, start: number) {
    this.note(context, 1480, start, 0.07, 'sine', 0.065)
    this.note(context, 2220, start + 0.045, 0.11, 'sine', 0.055)
  }

  private noise(context: AudioContext, start: number, duration: number, volume: number, frequency: number) {
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate)
    const samples = buffer.getChannelData(0)
    for (let index = 0; index < samples.length; index += 1) samples[index] = Math.random() * 2 - 1
    const source = context.createBufferSource()
    const filter = context.createBiquadFilter()
    const gain = context.createGain()
    source.buffer = buffer
    filter.type = 'bandpass'
    filter.frequency.value = frequency
    filter.Q.value = 0.8
    gain.gain.setValueAtTime(volume, start)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    source.connect(filter)
    filter.connect(gain)
    gain.connect(this.master ?? context.destination)
    source.start(start)
    source.stop(start + duration)
  }
}