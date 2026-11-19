# Independent audit — ENR 2.1 airport Class B / C / D

Audited the airport extraction files against the user-supplied `ENR 2.1.pdf` (20 PDF pages), with source-page text and rendered-page evidence. This audit concerns airport airspace, not airway Class D or the whole footprint of a mixed-class TMA.

## Final extracted coverage

| Class | Airports with modeled geometry | Vertical feature records |
| --- | ---: | ---: |
| B | 2 | 6 |
| C | 12 | 27 |
| Airport D | 15 | 18 |
| Total | 29 | 51 |

The 51 features contain 55 polygon components and 16 holes. All 55 polygon components successfully generate Cesium extruded geometry; the generated coordinates are finite and geometry indices are nonempty.

## Source and numerical checks

- Reviewed the Class B definitions on PDF page 2: Incheon and Gimpo centers, 5/10/20 NM tiers, north/south extension coordinates, and each tier's lower and upper datum. Their full upper limit is 10,000 ft AMSL; lower limits are GND, 1,000 ft AGL, and 5,000 ft AGL respectively.
- Checked all 44 Class C center and extension coordinate occurrences against their cited PDF pages. All 12 groups are supported, including Cheongju in this supplied edition. Surface extensions and outer shelves are retained with distinct lower floors.
- Reviewed Class D definitions in PDF pages 3–10 and the military CTR table on PDF page 17 (printed ENR 2.1-15). Military table Class C entries were not accidentally duplicated as airport Class D.
- All 51 GeoJSON geometries have valid, nonempty Polygon/MultiPolygon topology. All 71 rings are closed, and all 24,773 stored coordinate pairs are finite and within the regional bounds. Every nominal vertical interval has a strictly positive thickness.
- Independently reconstructed Class C coverage at 500, 1,500, 3,500 and 4,500 ft. The confirmed surface extensions remain covered at every tested level through their published 5,000 ft AGL ceiling.
- Verified Osan/Suwon overlap exclusion. Verified Cheongju/Seongmu coordinated exclusion below 4,000 ft nominal AGL without an artificial overlap.
- Verified Yeosu, Ulsan and Uljin extension floors remain 1,000 ft AGL and are not extended to ground. Their cores remain surface-based. Muan's extensions remain ground-based as published.

## Correction made during audit

The conservative Yecheon circular core is modeled only to 4,000 ft AGL because the older TMA entry has a missing numeric lower limit. The explicit east extension nevertheless reaches 5,000 ft AGL. An initial extraction removed the extension's approximately 3.8 km² overlap with the circular core at all heights, which would have lost confirmed extension coverage between 4,000 and 5,000 ft. The extraction owner corrected this before publication: below 4,000 ft, duplicate footprint is removed; from 4,000 to 5,000 ft, the full explicit extension polygon is retained. The revised JSON passes the altitude coverage checks.

## Required source limitations

- **Jeju Class B:** ENR 2.1 explicitly references ENR 2.2-1. That page is not among the supplied files; no Jeju Class B tiers are invented.
- **S1 protected area:** mixed Class B/E designation does not allocate exclusive B/E portions. Its whole polygon is not colored as Class B.
- **Sokcho airport D:** P518 and Yangyang CTR exclusions cannot be completely reconstructed from this upload. No uncertain Sokcho volume is rendered.
- **Seongmu/Cheongju:** the exact Cheongju CTR is delegated to AD 2. Seongmu uses the conservative residual outside the known Cheongju Class C surface footprint and is marked partial. It is not asserted to be the exact legal CTR boundary.
- **Yecheon circular core:** PDF page 11 literally shows an incomplete bare `AGL` lower limit. Only the unambiguous SFC–4,000 ft AGL military CTR core is modeled; the unresolved circular 4,000–5,000 ft portion outside the explicit extension remains absent.
- **Osan datum conflict:** older ENR 2.1-4 gives 2,200 ft AMSL; newer ENR 2.1-15 gives 2,200 ft AGL. The newer military CTR table is used, and both references are retained.
- AGL, GND/SFC, AMSL and FL references must remain visible in the viewer. The existing ellipsoid scene uses nominal height and does not perform terrain-following, airport-elevation, geoid or atmospheric-pressure correction. The audit does not convert AGL into AMSL.

## Reproducible checks

The independent numerical checks are in `audit_airports.py`. They use the shared local virtual environment's Shapely and pyproj packages. Cesium geometry was additionally constructed in Node using the locally bundled Cesium 1.129 implementation. Browser interaction and visual QA were not performed by this audit.
