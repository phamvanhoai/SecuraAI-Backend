import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';
import { z } from 'zod';
import { AppError } from '../../common/errors/app-error.js';

export const MAX_NOTIFICATION_IMAGE_BYTES = 192 * 1024;
const root = path.resolve(process.cwd(), 'uploads', 'notification-images');

function canonicalPng(dataUrl: string): Buffer {
  const buffer = Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64');
  if (
    buffer.length > MAX_NOTIFICATION_IMAGE_BYTES ||
    buffer.length < 33 ||
    !buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    throw new Error('Invalid PNG image');
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (!width || !height || width > 1600 || height > 1600)
    throw new Error('Image dimensions exceeded');
  const result = PNG.sync.write(PNG.sync.read(buffer, { checkCRC: true }));
  if (result.length > MAX_NOTIFICATION_IMAGE_BYTES) throw new Error('Image size exceeded');
  return result;
}

export const notificationImageSchema = z
  .strictObject({
    name: z.string().trim().min(5).max(120).refine((name) =>
      name.toLowerCase().endsWith('.png') && !name.includes('/') && !name.includes(String.fromCharCode(92)) &&
      Array.from(name).every((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)),
    dataUrl: z
      .string()
      .max(262_166)
      .regex(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/u),
  })
  .transform((image, context) => {
    try {
      return {
        name: image.name,
        dataUrl: `data:image/png;base64,${canonicalPng(image.dataUrl).toString('base64')}`,
      };
    } catch {
      context.addIssue({
        code: 'custom',
        message: 'Images must be valid PNG files up to 192 KB and 1600 pixels per side.',
      });
      return z.NEVER;
    }
  });
export const notificationImagesSchema = z.array(notificationImageSchema).max(3).optional();
export type NotificationImage = z.infer<typeof notificationImageSchema>;

const storedImageSchema = z.strictObject({
  id: z.uuid(),
  name: z.string().max(120),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
});
export type StoredNotificationImage = z.infer<typeof storedImageSchema>;
export function storedNotificationImages(value: unknown): StoredNotificationImage[] {
  const parsed = z.array(storedImageSchema).max(3).safeParse(value);
  return parsed.success ? parsed.data : [];
}
export function notificationImageFields(value: unknown) {
  return storedNotificationImages(value).map((image, index) => ({ name: image.name, index }));
}

export async function removeNotificationImages(images: StoredNotificationImage[]): Promise<void> {
  await Promise.all(
    images.map(async (image) => {
      try {
        await unlink(path.join(root, `${z.uuid().parse(image.id)}.png`));
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      }
    }),
  );
}

export async function storeNotificationImages(
  images: NotificationImage[] | undefined,
): Promise<StoredNotificationImage[]> {
  if (!images?.length) return [];
  const stored: StoredNotificationImage[] = [];
  try {
    const validated = notificationImagesSchema.parse(images) ?? [];
    await mkdir(root, { recursive: true });
    for (const image of validated) {
      const buffer = canonicalPng(image.dataUrl);
      const item = {
        id: randomUUID(),
        name: image.name,
        sha256: createHash('sha256').update(buffer).digest('hex'),
      };
      await writeFile(path.join(root, `${item.id}.png`), buffer, { flag: 'wx', mode: 0o600 });
      stored.push(item);
    }
    return stored;
  } catch (error) {
    await removeNotificationImages(stored);
    throw error;
  }
}

export async function readNotificationImage(image: StoredNotificationImage): Promise<Buffer> {
  const parsed = storedImageSchema.parse(image);
  const buffer = await readFile(path.join(root, `${parsed.id}.png`)).catch(() => {
    throw new AppError(404, 'NOTIFICATION_IMAGE_NOT_FOUND', 'The image is unavailable');
  });
  if (
    buffer.length > MAX_NOTIFICATION_IMAGE_BYTES ||
    createHash('sha256').update(buffer).digest('hex') !== parsed.sha256
  )
    throw new AppError(
      409,
      'NOTIFICATION_IMAGE_INTEGRITY_FAILED',
      'The image could not be verified',
    );
  return buffer;
}

export async function persistNotificationImages<T extends { kind: string }>(
  images: NotificationImage[] | undefined,
  save: (images: StoredNotificationImage[]) => Promise<T>,
  successKind: 'created' | 'prepared',
): Promise<T> {
  const stored = await storeNotificationImages(images);
  try {
    const result = await save(stored);
    if (result.kind !== successKind) await removeNotificationImages(stored);
    return result;
  } catch (error) {
    await removeNotificationImages(stored);
    throw error;
  }
}
