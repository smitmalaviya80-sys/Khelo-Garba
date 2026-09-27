# GARBA visual library

The production artwork is the approved 15-image courtyard set. Source masters remain outside normal runtime delivery; GitHub Pages expands one optimised 2K WebP bundle during deployment.

Canonical repository bundle:

`assets/backgrounds/garba15-2k.zip`

The ZIP contains exactly these 15 files at its root, each 2048px-wide WebP:

1. `01-bollywood-garba-courtyard.webp`
2. `02-rhythmic-drums-courtyard-a.webp`
3. `03-devotional-garba-courtyard.webp`
4. `04-colourful-garba-courtyard-a.webp`
5. `05-fusion-gujarati-neon.webp`
6. `06-fusion-abstract-neon.webp`
7. `07-dandiya-purple-courtyard.webp`
8. `08-colourful-garba-courtyard-b.webp`
9. `09-warm-stage-courtyard.webp`
10. `10-dandiya-silhouette-courtyard.webp`
11. `11-master-dark-courtyard.webp`
12. `12-rhythmic-drums-courtyard-b.webp`
13. `13-traditional-marigold-courtyard.webp`
14. `14-gujarati-folk-courtyard.webp`
15. `15-traditional-canopy-courtyard.webp`

## Art-directed genre buckets

- Traditional: 11, 15, 13, 09
- Dandiya: 10, 07
- Devotional: 03
- Folk: 14, 02, 12
- Sanedo: 08, 04
- Fusion: 05, 06, 01

The first image in each bucket is the default. Production runtime code selects approved alternates deterministically for shareable song URLs and falls back to the lightweight SVG world if a WebP is unavailable.

An older visual-library prototype is retained at `src/optional/visual-library.js`; it is not part of the current production first-load path.

The Pages workflow extracts the canonical ZIP into `assets/backgrounds/library/` in the deploy artifact. The PWA precaches only lightweight fallbacks and caches 2K artwork on demand, avoiding a 15-image download at install time. The source ZIP itself is removed from the deployed artifact.
