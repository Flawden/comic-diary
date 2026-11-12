"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import "./admin-category-manager.css";

type AdminCategory = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  updatedAt: string;
};

type Props = { initialCategories: AdminCategory[] };
type DialogState = { mode: "create" } | { mode: "update"; category: AdminCategory };
type ApiEnvelope = { ok?: unknown; error?: { kind?: unknown } };

function errorMessage(kind: unknown): string {
  switch (kind) {
    case "category-already-exists": return "Категория с таким адресом уже существует.";
    case "category-not-found": return "Категория больше не найдена. Обновите страницу.";
    case "invalid-catalog":
    case "invalid-category-request": return "Проверьте адрес, название и описание категории.";
    case "origin-not-allowed": return "Запрос отклонён политикой same-origin.";
    case "forbidden": return "Недостаточно прав для изменения каталога.";
    case "unauthorized": return "Сессия закончилась. Войдите снова.";
    default: return "Не удалось сохранить категорию.";
  }
}

function CategoryDialog({
  state, busy, error, onDismiss, onSave,
}: {
  state: DialogState;
  busy: boolean;
  error: string | null;
  onDismiss: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const existing = state.mode === "update" ? state.category : null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    const firstField = dialog.querySelector<HTMLInputElement>(existing ? 'input[name="name"]' : 'input[name="slug"]');
    firstField?.focus();
    return () => { if (dialog.open) dialog.close(); };
    // The dialog is remounted for every new create/edit operation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="admin-category-dialog"
      aria-labelledby="admin-category-dialog-heading"
      onCancel={event => {
        event.preventDefault();
        if (!busy) onDismiss();
      }}
      onClick={event => {
        if (event.target === event.currentTarget && !busy) onDismiss();
      }}
    >
      <div className="admin-category-dialog-heading">
        <div>
          <p className="admin-category-eyebrow">Каталог · Категории</p>
          <h2 id="admin-category-dialog-heading">
            {existing ? "Изменить категорию" : "Добавить категорию"}
          </h2>
        </div>
        <button type="button" onClick={onDismiss} disabled={busy}
          className="admin-category-dialog-close" aria-label="Закрыть окно">×</button>
      </div>

      <form onSubmit={onSave} className="admin-category-dialog-form">
        <div className="admin-category-dialog-body">
          <p className="admin-category-help">
            {existing
              ? "Название и описание можно изменить. Адрес категории сохраняется, чтобы ссылки продолжали работать."
              : "Добавьте категорию для произведений. Адрес (slug) после создания изменить нельзя."}
          </p>
          <div className="admin-category-fields">
            <label>
              <span>Адрес категории (slug)</span>
              <input name="slug" required readOnly={!!existing} maxLength={160}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                title="Используйте латинские строчные буквы, цифры и дефисы"
                defaultValue={existing?.slug ?? ""} placeholder="например, tea-stories" />
            </label>
            <label>
              <span>Название</span>
              <input name="name" required maxLength={200}
                defaultValue={existing?.name ?? ""} placeholder="Например, Чайная территория" />
            </label>
            <label>
              <span>Описание <small>необязательно</small></span>
              <textarea name="description" rows={4} defaultValue={existing?.description ?? ""}
                placeholder="О чём эта категория" />
            </label>
          </div>
          {error && <p role="alert" className="admin-category-error">{error}</p>}
        </div>
        <div className="admin-category-dialog-actions">
          <button type="button" className="admin-category-secondary" disabled={busy} onClick={onDismiss}>Отмена</button>
          <button type="submit" className="admin-category-primary" disabled={busy}>
            {busy ? "Сохранение…" : existing ? "Сохранить изменения" : "Создать категорию"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

export function AdminCategoryManager({ initialCategories }: Props) {
  const router = useRouter();
  const [activeDialog, setActiveDialog] = useState<DialogState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function openDialog(state: DialogState) {
    if (busy) return;
    setError(null);
    setMessage(null);
    setActiveDialog(state);
  }

  function dismiss() {
    if (!busy) {
      setActiveDialog(null);
      setError(null);
    }
  }

  async function saveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !activeDialog) return;
    const form = new FormData(event.currentTarget);
    const text = (name: string) => {
      const value = form.get(name);
      return typeof value === "string" ? value.trim() : "";
    };
    const existing = activeDialog.mode === "update" ? activeDialog.category : null;
    const payload = {
      slug: existing?.slug ?? text("slug"),
      name: text("name"),
      description: text("description") || null,
    };
    if (!payload.slug || !payload.name) {
      setError("Адрес и название обязательны.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/catalog/categories", {
        method: existing ? "PATCH" : "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({})) as ApiEnvelope;
      if (response.status === 401) {
        router.replace("/login?next=%2Fadmin%2Fcategories");
        router.refresh();
        return;
      }
      if (!response.ok) {
        setError(errorMessage(body.error?.kind));
        return;
      }
      setActiveDialog(null);
      setMessage(existing ? `Категория «${payload.name}» обновлена.` : `Категория «${payload.name}» создана.`);
      router.refresh();
    } catch {
      setError("Не удалось связаться с сервером.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-category-manager">
      {message && <p role="status" className="admin-category-success">{message}</p>}
      <section aria-label="Список категорий">
        <div className="admin-category-list-heading">
          <div>
            <h2>Категории</h2>
            <p>Всего: {initialCategories.length}</p>
          </div>
          <button type="button" className="admin-category-primary" onClick={() => openDialog({ mode: "create" })}>
            + Добавить категорию
          </button>
        </div>
        {initialCategories.length === 0 ? (
          <p className="admin-category-empty">Категорий пока нет. Создайте первую категорию.</p>
        ) : (
          <ul className="admin-category-list">
            {initialCategories.map(category => (
              <li key={category.id} data-category-slug={category.slug} className="admin-category-item">
                <div className="admin-category-item-content">
                  <h3>{category.name}</h3>
                  <p className="admin-category-slug">{category.slug}</p>
                  {category.description && <p className="admin-category-description">{category.description}</p>}
                </div>
                <button type="button" className="admin-category-secondary"
                  onClick={() => openDialog({ mode: "update", category })}>
                  Изменить категорию
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {activeDialog && (
        <CategoryDialog
          key={activeDialog.mode === "create" ? "create" : `edit-${activeDialog.category.id}`}
          state={activeDialog} busy={busy} error={error} onDismiss={dismiss} onSave={saveCategory}
        />
      )}
    </div>
  );
}
