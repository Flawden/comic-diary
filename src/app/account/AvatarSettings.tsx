'use client';
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserAvatar } from '@/shared/components/UserAvatar';
import { BETA_FRAME, type PublicAppearance } from '@/modules/appearance/policy';
type State = PublicAppearance & {
  revision: number;
  selectedFrame: string | null;
  betaFrameGranted: boolean;
  frameReady: boolean;
};
export function AvatarSettings({
  name,
  initial,
}: {
  name: string;
  initial: State;
}) {
  const router = useRouter();
  const [state, setState] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [source, setSource] = useState<{
      url: string;
      file: File;
      width: number;
      height: number;
    } | null>(null),
    [zoom, setZoom] = useState(1),
    [x, setX] = useState(50),
    [y, setY] = useState(50);
  const lock = useRef(false),
    fileRef = useRef<HTMLInputElement>(null);
  const [pendingFrame, setPendingFrame] = useState<string | null | undefined>(
    undefined,
  );
  useEffect(
    () => () => {
      if (source) URL.revokeObjectURL(source.url);
    },
    [source],
  );
  const crop = source
    ? (() => {
        const size = Math.floor(Math.min(source.width, source.height) / zoom);
        return {
          size,
          left: Math.round(((source.width - size) * x) / 100),
          top: Math.round(((source.height - size) * y) / 100),
        };
      })()
    : null;
  function clear() {
    if (source) URL.revokeObjectURL(source.url);
    setSource(null);
    if (fileRef.current) fileRef.current.value = '';
  }
  async function choose(file?: File) {
    if (!file) return;
    setError('');
    setNotice('');
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      setError('Выберите JPEG, PNG или WebP размером до 5 МБ.');
      return;
    }
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      if (
        image.naturalWidth * image.naturalHeight > 16000000 ||
        Math.min(image.naturalWidth, image.naturalHeight) < 64
      )
        throw Error();
      clear();
      setZoom(1);
      setX(50);
      setY(50);
      setSource({
        url,
        file,
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    } catch {
      URL.revokeObjectURL(url);
      setError(
        'Не удалось открыть изображение. Нужно не менее 64×64 и не более 16 млн пикселей.',
      );
    }
  }
  async function perform(url: string, init: RequestInit) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const r = await fetch(url, { ...init, credentials: 'same-origin' });
      const body = await r.json();
      if (!r.ok) {
        setError(
          body.error === 'appearance_changed'
            ? 'Настройки уже изменились. Обновите данные перед повторной попыткой.'
            : body.error === 'rate_limited'
              ? 'Слишком много изменений. Попробуйте позже.'
              : 'Не удалось сохранить. Проверьте изображение и обновите данные.',
        );
        return;
      }
      setState(body);
      clear();
      setNotice('Сохранено.');
      router.refresh();
    } catch {
      setError(
        'Подтверждение не получено. Обновите данные, чтобы проверить результат. Автоматического повтора не будет.',
      );
    } finally {
      lock.current = false;
      setBusy(false);
      setPendingFrame(undefined);
    }
  }
  function chooseFrame(frame: string | null) {
    if (lock.current) return;
    setPendingFrame(frame);
    void perform('/api/account/appearance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ frame, revision: state.revision }),
    });
  }
  async function reload() {
    if (lock.current) return;
    setBusy(true);
    try {
      const r = await fetch('/api/account/appearance', { cache: 'no-store' });
      if (!r.ok) throw Error();
      setState(await r.json());
      setError('');
      router.refresh();
    } catch {
      setError('Не удалось обновить данные.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="reader-panel avatar-settings"
      aria-labelledby="avatar-settings-title"
    >
      <h2 id="avatar-settings-title">Аватар и рамка</h2>
      <div className="avatar-settings-preview">
        <UserAvatar name={name} appearance={state} size={144} />
        <p>
          Аватар и выбранная рамка видны рядом с вашими отзывами и
          комментариями.
        </p>
      </div>
      <fieldset disabled={busy} className="avatar-settings-fields">
        <legend className="sr-only">Настройки аватара</legend>
        <label className="avatar-file-label">
          Выбрать изображение
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => void choose(e.target.files?.[0])}
          />
        </label>
        <p className="avatar-help">
          JPEG, PNG, WebP · до 5 МБ · от 64×64 до 16 млн пикселей. Аватар
          публичный; исходник и метаданные не сохраняются.
        </p>
        {source && crop && (
          <div className="avatar-crop-controls">
            <h3>Обрезка аватара</h3>
            <div
              className="avatar-crop-preview"
              role="img"
              aria-label="Предпросмотр обрезки"
            >
              <img
                src={source.url}
                alt=""
                style={{
                  width: (source.width / crop.size) * 100 + '%',
                  height: (source.height / crop.size) * 100 + '%',
                  left: (-crop.left / crop.size) * 100 + '%',
                  top: (-crop.top / crop.size) * 100 + '%',
                }}
              />
            </div>
            <label>
              Масштаб
              <input
                type="range"
                min={1}
                max={Math.min(4, Math.min(source.width, source.height) / 64)}
                step={0.01}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
              />
            </label>
            <label>
              По горизонтали
              <input
                type="range"
                min={0}
                max={100}
                value={x}
                onChange={(e) => setX(Number(e.target.value))}
              />
            </label>
            <label>
              По вертикали
              <input
                type="range"
                min={0}
                max={100}
                value={y}
                onChange={(e) => setY(Number(e.target.value))}
              />
            </label>
            <div className="avatar-actions">
              <button
                type="button"
                className="tea-outline"
                onClick={() =>
                  void perform('/api/account/avatar', {
                    method: 'POST',
                    headers: {
                      'Content-Type': source.file.type,
                      'If-Match': String(state.revision),
                      'X-Avatar-Crop': JSON.stringify(crop),
                    },
                    body: source.file,
                  })
                }
              >
                Сохранить аватар
              </button>
              <button type="button" className="tea-text-action" onClick={clear}>
                Отменить обрезку
              </button>
            </div>
          </div>
        )}
        {state.avatarUrl && (
          <button
            type="button"
            className="tea-outline"
            onClick={() =>
              void perform('/api/account/avatar', {
                method: 'DELETE',
                headers: { 'If-Match': String(state.revision) },
              })
            }
          >
            Удалить аватар
          </button>
        )}
        <h3>Рамка аватара</h3>
        <div className="avatar-frame-options">
          <label>
            <input
              type="radio"
              name="avatar-frame"
              value="none"
              checked={
                (pendingFrame === undefined
                  ? state.selectedFrame
                  : pendingFrame) === null
              }
              onChange={() => chooseFrame(null)}
            />
            Без рамки
          </label>
          {state.betaFrameGranted && (
            <label>
              <input
                type="radio"
                name="avatar-frame"
                value={BETA_FRAME}
                disabled={!state.frameReady}
                checked={
                  (pendingFrame === undefined
                    ? state.selectedFrame
                    : pendingFrame) === BETA_FRAME
                }
                onChange={() => chooseFrame(BETA_FRAME)}
              />
              <UserAvatar
                name={name}
                appearance={{
                  avatarUrl: state.avatarUrl,
                  frameUrl: state.frameReady
                    ? '/avatar-frames/beta-dragon-2026.webp'
                    : null,
                }}
                size={80}
              />
              <span>
                Бета-дракон · эксклюзив участника беты
                {!state.frameReady ? ' · готовится' : ''}
              </span>
            </label>
          )}
        </div>
        {!state.betaFrameGranted && (
          <p className="avatar-help">
            Эксклюзивная бета-рамка доступна участникам, которым администратор
            выдал награду.
          </p>
        )}
      </fieldset>
      {busy && <p role="status">Сохраняем…</p>}
      {notice && <p role="status">{notice}</p>}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="tea-outline"
            disabled={busy}
            onClick={() => void reload()}
          >
            Обновить данные
          </button>
        </div>
      )}
    </section>
  );
}
