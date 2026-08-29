import { LibraryStat } from "@/modules/diary/components/LibraryStat";

export default function Home() {
    return (
        <main className="mx-auto min-h-screen max-w-5xl px-4 py-8 sm:px-8">
            <header className="mb-10">
                <p className="mb-2 text-sm text-[var(--muted)]">
                    Добро пожаловать
                </p>

                <h1 className="text-3xl font-bold">
                    Мой читательский дневник
                </h1>
            </header>

            <section className="mb-10">
                <h2 className="mb-4 text-xl font-semibold">
                    Читаю сейчас
                </h2>

                <article className="max-w-md rounded-2xl bg-[var(--surface)] p-5 shadow-sm">
                    <p className="mb-1 text-sm text-[var(--muted)]">
                        Текущий комикс
                    </p>

                    <h3 className="mb-4 text-xl font-semibold">
                        Огненная корона
                    </h3>

                    <div className="mb-2 flex justify-between text-sm">
                        <span>Глава 12 из 20</span>
                        <span>60%</span>
                    </div>

                    <div className="mb-5 h-2 overflow-hidden rounded-full bg-gray-200">
                        <div className="h-full w-3/5 bg-[var(--primary)]" />
                    </div>

                    <button className="rounded-xl bg-[var(--primary)] px-4 py-2 text-white">
                        Продолжить читать
                    </button>
                </article>
            </section>

            <section>
                <h2 className="mb-4 text-xl font-semibold">
                    Моя библиотека
                </h2>

                <div className="grid gap-3 sm:grid-cols-3">
                    <LibraryStat label="Читаю" value={3} />
                    <LibraryStat label="Хочу прочитать" value={12} />
                    <LibraryStat label="Прочитано" value={27} />
                </div>
            </section>
        </main>
    );
}