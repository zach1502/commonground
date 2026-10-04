# Catalog cost sources

These are the unit costs in `src/catalog/items` and the earthworks rates in `defaultParameters()`. All amounts are in 2026 Canadian dollars and include supply and install.

No Vancouver Park Board capital report was checked when these numbers were written, because this task had no web access. Every row is marked "estimate" with a range. The catalog uses a value inside the range. Replace a row with a cited figure when someone checks the Park Board capital plan or a tender result, and keep the range until then. The off-leash area, rain garden, drinking fountain and flowering cherry rows changed after 3 checks of public sources on 2026-10-04. Their ranges are the span all 3 estimates share.

## Trees and shrubs

| Catalog id              | Unit      | Catalog value | Source   | Range          |
| ----------------------- | --------- | ------------- | -------- | -------------- |
| `bigleaf-maple`         | per tree  | 1,200         | estimate | 800 to 1,800   |
| `red-alder`             | per tree  | 800           | estimate | 500 to 1,200   |
| `douglas-fir`           | per tree  | 1,100         | estimate | 700 to 1,600   |
| `western-red-cedar`     | per tree  | 1,100         | estimate | 700 to 1,600   |
| `garry-oak`             | per tree  | 1,500         | estimate | 1,000 to 2,500 |
| `flowering-cherry`      | per tree  | 1,000         | estimate | 700 to 1,500   |
| `vine-maple`            | per tree  | 700           | estimate | 400 to 1,000   |
| `salal`                 | per shrub | 40            | estimate | 20 to 60       |
| `red-flowering-currant` | per shrub | 60            | estimate | 30 to 90       |

Tree prices assume 6 cm caliper stock, planting, stakes and two years of watering.

## Paths, water and ground cover

| Catalog id          | Unit             | Catalog value | Source   | Range        |
| ------------------- | ---------------- | ------------- | -------- | ------------ |
| `path-asphalt`      | per square metre | 90            | estimate | 60 to 130    |
| `path-gravel`       | per square metre | 45            | estimate | 30 to 70     |
| `path-boardwalk`    | per square metre | 700           | estimate | 450 to 1,000 |
| `pond`              | per square metre | 400           | estimate | 250 to 700   |
| `rain-garden`       | per square metre | 500           | estimate | 300 to 700   |
| `lawn`              | per square metre | 15            | estimate | 8 to 25      |
| `meadow`            | per square metre | 20            | estimate | 10 to 35     |
| `plaza`             | per square metre | 300           | estimate | 200 to 500   |
| `parking-lot-small` | per square metre | 150           | estimate | 100 to 220   |
| `off-leash-area`    | per square metre | 370           | estimate | 280 to 500   |

## Play, sports and seating

| Catalog id                | Unit     | Catalog value | Source   | Range              |
| ------------------------- | -------- | ------------- | -------- | ------------------ |
| `playground-structure`    | per item | 180,000       | estimate | 120,000 to 350,000 |
| `swings`                  | per item | 35,000        | estimate | 20,000 to 60,000   |
| `spray-pad`               | per item | 250,000       | estimate | 150,000 to 500,000 |
| `outdoor-fitness-station` | per item | 40,000        | estimate | 25,000 to 80,000   |
| `basketball-half-court`   | per item | 120,000       | estimate | 80,000 to 180,000  |
| `ball-diamond-backstop`   | per item | 60,000        | estimate | 35,000 to 90,000   |
| `tennis-court`            | per item | 350,000       | estimate | 250,000 to 500,000 |
| `bench`                   | per item | 3,500         | estimate | 2,000 to 6,000     |
| `picnic-table`            | per item | 4,000         | estimate | 2,500 to 7,000     |

## Buildings and site furniture

| Catalog id          | Unit     | Catalog value | Source   | Range                |
| ------------------- | -------- | ------------- | -------- | -------------------- |
| `washroom-building` | per item | 900,000       | estimate | 600,000 to 1,500,000 |
| `path-light`        | per item | 6,000         | estimate | 4,000 to 10,000      |
| `drinking-fountain` | per item | 35,000        | estimate | 25,000 to 45,000     |
| `waste-bin`         | per item | 1,500         | estimate | 800 to 3,000         |
| `bike-rack`         | per item | 1,200         | estimate | 600 to 2,500         |

## Community garden

| Catalog id         | Unit                  | Catalog value | Source   | Range        |
| ------------------ | --------------------- | ------------- | -------- | ------------ |
| `community-garden` | per raised bed (plot) | 900           | estimate | 600 to 1,500 |

The garden price per bed includes its share of fence, gate, soil and water line.

## Earthworks rates

| Parameter   | Unit            | Default value | Source   | Range    |
| ----------- | --------------- | ------------- | -------- | -------- |
| `cutPerM3`  | per cubic metre | 25            | estimate | 15 to 40 |
| `fillPerM3` | per cubic metre | 35            | estimate | 20 to 55 |
| `haulPerM3` | per cubic metre | 20            | estimate | 10 to 35 |

## How the metrics apply these costs

The metrics engine in `src/metrics/costs.ts` prices each new element by every unit cost its entry has. A per-item cost counts once, a per-square-metre cost uses the element's area, and a per-module cost uses the raised beds that fit in the area. An existing garden kept as the baseline has it uses the plot count from its site record instead. Locked elements are existing site features, so they add no cost. Earthworks cost is cut times `cutPerM3`, plus fill times `fillPerM3`, plus the net volume times `haulPerM3`.

## Mature trunk diameters

Each tree entry has a `matureDbhCm`, which sets the protected root zone of a locked tree: 0.12 m per cm. These values are estimates for mature trees of each species. A design can give a measured `dbhCm` on a tree item instead.

| Tree              | `matureDbhCm` | Source   |
| ----------------- | ------------- | -------- |
| Bigleaf maple     | 80            | estimate |
| Red alder         | 40            | estimate |
| Douglas fir       | 90            | estimate |
| Western red cedar | 90            | estimate |
| Garry oak         | 60            | estimate |
| Flowering cherry  | 45            | estimate |
| Vine maple        | 10            | estimate |
