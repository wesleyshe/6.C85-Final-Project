const fs = require("fs");
const path = require("path");

/* =========================
   1. FILE PATHS
   ========================= */

const AGG_CSV_PATH = path.join(__dirname, "..", "data", "aggregated2020.csv");
const TRACTS_PATH = path.join(
  __dirname,
  "..",
  "data",
  "2020 Census Tracts MAPC Region.geojson"
);
const NEIGHBORHOODS_PATH = path.join(
  __dirname,
  "..",
  "data",
  "Boston_Neighborhoods.geojson.json"
);

/* =========================
   2. LOAD FILES
   ========================= */

const csvText = fs.readFileSync(AGG_CSV_PATH, "utf8");
const tractsGeojson = JSON.parse(fs.readFileSync(TRACTS_PATH, "utf8"));
const neighborhoodsGeojson = JSON.parse(fs.readFileSync(NEIGHBORHOODS_PATH, "utf8"));

/* =========================
   3. SIMPLE CSV PARSER
   ========================= */

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(",");

  return lines.slice(1).map((line) => {
    const values = line.split(",");
    const row = {};
    headers.forEach((header, i) => {
      row[header] = values[i];
    });
    return row;
  });
}

const rows = parseCSV(csvText);

/* =========================
   4. GEOMETRY HELPERS
   ========================= */

function pointInRing(point, ring) {
  const [x, y] = point;
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];

    const intersect =
      ((yi > y) !== (yj > y)) &&
      (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);

    if (intersect) inside = !inside;
  }

  return inside;
}

function pointInPolygon(point, polygonCoords) {
  if (!polygonCoords || polygonCoords.length === 0) return false;

  const outerRing = polygonCoords[0];
  if (!pointInRing(point, outerRing)) return false;

  for (let i = 1; i < polygonCoords.length; i++) {
    if (pointInRing(point, polygonCoords[i])) return false;
  }

  return true;
}

function pointInGeometry(point, geometry) {
  if (!geometry) return false;

  if (geometry.type === "Polygon") {
    return pointInPolygon(point, geometry.coordinates);
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((polygonCoords) =>
      pointInPolygon(point, polygonCoords)
    );
  }

  return false;
}

/* =========================
   5. BUILD TRACT CENTROID LOOKUP
   ========================= */

const tractCentroids = {};

tractsGeojson.features.forEach((feature) => {
  const props = feature.properties;
  const geoid = String(props.geoid);
  const lat = parseFloat(props.intptlat);
  const lon = parseFloat(props.intptlon);

  tractCentroids[geoid] = { lat, lon };
});

console.log("Loaded tract centroids:", Object.keys(tractCentroids).length);
console.log("Sample tract centroid:", Object.entries(tractCentroids)[0]);

/* =========================
   6. PREP NEIGHBORHOOD FEATURES
   ========================= */

const neighborhoodFeatures = neighborhoodsGeojson.features.map((feature) => {
  return {
    name: feature.properties.blockgr2020_ctr_neighb_name,
    geometry: feature.geometry,
  };
});

console.log("Loaded Boston neighborhoods:", neighborhoodFeatures.length);
console.log(
  "Sample neighborhoods:",
  neighborhoodFeatures.slice(0, 10).map((d) => d.name)
);

/* =========================
   7. ASSIGN EACH TRACT TO A BOSTON NEIGHBORHOOD
   ========================= */

const tractToNeighborhood = {};

for (const geoid in tractCentroids) {
  const { lat, lon } = tractCentroids[geoid];
  const point = [lon, lat]; // GeoJSON uses [lon, lat]

  for (const hood of neighborhoodFeatures) {
    if (pointInGeometry(point, hood.geometry)) {
      tractToNeighborhood[geoid] = hood.name;
      break;
    }
  }
}

console.log("Assigned tracts to neighborhoods:", Object.keys(tractToNeighborhood).length);
console.log(
  "Sample tract assignments:",
  Object.entries(tractToNeighborhood).slice(0, 10)
);

/* =========================
   8. AGGREGATE INVESTOR COUNTS TO NEIGHBORHOODS
   ========================= */

const neighborhoodMix = {};

rows.forEach((row) => {
  const tractId = String(row.ct20_id);
  const hood = tractToNeighborhood[tractId];

  if (!hood) return;

  if (!neighborhoodMix[hood]) {
    neighborhoodMix[hood] = {
      total: 0,
      nonInvestor: 0,
      small: 0,
      medium: 0,
      large: 0,
      institutional: 0,
    };
  }

  neighborhoodMix[hood].total += Number(row.num_sales_transactions || 0);
  neighborhoodMix[hood].nonInvestor += Number(row.sum_non_investor || 0);
  neighborhoodMix[hood].small += Number(row.sum_small_investor || 0);
  neighborhoodMix[hood].medium += Number(row.sum_medium_investor || 0);
  neighborhoodMix[hood].large += Number(row.sum_large_investor || 0);
  neighborhoodMix[hood].institutional += Number(row.sum_institutional_investor || 0);
});

/* =========================
   9. DIAGNOSTIC CHECK
   ========================= */

console.log("\nDiagnostic check:");
Object.entries(neighborhoodMix).forEach(([hood, d]) => {
  const categorySum =
    d.nonInvestor + d.small + d.medium + d.large + d.institutional;

  console.log(hood, {
    total: d.total,
    categorySum,
    difference: d.total - categorySum,
  });
});

/* =========================
   10. SORT OUTPUT
   ========================= */

const sortedNeighborhoodMix = Object.fromEntries(
  Object.entries(neighborhoodMix).sort((a, b) => a[0].localeCompare(b[0]))
);

/* =========================
   11. PRINT FINAL JS OBJECT
   ========================= */

console.log("\nPaste this into js/data.js:\n");
console.log(
  "const neighborhoodMix = " +
    JSON.stringify(sortedNeighborhoodMix, null, 2) +
    ";"
);
