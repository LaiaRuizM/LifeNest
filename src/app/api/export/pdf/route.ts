import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getUploadPath } from '@/lib/storage';
import { getAlbumTheme, generateAlbumForeword, getPageDecor, PageDecor } from '@/lib/ai';
import { jsPDF } from 'jspdf';
import { readFile } from 'fs/promises';
import path from 'path';
const W = 210, H = 297, M = 16, CW = W - M * 2;
type RGB = [number, number, number];

function hex2rgb(hex: string): RGB {
  const n = parseInt(hex.replace(/^#/, ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function tint([r, g, b]: RGB, t: number): RGB {
  return [Math.round(r + (255 - r) * t), Math.round(g + (255 - g) * t), Math.round(b + (255 - b) * t)];
}
function shade([r, g, b]: RGB, s: number): RGB {
  return [Math.round(r * (1 - s)), Math.round(g * (1 - s)), Math.round(b * (1 - s))];
}
function sf(doc: jsPDF, c: RGB) { doc.setFillColor(c[0], c[1], c[2]); }
function sd(doc: jsPDF, c: RGB) { doc.setDrawColor(c[0], c[1], c[2]); }
function st(doc: jsPDF, c: RGB) { doc.setTextColor(c[0], c[1], c[2]); }

async function embedPhoto(
  doc: jsPDF, filePath: string, x: number, y: number, w: number, h: number
): Promise<boolean> {
  try {
    const buf = await readFile(getUploadPath(filePath));
    const ext = path.extname(filePath).toLowerCase();
    const fmt = ext === '.png' ? 'PNG' : 'JPEG';
    doc.addImage(
      `data:image/${fmt.toLowerCase()};base64,${buf.toString('base64')}`,
      fmt, x, y, w, h
    );
    return true;
  } catch { return false; }
}

function isPrismaValidationError(e: unknown): boolean {
  return (e as { name?: string })?.name === 'PrismaClientValidationError' ||
    (e as { constructor?: { name?: string } })?.constructor?.name === 'PrismaClientValidationError';
}

type MomentRow = {
  photoPath: string | null;
  photos?: { photoPath: string }[];
  vignette: string | null;
  transcript: string | null;
  recordedAt: Date;
};
function getPhotoPaths(m: MomentRow): string[] {
  if (m.photos?.length) return m.photos.map(p => p.photoPath);
  if (m.photoPath) return [m.photoPath];
  return [];
}

// ═══════════════════════════════════════════════════════════════════════════
// SCENE WATERMARK ENGINE — content-aware illustrations drawn per theme
// All scenes are drawn at ~13 % colour density behind the photo & text.
// Visible zones: top strip (y 0-17), side margins (x 0-15 / 195-210),
// bottom text zone (y 165-285).
// ═══════════════════════════════════════════════════════════════════════════

function drawPageWatermark(doc: jsPDF, decor: PageDecor) {
  const accent = hex2rgb(decor.accentColor);
  const wc: RGB = tint(accent, 0.87);       // 13 % colour
  sf(doc, wc); sd(doc, wc); doc.setLineWidth(0.5);

  const ctx = (decor.theme + ' ' + decor.icons.join(' ')).toLowerCase();

  if      (/beach|hawaii|tropic|ocean|coast|surf|island|carib/.test(ctx)) drawSceneBeach(doc, wc);
  else if (/alp|mountain|ski|winter|snow|glacier|peak/.test(ctx))         drawSceneMountain(doc, wc);
  else if (/wedding|romance|honeymoon|love|anniversar|bridal/.test(ctx))  drawSceneRomance(doc, wc);
  else if (/city|urban|paris|london|tokyo|travel|metro|capital/.test(ctx)) drawSceneCity(doc, wc);
  else if (/forest|nature|garden|park|countrys|camping|jungle/.test(ctx))  drawSceneNature(doc, wc);
  else                                                                      drawSceneGeneric(doc, wc);
}

// ── BEACH / HAWAII ─────────────────────────────────────────────────────────
function drawSceneBeach(doc: jsPDF, c: RGB) {
  sf(doc, c); sd(doc, c);

  // Sun — top-right corner
  doc.setLineWidth(0.5);
  doc.circle(196, 14, 18, 'S');
  for (let r = 0; r < 12; r++) {
    const a = (r * Math.PI * 2) / 12;
    doc.line(196 + Math.cos(a)*22, 14 + Math.sin(a)*22,
             196 + Math.cos(a)*30, 14 + Math.sin(a)*30);
  }

  // Palm tree — left margin, running full height
  doc.setLineWidth(0.7);
  doc.line( 5, 290,  7, 230);
  doc.line( 7, 230,  9, 165);
  doc.line( 9, 165, 10, 115);
  doc.line(10, 115, 11,  80);
  doc.setLineWidth(0.55);
  doc.line(11, 80,  -6,  62);   // far-left frond
  doc.line(11, 80,   4,  56);
  doc.line(11, 80,  18,  54);   // upward frond
  doc.line(11, 80,  28,  62);
  doc.line(11, 80,  34,  74);   // right frond
  // Coconuts
  doc.setLineWidth(0.3);
  doc.circle(12, 86, 3.2, 'F');
  doc.circle(17, 88, 2.8, 'F');
  doc.circle( 8, 89, 2.5, 'F');

  // Horizon line
  doc.setLineWidth(0.35);
  doc.line(0, 202, 210, 202);

  // Waves — 4 bands in the bottom text zone
  doc.setLineWidth(0.5);
  for (let band = 0; band < 4; band++) {
    const wy = 216 + band * 14;
    for (let x = -5; x < 215; x += 24) {
      doc.ellipse(x + 12, wy, 12, 3.5, 'S');
    }
  }

  // Starfish — bottom-left
  doc.setLineWidth(0.5);
  for (let r = 0; r < 5; r++) {
    const a = (r * Math.PI * 2) / 5 - Math.PI / 2;
    doc.line(14, 276, 14 + Math.cos(a)*10, 276 + Math.sin(a)*10);
  }
  doc.circle(14, 276, 2.8, 'F');

  // Seashell — bottom-right
  doc.circle(197, 271, 9, 'S');
  doc.ellipse(197, 271, 4.5, 9, 'S');
  doc.line(197, 262, 197, 280);

  // Fish — mid bottom zone
  doc.ellipse(148, 190, 8, 3.8, 'S');
  doc.triangle(140, 187, 140, 193, 135, 190, 'S');
  doc.circle(152, 189, 1.2, 'F');
  doc.ellipse(170, 200, 6.5, 3, 'S');
  doc.triangle(163, 198, 163, 203, 158, 200, 'S');
}

// ── MOUNTAINS / ALPS ───────────────────────────────────────────────────────
function drawSceneMountain(doc: jsPDF, c: RGB) {
  sf(doc, c); sd(doc, c);

  const pineFn = (px: number, py: number, ph: number) => {
    doc.triangle(px - ph*0.42, py, px + ph*0.42, py, px, py - ph*0.62, 'S');
    doc.triangle(px - ph*0.30, py - ph*0.30, px + ph*0.30, py - ph*0.30, px, py - ph*0.85, 'S');
    sf(doc, c); doc.rect(px - ph*0.07, py, ph*0.14, ph*0.22, 'F');
  };

  // Mountain range
  doc.setLineWidth(0.55);
  doc.triangle( -5, 268,  90, 268,  38, 118, 'S');   // left peak
  doc.triangle(105, 268, 215, 268, 168, 100, 'S');   // right peak
  doc.triangle(  25, 278, 185, 278, W/2,  88, 'S');  // centre (tallest)

  // Snow caps
  doc.setLineWidth(0.3);
  doc.triangle(28, 130, 48, 130, 38, 118, 'S');
  doc.triangle(158, 113, 178, 113, 168, 100, 'S');
  doc.triangle(W/2 - 14, 105, W/2 + 14, 105, W/2, 88, 'S');

  // Pine trees — both side margins
  doc.setLineWidth(0.45);
  pineFn(8,   290, 55);
  pineFn(8,   248, 42);
  pineFn(W-8, 290, 55);
  pineFn(W-8, 248, 42);

  // Snowflakes — scattered in top strip and side margins
  doc.setLineWidth(0.4);
  const flakes: [number, number][] = [
    [22,14],[65,22],[140,16],[190,22],
    [8,55],[W-8,48],[8,105],[W-8,95],
  ];
  for (const [fx, fy] of flakes) {
    for (let r = 0; r < 6; r++) {
      const a = (r * Math.PI) / 3;
      doc.line(fx, fy, fx + Math.cos(a)*5.5, fy + Math.sin(a)*5.5);
    }
    doc.circle(fx, fy, 1.2, 'F');
  }
}

// ── ROMANCE / HONEYMOON ────────────────────────────────────────────────────
function drawSceneRomance(doc: jsPDF, c: RGB) {
  sf(doc, c); sd(doc, c);

  const heartFn = (hx: number, hy: number, hs: number) => {
    sf(doc, c);
    doc.circle(hx - hs*0.5, hy - hs*0.22, hs*0.72, 'F');
    doc.circle(hx + hs*0.5, hy - hs*0.22, hs*0.72, 'F');
    doc.triangle(hx - hs, hy + hs*0.28, hx + hs, hy + hs*0.28, hx, hy + hs*1.2, 'F');
  };

  // Giant heart — page centre (visible in side margins + bottom zone as partial curves)
  doc.setLineWidth(0.55);
  const hr = 36;
  doc.circle(W/2 - hr*0.5, H/2 - hr*0.25, hr*0.76, 'S');
  doc.circle(W/2 + hr*0.5, H/2 - hr*0.25, hr*0.76, 'S');
  doc.triangle(W/2 - hr*1.24, H/2 + hr*0.3, W/2 + hr*1.24, H/2 + hr*0.3, W/2, H/2 + hr*1.42, 'S');

  // Small hearts at visible spots
  doc.setLineWidth(0.3);
  heartFn( 9,  16,  5);    heartFn(W-9,  14,  5);
  heartFn( 8, H-32, 5.5);  heartFn(W-8, H-30, 5);
  heartFn(W/2, 14, 4.5);   heartFn(8, H/2, 4);  heartFn(W-8, H/2, 4);

  // Rose — left and right margins
  doc.setLineWidth(0.45);
  const roseFn = (rx: number, ry: number) => {
    doc.line(rx, ry, rx + 2, ry - 55);
    const tx = rx + 2, ty2 = ry - 55;
    for (let p = 0; p < 5; p++) {
      const a = (p * Math.PI * 2) / 5;
      doc.circle(tx + Math.cos(a)*7, ty2 + Math.sin(a)*7, 5, 'S');
    }
    sf(doc, c); doc.circle(tx, ty2, 3.8, 'F');
    doc.ellipse(rx - 4, ry - 22, 5, 8, 'S');
  };
  roseFn(8, 285);
  roseFn(W-8, 285);

  // Wedding rings — bottom centre
  doc.setLineWidth(0.5);
  doc.circle(W/2 - 14, H - 45, 13, 'S');
  doc.circle(W/2 + 14, H - 45, 13, 'S');

  // Champagne glasses — top-right
  doc.setLineWidth(0.4);
  const glassFn = (gx: number, gy: number) => {
    doc.triangle(gx-5.5, gy, gx+5.5, gy, gx, gy+14, 'S');
    doc.line(gx, gy+14, gx, gy+20);
    doc.line(gx-5, gy+20, gx+5, gy+20);
    for (let b = 0; b < 3; b++) {
      sf(doc, c); doc.circle(gx + (b%2===0 ? -2 : 2), gy+4+b*2.5, 1, 'F');
    }
  };
  glassFn(W-22, 8);
  glassFn(W-10, 10);
}

// ── CITY / URBAN ───────────────────────────────────────────────────────────
function drawSceneCity(doc: jsPDF, c: RGB) {
  sf(doc, c); sd(doc, c);

  // Stars — top strip and side margins
  doc.setLineWidth(0.4);
  const starPos: [number, number, number][] = [
    [30,12,3.5],[70,20,3],[110,14,3.5],[150,18,3],[190,12,3.5],
    [15,38,2.5],[90,35,3],[170,32,2.8],
  ];
  for (const [sx, sy, sr] of starPos) {
    for (let r = 0; r < 4; r++) {
      const a = (r * Math.PI) / 4;
      doc.line(sx - Math.cos(a)*sr, sy - Math.sin(a)*sr, sx + Math.cos(a)*sr, sy + Math.sin(a)*sr);
    }
    sf(doc, c); doc.circle(sx, sy, sr*0.3, 'F');
  }

  // Moon — top-left
  doc.setLineWidth(0.5);
  doc.circle(16, 18, 12, 'S');

  // Skyline — bottom zone
  doc.setLineWidth(0.45);
  const skyline: [number, number, number][] = [
    [0,20,78],[22,16,62],[40,26,98],[68,14,68],
    [84,22,88],[108,18,63],[128,28,108],[158,16,72],[176,20,58],[198,12,50],
  ];
  const ground = H - 12;
  for (const [bx, bw, bh] of skyline) {
    doc.rect(bx, ground - bh, bw, bh, 'S');
    // Windows
    doc.setLineWidth(0.2);
    const cols = Math.max(1, Math.floor(bw / 8));
    const rows = Math.max(1, Math.floor(bh / 18));
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        doc.rect(
          bx + 2.5 + col * (bw - 3) / cols,
          ground - bh + 5 + r * (bh - 8) / rows,
          2.5, 3.5, 'S'
        );
      }
    }
    doc.setLineWidth(0.45);
  }

  // Bicycle — bottom-right margin
  doc.setLineWidth(0.5);
  const bcx = W - 12, bcy = H - 45;
  doc.circle(bcx - 9,  bcy, 7.5, 'S');
  doc.circle(bcx + 9,  bcy, 7.5, 'S');
  doc.line(bcx - 9, bcy, bcx,    bcy - 9);
  doc.line(bcx,     bcy - 9, bcx + 9, bcy);
  doc.line(bcx,     bcy - 9, bcx - 2, bcy + 1);
  doc.line(bcx - 3.5, bcy - 9, bcx + 3.5, bcy - 9);
}

