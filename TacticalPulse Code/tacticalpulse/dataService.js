class DataService {
  constructor() {
    this.liveApiUrl = '';
    this.replayEvents = null;
    this.replayIndex = 0;
    this._stopped = false;
    this._onEvent = null;
    this._onMode = null;
  }

  async startPolling(onEventCallback, onModeChangeCallback) {
    this._stopped = false;
    this._onEvent = onEventCallback;
    this._onMode = onModeChangeCallback;
    onModeChangeCallback('Replay');
    // Kick off the first event — chaining happens in script.js after speech ends
    await this._next();
  }

  // Called by script.js after each event finishes speaking
  async requestNext() {
    if (this._stopped) return;
    await this._next();
  }

  stopPolling() {
    this._stopped = true;
  }

  async _next() {
    if (this._stopped) return;

    if (!this.replayEvents) {
      try {
        const url = chrome.runtime.getURL('data/replay.json');
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to fetch replay.json');
        const data = await res.json();
        this.replayEvents = data.events;
      } catch (e) {
        console.error('Failed to load replay data:', e);
        return;
      }
    }

    if (this.replayIndex >= this.replayEvents.length) {
      this.replayIndex = 0; // loop
    }

    const event = this.replayEvents[this.replayIndex];
    this.replayIndex++;
    this._onEvent(event);
  }
}
