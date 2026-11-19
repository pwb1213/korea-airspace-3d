# Independent audit: Jeju B and Yangyang/Sokcho D

Audited the revised source geometry and the app's actual Cesium hierarchy helper. No blocking defect remains within the declared modeling scope.

## Jeju Class B

- Source: uploaded `ENR 2.2.pdf`, PDF page 1 / printed ENR 2.2 - 1, dated 27 SEP 2018.
- Independently compared the table, plan figure, and vertical profile. The 5 NM core is a full circle. The middle and outer layers follow the specified major arcs through west/north, leaving the southeastern wedge outside the shelves. They are not complete annuli.
- The RKPC ARP and all six named DMS coordinates match the source PDF exactly. Geometry keeps the published named endpoints.
- Limits match the source: SFC–10,000 ft AMSL; 1,000–10,000 ft AMSL; 2,000–10,000 ft AMSL.
- Independent point tests confirm the full core at 2 NM, the middle shelf at 7 NM, and the outer shelf at 15 NM for northern/western bearings. Southeastern test bearings 120°, 150°, and 180° are outside the two shelves.
- All three polygons are valid. The initial explicit radial-bridge method self-intersected near point 3. The revised sampler connects exact source endpoints directly to adjacent ideal-circle samples, resolving the backtracking intersection.
- Published endpoint distances differ slightly from the nominal radii. Maximum deviation is 29.6802 m and is recorded in the dataset. A tiny core/middle footprint overlap of about 1.92e-7 square degrees remains because some exact published endpoints lie inside the nominal 5 NM circle. This is a rounding-level effect; the model must not claim mathematically disjoint tiers. Middle/outer overlap is numerically negligible.

## Yangyang and Sokcho

- Yangyang's existing AIP center, 5 NM circle, and GND–3,000 ft AGL limits are unchanged. The screenshot is recorded as a cross-check.
- Sokcho retains the AIP center, 5 NM radius, and SFC–2,500 ft AGL limits. Its rendered residual excludes the existing Yangyang circle and the local image-derived P518 clipping polygon.
- The Sokcho geometry is valid, stays inside its source circle, and has no material overlap with either exclusion.
- The screenshot fit uses two manually identified airport-center pixels and a local AEQD similarity transform. The independently inspected metadata records the traced pixels, transformation, and uncertainty. Estimated screenshot circle scales differ from the AIP anchor-derived scale by about 6.5–8.6%; this is therefore an approximation rather than a surveyed or official P518 boundary.
- The feature correctly has `boundaryStatus: screenshot-approximation` and `boundarySource.approximate: true`; the airport remains marked partial/approximate. Its primary PDF link refers to the AIP radius/altitude source (ENR 2.1, PDF page 17), while notes identify the screenshot origin of the clipping edge.

## Combined dataset and viewer helper

- 31 modeled airports, 55 airport features: B 9, C 27, D 19. The obsolete missing-Jeju and missing-Sokcho issues have been removed.
- The app's actual `airportPolygonHierarchies` helper generated all 59 polygon components and preserved 16 holes. Every resulting Cesium extrusion had finite positions and nonempty indices.
- Jeju's source links resolve to `sources/enr22.pdf#page=1`; Sokcho's radius/altitude source resolves to `sources/enr21.pdf#page=17`.
- Browser visual/interaction QA was not performed because the required browser tool is unavailable.
