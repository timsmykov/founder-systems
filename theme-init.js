/* Apply only this application's colour preference before the first paint. */
(() => {
  const key = 'company-atlas-theme';
  const media = matchMedia('(prefers-color-scheme: dark)');
  let preference = 'system';
  try {const stored=localStorage.getItem(key);if(['light','dark','system'].includes(stored))preference=stored;} catch {}
  function apply() {
    const theme=preference==='system'?(media.matches?'dark':'light'):preference;
    document.documentElement.dataset.theme=theme;
    document.documentElement.dataset.themePreference=preference;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='dark'?'#191919':'#ffffff');
    const select=document.getElementById('theme-select');if(select)select.value=preference;
  }
  apply();
  media.addEventListener('change',()=>{if(preference==='system')apply();});
  document.addEventListener('DOMContentLoaded',()=>{
    const select=document.getElementById('theme-select');if(!select)return;select.value=preference;
    select.addEventListener('change',()=>{preference=select.value;try{localStorage.setItem(key,preference);}catch{}apply();});
  });
  window.addEventListener('storage',e=>{if(e.key===key){preference=['light','dark','system'].includes(e.newValue)?e.newValue:'system';apply();}});
})();
