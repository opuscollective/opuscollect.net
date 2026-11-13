# Earth imagery

- `blue-marble-*.webp`, `day-mercator-*.webp`: NASA Blue Marble (Visible Earth). NASA imagery is in the public domain.
- `night-*.webp`, `night-mercator-*.webp`: NASA Earth at Night (Black Marble), also public domain. The Mercator night copies
  are pre-coloured with the homepage globe's night formula (navy dark, warm city lights) so World matches it.
- The source files came from the `three-globe` package examples (MIT licence), resized to WebP. The Mercator copies were
  reprojected from the equirectangular images for the World map.
- `topology-2048.webp`: elevation map from the same source. It is used as a bump map so the land has relief.
