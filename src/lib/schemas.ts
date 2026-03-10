import { z } from 'zod';

// ── Auth ──────────────────────────────────────────────────────────────────────

export const RegisterSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().trim().max(100).optional(),
});

export const LoginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});

// ── Albums ────────────────────────────────────────────────────────────────────

export const CreateAlbumSchema = z.object({
  name: z.string().trim().min(1).max(100).default('My life album'),
});

export const RenameAlbumSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name is too long'),
});

// ── Inferred types (reuse anywhere — no duplication) ─────────────────────────

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type CreateAlbumInput = z.infer<typeof CreateAlbumSchema>;
export type RenameAlbumInput = z.infer<typeof RenameAlbumSchema>;
