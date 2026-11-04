"use client";

import { useId, useState } from "react";
import { calculateAverageRating, type PersonalRatings } from "../ratings/calculate-average-rating";

const fields = [
  ["ratingPlot", "Сюжет"],
  ["ratingCharacters", "Персонажи"],
  ["ratingArt", "Рисовка"],
  ["ratingDepth", "Глубина"],
  ["ratingWorld", "Мир"],
] as const;

type RatingKey = (typeof fields)[number][0];

function RatingRow({
  name,
  label,
  value,
  onChange,
}: {
  name: RatingKey;
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const visible = hovered ?? focused ?? value ?? 0;

  return (
    <div className="wd-review-row" role="group" aria-label={label}>
      <div className="wd-review-dimension">
        <span>{label}</span>
        <small>{value === null ? "Без оценки" : `${value} из 5`}</small>
      </div>
      <div className="wd-review-controls">
        <div className="wd-review-stars" onMouseLeave={() => setHovered(null)}>
          {[1, 2, 3, 4, 5].map((score) => (
            <button
              key={score}
              type="button"
              className={`wd-review-star${score <= visible ? " is-filled" : ""}`}
              aria-label={`${label}: ${score} из 5`}
              aria-pressed={value === score}
              onMouseEnter={() => setHovered(score)}
              onFocus={() => setFocused(score)}
              onBlur={() => setFocused(null)}
              onClick={() => onChange(score)}
              data-review-choice
            >
              <span aria-hidden="true">{score <= visible ? "★" : "☆"}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="wd-review-clear"
          aria-label={`Убрать оценку: ${label}`}
          title={`Убрать оценку: ${label}`}
          disabled={value === null}
          onClick={() => { setHovered(null); setFocused(null); onChange(null); }}
          data-review-choice
        >
          ×
        </button>
      </div>
      <input type="hidden" name={name} value={value ?? ""} />
    </div>
  );
}

export function DiaryRatingFields({ ratings, personalNote = "" }: { ratings: PersonalRatings; personalNote?: string }) {
  const [values, setValues] = useState<PersonalRatings>({
    ratingPlot: ratings.ratingPlot,
    ratingCharacters: ratings.ratingCharacters,
    ratingArt: ratings.ratingArt,
    ratingDepth: ratings.ratingDepth,
    ratingWorld: ratings.ratingWorld,
  });
  const [note, setNote] = useState(personalNote);
  const groupId = useId();
  const count = fields.filter(([name]) => values[name] !== null).length;
  const average = calculateAverageRating(values);
  const dirty = fields.some(([name]) => values[name] !== ratings[name]) || note !== personalNote;

  return (
    <section className="wd-review" aria-labelledby={`${groupId}-heading`}>
      <div className="wd-review-head">
        <div>
          <p className="wd-review-eyebrow">ЛИЧНЫЙ ДНЕВНИК</p>
          <h3 id={`${groupId}-heading`}>Моя оценка произведения</h3>
          <p className="wd-review-hint">Оцените то, что важно именно вам. Можно заполнить не все критерии.</p>
        </div>
        <div className="wd-review-average" aria-live="polite" aria-atomic="true">
          <strong>{average === null ? "—" : average.toLocaleString("ru", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</strong>
          <span>{average === null ? "Без оценки" : "из 5"}</span>
          <small>Оценено {count} из 5</small>
        </div>
      </div>

      <div className="wd-review-rows">
        {fields.map(([name, label]) => (
          <RatingRow
            key={name}
            name={name}
            label={label}
            value={values[name]}
            onChange={(value) => setValues((old) => ({ ...old, [name]: value }))}
          />
        ))}
      </div>

      <label className="wd-review-note" htmlFor={`${groupId}-note`}>
        <span>Личная заметка <small>· необязательно</small></span>
        <textarea
          id={`${groupId}-note`}
          name="personalNote"
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Что запомнилось в этой истории?"
        />
      </label>
      <div className="wd-review-footer">
        <p role="status">{dirty ? "Есть несохранённые изменения" : "Оценка и заметка хранятся только в вашем дневнике"}</p>
        {dirty && <button type="submit" className="tea-primary">Сохранить оценку и заметку</button>}
      </div>
    </section>
  );
}
