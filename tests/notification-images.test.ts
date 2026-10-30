import { PNG } from 'pngjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const files = vi.hoisted(() => new Map<string, Buffer>());
vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(async () => undefined),
  writeFile: vi.fn(async (name: string, buffer: Buffer) => {
    files.set(name, buffer);
  }),
  readFile: vi.fn(async (name: string) => {
    const value = files.get(name);
    if (!value) throw new Error('not found');
    return value;
  }),
  unlink: vi.fn(async (name: string) => {
    files.delete(name);
  }),
}));
import {
  notificationImageSchema,
  notificationImagesSchema,
  persistNotificationImages,
  readNotificationImage,
  storeNotificationImages,
} from '../src/modules/notification-system-logs/notification-images.js';
import { renderNotificationEmail } from '../src/modules/notification-system-logs/notification-email.template.js';

function image() {
  const png = new PNG({ width: 2, height: 2 });
  png.data.fill(255);
  return {
    name: 'test.png',
    dataUrl: `data:image/png;base64,${PNG.sync.write(png).toString('base64')}`,
  };
}

describe('private notification images', () => {
  beforeEach(() => files.clear());
  it('accepts a real PNG and rejects spoofed or corrupt contents', () => {
    expect(notificationImageSchema.safeParse(image()).success).toBe(true);
    expect(
      notificationImageSchema.safeParse({
        name: 'test.png',
        dataUrl: 'data:image/png;base64,PHNjcmlwdD4=',
      }).success,
    ).toBe(false);
    expect(
      notificationImageSchema.safeParse({ ...image(), dataUrl: 'https://example.test/image.png' })
        .success,
    ).toBe(false);
    expect(notificationImageSchema.safeParse({ ...image(), name: '../test.png' }).success).toBe(
      false,
    );
    expect(notificationImageSchema.safeParse({ ...image(), name: 'test.svg' }).success).toBe(false);
  });
  it('bounds count and image dimensions before decoding', () => {
    expect(notificationImagesSchema.safeParse(Array.from({ length: 4 }, image)).success).toBe(
      false,
    );
    const buffer = PNG.sync.write(new PNG({ width: 1, height: 1 }));
    buffer.writeUInt32BE(100_000, 16);
    expect(
      notificationImageSchema.safeParse({
        name: 'large.png',
        dataUrl: `data:image/png;base64,${buffer.toString('base64')}`,
      }).success,
    ).toBe(false);
  });
  it('stores generated private identifiers and verifies integrity on reads', async () => {
    const [stored] = await storeNotificationImages([image()]);
    if (!stored) throw new Error('Expected stored image');
    expect(stored.name).toBe('test.png');
    expect(stored.id).toMatch(/^[a-f0-9-]{36}$/u);
    expect((await readNotificationImage(stored)).subarray(1, 4).toString()).toBe('PNG');
    for (const key of files.keys()) files.set(key, Buffer.from('changed'));
    await expect(readNotificationImage(stored)).rejects.toMatchObject({ statusCode: 409 });
  });
  it('removes prepared files when the database write fails or recipients are ineligible', async () => {
    await expect(
      persistNotificationImages(
        [image()],
        async () => {
          throw new Error('transaction failed');
        },
        'created',
      ),
    ).rejects.toThrow('transaction failed');
    expect(files.size).toBe(0);
    await persistNotificationImages([image()], async () => ({ kind: 'no_recipients' }), 'created');
    expect(files.size).toBe(0);
  });
  it('keeps stored files after a successful notification write', async () => {
    await persistNotificationImages(
      [image()],
      async (images) => ({ kind: 'created', images }),
      'created',
    );
    expect(files.size).toBe(1);
  });
  it('renders inline CID images while escaping attachment names', () => {
    const html = renderNotificationEmail({
      appName: 'SecuraAI',
      subject: 'Review',
      message: '<script>unsafe</script>',
      inlineImages: [{ name: 'test".png', cid: 'image-1@notification' }],
    });
    expect(html).toContain('src="cid:image-1@notification"');
    expect(html).toContain('test&quot;.png');
    expect(html).not.toContain('<script>');
  });
});
