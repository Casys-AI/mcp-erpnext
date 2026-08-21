/**
 * Regenerate shared/fonts.css — the embedded webfaces for Direction B v2.
 *
 * Each viewer ships as one self-contained HTML file inside an MCP host iframe,
 * where neither the network nor a permissive CSP is a given. So the three
 * families are fetched once, at build-authoring time, and inlined as base64
 * rather than linked at runtime.
 *
 * Variable faces (a weight *range* in the css2 query) are deliberate: one file
 * per family covers every weight the design uses, for ~104 KB raw instead of
 * ~240 KB across seven static faces.
 *
 * Usage: node fetch-fonts.mjs [--check]
 *   --check  verify shared/fonts.css matches what would be generated, and exit
 *            non-zero if it drifted. Writes nothing.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = resolve(__dirname, "shared/fonts.css");

/** Families and the weight range each must cover, per shared/tokens.css. */
const FAMILIES = [
  { name: "Space Grotesk", weights: "500..600" },
  { name: "Work Sans", weights: "400..500" },
  { name: "JetBrains Mono", weights: "400..600" },
];

/**
 * Latin subset only. Covers French (accents, œ/Œ), the euro sign, the
 * typographic dashes and the ‹ › chevrons the pagination uses.
 */
const UNICODE_RANGE = [
  "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA,",
  "U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193,",
  "U+2212, U+2215, U+FEFF, U+FFFD",
];

/** Google serves woff2 only to a browser-shaped UA; a bare fetch gets ttf. */
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0 Safari/537.36";

const HEADER = `/**
 * Direction B v2 — webfonts embarquées.
 *
 * Trois familles variables, sous-ensemble latin (couvre le français, œ/Œ, €,
 * ‹ › — ×), encodées en base64 pour rester autonomes : chaque viewer est
 * bundlé en un fichier HTML unique servi dans une iframe d'hôte MCP, où ni le
 * réseau ni la CSP ne sont acquis.
 *
 * Généré depuis fonts.googleapis.com/css2 (SIL Open Font License 1.1).
 * Ne pas éditer à la main — régénérer via \`node fetch-fonts.mjs\`.
 */
`;

async function fetchText(url) {
  const response = await fetch(url, { headers: { "User-Agent": UA } });
  if (!response.ok) {
    throw new Error(
      `FONT_CSS_FETCH_FAILED status=${response.status} url=${url}`,
    );
  }
  return response.text();
}

async function fetchBinary(url) {
  const response = await fetch(url, { headers: { "User-Agent": UA } });
  if (!response.ok) {
    throw new Error(
      `FONT_FILE_FETCH_FAILED status=${response.status} url=${url}`,
    );
  }
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Pull the `latin` @font-face blocks out of a css2 response.
 *
 * Google labels each block with a subset comment (`/* latin *\/`) and orders
 * them subset-by-subset; matching on that label is the only way to tell the
 * latin face from the cyrillic one, since the rules are otherwise identical
 * apart from their unicode-range.
 */
function extractLatinFaces(css) {
  const faces = [];
  const blockPattern = /\/\* ([^*]+) \*\/\s*(@font-face \{[\s\S]*?\})/g;
  for (const [, label, block] of css.matchAll(blockPattern)) {
    if (label.trim() !== "latin") continue;
    const family = /font-family: '([^']+)'/.exec(block)?.[1];
    const weight = /font-weight: ([^;]+);/.exec(block)?.[1];
    const url = /url\((https:\/\/[^)]+)\)/.exec(block)?.[1];
    if (!family || !weight || !url) {
      throw new Error(`FONT_FACE_UNPARSEABLE block=${block.slice(0, 120)}`);
    }
    faces.push({ family, weight, url });
  }
  return faces;
}

function renderFace({ family, weight, base64 }) {
  return `@font-face {
  font-family: "${family}";
  font-style: normal;
  font-weight: ${weight};
  font-display: swap;
  unicode-range: ${UNICODE_RANGE.join("\n    ")};
  src: url(data:font/woff2;base64,${base64}) format("woff2");
}
`;
}

async function generate() {
  const query = FAMILIES
    .map((f) => `family=${f.name.replaceAll(" ", "+")}:wght@${f.weights}`)
    .join("&");
  const css = await fetchText(
    `https://fonts.googleapis.com/css2?${query}&display=swap`,
  );

  const faces = extractLatinFaces(css);
  if (faces.length !== FAMILIES.length) {
    throw new Error(
      `FONT_FACE_COUNT_MISMATCH expected=${FAMILIES.length} got=${faces.length}`,
    );
  }

  const rendered = [];
  let rawBytes = 0;
  for (const face of faces) {
    const binary = await fetchBinary(face.url);
    rawBytes += binary.length;
    rendered.push(renderFace({ ...face, base64: binary.toString("base64") }));
  }

  return { css: [HEADER, ...rendered].join("\n"), rawBytes };
}

const check = process.argv.includes("--check");
const { css, rawBytes } = await generate();

if (check) {
  const current = readFileSync(OUTPUT, "utf8");
  if (current === css) {
    console.log("fonts.css up to date");
  } else {
    console.error("FONTS_CSS_DRIFTED run `node fetch-fonts.mjs` to regenerate");
    process.exit(1);
  }
} else {
  writeFileSync(OUTPUT, css);
  const kb = (n) => `${Math.round(n / 1024)} KB`;
  console.log(
    `shared/fonts.css written — ${FAMILIES.length} variable faces, ` +
      `${kb(rawBytes)} raw / ${kb(css.length)} inlined`,
  );
}
