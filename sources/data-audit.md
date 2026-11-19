# Independent AIP data audit

Audited `/workspace/work/airways/enr31.json` and `enr32.json` against the uploaded source PDFs. No data defect found in the checks below.

- ENR 3.1: 18 routes, 114 physical segments, 221 Class A/D bands.
- ENR 3.2: 36 routes, 184 physical segments, 346 Class A/D bands.
- Total: 54 routes, 298 physical segments, 567 Class A/D bands.

## Complete numerical checks

All segment IDs are unique within their dataset. Every segment has a valid latitude/longitude inside the expected regional extent. Every DMS source coordinate exactly converts to its decimal coordinate. Every endpoint raw coordinate is present on the cited original PDF page. All route segments are continuous in source sequence. Every band has a positive altitude interval; all Class A lower bounds are at least FL200 nominal and ceilings no higher than FL600, and all Class D ceilings are at or below FL200. No empty band arrays found.

All significant point coordinates in ENR 3.2 and ENR 3.1 were captured; four ENR3.1 page3 coordinates not used as segment endpoints form a delegated-control polygon in remarks, not an airway centerline. The delegation is retained in A593 segment notes.

## Visual source spot checks

- ENR3.1 page2 A586: TENAS–PSN lower FL310; PSN–CJU low layer 8,000/9,000–10,000 ft with separately coordinated 11,000 ft–UNL layer. Gap retained.
- ENR3.1 page5 B576: SOT–CJU low layer 7,000/8,000/9,000–13,000 ft with separate FL140–UNL layer. Gap retained.
- ENR3.1 page4 B467: 10 NM lateral limit through TENAS, then 50 NM through MALSO to KANSU; FL200 lower floor in widened section, Class A/G only.
- ENR3.2 page8 Y655: TOLIS–ENSUM lower FL430; ENSUM–BONSO–ATOTI FL150–FL220. Correct A/D clipping at FL200.
- ENR3.2 page8 Y657: KWA–IGDOK–TGU 8,000–10,000 ft, Class D only.
- ENR3.2 page9 Y659: KUZ–TGU 7,000–10,000 ft; TGU–KPO lower 6,000 ft to UNL, split A/D. Verified against PDF text and page image used by extraction owner.

## Necessary interpretation limits

ENR3.2 has no lateral limits column; ±2 NM explicitly denotes RNAV2 navigation accuracy on a 95% containment basis. Keeping all RNAV widths null is correct; it must not be depicted as a measured corridor width.

ENR3.1 prints lateral limits as 8/10/50 NM without ±. The extraction explicitly records the standard total-width interpretation (half either side of centerline), rather than silently interpreting the column as each-side width. Flight levels are nominal geometric approximations in the viewer, with source datum preserved. Parenthesized MOCA is retained as metadata and is not used as the airway lower boundary.


## User-specified RNAV width model update

The original source extraction above retained all ENR3.2 widths as null. The current viewer additionally applies the user-requested visualization model: RNAV2 half-width 2 NM (total 4 NM), RNAV5 half-width 5 NM (total 10 NM). All 36 RNAV routes in these uploads are RNAV2; their 184 segments now have model width 4 NM. publishedWidthNm remains null and widthSource is user-specified-model. No RNAV5 routes were invented. Published coordinates, altitude bands, source references and conventional lateral limits remain unchanged. The model is distinct from AIP-published legal lateral limits.


## Y655 수직 범위 보완 — 2026-11-09

ENR3.2-8의 TOLIS–ATOTI 병합 칸에 들어 있는 FL150–220 / FL430–UNL 두 범위를 남쪽3개구간 모두에 적용했습니다. FL220–430 공백을 유지하며 전체항공로표시층은571개입니다. 자세한근거는 y655-audit.md에 기록했습니다.
