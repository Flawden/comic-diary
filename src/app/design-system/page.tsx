import { ChapterCard } from "@/shared/components/domain";

import {
  Badge,
  Button,
  Card,
  Section,
} from "@/shared/components/ui";

const swatches = [
  {
    label:
      "Background",
    token:
      "--cd-background",
  },
  {
    label:
      "Background soft",
    token:
      "--cd-background-soft",
  },
  {
    label:
      "Surface",
    token:
      "--cd-surface",
  },
  {
    label:
      "Elevated",
    token:
      "--cd-surface-elevated",
  },
  {
    label:
      "Primary",
    token:
      "--cd-primary",
  },
  {
    label:
      "Success",
    token:
      "--cd-success",
  },
  {
    label:
      "Warning",
    token:
      "--cd-warning",
  },
  {
    label:
      "Danger",
    token:
      "--cd-danger",
  },
  {
    label:
      "Info",
    token:
      "--cd-info",
  },
] as const;

export default function DesignSystemPage() {
  return (
    <main
      className="mx-auto min-h-screen max-w-5xl px-4 py-8 sm:px-6 sm:py-12"
    >
      <div
        className="max-w-3xl"
      >
        <Badge
          variant="primary"
        >
          R8.6 · Design System v1
        </Badge>

        <h1
          className="mt-4 text-4xl font-black tracking-tight text-[var(--cd-foreground)] sm:text-5xl"
        >
          Comic Diary
        </h1>

        <p
          className="mt-3 max-w-2xl text-base leading-7 text-[var(--cd-muted)]"
        >
          Внутренний визуальный стенд.
          Здесь проверяем токены,
          компоненты и объектную
          иерархию до миграции
          пользовательских экранов.
        </p>
      </div>

      <div
        className="mt-10 space-y-12"
      >
        <Section
          title="01 · Цвета"
          description="Базовые поверхности, акцент и семантические состояния."
        >
          <div
            className="grid grid-cols-2 gap-3 sm:grid-cols-3"
          >
            {swatches.map(
              (swatch) => (
                <Card
                  key={
                    swatch.token
                  }
                  className="p-3"
                >
                  <div
                    aria-hidden="true"
                    className="h-20 rounded-2xl border border-[var(--cd-border)]"
                    style={{
                      background:
                        `var(${swatch.token})`,
                    }}
                  />

                  <p
                    className="mt-3 text-sm font-semibold text-[var(--cd-foreground)]"
                  >
                    {swatch.label}
                  </p>

                  <code
                    className="mt-1 block break-all text-xs text-[var(--cd-muted)]"
                  >
                    {swatch.token}
                  </code>
                </Card>
              ),
            )}
          </div>
        </Section>

        <Section
          title="02 · Типографика"
          description="Иерархия важнее декоративности."
        >
          <Card
            className="space-y-5"
          >
            <div>
              <p
                className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--cd-primary-soft)]"
              >
                Display
              </p>

              <p
                className="mt-1 text-4xl font-black tracking-tight"
              >
                Чайная территория
              </p>
            </div>

            <div>
              <p
                className="text-xl font-bold"
              >
                Главы
              </p>

              <p
                className="mt-1 text-sm leading-6 text-[var(--cd-muted)]"
              >
                Объект → контекст →
                статус → действие.
              </p>
            </div>

            <p
              className="text-xs text-[var(--cd-subtle)]"
            >
              Метаданные · 28 глав ·
              обновлено сегодня
            </p>
          </Card>
        </Section>

        <Section
          title="03 · Компоненты"
          description="Первые primitives, которые будут использовать reader и admin поверхности."
        >
          <Card>
            <p
              className="text-sm font-semibold text-[var(--cd-foreground)]"
            >
              Status badges
            </p>

            <div
              className="mt-4 flex flex-wrap gap-2"
            >
              <Badge
                variant="success"
              >
                Опубликована
              </Badge>

              <Badge
                variant="warning"
              >
                Запланирована
              </Badge>

              <Badge
                variant="danger"
              >
                Архив
              </Badge>

              <Badge
                variant="info"
              >
                Информация
              </Badge>
            </div>

            <p
              className="mt-7 text-sm font-semibold text-[var(--cd-foreground)]"
            >
              Buttons
            </p>

            <div
              className="mt-4 flex flex-wrap gap-3"
            >
              <Button>
                Сохранить
              </Button>

              <Button
                variant="secondary"
              >
                Изменить
              </Button>

              <Button
                variant="ghost"
              >
                Отмена
              </Button>

              <Button
                variant="danger"
              >
                Удалить
              </Button>
            </div>
          </Card>
        </Section>

        <Section
          title="04 · Object pattern"
          description="Первый пример будущей карточки главы без изменения настоящей админки."
        >
          <Card
            className="relative overflow-hidden"
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--cd-primary)] to-transparent opacity-70"
            />

            <div
              className="flex items-start justify-between gap-4"
            >
              <div>
                <p
                  className="text-xs font-bold tracking-[0.16em] text-[var(--cd-primary-soft)]"
                >
                  004
                </p>

                <h3
                  className="mt-2 text-xl font-bold"
                >
                  Испытание
                </h3>

                <p
                  className="mt-2 text-sm text-[var(--cd-muted)]"
                >
                  Чайная территория ·
                  порядок 4
                </p>
              </div>

              <Badge
                variant="warning"
              >
                Запланирована
              </Badge>
            </div>

            <div
              className="mt-6 flex items-center justify-between gap-3 border-t border-[var(--cd-border)] pt-4"
            >
              <div
                className="flex gap-2"
                aria-label="Изменить порядок"
              >
                <Button
                  variant="ghost"
                  aria-label="Переместить выше"
                  className="min-h-10 px-3"
                >
                  ↑
                </Button>

                <Button
                  variant="ghost"
                  aria-label="Переместить ниже"
                  className="min-h-10 px-3"
                >
                  ↓
                </Button>
              </div>

              <div
                className="flex gap-2"
              >
                <Button
                  variant="secondary"
                >
                  Изменить
                </Button>

                <Button
                  variant="ghost"
                  aria-label="Другие действия"
                  className="min-h-10 px-3"
                >
                  ···
                </Button>
              </div>
            </div>
          </Card>
        </Section>
      

      <Section
        title="Domain Components"
        description="Real application objects built from UI primitives."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <ChapterCard
            number="001"
            title="Начало пути"
            pages={24}
            status="released"
            onOpen={() => {
              console.log("open chapter 001");
            }}
          />

          <ChapterCard
            number="002"
            title="Первая встреча"
            pages={32}
            status="reading"
          />
        </div>
      </Section>
</div>
    </main>
  );
}
