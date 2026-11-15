/**
 * The city guide header in World: panoramic photo, city name and region, live counts, Follow City,
 * a short introduction and an expandable music history. Pure (strings in, HTML out) so it renders the same
 * wherever World shows a guide. Counts come from the live directory, never from the guide data.
 */
import type { CityGuideEntry } from '../data/city-guides.ts';
import { photoSrc, photoSrcset } from '../data/city-guides.ts';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export interface GuideCounts { name: string; total: number; musicians: number; studios: number; organizations: number }

/** "12 professionals · 3 studios · 1 organization", or an honest line when nobody has published yet. */
export function countsLine(g: GuideCounts): string {
  const parts = [g.musicians && plural(g.musicians, 'professional', 'professionals'), g.studios && plural(g.studios, 'studio', 'studios'),
    g.organizations && plural(g.organizations, 'organization', 'organizations')].filter(Boolean);
  return parts.length ? `${parts.join(' · ')} on Opus` : `No one in ${g.name} has published a profile yet`;
}

export function cityGuideHeader(g: GuideCounts, o: { region?: string; entry?: CityGuideEntry; followId?: string }): string {
  const e = o.entry;
  const p = e?.photo;
  const photo = p ? `<figure class="wg__photo" style="--tone:${esc(p.tone)};--ratio:${p.ratio};--fx:${p.focusX ?? 50}%">
  <img src="${esc(photoSrc(p))}" srcset="${esc(photoSrcset(p))}" sizes="(max-width: 860px) 100vw, 46vw" alt="${esc(p.alt)}" width="1920" height="${Math.round(1920 / p.ratio)}" decoding="async" fetchpriority="high" onerror="this.remove()" />
  <figcaption>Photo: <a href="${esc(p.creditUrl)}" target="_blank" rel="noopener">${esc(p.credit)}</a>, <a href="${esc(p.licenseUrl)}" target="_blank" rel="noopener">${esc(p.license)}</a></figcaption>
</figure>` : '';
  const follow = o.followId
    ? `<button type="button" class="wg__follow" data-follow="${esc(o.followId)}" data-follow-name="${esc(g.name)}" aria-pressed="false"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path class="wg__fplus" d="M12 5v14M5 12h14"/><path class="wg__fcheck" d="m5 12.5 4.5 4.5L19 7.5"/></svg><span data-follow-label>Follow City</span></button>`
    : '';
  const history = e?.history.length
    ? `<details class="wg__hist"><summary><span>Music history</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></summary><div class="wg__histbody">${e.history.map((h) => `<p>${esc(h)}</p>`).join('')}</div></details>`
    : '';
  return `<header class="wg__head${p ? ' wg__head--photo' : ''}">
${photo}
<div class="wg__intro">
  <p class="wg__kicker">City guide</p>
  <div class="wg__titlerow"><div><h2 class="wg__title" id="wg-title">${esc(g.name)}</h2>${o.region ? `<p class="wg__region">${esc(o.region)}</p>` : ''}</div>${follow}</div>
  <p class="wg__counts" aria-live="polite">${esc(countsLine(g))}</p>
  ${e ? `<p class="wg__lede">${esc(e.intro)}</p>` : ''}
  ${history}
</div>
</header>`;
}
