import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');

export async function ensureUploadDir(): Promise<string> {
  await mkdir(UPLOAD_DIR, { recursive: true });
  return UPLOAD_DIR;
}

export function getUploadPath(relativePath: string): string {
  return path.join(UPLOAD_DIR, relativePath);
}

export async function saveUpload(
  file: File,
  subdir: 'photos' | 'audio'
): Promise<string> {
  await ensureUploadDir();
  const ext = path.extname(file.name) || (subdir === 'audio' ? '.webm' : '.jpg');
  const relativePath = path.join(subdir, `${uuidv4()}${ext}`);
  const fullPath = path.join(UPLOAD_DIR, relativePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  const bytes = await file.arrayBuffer();
  await writeFile(fullPath, Buffer.from(bytes));
  return relativePath;
}

export function relativeToAppUrl(relativePath: string): string {
  return `/uploads/${relativePath.replace(/\\/g, '/')}`;
}
