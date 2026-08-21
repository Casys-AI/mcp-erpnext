import type { ChartData, ChartType } from "./types.ts";

/**
 * Jeux de données de relecture, un par type de graphe.
 *
 * `?fixture=1` sert le bar d'origine ; `?fixture=<type>` sert le type nommé.
 * Les données reprennent celles de la galerie de la maquette (section J du
 * fichier « Etats et graphiques ») — Roulements / Courroies / Joints, les six
 * axes du radar — pour que la comparaison se fasse à l'identique et non sur
 * des chiffres inventés.
 *
 * Aucune couleur imposée nulle part : une série seule prend l'accent, des
 * séries multiples prennent la palette catégorielle dans l'ordre.
 */

const MONTHS = ["Mar", "Apr", "May", "Jun", "Jul", "Aug"];
const FAMILIES = ["Roulements", "Courroies", "Joints", "Divers"];

const CA = [18_400, 19_200, 17_650, 21_300, 20_800, 24_100];
const COMMANDES = [42, 47, 39, 55, 51, 63];
const OBJECTIF = [20_000, 20_000, 20_000, 22_000, 22_000, 22_000];

const base = (type: ChartType, title: string, subtitle: string): ChartData => ({
  title,
  subtitle,
  type,
  labels: MONTHS,
  datasets: [],
  currency: "EUR",
  _drillDown: "Show sales invoices for {label}",
});

export const CHART_FIXTURES: Record<ChartType, ChartData> = {
  bar: {
    ...base("bar", "Revenue Trend", "Last 6 months"),
    datasets: [{ label: "Revenue", values: CA, showDots: true }],
    yAxisLabel: "Revenue",
  },

  "stacked-bar": {
    ...base("stacked-bar", "Commandes par famille", "6 derniers mois"),
    currency: undefined,
    datasets: [
      { label: "Roulements", values: [18, 20, 16, 24, 22, 27], stack: "a" },
      { label: "Courroies", values: [12, 14, 11, 16, 15, 19], stack: "a" },
      { label: "Joints", values: [8, 9, 8, 10, 9, 11], stack: "a" },
      { label: "Divers", values: [4, 4, 4, 5, 5, 6], stack: "a" },
    ],
  },

  "horizontal-bar": {
    ...base("horizontal-bar", "CA par famille", "Année en cours"),
    labels: FAMILIES,
    datasets: [{ label: "CA", values: [48_200, 31_700, 19_400, 8_100] }],
  },

  line: {
    ...base("line", "Revenue Trend", "Réalisé vs objectif"),
    datasets: [
      { label: "Réalisé", values: CA, showDots: true },
      { label: "Objectif", values: OBJECTIF, strokeStyle: "dashed" },
    ],
  },

  area: {
    ...base("area", "Revenue Trend", "Last 6 months"),
    datasets: [{ label: "Revenue", values: CA }],
  },

  "stacked-area": {
    ...base("stacked-area", "CA cumulé par famille", "6 derniers mois"),
    datasets: [
      {
        label: "Roulements",
        values: [9_100, 9_800, 8_900, 10_700, 10_400, 12_000],
        stack: "a",
      },
      {
        label: "Courroies",
        values: [5_600, 5_900, 5_300, 6_400, 6_300, 7_300],
        stack: "a",
      },
      {
        label: "Joints",
        values: [3_700, 3_500, 3_450, 4_200, 4_100, 4_800],
        stack: "a",
      },
    ],
  },

  composed: {
    ...base("composed", "Revenue vs Orders", "Barres + ligne, 2e axe"),
    showRightAxis: true,
    rightAxisLabel: "Commandes",
    yAxisLabel: "CA",
    datasets: [
      { label: "CA", values: CA, type: "bar" },
      {
        label: "Commandes",
        values: COMMANDES,
        type: "line",
        yAxisId: "right",
        showDots: true,
      },
    ],
  },

  pie: {
    ...base("pie", "Répartition du CA", "Par famille"),
    labels: FAMILIES,
    datasets: [{ label: "CA", values: [48_200, 31_700, 19_400, 8_100] }],
  },

  donut: {
    ...base("donut", "Répartition du CA", "Total au centre"),
    labels: FAMILIES,
    datasets: [{ label: "CA", values: [48_200, 31_700, 19_400, 8_100] }],
  },

  radar: {
    ...base("radar", "Évaluation fournisseurs", "6 axes"),
    currency: undefined,
    labels: ["délai", "prix", "qualité", "stock", "SAV", "choix"],
    datasets: [
      { label: "Fournisseur A", values: [82, 64, 91, 73, 68, 77] },
      { label: "Fournisseur B", values: [61, 88, 70, 58, 79, 66] },
    ],
  },

  scatter: {
    ...base("scatter", "Prix vs quantité", "x/y indépendants"),
    labels: [],
    xAxisLabel: "Prix unitaire",
    yAxisLabel: "Quantité",
    scatterData: [
      {
        label: "Articles",
        points: [
          { x: 12.5, y: 420, label: "BOLT-M6" },
          { x: 44, y: 96, label: "WIDGET-B" },
          { x: 18, y: 210, label: "GADGET-1" },
          { x: 3.2, y: 1_240, label: "CONN-M12F" },
          { x: 184, y: 14, label: "PCB-8CH" },
          { x: 42.5, y: 88, label: "BOX-IP67" },
          { x: 11, y: 305, label: "CABLE-10M" },
          { x: 0.15, y: 4_800, label: "BOLT-M3" },
        ],
      },
    ],
  },

  treemap: {
    ...base("treemap", "Stock par famille", "Drill-down au clic"),
    labels: [],
    treeData: [
      { name: "Roulements", value: 48_200 },
      { name: "Courroies", value: 31_700 },
      { name: "Joints", value: 19_400 },
      { name: "Divers", value: 8_100 },
      // Sous 50 px de côté, la maquette masque le libellé : on en donne un petit.
      { name: "Visserie", value: 1_900 },
    ],
  },
};

/** Le bar d'origine, pour `?fixture=1` et les tests qui l'attendent. */
export const CHART_FIXTURE: ChartData = CHART_FIXTURES.bar;

export function isFixtureMode(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(globalThis.location.search).has("fixture");
}

/**
 * La fixture demandée par l'URL.
 *
 * `?fixture=1` (ou toute valeur inconnue) rend le bar ; `?fixture=radar`
 * rend le radar. C'est ce qui permet de relire les douze types sans hôte.
 */
export function fixtureFromSearch(): ChartData {
  if (typeof window === "undefined") return CHART_FIXTURE;
  const value = new URLSearchParams(globalThis.location.search).get("fixture");
  return (value && value in CHART_FIXTURES)
    ? CHART_FIXTURES[value as ChartType]
    : CHART_FIXTURE;
}
