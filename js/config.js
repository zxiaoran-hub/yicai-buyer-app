// 异采 YiCai 品牌方端 Supabase 配置
const SUPABASE_URL = 'https://spb-m06skr4cysol4lwz.supabase.opentrust.net';
const SUPABASE_ANON_KEY = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiIsInJlZiI6InNwYi1tMDZza3I0Y3lzb2w0bHd6IiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3ODUzNzcwNjIsImV4cCI6MjEwMDk1MzA2Mn0.2OO2jmTetq6vOE4xTRruNMXVUI89ATMIStpIl4ul3kI';

// 检查 token 是否即将过期（5分钟内过期视为已过期）
function isTokenExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 - Date.now() < 5 * 60 * 1000;
  } catch { return true; }
}

// 刷新 token
async function refreshTokenIfNeeded() {
  const accessToken = localStorage.getItem('yicai_buyer_token');
  const refreshTok = localStorage.getItem('yicai_buyer_refresh');
  if (!accessToken || !refreshTok) return;
  if (!isTokenExpired(accessToken)) return;

  try {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshTok })
    });
    if (resp.ok) {
      const data = await resp.json();
      localStorage.setItem('yicai_buyer_token', data.access_token);
      localStorage.setItem('yicai_buyer_refresh', data.refresh_token);
    } else {
      localStorage.removeItem('yicai_buyer_token');
      localStorage.removeItem('yicai_buyer_refresh');
      if (typeof logout === 'function') logout();
    }
  } catch (e) {
    console.warn('Token refresh failed:', e);
  }
}

// 获取当前认证 token（登录后用用户token，否则用anon key）
async function getAuthHeaders() {
  await refreshTokenIfNeeded();
  const userToken = localStorage.getItem('yicai_buyer_token');
  const authToken = userToken || SUPABASE_ANON_KEY;
  return {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${authToken}`,
    'Content-Type': 'application/json'
  };
}

// Supabase REST API 辅助函数
const supabase = {
  url: SUPABASE_URL,
  key: SUPABASE_ANON_KEY,

  async query(table, params = {}) {
    let url = `${this.url}/rest/v1/${table}`;
    const queryParams = [];

    if (params.select) queryParams.push(`select=${params.select}`);
    if (params.filter) {
      for (const [key, value] of Object.entries(params.filter)) {
        queryParams.push(`${key}=eq.${value}`);
      }
    }
    if (params.order) queryParams.push(`order=${params.order}`);
    if (params.limit) queryParams.push(`limit=${params.limit}`);
    if (params.offset) queryParams.push(`offset=${params.offset}`);
    if (params.like) {
      for (const [key, value] of Object.entries(params.like)) {
        queryParams.push(`${key}=ilike.${value}`);
      }
    }
    if (params.in) {
      for (const [key, value] of Object.entries(params.in)) {
        queryParams.push(`${key}=in.(${value})`);
      }
    }
    if (params.gte) {
      for (const [key, value] of Object.entries(params.gte)) {
        queryParams.push(`${key}=gte.${value}`);
      }
    }
    if (params.lte) {
      for (const [key, value] of Object.entries(params.lte)) {
        queryParams.push(`${key}=lte.${value}`);
      }
    }
    if (params.is) {
      for (const [key, value] of Object.entries(params.is)) {
        queryParams.push(`${key}=is.${value}`);
      }
    }

    if (queryParams.length > 0) {
      url += '?' + queryParams.join('&');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(url, {
        headers: await getAuthHeaders(),
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
    const url = `${this.url}/rest/v1/rpc/${functionName}`;
    const response = await fetch(url, {
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
    const url = `${this.url}/rest/v1/${table}`;
    const headers = await getAuthHeaders();
    headers['Prefer'] = 'return=representation';
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(data)
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Insert failed: ${response.status} - ${errText}`);
    }
    return response.json();
  },

  async update(table, data, match) {
    let url = `${this.url}/rest/v1/${table}?`;
    const queryParams = [];
    for (const [key, value] of Object.entries(match)) {
      queryParams.push(`${key}=eq.${value}`);
    }
    url += queryParams.join('&');

    const headers = await getAuthHeaders();
    headers['Prefer'] = 'return=representation';
    const response = await fetch(url, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(data)
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Update failed: ${response.status} - ${errText}`);
    }
    return response.json();
  },

  async delete(table, match) {
    let url = `${this.url}/rest/v1/${table}?`;
    const queryParams = [];
    for ( const [key, value] of Object.entries(match)) {
      queryParams.push(`${key}=eq.${value}`);
    }
    url += queryParams.join('&');

    const headers = await getAuthHeaders();
    headers['Prefer'] = 'return=representation';
    const response = await fetch(url, {
      method: 'DELETE',
      headers: headers
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Delete failed: ${response.status} - ${errText}`);
    }
    const deleted = await response.json();
    if (!deleted || deleted.length === 0) {
      throw new Error('未找到匹配记录，删除未生效（可能是权限不足）');
    }
    return true;
  },

  async signUp(email, password) {
    const url = `${this.url}/auth/v1/signup`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': this.key,
        'Authorization': `Bearer ${this.key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error_description || err.msg || '注册失败');
    }
    return response.json();
  },

  async signIn(email, password) {
    const url = `${this.url}/auth/v1/token?grant_type=password`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': this.key,
        'Authorization': `Bearer ${this.key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error_description || err.msg || '登录失败');
    }
    return response.json();
  },

  async getCount(table, filter = {}) {
    let url = `${this.url}/rest/v1/${table}?select=*`;
    const queryParams = [];
    for (const [key, value] of Object.entries(filter)) {
      queryParams.push(`${key}=eq.${value}`);
    }
    if (queryParams.length > 0) {
      url += '&' + queryParams.join('&');
    }
    const headers = await getAuthHeaders();
    headers['Prefer'] = 'count=exact';
    const response = await fetch(url, {
      headers
    });
    if (!response.ok) return 0;
    const cr = response.headers.get('content-range');
    if (cr) {
      const match = cr.match(/\/(\d+)/);
      return match ? parseInt(match[1]) : 0;
    }
    return 0;
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
