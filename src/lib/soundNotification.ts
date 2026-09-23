/**
 * Sound Notification Service for Supervisor Dashboard
 * Uses Web Audio API to synthesize crystal-clear, alert chimes
 * without depending on external MP3 assets, ensuring 100% reliability offline & online.
 */

class SoundNotificationService {
  private ctx: AudioContext | null = null;
  private soundEnabled: boolean = true;
  private volume: number = 0.85;

  constructor() {
    if (typeof window !== 'undefined') {
      const storedEnabled = localStorage.getItem('supervisor_sound_enabled');
      if (storedEnabled !== null) {
        this.soundEnabled = storedEnabled === 'true';
      }
      const storedVol = localStorage.getItem('supervisor_sound_volume');
      if (storedVol !== null) {
        const parsed = parseFloat(storedVol);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
          this.volume = parsed;
        }
      }
    }
  }

  /**
   * Initializes or resumes the AudioContext after user interaction
   */
  public unlockAudio(): void {
    if (typeof window === 'undefined') return;
    try {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    } catch (e) {
      console.warn('AudioContext unlock failed:', e);
    }
  }

  private getAudioContext(): AudioContext | null {
    this.unlockAudio();
    return this.ctx;
  }

  public isEnabled(): boolean {
    return this.soundEnabled;
  }

  public setEnabled(enabled: boolean): void {
    this.soundEnabled = enabled;
    if (typeof window !== 'undefined') {
      localStorage.setItem('supervisor_sound_enabled', enabled ? 'true' : 'false');
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(vol, 1));
    if (typeof window !== 'undefined') {
      localStorage.setItem('supervisor_sound_volume', this.volume.toString());
    }
  }

  /**
   * Plays a crisp, cheerful 2-tone chime when a driver punches their location.
   * Tone 1: 784 Hz (G5) -> Tone 2: 1046.5 Hz (C6) with gentle exponential decays.
   */
  public playLocationPunchChime(): void {
    if (!this.soundEnabled) return;
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(this.volume, now);
      masterGain.connect(ctx.destination);

      // --- First Note: G5 (784Hz) ---
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(784, now);
      osc1.frequency.exponentialRampToValueAtTime(830, now + 0.12);
      
      gain1.gain.setValueAtTime(0.001, now);
      gain1.gain.exponentialRampToValueAtTime(0.4, now + 0.02);
      gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);

      osc1.connect(gain1);
      gain1.connect(masterGain);

      // --- Second Note: C6 (1046.5Hz) - Bright bell resonance ---
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(1046.5, now + 0.11);
      osc2.frequency.exponentialRampToValueAtTime(1318.5, now + 0.4);

      gain2.gain.setValueAtTime(0.001, now);
      gain2.gain.setValueAtTime(0.001, now + 0.11);
      gain2.gain.exponentialRampToValueAtTime(0.5, now + 0.13);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.75);

      osc2.connect(gain2);
      gain2.connect(masterGain);

      // --- Harmonic body: C5 (523.25Hz) - Warmth ---
      const osc3 = ctx.createOscillator();
      const gain3 = ctx.createGain();
      osc3.type = 'sine';
      osc3.frequency.setValueAtTime(523.25, now + 0.11);

      gain3.gain.setValueAtTime(0.001, now);
      gain3.gain.setValueAtTime(0.001, now + 0.11);
      gain3.gain.exponentialRampToValueAtTime(0.25, now + 0.13);
      gain3.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);

      osc3.connect(gain3);
      gain3.connect(masterGain);

      osc1.start(now);
      osc1.stop(now + 0.4);

      osc2.start(now + 0.11);
      osc2.stop(now + 0.8);

      osc3.start(now + 0.11);
      osc3.stop(now + 0.65);
    } catch (err) {
      console.warn('Could not play location punch chime:', err);
    }
  }

  /**
   * Test tone trigger for supervisor sound check
   */
  public testSound(): void {
    this.unlockAudio();
    this.playLocationPunchChime();
  }
}

export const soundNotificationService = new SoundNotificationService();
