import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { RenameAlbumSchema } from '@/lib/schemas';

type Params = { params: { albumId: string } };

export async function GET(_req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const album = await prisma.album.findFirst({
    where: { id: params.albumId, userId: session.user.id },
    include: { _count: { select: { moments: true } } },
  });

  if (!album) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(album);
}

export async function PATCH(request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = RenameAlbumSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.flatten().fieldErrors.name?.[0] ?? 'Invalid name';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const result = await prisma.album.updateMany({
    where: { id: params.albumId, userId: session.user.id },
    data: { name: parsed.data.name },
  });

  if (result.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await prisma.album.deleteMany({
    where: { id: params.albumId, userId: session.user.id },
  });

  if (result.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
