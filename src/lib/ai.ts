import OpenAI from 'openai';
import { readFile } from 'fs/promises';
import path from 'path';

// Groq is API-compatible with OpenAI — same SDK, different baseURL and key
const openai = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

const isRetryableError = (err: unknown): boolean => {
  const code = (err as { code?: string })?.code;
  const cause = (err as { cause?: { code?: string } })?.cause;
  if (code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ECONNREFUSED') return true;
  if (cause?.code === 'ECONNRESET' || cause?.code === 'ETIMEDOUT') return true;
  return false;
};

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts && isRetryableError(err)) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

export async function transcribeAudio(filePath: string): Promise<string> {
  const buf = await readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === '.mp3' ? 'audio/mpeg' : ext === '.m4a' ? 'audio/mp4' : 'audio/webm';
  const file = new File([buf], path.basename(filePath), { type: mime });
  const transcription = await withRetry(() =>
    openai.audio.transcriptions.create({
      file,
      model: 'whisper-large-v3-turbo',
    })
  );
  return transcription.text?.trim() ?? '';
}

export async function generateVignette(transcript: string): Promise<string> {
  const completion = await withRetry(() =>
    openai.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: `You are a gentle, poetic writer. Turn the user's raw voice transcript into a short, evocative vignette: 2–4 sentences, present tense, sensory and warm. Preserve their words and meaning; do not add facts they did not say. Write the vignette in the same language as the transcript. Output only the vignette, no quotes or title.`,
        },
        {
          role: 'user',
          content: transcript,
        },
      ],
      max_tokens: 200,
      temperature: 0.6,
    })
  );
  const text = completion.choices[0]?.message?.content?.trim();
  return text ?? transcript;
}

export async function generateAlbumForeword(
  moments: { vignette: string | null; transcript: string | null }[]
): Promise<string> {
  const texts = moments
    .map((m) => m.vignette || m.transcript)
    .filter(Boolean) as string[];
  if (texts.length === 0) {
    return 'These are the moments that make up a life — small, quiet, and precious.';
  }
  const combined = texts.slice(0, 20).join('\n\n');
  const completion = await withRetry(() =>
    openai.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: `You write a warm, intimate foreword for a printed memory album. Based on the moments provided, write 3–5 sentences in first person, as if the album owner is writing to their future self or to loved ones. Be specific to the actual content — mention real details, feelings, or places from the memories. Write in the same language as the memories. Output only the foreword text, no title, no quotes, no labels.`,
        },
        {
          role: 'user',
          content: combined,
        },
      ],
      max_tokens: 280,
      temperature: 0.75,
    })
  );
  return (
    completion.choices[0]?.message?.content?.trim() ??
    'These are the moments that make up a life — small, quiet, and precious.'
  );
}

export type AlbumTheme = {
  title: string;
  subtitle: string;
  keywords: string[];
  primaryColor: string; // hex e.g. "#1e3a5f"
  secondaryColor: string;
};

export type PageDecor = {
  theme: string;           // e.g. "hawaii", "alps", "wedding", "city", "forest"
  icons: string[];         // 3–6 symbolic nouns to draw, e.g. ["turtle","wave","palm","shark","hibiscus"]
  mood: string;            // e.g. "tropical", "romantic", "adventurous", "cozy"
  accentColor: string;     // hex color suggestion for this page's accent (can differ per page)
};

