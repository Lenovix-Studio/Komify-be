import * as path from 'path';
import * as fs from 'fs/promises';
import * as sharp from 'sharp';
import { ConfigService } from '@nestjs/config';
import { NormalizedPage } from '@/types/comics';
import { BadRequestException } from 'node_modules/@nestjs/common';

export function getPageFilename(pageNumber: number): string {
  return `${String(pageNumber).padStart(3, '0')}.webp`;
}

export const transformToArray = ({
  value,
}: {
  value: unknown;
}): string[] | undefined => {
  if (!value) return undefined;
  if (Array.isArray(value))
    return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return undefined;
};

export function prepareChapterPagesPayload(
  legacyId: number | bigint,
  chapterId: string,
  chapterNumber: string,
  pages: NormalizedPage[],
  configService: ConfigService,
) {
  const STATIC_PREFIX = configService.get<string>('STATIC_PREFIX') ?? '';

  const pagesPayload: {
    chapter_id: string;
    page_number: number;
    filename: string;
    filepath: string;
    filesize: bigint;
  }[] = [];

  for (const page of pages) {
    const filename = getPageFilename(page.pageNumber);
    const filepath = `${STATIC_PREFIX}/${legacyId}/chapters/${chapterNumber}/${filename}`;

    pagesPayload.push({
      chapter_id: chapterId,
      page_number: page.pageNumber,
      filename,
      filepath,
      filesize: BigInt(page.buffer?.length ?? 0),
    });
  }

  return pagesPayload;
}

export async function writeChapterPagesToDisk(
  legacyId: number | bigint,
  chapterNumber: string,
  pages: NormalizedPage[],
  configService: ConfigService,
) {
  const STATIC_DIR = configService.get<string>('STATIC_DIR') ?? '';
  const chapterDir = path.join(
    STATIC_DIR,
    String(legacyId),
    'chapters',
    chapterNumber,
  );

  await fs.mkdir(chapterDir, { recursive: true });

  for (const page of pages) {
    await saveChapterPage(
      legacyId,
      chapterNumber,
      page.buffer,
      page.pageNumber,
      configService,
      {
        animated: page.animated,
      },
    );
  }
}

export async function saveChapterPage(
  legacyId: number | bigint,
  chapterNumber: string,
  buffer: Buffer,
  pageNumber: number,
  configService: ConfigService,
  options?: {
    animated?: boolean;
    quality?: number;
  },
): Promise<{
  filepath: string;
  filesize: bigint;
  filename: string;
}> {
  const STATIC_DIR = configService.get<string>('STATIC_DIR');
  const STATIC_PREFIX = configService.get<string>('STATIC_PREFIX');

  if (!STATIC_DIR || !STATIC_PREFIX) {
    throw new BadRequestException('STATIC_DIR or STATIC_PREFIX missing');
  }

  const baseDir = path.join(
    STATIC_DIR,
    String(legacyId),
    'chapters',
    chapterNumber,
  );

  const filename = getPageFilename(pageNumber);
  const fullPath = path.join(baseDir, filename);
  const quality = options?.quality ?? 80;

  let webpInfo: sharp.OutputInfo;

  try {
    webpInfo = await sharp
      .default(buffer, options?.animated ? { animated: true } : {})
      .webp({ quality })
      .toFile(fullPath);
  } catch (err) {
    throw new BadRequestException(
      `Failed to convert page ${pageNumber} to WebP for chapter ${chapterNumber}`,
    );
  }

  return {
    filepath: `${STATIC_PREFIX}/${legacyId}/chapters/${chapterNumber}/${filename}`,
    filesize: BigInt(webpInfo.size),
    filename,
  };
}

export async function clearDirectoryContents(
  directoryPath: string,
): Promise<void> {
  try {
    await fs.access(directoryPath);
  } catch {
    await fs.mkdir(directoryPath, { recursive: true });
    return;
  }

  const items = await fs.readdir(directoryPath);
  for (const item of items) {
    const itemPath = path.join(directoryPath, item);
    await fs.rm(itemPath, { recursive: true, force: true });
  }
}
