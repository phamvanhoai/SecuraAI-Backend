import express from 'express';
import request from 'supertest';
import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ directory: '' }));
vi.mock('../src/config/env.js', async () => {
  const fs = await import('node:fs/promises');
  const os = await import('node:os');
  const paths = await import('node:path');
  state.directory = await fs.mkdtemp(paths.join(os.tmpdir(), 'secura-training-upload-'));
  return { env: { FILE_STORAGE_DIR: state.directory } };
});
import {
  parseCourseUpload,
  inspectCourseUploads,
  cleanupCourseUploads,
} from '../src/modules/training-awareness/course-material.upload.js';

const app = express();
app.post('/upload', parseCourseUpload, async (req, res) => {
  const files = Array.isArray(req.files) ? req.files : [];
  try {
    const uploads = await inspectCourseUploads(files);
    res.json({ uploads });
  } catch {
    res.status(422).json({ success: false });
  } finally {
    await cleanupCourseUploads(files);
  }
});
app.use(
  (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res
      .status(error instanceof Error && 'statusCode' in error ? Number(error.statusCode) : 422)
      .json({ success: false });
  },
);
afterAll(async () => {
  // This exact directory is created by mkdtemp above and contains only test uploads.
  await rm(state.directory, { recursive: true, force: true });
});
describe('private training uploads', () => {
  it('accepts a PDF and records its size and checksum', async () => {
    const response = await request(app)
      .post('/upload')
      .field('payload', '{}')
      .attach('00000000-0000-4000-8000-000000000001', Buffer.from('%PDF-1.7\ncontent'), {
        filename: 'lesson.pdf',
        contentType: 'application/pdf',
      });
    expect(response.status).toBe(200);
    const body: unknown = response.body;
    expect(body).toMatchObject({
      uploads: [
        {
          mimeType: 'application/pdf',
          sizeBytes: 16,
          checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
        },
      ],
    });
  });
  it('rejects a spoofed PDF and removes the temporary upload', async () => {
    const response = await request(app)
      .post('/upload')
      .attach('00000000-0000-4000-8000-000000000001', Buffer.from('not a PDF document'), {
        filename: 'lesson.pdf',
        contentType: 'application/pdf',
      });
    expect(response.status).toBe(422);
    await expect.poll(() => readdir(path.join(state.directory, 'training-materials'))).toEqual([]);
  });
  it('rejects executable extensions', async () => {
    const response = await request(app)
      .post('/upload')
      .attach('00000000-0000-4000-8000-000000000001', Buffer.from('executable'), {
        filename: 'lesson.exe',
        contentType: 'application/pdf',
      });
    expect(response.status).toBe(422);
  });
});
