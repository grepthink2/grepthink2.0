/* Dev fallback: when the compiled _ds_bundle.js predates the What's new round (it regenerates once per turn),
   transpile the round's new and changed files straight from source into the same namespace — the releases family,
   NewDot, Badge (size="sm", release.new), Menu (MenuGroup, trailing), Modal (tone="dark"), LandingHeader (the tab)
   and ProfileMenu. Inert as soon as the bundle carries WhatsNewModal and WhatsNewTab. */
window.loadReleasesSources = async function loadReleasesSources(base) {
  const NS = window.GrepThinkDesignSystem_36e7e3 || (window.GrepThinkDesignSystem_36e7e3 = {});
  if (NS.WhatsNewModal && NS.WhatsNewTab && NS.ProfileMenu && NS.MenuGroup && NS.NewDot) return NS;
  const order = [
    'display/Badge', 'display/NewDot', 'feedback/Menu', 'feedback/Modal', 'marketing/LandingHeader', 'navigation/ProfileMenu',
    'releases/ReleasesModel', 'releases/ReleaseEntry', 'releases/ReleaseFeed', 'releases/WhatsNewModal',
  ];
  for (const file of order) {
    let src = await (await fetch(`${base}/components/${file}.jsx`)).text();
    const needed = [], found = [];
    src = src.replace(/import\s*\{([^}]*)\}\s*from\s*'[^']+';?/g, (m, names) => { needed.push(...names.split(',').map((s) => s.trim()).filter(Boolean)); return ''; });
    src = src.replace(/^import React[^\n]*$/mg, '');
    src = src.replace(/^export\s+(function|const)\s+([A-Za-z_$][\w$]*)/mg, (m, kind, id) => { found.push(id); return `${kind} ${id}`; });
    const prelude = needed.length ? `const {${[...new Set(needed)].join(',')}} = __NS;\n` : '';
    const code = Babel.transform(prelude + src + `\n;Object.assign(__NS, {${found.join(',')}});`, { presets: ['react'] }).code;
    new Function('React', '__NS', code)(window.React, NS);
  }
  return NS;
};

/* Transpile + run an inline <script type="text/babel-deferred"> after the sources are in. */
window.runDeferredBabel = window.runDeferredBabel || function runDeferredBabel() {
  document.querySelectorAll('script[type="text/babel-deferred"]').forEach((s) => {
    new Function(Babel.transform(s.textContent, { presets: ['react'] }).code)();
  });
};