// ── NATURE / FOREST ────────────────────────────────────────────────────────
function drawSceneNature(doc: jsPDF, c: RGB) {
  sf(doc, c); sd(doc, c);

  const treeFn = (tx: number, ty: number, th: number) => {
    doc.triangle(tx - th*0.44, ty, tx + th*0.44, ty, tx, ty - th*0.68, 'S');
    doc.triangle(tx - th*0.32, ty - th*0.28, tx + th*0.32, ty - th*0.28, tx, ty - th*0.9, 'S');
    sf(doc, c); doc.rect(tx - th*0.08, ty, th*0.16, th*0.24, 'F');
  };

  doc.setLineWidth(0.5);
  treeFn(8,    H-10, 58); treeFn(22,   H-10, 44);
  treeFn(W-8,  H-10, 58); treeFn(W-22, H-10, 44);
  treeFn(W/2,  H-10, 52);

  // Flowers — bottom zone
  doc.setLineWidth(0.4);
  const flowerFn = (fx: number, fy: number, fr: number) => {
    for (let p = 0; p < 6; p++) {
      const a = (p * Math.PI * 2) / 6;
      doc.circle(fx + Math.cos(a)*fr*1.55, fy + Math.sin(a)*fr*1.55, fr, 'S');
    }
    sf(doc, c); doc.circle(fx, fy, fr*0.85, 'F');
  };
  flowerFn(18,    H-75, 3.8); flowerFn(W-18,  H-72, 3.5);
  flowerFn(40,    H-32, 3.2); flowerFn(W-40,  H-34, 3.0);
  flowerFn(W/2-18,H-58, 3.5); flowerFn(W/2+20,H-56, 3.2);
  flowerFn(12,    H-115,3.0); flowerFn(W-12,  H-118,3.2);

  // Leaves — side margins
  doc.setLineWidth(0.4);
  const leafPos: [number, number, number, number][] = [
    [8, 55, 7, 17], [W-8, 60, 7, 17], [8, 105, 6, 15],
    [W-8,100, 6, 15],[8, 150, 7, 16], [W-8,155, 7, 16],
  ];
  for (const [lx, ly, lw, lh] of leafPos) {
    doc.ellipse(lx, ly, lw, lh, 'S');
    doc.line(lx, ly - lh, lx, ly + lh);
    doc.line(lx, ly, lx + lw*0.65, ly - lh*0.35);
    doc.line(lx, ly, lx - lw*0.65, ly - lh*0.35);
  }

  // Butterfly — top centre strip
  doc.setLineWidth(0.45);
  const bfx = W/2, bfy = 30;
  doc.ellipse(bfx-12, bfy-5, 11, 7.5, 'S');
  doc.ellipse(bfx+12, bfy-5, 11, 7.5, 'S');
  doc.ellipse(bfx-8,  bfy+5,  7,   5, 'S');
  doc.ellipse(bfx+8,  bfy+5,  7,   5, 'S');
  doc.line(bfx, bfy-12, bfx, bfy+10);
  doc.line(bfx, bfy-12, bfx-6, bfy-20);
  doc.line(bfx, bfy-12, bfx+6, bfy-20);
  sf(doc, c);
  doc.circle(bfx-6, bfy-20, 1.5, 'F');
  doc.circle(bfx+6, bfy-20, 1.5, 'F');
}

