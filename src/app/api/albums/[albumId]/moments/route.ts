import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { saveUpload, getUploadPath } from '@/lib/storage';
import { transcribeAudio, generateVignette } from '@/lib/ai';

type Params = { params: { albumId: string } };

function isPrismaValidationError(e: unknown): boolean {
  return (
    (e as { name?: string })?.name === 'PrismaClientValidationError' ||
    (e as { constructor?: { name?: string } })?.constructor?.name === 'PrismaClientValidationError'
  );
}

function normalizeMoment(m: { photoPath: string | null; photos?: { photoPath: string }[] } & Record<string, unknown>) {
  const photos =
    m.photos && Array.isArray(m.photos) && m.photos.length > 0
      ? (m.photos as { photoPath: string }[]).map((p) => p.photoPath)
      : m.photoPath
        ? [m.photoPath]
        : [];
  const { photos: _p, photoPath: __, ...rest } = m;
  return { ...rest, photos };
}

async function getAuthorizedAlbum(albumId: string, userId: string) {
  return prisma.album.findFirst({ where: { id: albumId, userId } });
}

export async function GET(_req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const album = await getAuthorizedAlbum(params.albumId, session.user.id);
  if (!album) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    let moments: Array<{ photoPath: string | null; photos?: { photoPath: string }[]; [k: string]: unknown }>;
    try {
      const result = await prisma.moment.findMany({
        where: { albumId: params.albumId },
        orderBy: { recordedAt: 'desc' },
        include: { photos: { orderBy: { sortOrder: 'asc' } } },
      });
      moments = result as typeof moments;
    } catch (includeErr) {
      if (isPrismaValidationError(includeErr)) {
        moments = (await prisma.moment.findMany({
          where: { albumId: params.albumId },
          orderBy: { recordedAt: 'desc' },
        })) as typeof moments;
      } else throw includeErr;
    }

    return NextResponse.json(moments.map(normalizeMoment));
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to load moments' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const album = await getAuthorizedAlbum(params.albumId, session.user.id);
  if (!album) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    const formData = await request.formData();
    const photoFiles = formData.getAll('photo') as File[];
    const photos = photoFiles.filter((f): f is File => f && typeof f === 'object' && 'size' in f && f.size > 0);
    const audio = formData.get('audio') as File | null;

    if (photos.length === 0) {
      return NextResponse.json({ error: 'At least one photo is required' }, { status: 400 });
    }

    const recordedAtRaw = formData.get('recordedAt') as string | null;
    const recordedAt = recordedAtRaw ? new Date(recordedAtRaw) : new Date();
    const photoPaths: string[] = [];
    for (const photo of photos) {
      photoPaths.push(await saveUpload(photo, 'photos'));
    }
    const firstPhotoPath = photoPaths[0];

    let audioPath: string | null = null;
    let transcript: string | null = null;
    let vignette: string | null = null;

    if (audio?.size) {
      audioPath = await saveUpload(audio, 'audio');
      const fullAudioPath = getUploadPath(audioPath);
      try {
        transcript = await transcribeAudio(fullAudioPath);
        vignette = transcript ? await generateVignette(transcript) : null;
      } catch (aiErr) {
        console.error('Transcription/vignette failed:', aiErr);
      }
    }

    let moment: { id: string; photoPath: string | null; photos?: { photoPath: string }[]; [k: string]: unknown };
    try {
      const created = await prisma.moment.create({
        data: {
          albumId: params.albumId,
          photoPath: firstPhotoPath,
          audioPath,
          transcript,
          vignette,
          recordedAt,
          photos: {
            create: photoPaths.map((p, i) => ({ photoPath: p, sortOrder: i })),
          },
        },
        include: { photos: { orderBy: { sortOrder: 'asc' } } },
      });
      moment = created as typeof moment;
    } catch (createErr) {
      if (isPrismaValidationError(createErr)) {
        moment = (await prisma.moment.create({
          data: {
            albumId: params.albumId,
            photoPath: firstPhotoPath,
            audioPath,
            transcript,
            vignette,
            recordedAt,
          },
        })) as typeof moment;
      } else throw createErr;
    }

    const photosList =
      moment.photos && Array.isArray(moment.photos)
        ? (moment.photos as { photoPath: string }[]).map((p) => p.photoPath)
        : photoPaths;
    const { photos: _p, ...rest } = moment;
    return NextResponse.json({ ...rest, photos: photosList });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to create moment' },
      { status: 500 }
    );
  }
}
