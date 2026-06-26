# TacticalPulse

TacticalPulse is a real-time, AI-driven commentary assistant designed to bridge the gap between live sports data and an immersive, accessible viewing experience.

## 🚀 The Problem
Modern sports viewing is fragmented. Fans are stuck toggling between live feeds and mobile devices to track stats, losing the "human" narrative of the game. Furthermore, global broadcasts are often limited to major languages, leaving millions of fans—who want to experience the game in their mother tongue (e.g., Marathi, Bengali, Odia)—without a meaningful connection to the match.

## 💡 The Solution
TacticalPulse is a "second-screen" Chrome extension that acts as your personal AI commentator. Instead of showing dry statistics, it ingests live event data and uses IBM's AI models to generate a tactical, emotional narrative in real-time.

### Why this matters:
* **Tactical Storytelling:** It moves beyond the scoreboard to explain *why* a play matters.
* **Accessibility:** Built with a language-agnostic architecture, it provides a foundation to bring personalized, local-language commentary to underserved global audiences.
* **Robustness:** Features a built-in **"Fallback Mode"** that ensures the narration never goes dark, seamlessly switching to a local data buffer if live API feeds fluctuate.

## 🛠️ Tech Stack
* **LLM (Narrative Engine):** IBM Granite (watsonx.ai)
* **Voice Engine:** IBM Watson TTS (Neural V3)
* **Infrastructure:** Cloudflare Workers
* **Frontend:** Chrome Extension (Manifest V3)

## ⚙️ Architecture
1. **Frontend:** The Chrome Extension polls event data.
2. **Proxy:** A Cloudflare Worker processes the request, keeping API keys hidden.
3. **Logic:** IBM Granite performs sentiment classification (using SSML prosody tags) to determine the tone of the narration.
4. **Output:** IBM Watson TTS synthesizes the final audio feed.

---

## 🛠️ Installation & Setup

Follow these steps to deploy TacticalPulse in your own environment.

### 1. Prerequisites
* [Node.js](https://nodejs.org/) installed on your machine.
* A [Cloudflare account](https://www.cloudflare.com/) with Workers enabled.
* [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installed: `npm install -g wrangler`.

### 2. Download the Project
Clone the repository:
```bash
git clone https://github.com/YOUR_USERNAME/TacticalPulse.git
cd TacticalPulse
```

### 3. Deploy the Cloudflare Worker

Navigate to the `/worker` directory.

Log in to Cloudflare using the CLI:

```bash
wrangler login
```

Deploy the worker:

```bash
wrangler deploy
```

### 4. Configuration (Variables & Secrets)

To keep your API keys secure, configure them via the Cloudflare Dashboard rather than hardcoding them in the source.

1. Go to your Cloudflare Dashboard > **Workers & Pages**.
2. Select your `TacticalPulse` worker.
3. Go to **Settings > Variables & Secrets**.
4. Set the following:

| Variable Name | Type | Value |
| --- | --- | --- |
| `IBM_TTS_KEY_API` | Secret | Your Watson TTS API Key |
| `IBM_WATSON_API_KEY` | Secret | Your IBM WatsonX (Granite) API Key |
| `IBM_TTS_URL` | Plain Text | Your IBM Watson TTS Service URL |
| `IBM_WATSONX_URL` | Plain Text | Your IBM WatsonX (Granite) Endpoint URL |

> **Security Note:** Always use the "Encrypt" or "Secret" option for API keys.

### 5. Launch the Extension

1. Open Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** (top right toggle).
3. Click **Load unpacked**.
4. Select the `TacticalPulse Code/tacticalpulse` folder from this repository.
5. In `TacticalPulse Code/tacticalpulse/script.js`, replace `<YOUR_CLOUDFLARE_WORKER_URL>` on line 13 with your deployed Cloudflare Worker URL.

---

## 🏗️ Development Status

This project is currently an MVP.

* **Current State:** Fully functional data pipeline with English narration.
* **Roadmap:** Active fine-tuning of prosody and voice models to increase emotional nuance, followed by expansion into regional language models.

*Built as a solo project for the IBM/Sports Hackathon. Focus: Accessibility, Latency, and Resilient Architecture.*
