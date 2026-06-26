function getCorsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowedOrigins = [
    /^chrome-extension:\/\//,
    /^http:\/\/127\.0\.0\.1/,
    /^http:\/\/localhost/
  ];
  const allowed = allowedOrigins.some(pattern => pattern.test(origin));
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json",
  };
}

export default {
  async fetch(request, env) {
    const corsHeaders = getCorsHeaders(request);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "")) {
      return new Response(JSON.stringify({ success: true, message: "TacticalPulse Worker is running!" }), { status: 200, headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), { status: 405, headers: corsHeaders });
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ success: false, error: "Invalid JSON" }), { status: 400, headers: corsHeaders });
    }

    try {
      if (env.RATE_LIMIT) {
        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        const key = `rate:${ip}`;
        const count = parseInt(await env.RATE_LIMIT.get(key) || '0', 10);
        if (count >= 60) {
          return new Response(JSON.stringify({ success: false, error: "Rate limit reached." }), { status: 429, headers: corsHeaders });
        }
        await env.RATE_LIMIT.put(key, String(count + 1), { expirationTtl: 60 });
      }

      // ── GENERATE SSML ──────────────────────────────────────────────────────────
      if (body.action === "generate-ssml") {

        // FIX 3: Strict SSML-only system prompt — no chatting, no preamble
        const systemPrompt = `You are an SSML-only generation engine. You do NOT chat. You do NOT include any introductory text like "Here is the commentary" or "Sure!" or "Certainly!". You only output valid SSML code.

Follow these rules strictly:
1. Start EVERY output with <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-GB">
2. End EVERY output with </speak>
3. Use <prosody> tags for every sentence based on event intensity:
   - High Intensity (Goal, Red Card, Penalty Miss): <prosody pitch="high" rate="x-fast" volume="+6dB">
   - Medium Intensity (Shot, Attack, Foul, Free Kick): <prosody pitch="medium" rate="fast">
   - Low Intensity (Tactical, Kickoff, Half Time, Pass): <prosody pitch="low" rate="medium">
4. Use <break time="400ms"/> before the key moment in high intensity events for dramatic pause
5. If you output a single character of text outside of the <speak>...</speak> tags, the system will crash. Output ONLY the SSML block. Nothing else.`;

        const userPrompt = `Match Event: Minute ${body.event.minute}, ${body.event.team}, ${body.event.player} — ${body.event.description}
Event Type for intensity classification: ${body.event.type}
Generate passionate, human football commentary for this event as valid SSML only.`;

        const watsonPayload = {
          input: userPrompt,
          system_prompt: systemPrompt,
          parameters: {
            max_new_tokens: 200,
            temperature: 0.75,
            repetition_penalty: 1.1
          }
        };

        let finalSSML = null;
        let retries = 0;

        // FIX 1: Wait for FULL response — no streaming — before touching TTS
        while (retries < 3) {
          try {
            if (!env.IBM_WATSONX_URL || !env.IBM_WATSON_API_KEY) {
              throw new Error("IBM Watsonx not configured");
            }

            const res = await fetch(env.IBM_WATSONX_URL, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${env.IBM_WATSON_API_KEY}`
              },
              body: JSON.stringify(watsonPayload)
            });

            if (!res.ok) {
              if (res.status === 429 || res.status === 503) {
                retries++;
                await new Promise(r => setTimeout(r, retries * 1500));
                continue;
              }
              throw new Error(`Watsonx error ${res.status}`);
            }

            // Await the COMPLETE response before any processing
            const data = await res.json();
            let raw = (data.results?.[0]?.generated_text || '').trim();

            // Log raw output for debugging
            console.log("Raw Granite Output:", raw);

            // FIX 2: Strip any preamble the LLM added before the <speak> tag
            const speakStart = raw.indexOf('<speak');
            if (speakStart > 0) {
              console.warn("Stripped LLM preamble:", raw.substring(0, speakStart));
              raw = raw.substring(speakStart);
            }

            // FIX 2: Ensure <speak> wrapper always exists
            if (!raw.startsWith('<speak')) {
              raw = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-GB"><prosody pitch="medium" rate="fast">${raw}</prosody></speak>`;
            }
            if (!raw.endsWith('</speak>')) {
              raw = raw + '</speak>';
            }

            finalSSML = raw;
            break;

          } catch (err) {
            console.error(`Watsonx attempt ${retries + 1} failed:`, err.message);
            retries++;
            if (retries >= 3) break;
            await new Promise(r => setTimeout(r, retries * 1500));
          }
        }

        // Clean fallback SSML if Watsonx failed entirely
        if (!finalSSML) {
          console.warn("Watsonx failed. Using fallback SSML.");
          finalSSML = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-GB"><prosody pitch="medium" rate="fast">${body.event.description}</prosody></speak>`;
        }

        return new Response(JSON.stringify({ success: true, ssml: finalSSML }), { status: 200, headers: corsHeaders });
      }

      // ── GENERATE AUDIO ─────────────────────────────────────────────────────────
      if (body.action === "generate-audio") {
        let audioUrl = null;

        try {
          const ttsApiKey = env.IBM_TTS_API_KEY || env.IBM_WATSON_API_KEY;
          if (!env.IBM_TTS_URL || !ttsApiKey) throw new Error("IBM TTS not configured");

          // FIX 3: Use neural V3 voice — sounds human, not robotic standard voice
          const ttsUrl = `${env.IBM_TTS_URL}?voice=en-US_AllisonV3Voice`;

          const ttsRes = await fetch(ttsUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Accept": "audio/mp3",
              "Authorization": `Basic ${btoa('apikey:' + ttsApiKey)}`
            },
            // FIX 1: Send complete SSML only after Watsonx has fully responded
            body: JSON.stringify({ text: body.ssml })
          });

          if (!ttsRes.ok) {
            const err = await ttsRes.text();
            console.error(`Watson TTS error ${ttsRes.status}:`, err);
            throw new Error("TTS failed");
          }

          const buffer = await ttsRes.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          let binary = '';
          const chunk = 8192;
          for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
          }
          audioUrl = `data:audio/mp3;base64,${btoa(binary)}`;

        } catch (e) {
          console.warn("Watson TTS failed — client will use browser speech.", e.message);
        }

        // Return null if TTS failed — client handles gracefully with Web Speech API
        return new Response(JSON.stringify({ success: true, audioUrl }), { status: 200, headers: corsHeaders });
      }

      return new Response(JSON.stringify({ success: false, error: "Unknown action" }), { status: 400, headers: corsHeaders });

    } catch (error) {
      console.error('Worker unhandled error:', error.message);
      return new Response(JSON.stringify({ success: false, error: "Service temporarily unavailable." }), { status: 500, headers: corsHeaders });
    }
  }
};
