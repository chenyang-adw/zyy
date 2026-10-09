/* 云服务公开配置
 * 来源：workbuddy_cloud_service 激活后返回的 publicConfig（resourceId: wbcs_mdhSzsxvWuOx8Jk39i98fO）
 * 只有 endpoint / oauthRelayBaseUrl / publishableKey 属于可下发到前端的公开值，
 * 重新发布导致域名变化时需同步更新这里的 endpoint。
 */
window.PF_PUBLIC_CONFIG = {
  endpoint: 'https://portfolio-hub-92035.app.workbuddy.host',
  oauthRelayBaseUrl: 'https://www.workbuddy.cn/v2/as/genie-baas/oauth',
  publishableKey: 'wbpk_dpLe56w9pZRdXi98pupqtR_0G09EG4MwKze2huSNpQjjR3vXzDLTlw4'
};

window.PFCloud = function () {
  if (!window.WorkBuddyCloud) return null;
  const c = window.PF_PUBLIC_CONFIG;
  return window.WorkBuddyCloud.createWorkBuddyCloud({
    endpoint: c.endpoint,
    oauthRelayBaseUrl: c.oauthRelayBaseUrl,
    publishableKey: c.publishableKey
  });
};
