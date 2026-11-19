# Sokcho whole-circle display update

The user requested that the airspace be drawn without cutting it. Sokcho now uses the complete WGS84 circle of radius 5 NM at 380839N 1283610E, retaining SFC–2,500 ft AGL. Yangyang retains its complete existing 5 NM circle and SFC–3,000 ft AGL limits. This is a user-requested display model; the published P518 and Yangyang overlap exclusions are not applied.

Validation passed: all 720 circle vertices are at 9,260 m radius, the full azimuth sweep is present, no polygon holes exist, and the overlapping areas previously removed for Yangyang/P518 are restored. All other 54 airport feature geometries, altitude limits and source references are unchanged. Whole-circle provenance is explicit in the JSON and viewer.

The earlier screenshot-clipping audit in jeju-sokcho-audit.md describes the superseded display model. Jeju source-arc checks from that report remain valid.
