"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/shared/components/ui/Button";
import { CoverImage } from "@/shared/components/media/CoverImage";

type Comic = {
  id: number;
  title: string;
  slug: string;
  coverUrl: string | null;
  publicationStatus: "PUBLISHED" | "HIDDEN" | "ARCHIVED";
  categorySlug: string | null;
  categoryName: string | null;
  chapters: { id: number }[];
};

const PAGE_SIZE = 20;
const statusLabel: Record<Comic["publicationStatus"], string> = {
  PUBLISHED: "Опубликован",
  HIDDEN: "Скрыт",
  ARCHIVED: "Архив",
};

/**
 * A focused workspace instead of many expanded forms. All editor forms stay
 * mounted in `children`: switching titles, search or pagination never loses
 * the editor's unsaved input.
 */
export function AdminComicList({ comics, categories, locked, children, onSelectionChange, onCreate }: {
  comics: Comic[];
  categories: { slug: string; name: string }[];
  locked: boolean;
  children: (selectedId: number | null) => ReactNode;
  onSelectionChange?: (currentId: number | null) => boolean | Promise<boolean>;
  onCreate?: () => void;
}) {
  const id = useId();
  const [selectedId, setSelectedId] = useState<number | null>(comics[0]?.id ?? null);
  // On mobile, selecting a work opens its editor as a separate screen.
  // Desktop retains its existing side-by-side editor and initial selection.
  const [mobileEditorOpen, setMobileEditorOpen] = useState(false);
  const navigatorRef = useRef<HTMLElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const firstSelectionRender = useRef(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [category, setCategory] = useState("ALL");
  const [page, setPage] = useState(1);
  const query = search.trim().toLocaleLowerCase("ru");
  const filtered = comics.filter(comic =>
    (status === "ALL" || comic.publicationStatus === status) &&
    (category === "ALL" || (category === "UNCATEGORIZED" ? comic.categorySlug === null : `category:${comic.categorySlug}` === category)) &&
    (!query || `${comic.title} ${comic.slug}`.toLocaleLowerCase("ru").includes(query))
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);
  const fieldClass = "admin-studio-filter";

  async function choose(next: number | null) {
    if (locked) return;
    if (selectedId === next) {
      // The first work may already be selected on desktop. Its mobile editor
      // must still open when the user explicitly taps the card.
      if (next !== null) setMobileEditorOpen(true);
      return;
    }
    if (await onSelectionChange?.(selectedId) === false) return;
    setSelectedId(next);
    setMobileEditorOpen(next !== null);
  }
  async function returnToList() {
    if (locked) return;
    // Keep the existing unsaved-change confirmation/discard behavior.
    if (await onSelectionChange?.(selectedId) === false) return;
    setMobileEditorOpen(false);
  }
  useEffect(() => {
    if (firstSelectionRender.current) {
      firstSelectionRender.current = false;
      return;
    }
    if (!window.matchMedia("(max-width: 760px)").matches) return;
    const frame = window.requestAnimationFrame(() => {
      const target = mobileEditorOpen ? editorRef.current : navigatorRef.current;
      target?.scrollIntoView({ block: "start", behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [mobileEditorOpen, selectedId]);
  function reset() {
    setSearch(""); setStatus("ALL"); setCategory("ALL"); setPage(1);
  }

  return (
    <div className={`admin-studio-layout${mobileEditorOpen ? " is-mobile-editing" : ""}`}>
      <aside ref={navigatorRef} className="admin-studio-navigator" aria-label="Список произведений">
        <div className="admin-studio-navigator-heading">
          <div>
            <h2>Произведения</h2>
            <p>Каталог · {comics.length}</p>
          </div>
          <Button disabled={locked} onClick={() => onCreate ? onCreate() : void choose(null)} className="admin-studio-add-button">
            + Добавить
          </Button>
        </div>
        <div className="admin-studio-filters">
          <label htmlFor={`${id}-search`}>Поиск
            <input id={`${id}-search`} type="search" value={search} disabled={locked} maxLength={255}
              placeholder="Название или slug" className={fieldClass}
              onChange={event => { setSearch(event.target.value); setPage(1); }} />
          </label>
          <div className="admin-studio-filter-row">
            <label htmlFor={`${id}-status`}>Статус
              <select id={`${id}-status`} value={status} disabled={locked} className={fieldClass}
                onChange={event => { setStatus(event.target.value); setPage(1); }}>
                <option value="ALL">Все статусы</option>
                <option value="PUBLISHED">Опубликован</option>
                <option value="HIDDEN">Скрыт</option>
                <option value="ARCHIVED">Архив</option>
              </select>
            </label>
            <label htmlFor={`${id}-category`}>Категория
              <select id={`${id}-category`} value={category} disabled={locked} className={fieldClass}
                onChange={event => { setCategory(event.target.value); setPage(1); }}>
                <option value="ALL">Все</option>
                <option value="UNCATEGORIZED">Без категории</option>
                {categories.map(item => <option key={item.slug} value={`category:${item.slug}`}>{item.name}</option>)}
              </select>
            </label>
          </div>
        </div>
        <div className="admin-studio-count" role="status">
          <span>Найдено: {filtered.length}</span>
          <button type="button" disabled={locked} onClick={reset}>Сбросить</button>
        </div>
        {locked && <p className="admin-studio-lock-note">Дождитесь завершения операции, чтобы выбрать другое произведение.</p>}
        <div className="admin-studio-items">
          {visible.map(comic => (
            <button type="button" key={comic.id} disabled={locked}
              aria-pressed={selectedId === comic.id}
              className={`admin-studio-item${selectedId === comic.id ? " is-selected" : ""}`}
              onClick={() => choose(comic.id)}>
              <CoverImage src={comic.coverUrl} alt="" className="admin-studio-item-cover" fallback="Нет обложки" />
              <span className="admin-studio-item-body">
                <strong>{comic.title}</strong>
                <span className="admin-studio-item-slug">{comic.slug}</span>
                <span className="admin-studio-item-meta">
                  <span className={`admin-studio-status admin-studio-status-${comic.publicationStatus.toLowerCase()}`}>
                    {statusLabel[comic.publicationStatus]}
                  </span>
                </span>
                <span className="admin-studio-item-sub">{comic.categoryName ?? "Без категории"} · {comic.chapters.length} гл.</span>
              </span>
            </button>
          ))}
          {!visible.length && <p className="admin-studio-empty">Ничего не найдено. Измените условия поиска.</p>}
        </div>
        {pages > 1 && <nav aria-label="Страницы каталога" className="admin-studio-pages">
          <Button size="sm" variant="secondary" disabled={locked || currentPage === 1}
            onClick={() => setPage(currentPage - 1)}>←</Button>
          <span>{currentPage} / {pages}</span>
          <Button size="sm" variant="secondary" disabled={locked || currentPage === pages}
            onClick={() => setPage(currentPage + 1)}>→</Button>
        </nav>}
      </aside>
      <div ref={editorRef} className="admin-studio-editor" aria-label="Редактор произведения">
        {mobileEditorOpen && selectedId !== null ? (
          <button type="button" className="admin-studio-return-to-list"
            disabled={locked} onClick={() => void returnToList()}>
            ← К списку произведений
          </button>
        ) : null}
        {children(selectedId)}
      </div>
    </div>
  );
}
