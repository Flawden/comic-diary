"use client";
import { useId, useState } from "react";
import { calculateAverageRating, type PersonalRatings } from "../ratings/calculate-average-rating";
const fields = [
  ["ratingPlot", "Сюжет"], ["ratingCharacters", "Персонажи"], ["ratingArt", "Рисовка"],
  ["ratingDepth", "Глубина"], ["ratingWorld", "Мир"],
] as const;
export function DiaryRatingFields({ ratings, personalNote = "" }: { ratings: PersonalRatings; personalNote?: string }) {
  const [values, setValues] = useState<PersonalRatings>({ ratingPlot: ratings.ratingPlot, ratingCharacters: ratings.ratingCharacters, ratingArt: ratings.ratingArt, ratingDepth: ratings.ratingDepth, ratingWorld: ratings.ratingWorld });
  const groupId = useId();
  const [note, setNote] = useState(personalNote);
  const dirty = fields.some(([name]) => values[name] !== ratings[name]) || note !== personalNote;
  const average = calculateAverageRating(values);
  const count = fields.filter(([name]) => values[name] !== null).length;
  return <div className="diary-rating-fields diary-editor-v4">
    <details className="wd-edit"><summary>Моя оценка тайтла <b>{average===null?"Оценить ›":"★ "+average.toLocaleString("ru",{maximumFractionDigits:1})}</b></summary>
    {fields.map(([name, label]) => <div className="rating-row-v4" role="group" aria-labelledby={`${groupId}-${name}`} key={name}>
      <span className="rating-label-v4" id={`${groupId}-${name}`}>{label}</span>
      <div className="rating-options">
        {[1,2,3,4,5].map(value => <label key={value} className={`rating-star ${value <= (values[name] ?? 0) ? "is-filled" : ""}`}>
          <input type="radio" name={name} value={value} checked={values[name] === value} onChange={() => setValues(old => ({...old, [name]: value}))} aria-label={`${label}: ${value} из 5`} />
          <span aria-hidden="true">{value <= (values[name] ?? 0) ? "★" : "☆"}</span>
        </label>)}
        <label className="rating-clear"><input type="radio" name={name} value="" checked={values[name] === null} onChange={() => setValues(old => ({...old, [name]: null}))} aria-label={`${label}: без оценки`} /><span aria-hidden="true">×</span></label>
      </div>
    </div>)}
    <p className="rating-total" aria-live="polite"><strong>{average === null ? "Без оценки" : `${average.toFixed(1)} / 5`}</strong><span>Оценено {count} из 5</span></p>
    </details>
    <details className="wd-edit"><summary>Личная заметка <b>{note?"Изменить ›":"Добавить ›"}</b></summary>
    <label className="journal-note-v4" htmlFor={`${groupId}-note`}>
      <span>Личная заметка</span>
      <textarea id={`${groupId}-note`} name="personalNote" rows={3} value={note} onChange={event => setNote(event.target.value)} placeholder="Что хочется запомнить об этой истории?" />
    </label>
    </details>
    {dirty && <div className="journal-save-v4">
      <p role="status">{dirty ? "Есть несохранённые изменения" : count === 0 && !note ? "Оцените историю или оставьте заметку" : "Оценки и заметка сохранены"}</p>
      <button type="submit" className="tea-primary">Сохранить</button>
    </div>}
  </div>;
}
