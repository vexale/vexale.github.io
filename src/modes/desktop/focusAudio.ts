import type { FocusAmbient } from './focusStore'

export function startFocusAmbient(kind: Exclude<FocusAmbient, 'none'>, ctx: AudioContext, output: AudioNode): () => void {
  const stops: Array<() => void> = []
  if (kind === 'drone') {
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 380
    filter.connect(output)
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.06
    const modulation = ctx.createGain()
    modulation.gain.value = 150
    lfo.connect(modulation).connect(filter.frequency)
    lfo.start()
    for (const [index, frequency] of [55, 82.41, 110.3].entries()) {
      const oscillator = ctx.createOscillator()
      oscillator.type = index % 2 ? 'triangle' : 'sine'
      oscillator.frequency.value = frequency
      oscillator.detune.value = (index - 1) * 5
      const gain = ctx.createGain()
      gain.gain.value = 0.1
      oscillator.connect(gain).connect(filter)
      oscillator.start()
      stops.push(() => oscillator.stop())
    }
    stops.push(() => lfo.stop())
  } else if (kind === 'wind') {
    const length = ctx.sampleRate * 4
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    let previous = 0
    for (let index = 0; index < length; index += 1) {
      previous = (previous + 0.02 * (Math.random() * 2 - 1)) / 1.02
      data[index] = previous * 3.5
    }
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 520
    const gain = ctx.createGain()
    gain.gain.value = 0.28
    source.connect(filter).connect(gain).connect(output)
    source.start()
    stops.push(() => source.stop())
  } else {
    const delay = ctx.createDelay(1)
    delay.delayTime.value = 0.45
    const feedback = ctx.createGain()
    feedback.gain.value = 0.35
    delay.connect(feedback).connect(delay)
    delay.connect(output)
    let timer = 0
    const ping = (): void => {
      const oscillator = ctx.createOscillator()
      oscillator.type = 'sine'
      oscillator.frequency.value = 500 + Math.random() * 1300
      const gain = ctx.createGain()
      const now = ctx.currentTime
      gain.gain.setValueAtTime(0, now)
      gain.gain.linearRampToValueAtTime(0.07, now + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.6)
      oscillator.connect(gain)
      gain.connect(output)
      gain.connect(delay)
      oscillator.start(now)
      oscillator.stop(now + 1.7)
      timer = window.setTimeout(ping, 1600 + Math.random() * 2500)
    }
    ping()
    stops.push(() => window.clearTimeout(timer))
  }
  return () => stops.forEach(stop => stop())
}
