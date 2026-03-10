'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { RenameAlbumSchema } from '@/lib/schemas';
import { getUploadPath } from '@/lib/storage';
import { revalidatePath } from 'next/cache';
import { unlink } from 'fs/promises';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function tryUnlink(relativePath: string | null | undefined): Promise<void> {
  if (!relativePath) return;
  try {
    await unlink(getUploadPath(relativePath));
  } catch {
    // Non-fatal — file may already be gone
  }
}

async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error('Unauthorized');
  return session.user.id;
}

// ── Album actions ─────────────────────────────────────────────────────────────

export async function renameAlbum(albumId: string, name: string): Promise<void> {
  const userId = await requireSession();
  const { name: validName } = RenameAlbumSchema.parse({ name });

  const result = await prisma.album.updateMany({
    where: { id: albumId, userId },
    data: { name: validName },
  });

  if (result.count === 0) throw new Error('Album not found');
  revalidatePath('/dashboard');
}

export async function deleteAlbum(albumId: string): Promise<void> {
  const userId = await requireSession();

  const result = await prisma.album.deleteMany({
    where: { id: albumId, userId },
  });

  if (result.count === 0) throw new Error('Album not found');
  revalidatePath('/dashboard');
}

// ── Moment actions ────────────────────────────────────────────────────────────

export async function deleteMoment(momentId: string): Promise<void> {
  const userId = await requireSession();

  const moment = await prisma.moment.findFirst({
    where: { id: momentId, album: { userId } },
    include: { photos: true },
  });

  if (!moment) throw new Error('Moment not found');

  await prisma.moment.delete({ where: { id: momentId } });

  // Clean up uploaded files — failures are non-fatal
  await tryUnlink(moment.audioPath);
  await tryUnlink(moment.photoPath);
  for (const p of moment.photos) {
    await tryUnlink(p.photoPath);
  }

  revalidatePath(`/albums/${moment.albumId}`);
}
