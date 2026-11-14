# Earth imagery

Each layer, where it comes from and its licence. All of them can be used on a commercial website.

| Files | What | Source | Licence |
| --- | --- | --- | --- |
| `earth-day-{2048,4096,8192}.webp` | Surface colour | NASA Blue Marble Next Generation, July 2004 (`world.200407.3x21600x10800`), Reto Stöckli, NASA Earth Observatory | Public domain (NASA imagery, no copyright) |
| (shelf tint baked into the surface) | Shallow seas | NASA Blue Marble NG with topography and bathymetry (`world.topo.bathy.200412`) | Public domain |
| `earth-night-{2048,4096}.webp` | City lights | NASA Earth Observatory Black Marble 2016 (3 km) | Public domain |
| `earth-clouds-{2048,4096}.webp` | Cloud cover | Solar System Scope, `8k_earth_clouds` (based on NASA imagery) | CC BY 4.0. Credit needed: "Cloud texture: Solar System Scope (solarsystemscope.com), CC BY 4.0" |
| `earth-water-4096.webp` | Water mask (for sun glint) | Made from the Blue Marble surface above | Public domain |
| `topology-2048.webp` | Elevation (relief) | NASA elevation map, from the `three-globe` package examples (MIT) | Public domain / MIT |
| `day-mercator-*.webp`, `night-mercator-*.webp` | World map copies | The layers above, reprojected to Web Mercator with the clouds and night formula of the homepage globe baked in | As above |

How the files were made: the 21600 px NASA originals were resampled (Lanczos) to 8192 px. Ocean pixels get a
small lift and a shelf tint taken from the bathymetry version, so the seas read deep blue rather than black.
Each set was then exported to WebP at 2K, 4K and (surface only) 8K. Phones load 2K; desktops load 4K; large,
sharp screens move up to the 8K surface once the page is idle.
