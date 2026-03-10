import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { RegisterSchema } from '@/lib/schemas';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Single source of truth — same schema validates server and client
    const parsed = RegisterSchema.safeParse(body);
    if (!parsed.success) {
      const errs = parsed.error.flatten().fieldErrors;
      const message =
        errs.email?.[0] ?? errs.password?.[0] ?? errs.name?.[0] ?? 'Invalid input';
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const { email, name, password } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 409 }
      );
    }

    const hashed = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, name: name ?? null, password: hashed },
    });

    return NextResponse.json({ id: user.id, email: user.email }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
  }
}
