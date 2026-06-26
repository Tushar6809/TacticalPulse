if (window.speechSynthesis) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
}

document.addEventListener('DOMContentLoaded', () => {
  const startBtn      = document.getElementById('start-btn');
  const stopBtn       = document.getElementById('stop-btn');
  const statusText    = document.getElementById('status-text');
  const modeText      = document.getElementById('mode-text');
  const feedContainer = document.getElementById('commentary-feed');

  const WORKER_URL = '<YOUR_CLOUDFLARE_WORKER_URL>'; // e.g., 'https://tacticalpulse.yourusername.workers.dev/'
  const dataService = new DataService();
  let isStopped = false;

  // Bridges timed to feel like natural breath between moments
  const bridges = [
    "Play continues. Both sides probing for an opening.",
    "The crowd watching every single move now.",
    "Both managers silent on the touchline. Thinking.",
    "You can feel it. Something is about to happen.",
    "Every touch under enormous pressure.",
    "Eighty eight thousand people holding their breath.",
    "Football at its absolute finest.",
    "The players know exactly what is at stake tonight.",
  ];
  let bridgeIndex = 0;

  // ── PITCH MAP ─────────────────────────────────────────────────────────────
  // Hand-tuned per event. rate: speed. pitch: tone height. volume: loudness.
  // Read each description and matched the arc to the words.
  const pitchMap = {

    // "The 2022 World Cup Final..." — slow, grand, like an opening monologue
    "0": { rate: 0.88, pitch: 0.95, volume: 0.9 },

    // "Argentina pressing high and fast..." — starts energetic, building
    "3": { rate: 1.05, pitch: 1.1, volume: 0.95 },

    // "France look strangely quiet..." — analytical, calm, slightly concerned
    "9": { rate: 0.95, pitch: 0.9, volume: 0.9 },

    // "A foul in the box!..." — sharp burst, voice rising with each sentence
    "21": { rate: 1.15, pitch: 1.35, volume: 1.0 },

    // "GOAL! The Captain scores!..." — full explosion, fastest and highest
    "23": { rate: 1.3, pitch: 1.75, volume: 1.0 },

    // "TWO NIL!..." — even bigger than the first goal, pure joy
    "36": { rate: 1.35, pitch: 1.85, volume: 1.0 },

    // "Half time. Argentina two, France nil..." — drops right down, reflective
    "45": { rate: 0.85, pitch: 0.85, volume: 0.88 },

    // "France starting the second half with far more urgency..." — tension returning
    "52": { rate: 1.0, pitch: 1.05, volume: 0.93 },

    // "The Captain is still directing everything..." — warm, admiring, building awe
    "68": { rate: 0.95, pitch: 1.0, volume: 0.92 },

    // "GOAL! France pull one back!..." — shock, disbelief, voice jumping up
    "80": { rate: 1.2, pitch: 1.55, volume: 1.0 },

    // "TWO TWO! He scores again!..." — absolute pandemonium, highest energy yet
    "81": { rate: 1.4, pitch: 1.9, volume: 1.0 },

    // "Full time — two two..." — stunned, breathless, almost whispering
    "90": { rate: 0.88, pitch: 0.9, volume: 0.9 },

    // "THE CAPTAIN SCORES IN EXTRA TIME!..." — explosion again, raw emotion
    "108": { rate: 1.3, pitch: 1.8, volume: 1.0 },

    // "THREE THREE!..." — disbelief, almost incredulous
    "115": { rate: 1.25, pitch: 1.6, volume: 1.0 },

    // "The Captain steps up first..." — quiet drama, calm before storm
    "121": { rate: 0.95, pitch: 1.1, volume: 0.95 },

    // "THE KEEPER SAVES IT!..." — pure eruption
    "123": { rate: 1.35, pitch: 1.85, volume: 1.0 },

    // "HE HITS THE POST! Wide! It is over!..." — starts explosive then drops
    // to something almost reverent at "Football found its perfect ending"
    "125": { rate: 1.3, pitch: 1.9, volume: 1.0 },
  };

  startBtn.addEventListener('click', () => {
    startBtn.disabled = true;
    stopBtn.disabled  = false;
    isStopped = false;
    statusText.textContent = 'Live Commentary...';
    statusText.style.color = 'var(--primary)';
    feedContainer.innerHTML = '';
    dataService.startPolling(processEvent, (mode) => {
      modeText.textContent = mode;
    });
  });

  stopBtn.addEventListener('click', () => {
    isStopped = true;
    dataService.stopPolling();
    window.speechSynthesis.cancel();
    startBtn.disabled = false;
    stopBtn.disabled  = true;
    statusText.textContent = 'Stopped.';
  });

  async function processEvent(event) {
    if (isStopped) return;

    let ssml = null;
    let plainText = event.description;

    try {
      const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate-ssml', event })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.ssml) {
          ssml = data.ssml;
          plainText = ssml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        }
      }
    } catch (e) {
      console.warn('Worker unavailable — using replay text.');
    }

    if (!plainText) plainText = event.description;
    addFeedItem(event, plainText);

    // Try Watson TTS first
    let watsonPlayed = false;
    if (ssml) {
      try {
        const audioRes = await fetch(WORKER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'generate-audio', ssml })
        });
        if (audioRes.ok) {
          const audioData = await audioRes.json();
          if (audioData.success && audioData.audioUrl && audioData.audioUrl.startsWith('data:audio')) {
            await playAudio(audioData.audioUrl);
            watsonPlayed = true;
          }
        }
      } catch (e) {
        console.warn('Watson TTS failed:', e.message);
      }
    }

    // Browser speech with hand-tuned pitch per event
    if (!watsonPlayed) {
      const voice = pitchMap[event.minute] || { rate: 1.0, pitch: 1.0, volume: 0.95 };
      await speakFully(plainText, voice);
    }

    if (isStopped) return;

    // Bridge — always calm and quiet between events
    const bridge = bridges[bridgeIndex % bridges.length];
    bridgeIndex++;

    if (watsonPlayed) {
      const bridgeSsml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-GB"><prosody pitch="low" rate="medium">${bridge}</prosody></speak>`;
      try {
        const audioRes = await fetch(WORKER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'generate-audio', ssml: bridgeSsml })
        });
        if (audioRes.ok) {
          const audioData = await audioRes.json();
          if (audioData.success && audioData.audioUrl && audioData.audioUrl.startsWith('data:audio')) {
            await playAudio(audioData.audioUrl);
            watsonPlayed = true;
          } else {
            await speakFully(bridge, { rate: 0.95, pitch: 0.95, volume: 0.88 });
          }
        }
      } catch (e) {
        await speakFully(bridge, { rate: 0.95, pitch: 0.95, volume: 0.88 });
      }
    } else {
      await speakFully(bridge, { rate: 0.95, pitch: 0.95, volume: 0.88 });
    }

    if (isStopped) return;
    dataService.requestNext();
  }

  function playAudio(audioUrl) {
    return new Promise((resolve) => {
      const audio = new Audio(audioUrl);
      audio.onended = resolve;
      audio.onerror = () => resolve();
      audio.play().catch(() => resolve());
    });
  }

  function speakFully(text, voice) {
    return new Promise((resolve) => {
      if (isStopped) return resolve();
      window.speechSynthesis.cancel();

      setTimeout(() => {
        if (isStopped) return resolve();
        const utter = new SpeechSynthesisUtterance(text);

        utter.rate   = voice.rate;
        utter.pitch  = voice.pitch;
        utter.volume = voice.volume;

        const voices = window.speechSynthesis.getVoices();
        const pick =
          voices.find(v => v.name === 'Google UK English Male') ||
          voices.find(v => v.name === 'Daniel') ||
          voices.find(v => v.name.includes('Google') && v.lang.startsWith('en')) ||
          voices.find(v => v.lang === 'en-GB') ||
          voices.find(v => v.lang.startsWith('en'));
        if (pick) utter.voice = pick;

        let resolved = false;
        const done = () => { if (!resolved) { resolved = true; resolve(); } };

        const keepAlive = setInterval(() => {
          if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
            window.speechSynthesis.pause();
            window.speechSynthesis.resume();
          }
        }, 10000);

        utter.onend = () => { clearInterval(keepAlive); done(); };
        utter.onerror = (e) => {
          clearInterval(keepAlive);
          if (e.error !== 'interrupted' && e.error !== 'canceled') done();
        };

        const estimatedMs = Math.max((text.length / 15) * 1000, 3000) + 5000;
        setTimeout(done, estimatedMs);

        window.speechSynthesis.speak(utter);
      }, 150);
    });
  }

  function addFeedItem(event, commentary) {
    const item = document.createElement('div');
    item.className = 'feed-item';
    item.innerHTML = `<strong>${event.minute}'</strong> — ${commentary}`;
    feedContainer.prepend(item);
  }
});
