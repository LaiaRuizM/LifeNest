import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { CreateAlbumSchema } from '@/lib/schemas';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const albums = await prisma.album.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { moments: true } } },
  });

  return NextResponse.json(albums);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = CreateAlbumSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid album name' }, { status: 400 });
  }

  const album = await prisma.album.create({
    data: {
      userId: session.user.id,
      name: parsed.data.name,
    },
    include: { _count: { select: { moments: true } } },
  });

  return NextResponse.json(album, { status: 201 });
}
