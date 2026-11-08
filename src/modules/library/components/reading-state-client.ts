export async function writeReading(
  comicId: number,
  fields: Record<string, string>,
) {
  const response = await fetch(
    "/api/library/reading-state",
    {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
      body: new URLSearchParams({
        comicId: String(comicId),
        ...fields,
      }),
    },
  );

  const result = await response.json().catch(() => null);

  if (!response.ok || result?.ok !== true) {
    throw new Error("Не удалось сохранить.");
  }
}
