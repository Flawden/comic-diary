"use client";
import { useState } from "react";
import { calculateAverageRating, type PersonalRatings } from "../ratings/calculate-average-rating";
const fields = [
  ["ratingPlot", "Сюжет"], ["ratingCharacters", "Персонажи"], ["ratingArt", "Рисовка"],
  ["ratingDepth", "Глубина"], ["ratingWorld", "Мир"],
] as const;
export function DiaryRatingFields({ ratings }: { ratings: PersonalRatings }) {
  const [values, setValues] = useState<PersonalRatings>({ ratingPlot: ratings.ratingPlot, ratingCharacters: ratings.ratingCharacters, ratingArt: ratings.ratingArt, ratingDepth: ratings.ratingDepth, ratingWorld: ratings.ratingWorld });
  const average = calculateAverageRating(values);
  const count = fields.filter(([name]) => values[name] !== null).length;
  return <div className="diary-rating-fields">
    {fields.map(([name, label]) => <fieldset className="rating-dimension" key={name}>
      <legend>{label}</legend>
      <div className="rating-options">
        {[1,2,3,4,5].map(value => <label key={value} className={`rating-star ${value <= (values[name] ?? 0) ? "is-filled" : ""}`}>
          <input type="radio" name={name} value={value} checked={values[name] === value} onChange={() => setValues(old => ({...old, [name]: value}))} aria-label={`${label}: ${value} из 5`} />
          <span aria-hidden="true">★</span>
        </label>)}
        <label className="rating-clear"><input type="radio" name={name} value="" checked={values[name] === null} onChange={() => setValues(old => ({...old, [name]: null}))} aria-label={`${label}: без оценки`} /><span aria-hidden="true">×</span></label>
      </div>
    </fieldset>)}
    <p className="rating-total" aria-live="polite"><strong>{average === null ? "Без оценки" : `${average.toFixed(1)} / 5`}</strong><span>Оценено {count} из 5 · сохраните изменения ниже</span></p>
  </div>;
}
