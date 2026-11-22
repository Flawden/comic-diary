'use client';
/* eslint-disable @next/next/no-img-element */
import { useState, type CSSProperties } from 'react';
import { initials, type PublicAppearance } from '@/modules/appearance/policy';
export function UserAvatar({
  name,
  appearance,
  size = 56,
}: {
  name: string;
  appearance?: PublicAppearance | null;
  size?: number;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const [frameFailed, setFrameFailed] = useState<string | null>(null);
  const url = appearance?.avatarUrl,
    frame = appearance?.frameUrl;
  // Only app-owned avatar routes and the reviewed catalogue asset may render.
  const safeUrl =
    url && /^\/media\/avatars\/[a-f0-9-]{36}\.webp$/.test(url) ? url : null;
  const safeFrame =
    frame === '/avatar-frames/beta-dragon-2026.webp' ? frame : null;
  const framed = !!safeFrame && frameFailed !== safeFrame;
  return (
    <span
      className={'user-avatar' + (framed ? ' user-avatar--framed' : '')}
      style={{ '--avatar-size': size + 'px' } as CSSProperties}
      role="img"
      aria-label={'Аватар: ' + name + (framed ? ' · бета-рамка' : '')}
    >
      <span className="user-avatar-face">
        {safeUrl && failed !== safeUrl ? (
          <img
            src={safeUrl}
            alt=""
            width={256}
            height={256}
            loading="lazy"
            decoding="async"
            onError={() => setFailed(safeUrl)}
          />
        ) : (
          <span>{initials(name)}</span>
        )}
      </span>
      {framed && (
        <img
          className="user-avatar-frame"
          src={safeFrame!}
          alt=""
          aria-hidden="true"
          width={1254}
          height={1254}
          onError={() => setFrameFailed(safeFrame)}
        />
      )}
    </span>
  );
}
