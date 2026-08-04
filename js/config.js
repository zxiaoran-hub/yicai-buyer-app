// 异采 YiCai 品牌方端 API 配置（自建后端版，替代原 Supabase）
// API 与前端同域部署（nginx 反代 /api），无需跨域配置
const API_BASE = '';

// ==================== XSS 防护 ====================
function escapeHtml(str) {
  if (!str) return '';
  const s = String(str);
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return s.replace(/[&<>"']/g, c => map[c]);
}

// 解码 JWT payload（兼容 base64url 编码与 UTF-8 字符，如中文姓名）
function decodeJwtPayload(token) {
  try {
    let b64 = String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch { return null; }
}

// 检查 token 是否即将过期（5分钟内过期视为已过期）
function isTokenExpired(token) {
  const payload = decodeJwtPayload(token);
  // 解码失败时不贸然判定过期（避免误清令牌），交给服务端校验
  if (!payload || !payload.exp) return false;
  return payload.exp * 1000 - Date.now() < 5 * 60 * 1000;
}

// 刷新 token（单飞模式：并发请求共享同一次刷新，避免轮换竞态）
let __refreshInFlight = null;
async function refreshTokenIfNeeded() {
  const accessToken = localStorage.getItem('yicai_buyer_token');
  const refreshTok = localStorage.getItem('yicai_buyer_refresh');
  if (!accessToken || !refreshTok) return;
  if (!isTokenExpired(accessToken)) return;

  if (!__refreshInFlight) {
    __refreshInFlight = (async () => {
      try {
        const resp = await fetch(`${API_BASE}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshTok })
        });
        if (resp.ok) {
          const data = await resp.json();
          localStorage.setItem('yicai_buyer_token', data.access_token);
          if (data.refresh_token) {
            localStorage.setItem('yicai_buyer_refresh', data.refresh_token);
          }
        } else {
          // 刷新被拒绝：保留现有令牌，由服务端按 401 处理，避免误清登录态
          console.warn('Token refresh rejected:', resp.status);
        }
      } catch (e) {
        // 网络异常：同样不激进清除，等待下次请求重试
        console.warn('Token refresh failed:', e.message);
      } finally {
        setTimeout(() => { __refreshInFlight = null; }, 1000);
      }
    })();
  }
  await __refreshInFlight;
}

// 获取当前认证请求头（未登录时不带 Authorization，服务端按匿名规则处理）
async function getAuthHeaders() {
  await refreshTokenIfNeeded();
  const userToken = localStorage.getItem('yicai_buyer_token');
  const headers = { 'Content-Type': 'application/json' };
  if (userToken) headers['Authorization'] = `Bearer ${userToken}`;
  return headers;
}

// 数据访问封装（接口签名与原 Supabase 版保持一致，业务代码无需改动）
const supabase = {
  async query(table, params = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`${API_BASE}/api/query`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ table, ...params }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        console.warn(`Query ${table} failed: ${response.status}`);
        return [];
      }
      return response.json();
    } catch (err) {
      clearTimeout(timeoutId);
      console.warn(`Query ${table} error:`, err.message);
      return [];
    }
  },

  async rpc(functionName, params = {}) {
    const response = await fetch(`${API_BASE}/api/rpc/${functionName}`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify(params)
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`RPC failed: ${response.status} - ${errText}`);
    }
    return response.json();
  },

  async insert(table, data) {
    const response = await fetch(`${API_BASE}/api/insert`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ table, data })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || `Insert failed: ${response.status}`);
    }
    return response.json();
  },

  async update(table, data, match) {
    const response = await fetch(`${API_BASE}/api/update`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ table, data, match })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || `Update failed: ${response.status}`);
    }
    return response.json();
  },

  async delete(table, match) {
    const response = await fetch(`${API_BASE}/api/delete`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ table, match })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || `Delete failed: ${response.status}`);
    }
    const deleted = await response.json();
    if (!deleted || deleted.length === 0) {
      throw new Error('未找到匹配记录，删除未生效（可能是权限不足）');
    }
    return true;
  },

  async signUp(email, password, metadata) {
    const response = await fetch(`${API_BASE}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, data: metadata })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || '注册失败');
    }
    return response.json();
  },

  async signIn(email, password) {
    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || '登录失败');
    }
    return response.json();
  },

  async getCount(table, filter = {}) {
    try {
      const response = await fetch(`${API_BASE}/api/count`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ table, filter })
      });
      if (!response.ok) return 0;
      const data = await response.json();
      return data.count || 0;
    } catch {
      return 0;
    }
  }
};

// ============ 通用工具函数 ============

// 状态映射表
const STATUS_MAP = {
  // 询价状态
  open: { label: '进行中', color: 'primary' },
  closed: { label: '已关闭', color: 'default' },
  cancelled: { label: '已取消', color: 'default' },
  // 报价状态
  pending: { label: '待处理', color: 'warning' },
  accepted: { label: '已接受', color: 'success' },
  rejected: { label: '已拒绝', color: 'danger' },
  // 订单状态
  confirmed: { label: '已确认', color: 'info' },
  producing: { label: '生产中', color: 'warning' },
  completed: { label: '已完成', color: 'success' }
};

function getStatusClass(status) {
  const map = {
    open: 'status-open',
    closed: 'status-closed',
    cancelled: 'status-cancelled',
    pending: 'status-pending',
    accepted: 'status-accepted',
    rejected: 'status-rejected',
    confirmed: 'status-confirmed',
    producing: 'status-producing',
    completed: 'status-completed'
  };
  return map[status] || 'status-default';
}

function getStatusLabel(status) {
  return STATUS_MAP[status]?.label || status || '未知';
}

function formatMoney(amount) {
  if (amount === null || amount === undefined || amount === '') return '-';
  const num = parseFloat(amount);
  if (isNaN(num)) return '-';
  return '¥' + num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day} ${h}:${min}`;
  } catch {
    return dateStr;
  }
}
