# us-zip.txt

US ZIP Code Tabulation Area (ZCTA) centres, from the US Census Bureau (public domain), as packaged in
`us-zips` 2022.9.1 by Blake Knight (MIT). Used only to turn a ZIP code typed into World's
"Where are you connecting from?" into the nearest Opus city. The file is downloaded whole, so the ZIP
someone types never leaves their browser.

Format: entries separated by `;`, each `zipDelta,lat*100,lng*100` in base 36, ZIPs ascending
(the first delta is from 0). See src/scripts/zip-lookup.ts.
