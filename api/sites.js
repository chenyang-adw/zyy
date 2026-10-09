/* 作品数据代理（Vercel Serverless Function）
 *
 * 作用：站点部署到自定义域名（zhongyiya.cn）后，浏览器直连云数据库会被
 * 服务端的 Origin 白名单拒绝（403 access_denied）。服务端请求没有这个限制，
 * 所以由这个函数在服务端读取云端 sites 表，再以同源 /api/sites 返回给前台。
 *
 * 本地预览（python -m http.server）下这个接口不存在，前台会自动跳过它。
 */

const ENDPOINT = 'https://portfolio-hub-92035.app.workbuddy.host';
const ACCESS_KEY = 'wbpk_dpLe56w9pZRdXi98pupqtR_0G09EG4MwKze2huSNpQjjR3vXzDLTlw4';

function pick(row) {
  return {
    id: row.id,
    name: row.name || '',
    url: row.url || '',
    desc: row.summary || '',
    tag: row.tag || '',
    icon: row.icon || '',
    color: row.color || '',
    kind: row.kind || 'link',
    file_path: row.file_path || ''
  };
}

module.exports = async function handler(req, res) {
  // 边缘缓存 60 秒，后台改完作品最多一分钟后生效
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  try {
    const url = ENDPOINT + '/.cloud/database/rest/v1/sites?select=*&order=sort_order.asc,id.asc';
    const upstream = await fetch(url, {
      headers: {
        'x-wb-webapp-access-key': ACCESS_KEY,
        'Accept': 'application/json'
      }
    });

    if (!upstream.ok) {
      res.status(502).json({ error: 'upstream_failed', status: upstream.status });
      return;
    }

    const rows = await upstream.json();
    if (!Array.isArray(rows)) {
      res.status(502).json({ error: 'bad_upstream_payload' });
      return;
    }

    res.status(200).json(rows.map(pick));
  } catch (e) {
    res.status(502).json({ error: 'upstream_error' });
  }
};