export async function getPageDecor(
  vignette: string | null,
  transcript: string | null
): Promise<PageDecor> {
  const text = (vignette || transcript || '').slice(0, 600);
  if (!text) {
    return { theme: 'generic', icons: ['heart', 'star', 'leaf', 'circle'], mood: 'warm', accentColor: '#a0855a' };
  }
  const completion = await withRetry(() =>
    openai.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: `You read a short memory text and return a JSON object describing decorative elements to draw on that album page.
Output JSON only, no markdown, with these exact keys:
- theme: one lowercase word for the overall context (e.g. "hawaii", "alps", "wedding", "paris", "forest", "beach", "city", "baby", "birthday", "winter").
- icons: an array of 4–6 simple nouns that are visually iconic for this memory and can be drawn as simple geometric shapes/silhouettes. Choose from nature, animals, landmarks, objects. Examples for Hawaii: ["turtle","wave","palm","hibiscus","shark","sun"]. Examples for Alps: ["mountain","pine","snow","chalet","cable-car","chamois"]. Examples for honeymoon: ["heart","rose","candle","ring","champagne","moon"]. Examples for city: ["building","bridge","car","umbrella","coffee","bicycle"].
- mood: one word: "tropical","romantic","adventurous","cozy","festive","nostalgic","serene","urban","wild" or similar.
- accentColor: a hex color that fits the mood (e.g. "#1a7a4a" for tropical green, "#2d6fa8" for ocean blue, "#c23b5e" for romantic red, "#4a3728" for cozy brown).`,
        },
        {
          role: 'user',
          content: text,
        },
      ],
      max_tokens: 200,
      temperature: 0.5,
    })
  );
  const raw = completion.choices[0]?.message?.content?.trim() ?? '{}';
  try {
    const cleaned = raw.replace(/^```\w*\n?|\n?```$/g, '').trim();
    const parsed = JSON.parse(cleaned) as PageDecor;
    if (parsed && typeof parsed.theme === 'string' && Array.isArray(parsed.icons)) {
      return {
        theme: parsed.theme || 'generic',
        icons: parsed.icons.slice(0, 6),
        mood: typeof parsed.mood === 'string' ? parsed.mood : 'warm',
        accentColor: typeof parsed.accentColor === 'string' && parsed.accentColor.startsWith('#')
          ? parsed.accentColor : '#a0855a',
      };
    }
  } catch { /* fall through */ }
  return { theme: 'generic', icons: ['heart', 'star', 'leaf', 'circle'], mood: 'warm', accentColor: '#a0855a' };
}

export async function getAlbumTheme(
  moments: { vignette: string | null; transcript: string | null }[]
): Promise<AlbumTheme> {
  const texts = moments
    .map((m) => m.vignette || m.transcript)
    .filter(Boolean) as string[];
  const combined =
    texts.length > 0
      ? texts.slice(0, 30).join('\n\n')
      : 'Personal memories and moments.';

  const completion = await withRetry(() =>
    openai.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: `You analyze a collection of short life vignettes to suggest a printable album theme.
Output a JSON object only, no markdown, with these exact keys:
- title: A short, evocative album title (e.g. "London & the Sea", "Our Wedding", "Blue Days").
- subtitle: One short line that fits the album (e.g. "A year of travels", "Moments we keep").
- keywords: Array of 3–5 theme keywords (e.g. ["London", "wedding", "sea", "blue", "engagement"]).
- primaryColor: A hex color for the album (e.g. "#1e3a5f" for navy, "#0d5c47" for teal, "#5c2d1e" for warm brown). Pick a color that fits the mood and any mentioned colors or places.
- secondaryColor: A lighter or complementary hex (e.g. "#c9d6e3", "#e8f0ed").`,
        },
        {
          role: 'user',
          content: combined,
        },
      ],
      max_tokens: 300,
      temperature: 0.5,
    })
  );
  const raw = completion.choices[0]?.message?.content?.trim() ?? '{}';
  const parsed = (() => {
    try {
      const cleaned = raw.replace(/^```\w*\n?|\n?```$/g, '').trim();
      return JSON.parse(cleaned) as AlbumTheme;
    } catch {
      return null;
    }
  })();
  if (
    parsed &&
    typeof parsed.title === 'string' &&
    typeof parsed.primaryColor === 'string'
  ) {
    return {
      title: parsed.title || 'My life album',
      subtitle: typeof parsed.subtitle === 'string' ? parsed.subtitle : '',
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
      primaryColor: parsed.primaryColor.startsWith('#')
        ? parsed.primaryColor
        : '#' + parsed.primaryColor,
      secondaryColor:
        typeof parsed.secondaryColor === 'string' &&
        parsed.secondaryColor.startsWith('#')
          ? parsed.secondaryColor
          : '#e8e8e8',
    };
  }
  return {
    title: 'My life album',
    subtitle: 'Moments we keep',
    keywords: [],
    primaryColor: '#564636',
    secondaryColor: '#e8e4dc',
  };
}
