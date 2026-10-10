/**
 * Spatial Audio Channel Router (Phase 2)
 * Splits and maps stereo channels using Web Audio ChannelSplitterNode.
 */
export class ChannelRouter {
  constructor(audioContext) {
    this.ctx = audioContext;
    this.currentMode = 'mono'; // 'mono' | 'left' | 'right' | 'center' | 'ambient'
    this.gainNode = this.ctx.createGain();
    this.splitter = this.ctx.createChannelSplitter(2);
    this.merger = this.ctx.createChannelMerger(2);

    // Initial setup connects directly
    this.gainNode.connect(this.ctx.destination);
  }

  /**
   * Connect an audio source node through the channel router
   */
  route(sourceNode, mode = 'mono') {
    this.currentMode = mode;

    // Disconnect previous graph
    try {
      sourceNode.disconnect();
      this.splitter.disconnect();
      this.merger.disconnect();
    } catch (_) {}

    switch (mode) {
      case 'left':
        // Route channel 0 (Left) to both left and right speaker outputs
        sourceNode.connect(this.splitter);
        this.splitter.connect(this.merger, 0, 0);
        this.splitter.connect(this.merger, 0, 1);
        this.merger.connect(this.gainNode);
        break;

      case 'right':
        // Route channel 1 (Right) to both left and right speaker outputs
        sourceNode.connect(this.splitter);
        this.splitter.connect(this.merger, 1, 0);
        this.splitter.connect(this.merger, 1, 1);
        this.merger.connect(this.gainNode);
        break;

      case 'center':
      case 'mono':
      default:
        // Pass-through stereo mix to full output
        sourceNode.connect(this.gainNode);
        break;
    }
  }

  setVolume(volume) {
    // Clamp 0.0 - 1.0
    const val = Math.max(0, Math.min(1, volume));
    this.gainNode.gain.setValueAtTime(val, this.ctx.currentTime);
  }
}