// ── GENERIC ────────────────────────────────────────────────────────────────
function drawSceneGeneric(doc: jsPDF, c: RGB) {
  sf(doc, c); sd(doc, c);

  // Corner flourishes
  doc.setLineWidth(0.4);
  const cornerFn = (ox: number, oy: number, sx: number, sy: number) => {
    for (let i = 0; i < 3; i++) {
      doc.line(ox + sx*(3+i*5), oy,            ox + sx*(3+i*5), oy + sy*(3+i*5));
      doc.line(ox,             oy + sy*(3+i*5), ox + sx*(3+i*5), oy + sy*(3+i*5));
    }
    sf(doc, c); doc.circle(ox, oy, 1.5, 'F');
  };
  cornerFn(4,   4,    1,  1);
  cornerFn(W-4, 4,   -1,  1);
  cornerFn(4,   H-4,  1, -1);
  cornerFn(W-4, H-4, -1, -1);

  // Side tick marks
  doc.setLineWidth(0.3);
  for (let y = 50; y < H - 20; y += 22) {
    doc.line(2, y, 7, y);
    doc.line(W-7, y, W-2, y);
  }

  // Centre double-circle ornament
  doc.setLineWidth(0.4);
  doc.circle(W/2, H/2, 42, 'S');
  doc.circle(W/2, H/2, 36, 'S');
  doc.line(W/2-40, H/2, W/2+40, H/2);
  doc.line(W/2, H/2-40, W/2, H/2+40);
  for (let r = 0; r < 8; r++) {
    const a = (r * Math.PI) / 4;
    sf(doc, c); doc.circle(W/2 + Math.cos(a)*39, H/2 + Math.sin(a)*39, 1.5, 'F');
  }
}


