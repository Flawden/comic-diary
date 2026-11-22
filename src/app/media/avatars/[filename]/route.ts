import { readFile } from 'node:fs/promises';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { userAppearance, users } from '@/db/schema';
import { avatarPath } from '@/modules/appearance/avatar-storage';
import { AVATAR_FILENAME } from '@/modules/appearance/policy';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(
  _request: Request,
  context: { params: Promise<{ filename: string }> },
) {
  const { filename } = await context.params;
  const headers = {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  if (!AVATAR_FILENAME.test(filename))
    return new Response(null, { status: 404, headers });
  const [ref] = await db
    .select({ id: users.id })
    .from(userAppearance)
    .innerJoin(users, eq(users.id, userAppearance.userId))
    .where(
      and(
        eq(userAppearance.avatarFilename, filename),
        eq(users.isActive, true),
      ),
    )
    .limit(1);
  if (!ref) return new Response(null, { status: 404, headers });
  try {
    return new Response(new Uint8Array(await readFile(avatarPath(filename))), {
      headers: {
        ...headers,
        'Content-Type': 'image/webp',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  } catch {
    return new Response(null, { status: 404, headers });
  }
}
