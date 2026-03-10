import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { saveUpload, getUploadPath } from '@/lib/storage';
import { transcribeAudio, generateVignette } from '@/lib/ai';
import { unlink } from 'fs/promises';

interface MomentWithPhotos {
  id: string;
  albumId: string;
  photoPath: string | null;
  audioPath: string | null;
  transcript: string | null;
  vignette: string | null;
  recordedAt: Date;
  createdAt: Date;
  photos?: { id: string; photoPath: string; sortOrder: number }[];
}

function normalizeMoment(m: MomentWithPhotos) {
  const photos =
    m.photos && m.photos.length > 0
      ? m.photos.map((p) => p.photoPath)
      : m.photoPath
      ? [m.photoPath]
      : [];
  const { photos: _p, ...rest } = m;
  return { ...rest, photos };
}

async function tryUnlink(relativePath: string | null | undefined) {
  if (!relativePath) return;
  try {
    await unlink(getUploadPath(relativePath));
  } catch {
    // file may not exist — ignore
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const moment = await prisma.moment.findFirst({
      where: { id, album: { userId: session.user.id } },
      include: { photos: true },
    });
    if (!moment) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    await prisma.moment.delete({ where: { id } });
    // clean up files (non-fatal)
    await tryUnlink(moment.audioPath);
    for (const p of moment.photos) await tryUnlink(p.photoPath);
    await tryUnlink(moment.photoPath);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const existing = await prisma.moment.findFirst({
      where: { id, album: { userId: session.user.id } },
      include: { photos: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const formData = await req.formData();
    const newPhoto = formData.get('photo') as File | null;
    const newAudio = formData.get('audio') as File | null;
    const removePhoto = formData.get('removePhoto') === 'true';
    const removeAudio = formData.get('removeAudio') === 'true';

    const updates: {
      photoPath?: string | null;
      audioPath?: string | null;
      transcript?: string | null;
      vignette?: string | null;
    } = {};

    // ── Photo ────────────────────────────────────────────────────────────
    if (newPhoto && newPhoto.size > 0) {
      const newPath = await saveUpload(newPhoto, 'photos');
      updates.photoPath = newPath;
      if (existing.photos.length > 0) {
        await prisma.momentPhoto.update({
          where: { id: existing.photos[0].id },
          data: { photoPath: newPath },
        });
        await tryUnlink(existing.photos[0].photoPath);
      } else {
        await prisma.momentPhoto.create({
          data: { momentId: id, photoPath: newPath, sortOrder: 0 },
        });
      }
      await tryUnlink(existing.photoPath);
    } else if (removePhoto) {
      updates.photoPath = null;
      await prisma.momentPhoto.deleteMany({ where: { momentId: id } });
      for (const p of existing.photos) await tryUnlink(p.photoPath);
      await tryUnlink(existing.photoPath);
    }

    // ── Audio ────────────────────────────────────────────────────────────
    if (newAudio && newAudio.size > 0) {
      const audioPath = await saveUpload(newAudio, 'audio');
      updates.audioPath = audioPath;
      try {
        const transcript = await transcribeAudio(getUploadPath(audioPath));
        updates.transcript = transcript;
        updates.vignette = transcript ? await generateVignette(transcript) : null;
      } catch {
        // keep existing transcript on failure
      }
      await tryUnlink(existing.audioPath);
    } else if (removeAudio) {
      updates.audioPath = null;
      updates.transcript = null;
      updates.vignette = null;
      await tryUnlink(existing.audioPath);
    }

    const updated = await prisma.moment.update({
      where: { id },
      data: updates,
      include: { photos: { orderBy: { sortOrder: 'asc' } } },
    });

    return NextResponse.json(normalizeMoment(updated as MomentWithPhotos));
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}
