import type { Provider, TopicTable } from "./types.js";

const TOPICS: TopicTable = {
  news:          { label: "Zprávy (news headlines)",  pages: ["101", "110", "111", "112", "113", "130", "131", "132"] },
  news_domestic: { label: "Z domova (domestic news)", pages: ["110", "111", "112", "113", "114", "115"] },
  news_world:    { label: "Ze světa (world news)",    pages: ["130", "131", "132", "133", "134", "135"] },
  news_regional: { label: "Z regionů (regional news)", pages: ["150", "151", "152", "153"] },
  weather:       { label: "Počasí (weather)",         pages: ["170", "171", "172", "173", "174", "178", "179", "180"] },
  sport:         { label: "Sport",                    pages: ["200", "201", "202", "203", "204", "240", "250", "280", "290", "400"] },
  economy:       { label: "Finance / ekonomika",      pages: ["500", "501", "502", "510", "520"] },
  tv_program:    { label: "TV program",               pages: ["300", "301", "302", "303", "310", "320"] },
  interests:     { label: "Zájmy / zajímavosti",      pages: ["600", "601", "610", "620", "160"] },
};

export const ct: Provider = {
  code: "ct",
  label: "ČT Teletext",
  broadcaster: "Česká televize",
  country: "CZ",
  countryName: "Czechia",
  language: "cs",
  description:
    "Public-broadcaster teletext from Czech Television (Česká televize). " +
    "Bulk JSON feed (~1 MB, all pages); 40-column fixed-width text in Czech.",
  apiUrl: "https://api-teletext.ceskatelevize.cz/pages/text",
  topics: TOPICS,
  acceptLanguage: "cs,en;q=0.9",
};
