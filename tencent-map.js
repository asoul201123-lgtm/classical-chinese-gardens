// Tencent JavaScript API GL loader. The key below is the original public demo key.
// Replace it with your own Tencent Location Service key for deployment.
window.GARDEN_MAP_CONFIG = Object.assign({
    key: 'OB4BZ-D4W3U-B7VVO-4PJWW-6TKDJ-WPB77',
    timeout: 12000
}, window.GARDEN_MAP_CONFIG);

window.GardenTencentMap = (() => {
    let loading = null;
    let sequence = 0;
    const isReady = () => Boolean(window.TMap?.Map && window.TMap?.visualization?.Heat);
    function load() {
        if (isReady()) return Promise.resolve(window.TMap);
        if (loading) return loading;
        loading = new Promise((resolve, reject) => {
            const key = String(window.GARDEN_MAP_CONFIG.key || '').trim();
            if (!key) { reject(new Error('尚未设置腾讯地图 Key')); return; }
            const callback = '__gardenTencentMapReady' + (++sequence);
            const script = document.createElement('script');
            let finished = false;
            let poll;
            const finish = error => {
                if (finished) return;
                finished = true;
                clearTimeout(timer); clearInterval(poll);
                // A response that arrives after a timeout must not call a deleted function.
                window[callback] = () => {};
                script.onload = script.onerror = null;
                if (error) { script.remove(); reject(error); } else resolve(window.TMap);
            };
            const check = () => { if (isReady()) finish(); };
            window[callback] = check;
            const timer = setTimeout(() => finish(new Error('腾讯地图加载超时，请检查网络和 Key 配置')), Number(window.GARDEN_MAP_CONFIG.timeout) || 12000);
            script.async = true;
            script.charset = 'utf-8';
            script.src = 'https://map.qq.com/api/gljs?' + new URLSearchParams({v:'1.exp', key, libraries:'visualization', callback});
            script.onload = check;
            script.onerror = () => finish(new Error('无法连接腾讯地图接口，请检查网络'));
            poll = setInterval(check, 100);
            document.head.appendChild(script);
        }).catch(error => { loading = null; throw error; });
        return loading;
    }
    return { load };
})();
