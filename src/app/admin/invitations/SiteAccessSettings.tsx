"use client";
import { useRef, useState } from "react";
type Policy = {
  publicRegistration: boolean;
  betaOnly: boolean;
  revision: number;
};
const pick=(p:Policy):Policy=>({publicRegistration:p.publicRegistration,betaOnly:p.betaOnly,revision:p.revision});
export function SiteAccessSettings({ initial }: { initial: Policy }) {
  const [policy, setPolicy] = useState(pick(initial)),
    [draft, setDraft] = useState(pick(initial)),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const lock = useRef(false);
  async function reload() {
    try {
      const r = await fetch("/api/admin/site-access", { cache: "no-store" });
      if (!r.ok) throw Error();
      const p = await r.json();
      setPolicy(pick(p));
      setDraft(pick(p));
      setMessage("Настройки обновлены.");
    } catch {
      setMessage("Не удалось обновить настройки.");
    }
  }
  return (
    <section
      className="reader-panel p-5 my-6"
      aria-labelledby="site-access-title"
    >
      <h2 id="site-access-title">Регистрация и доступ</h2>
      <p className="my-3">
        Только ADMIN управляет этими настройками. Изменения действуют сразу, без
        перезапуска приложения.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (lock.current) return;
          lock.current = true;
          setBusy(true);
          setMessage("");
          try {
            const r = await fetch("/api/admin/site-access", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...draft, revision: policy.revision }),
            });
            if (!r.ok) {
              setMessage(
                r.status === 409
                  ? "Настройки изменились или активация недоступна. Обновите данные."
                  : "Не удалось сохранить настройки.",
              );
              return;
            }
            const p = await r.json();
            setPolicy(pick(p));
            setDraft(pick(p));
            setMessage("Настройки сохранены.");
          } catch {
            setMessage("Ответ не получен. Обновите данные перед повтором.");
          } finally {
            lock.current = false;
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy} className="grid gap-5">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={draft.publicRegistration}
              onChange={(e) =>
                setDraft({ ...draft, publicRegistration: e.target.checked })
              }
            />
            <span>
              Открыть регистрацию для всех
              <small className="block">
                Когда выключено, новый аккаунт можно создать только по
                действующему приглашению. Подтверждение почты обязательно в
                обоих режимах.
              </small>
            </span>
          </label>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={draft.betaOnly}
              onChange={(e) =>
                setDraft({ ...draft, betaOnly: e.target.checked })
              }
            />
            <span>
              Пускать только участников закрытой беты
              <small className="block">
                Все остальные, включая EDITOR без отметки участника, увидят
                ожидание релиза. ADMIN сохраняет доступ. Аккаунты и данные
                сохраняются.
              </small>
            </span>
          </label>
          <p>
            Открытая регистрация не выдаёт участие в бете или рамку. Если доступ
            ограничен бетой, обычный новый аккаунт будет ожидать релиза.
          </p>
          <button className="tea-outline" type="submit">
            {busy ? "Сохраняем…" : "Сохранить режим доступа"}
          </button>
        </fieldset>
      </form>
      {message && (
        <p role="status" className="my-3">
          {message}
        </p>
      )}
      <button
        type="button"
        className="tea-text-action"
        disabled={busy}
        onClick={() => void reload()}
      >
        Обновить настройки
      </button>
    </section>
  );
}
