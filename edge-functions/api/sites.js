/* 作品数据代理（EdgeOne Pages · Edge Function）
 *
 * 作用：站点部署到自定义域名（zhongyiya.cn）后，浏览器直连云数据库会被
 * 服务端的 Origin 白名单拒绝（403 access_denied）。服务端请求没有这个限制，
 * 所以由这个边缘函数在服务端读取云端 sites 表，再以同源 /api/sites 返回。
 *
 * 路由：本文件对应 https://zhongyiya.cn/api/sites
 * 运行时：V8（不是 Node），只能用 ES Module + Web API，不能 require / 用 npm 包。
 */

const ENDPOINT = 'https://portfolio-hub-92035.app.workbuddy.host';
const ACCESS_KEY = 'wbpk_dpLe56w9pZRdXi98pupqtR_0G09EG4MwKze2huSNpQjjR3vXzDLTlw4';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'public, max-age=60'
};

function json(body, status) {
  return new Response(JSON.stringify(body), { status: status || 200, headers: JSON_HEADERS });
}

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

export default async function onRequest(context) {
  if (context.request.method !== 'GET') {
    return json({ error: 'method_not_allowed' }, 405);
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
      return json({ error: 'upstream_failed', status: upstream.status }, 502);
    }

    const rows = await upstream.json();
    if (!Array.isArray(rows)) {
      return json({ error: 'bad_upstream_payload' }, 502);
    }

    return json(rows.map(pick), 200);
  } catch (e) {
    return json({ error: 'upstream_error' }, 502);
  }
}
