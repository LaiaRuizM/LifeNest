# LifeNest

Privacy-first life albums from photos and voice notes. Add a photo and an optional voice note; the app transcribes the audio (Whisper) and turns it into a short vignette (LLM). Export your album as PDF.

## Run locally

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Environment**
   - Copy `.env.example` to `.env`
   - Set `OPENAI_API_KEY` (required for transcription and vignettes)
   - `DATABASE_URL` defaults to `file:./dev.db` (SQLite in `prisma/`)

3. **Database**
   ```bash
   npm run db:push
   npm run db:generate
   ```

4. **Dev server**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000).

## Usage

- **Add a moment**: Choose a photo (required) and optionally a voice note. Submit; the app transcribes the audio and generates a vignette, then shows the moment in your album.
- **Export PDF**: Use “Export PDF” in the header to download your album as a printable PDF.

## Tech

- **Stack**: Next.js 14 (App Router), TypeScript, Tailwind, Prisma (SQLite), OpenAI (Whisper + GPT-4o-mini), jsPDF.
- **Storage**: Photos and audio are stored under `public/uploads/` (create it if missing; it’s gitignored). Metadata is in SQLite.
- **Privacy**: Audio and photos are sent to OpenAI only for transcription and vignette generation; no training on your data.

## Optional: reset DB

```bash
rm prisma/dev.db
npm run db:push
```

## Troubleshooting

- **"Unknown field `photos`"** or **Upload failed** after schema changes: run `npm run db:generate` (or `npx prisma generate`), then restart the dev server.
- **"Cannot find module './276.js'"** or similar in `.next`: clear the build cache and restart: `rm -rf .next && npm run dev`.
- **Transcription fails (ECONNRESET)**: the moment is still saved with your photos and date; only the voice vignette is missing. Check your network and `OPENAI_API_KEY`. You can add another moment to retry.
