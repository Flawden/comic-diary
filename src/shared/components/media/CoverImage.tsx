"use client";

/* eslint-disable @next/next/no-img-element */

import {
  useState,
} from "react";

type CoverImageProps = {
  src?: string | null;
  alt: string;
  className?: string;
  imageClassName?: string;
  fallback?: string;
};

type CoverSourceProps = {
  src: string;
  alt: string;
  imageClassName: string;
  fallback: string;
};

function CoverFallback({
  label,
}: {
  label: string;
}) {
  return (
    <div
      className="cover-fallback flex h-full w-full items-center justify-center p-3 text-center text-xs font-medium"
    >
      <span><span className="cover-fallback-symbol" aria-hidden="true">▤</span>{label}</span>
    </div>
  );
}

function CoverSource({
  src,
  alt,
  imageClassName,
  fallback,
}: CoverSourceProps) {
  const [failed, setFailed] =
    useState(false);

  const [loaded, setLoaded] =
    useState(false);

  if (failed) {
    return (
      <CoverFallback
        label={fallback}
      />
    );
  }

  return (
    <>
      {!loaded ? (
        <div
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center bg-[var(--surface-raised)] p-3 text-center text-xs"
        >Загружаем обложку…</div>
      ) : null}

      <img
        ref={(image) => {
          // Cached images can finish before React attaches onLoad.
          if (image?.complete && image.naturalWidth > 0) setLoaded(true);
        }}
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() =>
          setLoaded(true)
        }
        onError={() =>
          setFailed(true)
        }
        className={[
          "h-full w-full object-cover",
          "transition-opacity duration-200",
          loaded
            ? "opacity-100"
            : "opacity-0",
          imageClassName,
        ].join(" ")}
      />
    </>
  );
}

export function CoverImage({
  src,
  alt,
  className = "",
  imageClassName = "",
  fallback = "Нет обложки",
}: CoverImageProps) {
  const normalized =
    src?.trim() ?? "";

  return (
    <div
      className={[
        "relative overflow-hidden",
        "bg-[var(--surface-raised)]",
        "text-[var(--text-muted)]",
        className,
      ].join(" ")}
    >
      {normalized ? (
        <CoverSource
          key={normalized}
          src={normalized}
          alt={alt}
          imageClassName={
            imageClassName
          }
          fallback={fallback}
        />
      ) : (
        <CoverFallback
          label={fallback}
        />
      )}
    </div>
  );
}
