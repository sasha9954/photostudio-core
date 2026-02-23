// Canonical list of studios (UI + navigation). Keep order stable.

export const STUDIOS = [
  {
    key: "lookbook",
    badge: "LOOKBOOK",
    title: "Лукбук",
    desc: "Каталожная съёмка одежды на модели",
    accent: "cyan",
    letter: "F",
  },
  {
    key: "product",
    badge: "PRODUCT",
    title: "Предметка",
    desc: "Товар без модели",
    accent: "green",
    letter: "P",
  },
  {
    key: "flatlay",
    badge: "FLATLAY",
    title: "Флэтлей",
    desc: "Одежда без модели, вид сверху",
    accent: "orange",
    letter: "F",
  },
  {
    key: "swim",
    badge: "SWIM",
    title: "Купальники / бельё",
    desc: "Купальники и нижнее бельё",
    accent: "pink",
    letter: "S",
  },
  {
    key: "creative",
    badge: "CREATIVE",
    title: "Креатив",
    desc: "Необычные позы и движения",
    accent: "violet",
    letter: "A",
  },
  {
    key: "portrait",
    badge: "PORTRAIT",
    title: "Портрет",
    desc: "Проф-съёмка людей",
    accent: "mint",
    letter: "M",
  },
  {
    key: "animals",
    badge: "ANIMALS",
    title: "Животные",
    desc: "Проф-съёмка животных (питомцы, студия/улица)",
    accent: "blue",
    letter: "A",
  },
  {
    key: "mirror",
    badge: "MIRROR",
    title: "Зеркало / соцсети",
    desc: "Селфи, зеркало, соцсети",
    accent: "indigo",
    letter: "M",
  },
  {
    key: "storyboard",
    badge: "STORYBOARD",
    title: "Раскадровка",
    desc: "Серия кадров для сцены",
    accent: "red",
    letter: "S",
  },
  {
    key: "food",
    badge: "FOOD",
    title: "Еда и напитки",
    desc: "Фуд-фото и напитки",
    accent: "lime",
    letter: "F",
  },
];

export function getStudioByKey(key) {
  return STUDIOS.find((s) => s.key === key) || null;
}
