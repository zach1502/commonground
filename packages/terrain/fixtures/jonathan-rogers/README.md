# The recorded site data for this park

This folder holds real site data for Jonathan Rogers Park in Mount Pleasant, Vancouver. It was fetched from the live sources on 2026-09-25. It is not synthetic.

The static adapters serve these files, so the app runs with no network.

## Files

- `features.json` has the parcel and the features on it. The parcel boundary and the trees and garden come from Vancouver Open Data. The garden, building and pitch outlines come from OpenStreetMap and are marked `reviewOnly`.
- `heightmap.json` is the header for the elevation grid. It lists the size, the cell size, the source, the CRS the data was read in and the parcel polygon that sets the local frame.
- `heightmap.bin` holds the elevations as little-endian float32 values, row by row from the south-west corner.
- `raw/` holds the JSON responses as the sources sent them. Tests replay these files, so they never use the network.
- `context.json` holds the streets, sidewalks, bus stops, parking stalls and bikeways within 300 m of the parcel box, in local metres. It was fetched on 2026-10-03.
- `raw/vancouver-public-streets.json`, `raw/vancouver-sidewalk-condition-rating.json`, `raw/vancouver-bikeways.json`, `raw/vancouver-parking-meters.json`, `raw/vancouver-disability-parking.json` and `raw/vancouver-right-of-way-widths.json` are the city records behind `context.json`, fetched on 2026-10-03 (Open Government Licence - Vancouver).
- `raw/translink-stops.json` holds the 5 stops inside the area from the TransLink GTFS feed `26SEP_20261002`, read on 2026-10-03. The 16 MB zip is not stored. TransLink lets us use this data by permission.

## Grid

The grid is 176 by 86 cells at 1 m. Elevations run from 13.95 m to 23.01 m and fall from south to north.

The heights are bare-earth DTM values from NRCan HRDEM. The DSM is never used. The data was read in EPSG:3979, NAD83(CSRS) / Canada Atlas Lambert. Both the STAC item (`proj:epsg`) and the COG geokeys give this code.

The local frame is a transverse Mercator with scale 1 on the meridian through the parcel's south-west corner. Local (0, 0) is the bounding box minimum of the parcel.

## Counts

- 22 public trees, and 12 of them are over 30 cm across the trunk, so they are suggested as locked.
- 1 community garden with 56 plots.
- 3 OpenStreetMap outlines: the garden, the field house and a pitch.
- 0 records in parks special features.
- Context: 143 street pieces, 235 sidewalk pieces, 5 bus stops, 218 parking stalls and 55 bikeway pieces.

## How to fetch it again

Run these from the repo root. The first command writes `features.json`, and the second reads the parcel from it.

```sh
pnpm --filter @parkshape/terrain fetch-site --record
pnpm --filter @parkshape/terrain fetch-terrain --record --provider hrdem
pnpm --filter @parkshape/terrain fetch-context --record
```

Then check the changes with `pnpm --filter @parkshape/terrain test:live`.
