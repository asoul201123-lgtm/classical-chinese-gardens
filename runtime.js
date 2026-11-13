// Static-site knowledge, demo accounts and preferences. No backend is required.
(() => {
  const storage = {
    get(key, fallback = null) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Private browsing may disable storage. */ } }
  };
  const plain = html => { const el = document.createElement('div'); el.innerHTML = String(html || ''); return el.textContent.replace(/\s+/g, ' ').trim(); };
  const upperLines = ['叠石引泉来雅趣', '一池碧水涵明月', '曲径通幽花影静', '半窗竹影摇诗梦', '小院听风竹有声'];
  let coupletRound = 0;
  let upperLine = upperLines[0];

  function localQuestion(question) {
    const q = question.replace(/[《》“”‘’？?\s]/g, '');
    const sources = [];
    if (typeof richDB !== 'undefined') Object.entries(richDB).forEach(([name, item]) => sources.push({ name, text: plain(item.content) }));
    if (typeof wikiDB !== 'undefined') Object.values(wikiDB).forEach(item => sources.push({ name: item.n, text: plain(item.d || item.desc || item.content || Object.values(item).filter(v => typeof v === 'string').join('；')) }));
    const matches = sources.filter(item => item.name && q.includes(item.name)).sort((a, b) => b.name.length - a.name.length);
    if (matches.length) return `【本地知识库】${matches.slice(0, 2).map(item => `${item.name}：${item.text.slice(0, 850)}`).join('\n\n')}`;
    if (/园冶|计成/.test(q)) return '【本地知识库】《园冶》是明代计成撰写的造园专著，强调“虽由人作，宛自天开”。其内容涉及相地、立基、屋宇、装折、门窗、墙垣、铺地、掇山、选石与借景。可到“人物与著作”继续阅读。';
    if (/借景/.test(q)) return '【本地知识库】借景指把园外或远处景物纳入园内视野，扩大空间意境。例如拙政园借北寺塔入景。框景用门窗限定画面，对景让景物在视线中相互呼应；它们可以与借景配合。';
    if (/推荐|苏州|春天|江南/.test(q)) return '【本地知识库】可从拙政园、留园、网师园、沧浪亭和狮子林了解苏州园林：拙政园适合观察水面布局，留园适合观察廊院与空间变化，网师园体现小中见大，沧浪亭可看内外借景，狮子林以假山游线见长。开放时间与预约信息请以园方公告为准。';
    if (/皇家|私家|岭南|流派/.test(q)) return '【本地知识库】皇家园林通常规模宏大，兼有礼仪与游赏功能；江南私家园林重视诗画意境、曲折空间与小中见大；岭南园林适应湿热气候，注重通风、开敞空间与地域装饰。可在“构造分类”查看三大流派。';
    const keywords = [...new Set(q.match(/[\u4e00-\u9fff]{2,}/g) || [])].flatMap(word => Array.from({ length: Math.max(0, word.length - 1) }, (_, i) => word.slice(i, i + 2)));
    const ranked = sources.map(item => ({ ...item, score: keywords.filter(k => item.text.includes(k)).length })).filter(item => item.score >= 2).sort((a, b) => b.score - a.score);
    if (ranked.length) return `【本地知识库 · 相关条目】${ranked.slice(0, 2).map(item => `${item.name}：${item.text.slice(0, 450)}`).join('\n\n')}`;
    return '【本地知识库】暂未找到直接匹配的条目。可以输入具体园林或构造名称，如“拙政园”“漏窗”“亭”，也可以询问“借景”或“园冶”。当前回答范围限于项目内的知识。';
  }
  function localReply(kind, text) {
    if (kind === 'couplet') {
      const value = text.replace(/[\s，。！？、；：,.!?;:]/g, '');
      const length = Array.from(value).length;
      const comment = length === 7 ? '字数与七字上联相合。可继续检查上下联相同位置的词性，以及景物和动作是否呼应。' : `你的下联共 ${length} 字，本轮上联为七字；建议先调整字数，再推敲对仗与意境。`;
      upperLine = upperLines[++coupletRound % upperLines.length];
      return `【本地练习 · 字数与意境提示】\n${comment}\n本地规则不作平仄判定。\n\n📜 新上联：${upperLine}`;
    }
    if (kind === 'poem') {
      const points = [];
      if (/[水池泉溪湖雨]/.test(text)) points.push('水景意象可联系理水：水面映照建筑、植物与天光，形成虚实相生的层次。');
      if (/[山石峰岩]/.test(text)) points.push('山石意象可联系叠山与置石，在有限空间中凝练自然山水的气势。');
      if (/[花木竹柳草荷梅松]/.test(text)) points.push('植物意象可联系季相与花木配置，以色彩、香气与疏密变化营造氛围。');
      if (/[窗门廊亭楼]/.test(text)) points.push('建筑意象可联系框景、对景与游线，组织观看的位置与景物层次。');
      return '【本地意象提示 · 规则匹配】\n' + (points.length ? points.join('\n') : '可从景物、季节、观看位置与情感四个方面阅读诗句，再联系借景、框景或移步换景。') + '\n以上仅依据输入中的意象提供阅读线索，未核验作品出处。';
    }
    return localQuestion(text);
  }
  async function ask(kind, text) {
    if (!text.trim() || text.length > 2000) throw new Error('请输入 1–2000 字的内容');
    return localReply(kind, text);
  }
  async function account(url, username, password) {
    // Live Server and file:// have no backend. These accounts are explicitly local demos.
    if (url === 'login.php' && username === 'gjyg' && password === 'gjyg') return 'yes';
    if (!crypto.subtle) throw new Error('当前地址不支持本地账户加密，请使用 localhost 地址打开，或点击游客浏览。');
    const users = Object.assign(Object.create(null), storage.get('gardenDemoUsers', {}));
    const hex = value => Array.from(new Uint8Array(value), byte => byte.toString(16).padStart(2, '0')).join('');
    async function hash(salt) {
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
      return hex(await crypto.subtle.deriveBits({name:'PBKDF2', salt:new TextEncoder().encode(salt), iterations:120000, hash:'SHA-256'}, key, 256));
    }
    if (url === 'register.php') {
      if (username === 'gjyg' || Object.hasOwn(users, username)) return 'no';
      const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
      users[username] = {salt, hash:await hash(salt)};
      storage.set('gardenDemoUsers', users);
      if (!storage.get('gardenDemoUsers', {})[username]) throw new Error('浏览器禁止保存本地账户，请启用本地存储或使用游客浏览。');
      return 'yes';
    }
    const user = users[username];
    return user && await hash(user.salt) === user.hash ? 'yes' : 'no';
  }
  window.GardenApp = { ask, account, storage };

  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('loginForm')) {
      const note = document.createElement('p'); note.className = 'local-mode-note';
      note.textContent = '静态演示模式：注册账户仅保存在当前浏览器。演示账号 gjyg / gjyg，也可免登录浏览。';
      document.getElementById('loginForm').after(note);
      const register = document.getElementById('registerForm');
      if (register) { const copy = note.cloneNode(true); register.after(copy); }
    }
    if (document.getElementById('ai-question-input') || /(?:index|home)\.html$/.test(location.pathname) || location.pathname.endsWith('/')) return;
    const launch = document.createElement('button');
    launch.className = 'garden-assistant-launch'; launch.textContent = '园林助手';
    const panel = document.createElement('section'); panel.className = 'garden-assistant-panel'; panel.hidden = true;
    panel.setAttribute('aria-label', '园林知识助手');
    panel.innerHTML = '<header><strong>园林知识助手</strong><button type="button" aria-label="关闭助手">×</button></header><div class="garden-assistant-messages" aria-live="polite"></div><form><label for="garden-assistant-input">输入园林问题</label><input id="garden-assistant-input" maxlength="2000" required placeholder="例如：什么是借景？"><button type="submit">提问</button></form>';
    const messages = panel.querySelector('.garden-assistant-messages');
    const append = value => { const p = document.createElement('p'); p.textContent = value; messages.appendChild(p); messages.scrollTop = messages.scrollHeight; };
    append('可检索项目内的园林知识，例如输入园林名称或“借景”。');
    launch.onclick = () => { panel.hidden = !panel.hidden; if (!panel.hidden) panel.querySelector('input').focus(); };
    panel.querySelector('header button').onclick = () => { panel.hidden = true; launch.focus(); };
    panel.querySelector('form').onsubmit = async event => {
      event.preventDefault(); const input = panel.querySelector('input'); const button = panel.querySelector('button[type="submit"]');
      const text = input.value.trim(); if (!text || button.disabled) return;
      append(`我：${text}`); input.value = ''; button.disabled = true;
      try { append(await ask('question', text)); } catch (error) { append(error.message); } finally { button.disabled = false; }
    };
    document.body.append(launch, panel);
  });
})();
