/** Sprite de ícones SVG (2026-09-10, "Acabamento FESF") — substitui os
 * glifos Unicode usados até aqui no menu/sessão por ícones de traço
 * consistente. Renderizado uma vez perto da raiz do app; cada ícone é
 * consumido como `<svg className="ic"><use href="#i-nome"/></svg>`,
 * herdando cor/tamanho do CSS existente (`.nav-btn .ic` etc.) — troca
 * de marcação, não de estilo.
 *
 * Duas armadilhas reais encontradas implementando isto no projeto
 * irmão (Almoxarifado) — evitadas aqui desde o início:
 * 1. NÃO usar `display: none` no wrapper — tira o elemento da árvore
 *    de renderização, e em vários motores o `<use>` em outro lugar do
 *    DOM não pinta mais o conteúdo referenciado. Posição absoluta com
 *    tamanho zero esconde sem tirar da árvore.
 * 2. `<symbol viewBox="0 0 24 24">`, NÃO `<g>` — cada `<svg
 *    className="ic">` que consome via `<use>` tem um tamanho CSS
 *    diferente e nenhum viewBox próprio. `<g>` não carrega
 *    viewport/escala nenhuma pro `<use>`, então o desenho (coordenadas
 *    0–24) pinta 1 unidade = 1px dentro de uma caixa menor, cortando a
 *    maior parte do ícone — um recorte diferente em cada tamanho.
 *    `<symbol>` escala o conteúdo pro tamanho real do `<use>`.
 * (E, à parte do sprite em si: `stroke` tem que vir de CSS —
 * `.ic { stroke: currentColor; fill: none; }` — os `<symbol>` abaixo
 * não definem cor própria nenhuma.) */
export function IconSprite() {
  return (
    <svg
      aria-hidden="true"
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
      focusable="false"
    >
      <defs>
        <symbol id="i-grid" viewBox="0 0 24 24" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </symbol>
        <symbol id="i-layers" viewBox="0 0 24 24" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 2 7 12 12 22 7 12 2" />
          <polyline points="2 12 12 17 22 12" />
          <polyline points="2 17 12 22 22 17" />
        </symbol>
        <symbol id="i-in" viewBox="0 0 24 24" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v10" />
          <path d="m8 9 4 4 4-4" />
          <path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
        </symbol>
        <symbol id="i-out" viewBox="0 0 24 24" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 21V11" />
          <path d="m8 15 4-4 4 4" />
          <path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
        </symbol>
        <symbol id="i-swap" viewBox="0 0 24 24" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="m17 1 4 4-4 4" />
          <path d="M3 11V9a4 4 0 0 1 4-4h14" />
          <path d="m7 23-4-4 4-4" />
          <path d="M21 13v2a4 4 0 0 1-4 4H3" />
        </symbol>
        <symbol id="i-building" viewBox="0 0 24 24" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="3" width="16" height="18" rx="1" />
          <path d="M9 8h1M14 8h1M9 12h1M14 12h1" />
          <path d="M9 21v-4h6v4" />
        </symbol>
        <symbol id="i-chart" viewBox="0 0 24 24" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="12" width="4" height="8" rx="1" />
          <rect x="10" y="6" width="4" height="14" rx="1" />
          <rect x="17" y="9" width="4" height="11" rx="1" />
        </symbol>
        <symbol id="i-users" viewBox="0 0 24 24" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </symbol>
        <symbol id="i-shield" viewBox="0 0 24 24" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6l-8-4Z" />
          <path d="m9 12 2 2 4-4" />
        </symbol>
        <symbol id="i-key" viewBox="0 0 24 24" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="7.5" cy="15.5" r="4.5" />
          <path d="m10.5 12.5 8-8" />
          <path d="m15.5 7.5 2.5 2.5" />
          <path d="m18.5 4.5 2.5 2.5" />
        </symbol>
        <symbol id="i-logout" viewBox="0 0 24 24" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <path d="m16 17 5-5-5-5" />
          <path d="M21 12H9" />
        </symbol>
        <symbol id="i-refresh" viewBox="0 0 24 24" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-9-9 9 9 0 0 1 9-9c2.5 0 4.7 1 6.3 2.7" />
          <path d="M21 3v6h-6" />
        </symbol>
        <symbol id="i-clipboard" viewBox="0 0 24 24" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <rect x="6" y="4" width="12" height="17" rx="2" />
          <path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" />
          <path d="M9 11h6M9 15h6" />
        </symbol>
        <symbol id="i-bell" viewBox="0 0 24 24" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" />
          <path d="M10.5 20a1.5 1.5 0 0 0 3 0" />
        </symbol>
        <symbol id="i-check" viewBox="0 0 24 24" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="m8 12 3 3 5-6" />
        </symbol>
        <symbol id="i-package" viewBox="0 0 24 24" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="m3 8 9-5 9 5-9 5-9-5Z" />
          <path d="M3 8v9l9 5 9-5V8" />
          <path d="M12 13v9" />
        </symbol>
        <symbol id="i-capsule" viewBox="0 0 24 24" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="9" width="20" height="6" rx="3" />
          <path d="M12 9v6" />
        </symbol>
        <symbol id="i-flask" viewBox="0 0 24 24" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 2h6" />
          <path d="M10 2v6.34a2 2 0 0 1-.4 1.2L4.15 17.8A2 2 0 0 0 6 21h12a2 2 0 0 0 1.85-3.2l-5.45-8.26a2 2 0 0 1-.4-1.2V2" />
          <path d="M6.5 14h11" />
        </symbol>
        <symbol id="i-clock" viewBox="0 0 24 24" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3.5 2" />
        </symbol>
        <symbol id="i-coin" viewBox="0 0 24 24" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 6.5v11" />
          <path d="M15 9.3c0-1.3-1.3-2.3-3-2.3s-3 .9-3 2.2c0 3 6 1.5 6 4.4 0 1.3-1.3 2.4-3 2.4s-3-1-3-2.3" />
        </symbol>
      </defs>
    </svg>
  );
}
