(() => {
  const release = document.querySelector('meta[name="indoor-release"]')?.content;
  if (!release) return;
  // A local preference only; no analytics or external requests.
  document.cookie = `indoor_release=${release}; Path=/; Max-Age=31536000; SameSite=Lax`;
  const mount = () => {
    if (document.getElementById('indoor-release-picker')) return;
    const label = document.createElement('label');
    label.id = 'indoor-release-picker';
    label.style.cssText = 'position:fixed;bottom:8px;left:12px;z-index:9999;background:#171717;color:#eee;border:1px solid #555;border-radius:6px;padding:4px 8px;font:12px system-ui;display:flex;gap:6px;align-items:center';
    label.append('Version');
    const select = document.createElement('select');
    select.setAttribute('aria-label', 'Application version');
    select.title = 'Switching versions reloads the page. Save your changes first.';
    select.style.cssText = 'background:#171717;color:#ddd;border:0;max-width:230px';
    for (const [value,text] of [['0.2.4','0.2.4 · Human route playback'],['0804b','0804b · Previous release']]) {
      const option=document.createElement('option'); option.value=value; option.textContent=text; select.append(option);
    }
    select.value=release;
    select.addEventListener('change', () => {
      const url=new URL(location.href);
      url.searchParams.set('version',select.value);
      location.assign(url.href);
    });
    label.append(select);document.body.append(label);
  };
  if(document.readyState==='complete') mount(); else window.addEventListener('load',mount,{once:true});
})();
