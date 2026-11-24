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
    g.organizations && plural(g.organizations, 'group', 'groups')].filter(Boolean);
  return parts.length ? `${parts.join(' · ')} on Opus` : `No one in ${g.name} has published a profile yet`;
}

export function cityGuideHeader(g: GuideCounts, o: { region?: string; entry?: CityGuideEntry; followId?: string }): string {
  const e = o.entry;
  const p = e?.photo;
  const img = p ? `<img src="${esc(photoSrc(p))}" srcset="${esc(photoSrcset(p))}" sizes="(max-width: 860px) 100vw, 32vw" alt="${esc(p.alt)}" width="1920" height="${Math.round(1920 / p.ratio)}" decoding="async" fetchpriority="high" onerror="this.remove()" />` : '';
  const credit = p ? `<small class="wg__credit">Photo: <a href="${esc(p.creditUrl)}" target="_blank" rel="noopener">${esc(p.credit)}</a>, <a href="${esc(p.licenseUrl)}" target="_blank" rel="noopener">${esc(p.license)}</a></small>` : '';
  const follow = o.followId
    ? `<button type="button" class="wg__follow" data-follow="${esc(o.followId)}" data-follow-name="${esc(g.name)}" aria-pressed="false"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path class="wg__fplus" d="M12 5v14M5 12h14"/><path class="wg__fcheck" d="m5 12.5 4.5 4.5L19 7.5"/></svg><span data-follow-label>Follow City</span></button>`
    : '';
  const about = e
    ? `<details class="wg__about"><summary><span>About ${esc(g.name)}</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></summary><div class="wg__histbody"><p>${esc(e.intro)}</p>${e.history.map((h) => `<p>${esc(h)}</p>`).join('')}</div></details>`
    : '';
  // The photo is the header: the city's name, region and live counts sit inside it, so the people are right beneath.
  return `<header class="wg__head">
<div class="wg__banner${p ? '' : ' wg__banner--plain'}"${p ? ` style="--tone:${esc(p.tone)};--fx:${p.focusX ?? 50}%"` : ''}>
  ${img}
  <div class="wg__ov">
    <div class="wg__id">${e?.title ? `<p class="wg__kicker">${esc(e.title)}</p>` : ''}<h2 class="wg__title" id="wg-title">${esc(g.name)}</h2><p class="wg__meta" aria-live="polite">${o.region ? `${esc(o.region)} · ` : ''}${esc(countsLine(g))}</p></div>
    ${follow}
  </div>
  ${credit}
</div>
${about}
</header>`;
}
