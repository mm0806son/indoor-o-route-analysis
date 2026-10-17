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
    label.append('版本');
    const select = document.createElement('select');
    select.setAttribute('aria-label', '应用版本');
    select.title = '切换版本会重新加载页面；请先保存当前编辑。';
    select.style.cssText = 'background:#171717;color:#ddd;border:0;max-width:230px';
    for (const [value,text] of [['1017-human-route','0.2.3 · 人类路线单向通道修复'],['1017-stairs','0.2.0 · 1017-stairs · 楼梯视图'],['0804b','0804b · 上一版本']]) {
      const option=document.createElement('option'); option.value=value; option.textContent=text; select.append(option);
    }
    select.value=release;
    select.addEventListener('change', () => {
      const url=new URL(location.href);
      url.searchParams.set('version',select.value);
      // The previous application does not have the Stairs route.
      if(select.value==='0804b' && url.pathname==='/stairs') url.pathname='/';
      location.assign(url.href);
    });
    label.append(select);document.body.append(label);
  };
  if(document.readyState==='complete') mount(); else window.addEventListener('load',mount,{once:true});
})();