function drawFooter(doc: jsPDF, n: number, p: RGB) {
  sd(doc, tint(p, 0.6)); doc.setLineWidth(0.2);
  doc.line(M, H - 11, W - M, H - 11);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); st(doc, tint(p, 0.4));
  doc.text(String(n), W / 2, H - 5.5, { align: 'center' });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const albumId = searchParams.get('albumId');
  if (!albumId) {
    return NextResponse.json({ error: 'albumId query parameter is required' }, { status: 400 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const album = await prisma.album.findFirst({
    where: { id: albumId, userId: session.user.id },
  });
  if (!album) {
    return NextResponse.json({ error: 'Album not found' }, { status: 404 });
  }

  try {
    let moments: MomentRow[];
    try {
      moments = (await prisma.moment.findMany({
        where: { albumId },
        orderBy: { recordedAt: 'asc' },
        include: { photos: { orderBy: { sortOrder: 'asc' } } },
      })) as MomentRow[];
    } catch (includeErr) {
      if (isPrismaValidationError(includeErr)) {
        moments = (await prisma.moment.findMany({
          where: { albumId },
          orderBy: { recordedAt: 'asc' },
        })) as MomentRow[];
      } else throw includeErr;
    }

    if (moments.length === 0)
      return NextResponse.json({ error: 'No moments to export' }, { status: 400 });

    const fallbackTheme = {
      title: 'My Life Album',
      subtitle: 'Moments we keep',
      keywords: [] as string[],
      primaryColor: '#564636',
      secondaryColor: '#e8e4dc',
    };
    const texts = moments.map(m => ({ vignette: m.vignette, transcript: m.transcript }));

    // Fetch theme, foreword AND all per-page decors in parallel
    const [themeR, forewordR, ...decorResults] = await Promise.allSettled([
      getAlbumTheme(texts),
      generateAlbumForeword(texts),
      ...moments.map(m => getPageDecor(m.vignette, m.transcript)),
    ]);

    const theme = themeR.status === 'fulfilled' ? themeR.value : fallbackTheme;
    const foreword = forewordR.status === 'fulfilled'
      ? forewordR.value
      : 'These are the moments that make up a life.';
    const decors: PageDecor[] = decorResults.map(r =>
      r.status === 'fulfilled'
        ? r.value
        : { theme: 'generic', icons: ['leaf', 'star', 'heart', 'circle'], mood: 'warm', accentColor: theme.primaryColor }
    );

    const p  = hex2rgb(theme.primaryColor);
    const s2 = hex2rgb(theme.secondaryColor);
    const fmtD = (d: Date) =>
      d.toLocaleDateString('en', { month: 'long', day: 'numeric', year: 'numeric' });
    const first = new Date(moments[0].recordedAt);
    const last  = new Date(moments[moments.length - 1].recordedAt);
    const dateRange = first.toDateString() === last.toDateString()
      ? fmtD(first)
      : `${fmtD(first)} — ${fmtD(last)}`;

    const doc = new jsPDF({ format: 'a4', unit: 'mm' });

    // ══ COVER ═══════════════════════════════════════════════════════════════
    sf(doc, p); doc.rect(0, 0, W, H, 'F');
    sf(doc, s2); doc.rect(0, H * 0.70, W, H * 0.30, 'F');
    doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.4);
    doc.line(M, H * 0.70, W - M, H * 0.70);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(40); doc.setTextColor(255, 255, 255);
    const tLines = doc.splitTextToSize(theme.title.toUpperCase(), CW);
    doc.text(tLines, M, 82);
    if (theme.subtitle) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(13); doc.setTextColor(255, 255, 255);
      doc.text(theme.subtitle, M, 82 + tLines.length * 15 + 6);
    }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); st(doc, p);
    doc.text(dateRange.toUpperCase(), M, H * 0.70 + 14);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.text(
      `${moments.length} ${moments.length === 1 ? 'memory' : 'memories'}`,
      M, H * 0.70 + 22
    );
    if (theme.keywords.length) {
      doc.setFontSize(7.5);
      doc.text(theme.keywords.join('  ·  '), M, H * 0.70 + 31);
    }
    doc.setFontSize(7); st(doc, p);
    doc.text('LifeNest', W - M, H - 7, { align: 'right' });

    // ══ FOREWORD ════════════════════════════════════════════════════════════
    doc.addPage();
    sf(doc, tint(p, 0.94)); doc.rect(0, 0, W, H, 'F');
    sf(doc, p); doc.rect(0, 0, 5, H, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); st(doc, p);
    doc.text('A FEW WORDS', M + 4, 38);
    sd(doc, p); doc.setLineWidth(0.5); doc.line(M + 4, 41, M + 36, 41);
    doc.setFont('helvetica', 'bolditalic'); doc.setFontSize(12); doc.setTextColor(30, 22, 14);
    doc.text(doc.splitTextToSize(foreword, CW - 6), M + 4, 54);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); st(doc, tint(p, 0.45));
    doc.text(theme.title, M + 4, H - 20);
    drawFooter(doc, 2, p);

    // ══ MOMENT PAGES ════════════════════════════════════════════════════════
    for (let i = 0; i < moments.length; i++) {
      doc.addPage();
      const m = moments[i];
      const decor  = decors[i];
      const accent = hex2rgb(decor.accentColor);

      // Background: very light accent tint
      sf(doc, tint(accent, 0.92)); doc.rect(0, 0, W, H, 'F');

      // ── Scene watermark (drawn behind photo & text) ─────────────────────────
      drawPageWatermark(doc, decor);

      // ── Photo ────────────────────────────────────────────────────────────
      const photoTop = 17, photoH = 148;
      const paths = getPhotoPaths(m);
      if (paths.length) {
        // Drop shadow
        sf(doc, shade(accent, 0.32)); doc.rect(M + 1.5, photoTop + 1.5, CW, photoH, 'F');
        // White mat
        doc.setFillColor(255, 255, 255); doc.rect(M - 1, photoTop - 1, CW + 2, photoH + 2, 'F');
        const ok = await embedPhoto(doc, paths[0], M, photoTop, CW, photoH);
        if (!ok) { sf(doc, tint(accent, 0.5)); doc.rect(M, photoTop, CW, photoH, 'F'); }
        // Accent frame
        sd(doc, accent); doc.setLineWidth(0.75);
        doc.rect(M - 1, photoTop - 1, CW + 2, photoH + 2, 'S');
      } else {
        sf(doc, tint(accent, 0.5)); doc.rect(M, photoTop, CW, photoH, 'F');
      }

      // ── Date header bar (over photo top) ─────────────────────────────────
      sf(doc, tint(accent, 0.28)); doc.rect(M, photoTop, CW, 10, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
      st(doc, shade(accent, 0.55));
      doc.text(
        new Date(m.recordedAt).toLocaleDateString('en', {
          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        }).toUpperCase(),
        M + 3, photoTop + 6.5
      );

      // ── Text area ─────────────────────────────────────────────────────────
      let ty = photoTop + photoH + 10;

      // Accent rule
      sf(doc, accent); doc.rect(M, ty - 5, 20, 1.2, 'F');

      // Vignette
      if (m.vignette) {
        doc.setFont('helvetica', 'bolditalic'); doc.setFontSize(11); doc.setTextColor(22, 16, 10);
        const vigLines = doc.splitTextToSize(m.vignette, CW);
        const maxLines = Math.floor((H - 22 - ty) / 6.8);
        doc.text(vigLines.slice(0, maxLines), M, ty);
        ty += Math.min(vigLines.length, maxLines) * 6.8 + 5;
      }

      // Transcript
      if (m.transcript && ty < H - 24) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); st(doc, tint(accent, 0.3));
        doc.text(m.vignette ? 'EXACT WORDS' : 'TRANSCRIPT', M, ty); ty += 4.5;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(100, 90, 78);
        const txLines = doc.splitTextToSize(m.transcript, CW);
        const maxTx = Math.floor((H - 18 - ty) / 4.6);
        doc.text(txLines.slice(0, maxTx), M, ty);
      }

      // Theme badge — bottom centre, after content
      if (decor.theme && decor.theme !== 'generic') {
        const badgeW = 34, badgeH = 7.5;
        const bx = W / 2 - badgeW / 2;
        const by = H - 20;
        sf(doc, accent);
        doc.roundedRect(bx, by, badgeW, badgeH, 2, 2, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(6.2); doc.setTextColor(255, 255, 255);
        doc.text(decor.theme.toUpperCase(), W / 2, by + badgeH - 2, { align: 'center' });
      }

      drawFooter(doc, i + 3, p);
    }

    // ══ BACK COVER ══════════════════════════════════════════════════════════
    doc.addPage();
    sf(doc, p); doc.rect(0, 0, W, H, 'F');
    sf(doc, s2); doc.rect(0, 0, W, H * 0.30, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(255, 255, 255);
    doc.text(theme.title, M, H * 0.30 + 18);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(255, 255, 255);
    doc.text(dateRange, M, H * 0.30 + 28);
    if (theme.keywords.length) {
      doc.setFontSize(8);
      doc.text(theme.keywords.join('  ·  '), M, H * 0.30 + 38);
    }
    doc.setFontSize(7);
    doc.text('LifeNest — Your moments, your album', W / 2, H - 10, { align: 'center' });

    const buf = Buffer.from(doc.output('arraybuffer'));
    const filename = `lifenest-${theme.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.pdf`;
    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 });
  }
}
