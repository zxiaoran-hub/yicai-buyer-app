// 异采 YiCai 品牌方端 - 主应用
// 不依赖 Supabase JS SDK，全部使用 config.js 中的自定义 supabase REST 封装

// ==================== 状态 ====================
let currentUser = null;
let currentPermissions = [];
let currentMenuPermissions = {};
let currentButtonPermissions = {};

// appState 兼容层 - 供 orders.js/quotes.js/admin.js/profile.js 使用
window.appState = {
  get companyId() { return currentUser?.companyId || null; },
  get user() { return currentUser; },
  get roles() { return currentUser?.roles || []; },
  get isPlatformAdmin() { return currentUser?.isPlatformAdmin || false; },
  get isCompanyAdmin() { return currentUser?.isCompanyAdmin || false; },
  get isIndividual() { return !currentUser?.companyId; }
};

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', () => {
  console.log('[App] DOMContentLoaded - app.js loaded');
  // 平台检测并标记到 body
  const platform = detectPlatform();
  document.body.dataset.platform = platform;
  console.log('[App] Platform:', platform);
  // 确保初始状态：只有 dashboard 页面可见
  document.querySelectorAll('.page').forEach(p => {
    if (p.id !== 'page-dashboard') p.classList.remove('active');
  });
  checkSession();
  bindEvents();
});

function checkSession() {
  const savedUser = localStorage.getItem('yicai_buyer_user');
  const token = localStorage.getItem('yicai_buyer_token');
  if (savedUser && token) {
    try {
      currentUser = JSON.parse(savedUser);
      loadUserPermissions();
    } catch (e) {
      localStorage.removeItem('yicai_buyer_user');
      localStorage.removeItem('yicai_buyer_token');
      localStorage.removeItem('yicai_buyer_refresh');
    }
  }
}

function bindEvents() {
  console.log('[App] bindEvents called');
  // 企业登录表单
  const loginForm = document.getElementById('login-form');
  console.log('[App] login-form element:', loginForm);
  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      console.log('[App] login-form submit event fired');
      handleCompanyLogin();
    });
    console.log('[App] login-form submit handler bound');
  }

  // 企业注册表单
  const registerCompanyForm = document.getElementById('register-company-form');
  if (registerCompanyForm) {
    registerCompanyForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleCompanyRegister();
    });
  }

  // 个人登录表单
  const loginIndividualForm = document.getElementById('login-individual-form');
  if (loginIndividualForm) {
    loginIndividualForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleIndividualLogin();
    });
  }

  // 个人注册表单
  const registerIndividualForm = document.getElementById('register-individual-form');
  if (registerIndividualForm) {
    registerIndividualForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleIndividualRegister();
    });
  }

  // 身份选择卡片
  document.querySelectorAll('[onclick^="selectLoginType"]').forEach(el => {
    // already handled by inline onclick
  });

  // 密码显示/隐藏
  document.querySelectorAll('.password-toggle').forEach(toggle => {
    toggle.addEventListener('click', function() {
      const input = this.previousElementSibling;
      if (input && input.type === 'password') {
        input.type = 'text';
        this.textContent = '🙈';
      } else if (input) {
        input.type = 'password';
        this.textContent = '👁️';
      }
    });
  });

  // 登录/注册切换链接
  document.querySelectorAll('[onclick^="toggleForm"]').forEach(el => {
    // already handled by inline onclick
  });

  // Tab bar navigation
  document.querySelectorAll('.tab-item').forEach(tab => {
    if (!tab.onclick) {
      tab.addEventListener('click', function() {
        const page = this.dataset.page;
        if (page) switchPage(page);
      });
    }
  });

  // 退出登录
  document.querySelectorAll('[onclick*="logout"]').forEach(el => {
    // already handled by inline onclick
  });
}

// ==================== 身份选择（两步式登录） ====================
function selectLoginType(type) {
  document.getElementById('login-step-choice').style.display = 'none';
  if (type === 'company') {
    document.getElementById('login-step-company').style.display = 'block';
    document.getElementById('login-step-individual').style.display = 'none';
  } else {
    document.getElementById('login-step-company').style.display = 'none';
    document.getElementById('login-step-individual').style.display = 'block';
  }
}

function backToChoice() {
  document.getElementById('login-step-choice').style.display = 'block';
  document.getElementById('login-step-company').style.display = 'none';
  document.getElementById('login-step-individual').style.display = 'none';
}

function toggleForm(type, formType) {
  // type: 'company' or 'individual'
  // formType: 'login' or 'register'
  const container = document.getElementById('login-step-' + type);
  if (!container) return;
  const loginForm = container.querySelector('form[id^="login"]');
  const registerForm = container.querySelector('form[id^="register"]');
  if (formType === 'register') {
    if (loginForm) loginForm.style.display = 'none';
    if (registerForm) registerForm.style.display = 'block';
  } else {
    if (loginForm) loginForm.style.display = 'block';
    if (registerForm) registerForm.style.display = 'none';
  }
}

// HTML 中 onclick 使用的函数
function toggleAuthForm(mode) {
  switch (mode) {
    case 'register-company':
      toggleForm('company', 'register');
      break;
    case 'login':
      toggleForm('company', 'login');
      break;
    case 'register-individual':
      toggleForm('individual', 'register');
      break;
    case 'login-individual':
      toggleForm('individual', 'login');
      break;
  }
}

// ==================== 认证 ====================
async function handleCompanyLogin() {
  console.log('[Login] handleCompanyLogin called');
  const email = document.getElementById('login-email')?.value?.trim();
  const password = document.getElementById('login-password')?.value;
  console.log('[Login] email:', email, 'password length:', password?.length);
  if (!email || !password) {
    showToast('请输入邮箱和密码');
    return;
  }
  await doLogin(email, password);
}

async function handleIndividualLogin() {
  const email = document.getElementById('login-individual-email')?.value?.trim();
  const password = document.getElementById('login-individual-password')?.value;
  if (!email || !password) {
    showToast('请输入邮箱和密码');
    return;
  }
  await doLogin(email, password);
}

async function doLogin(email, password) {
  console.log('[Login] Attempting login for:', email);
  try {
    console.log('[Login] Calling supabase.signIn...');
    const result = await supabase.signIn(email, password);
    console.log('[Login] signIn result:', result);
    if (result.access_token) {
      localStorage.setItem('yicai_buyer_token', result.access_token);
      if (result.refresh_token) {
        localStorage.setItem('yicai_buyer_refresh', result.refresh_token);
      }
      currentUser = {
        id: result.user.id,
        email: result.user.email,
        name: result.user.user_metadata?.name || email.split('@')[0],
        role: 'buyer'
      };
      localStorage.setItem('yicai_buyer_user', JSON.stringify(currentUser));
      console.log('[Login] User logged in, loading permissions...');
      await loadUserPermissions();
      console.log('[Login] Login complete!');
    } else {
      console.error('[Login] No access_token in result');
      showToast('登录失败：未返回有效凭证');
    }
  } catch (err) {
    console.error('[Login] Error:', err);
    showToast('登录失败：' + (err.message || '邮箱或密码错误'));
  }
}

async function handleCompanyRegister() {
  showModal('企业账号开通', `
    <div style="text-align:center;padding:20px 0;">
      <div style="font-size:48px;margin-bottom:16px;">🏢</div>
      <p style="font-size:15px;color:var(--gray-700);margin-bottom:12px;">企业采购方账号由平台管理员统一开通</p>
      <p style="font-size:13px;color:var(--gray-500);">请联系平台管理员，提供公司名称、管理员姓名和邮箱即可开通</p>
      <button class="btn btn-primary" style="margin-top:20px;" onclick="closeModal()">知道了</button>
    </div>
  `);
}

async function handleIndividualRegister() {
  const name = document.getElementById('register-individual-name')?.value?.trim();
  const email = document.getElementById('register-individual-email')?.value?.trim();
  const password = document.getElementById('register-individual-password')?.value;
  const confirmPassword = document.getElementById('register-individual-confirm-password')?.value;

  if (!name || !email || !password || !confirmPassword) {
    showToast('请填写所有字段');
    return;
  }
  if (password !== confirmPassword) {
    showToast('两次输入的密码不一致');
    return;
  }
  if (password.length < 6) {
    showToast('密码至少6位');
    return;
  }

  try {
    // 第一步：创建 Supabase Auth 账号
    console.log('[Register] Creating auth user for:', email);
    const signUpResult = await supabase.signUp(email, password);
    console.log('[Register] signUp result:', signUpResult);

    if (!signUpResult.user) {
      showToast('注册失败：未创建用户账号');
      return;
    }

    // 第二步：调用 RPC 分配「采购个人用户」角色
    console.log('[Register] Assigning role via RPC...');
    const rpcResult = await supabase.rpc('register_individual_buyer', {
      p_email: email,
      p_password: password,
      p_name: name
    });
    console.log('[Register] RPC result:', rpcResult);

    if (rpcResult && rpcResult.success) {
      // 检查是否需要邮箱验证
      if (signUpResult.user && !signUpResult.user.confirmed_at) {
        showToast('注册成功！请查收验证邮件后登录');
        // 切回登录页
        const loginStepChoice = document.getElementById('login-step-choice');
        const loginStepIndividual = document.getElementById('login-step-individual');
        if (loginStepChoice) loginStepChoice.style.display = 'block';
        if (loginStepIndividual) loginStepIndividual.style.display = 'none';
      } else {
        showToast('注册成功，正在登录...');
        // 第三步：自动登录
        await doLogin(email, password);
      }
    } else {
      showToast(rpcResult?.error || '角色分配失败，请联系管理员');
    }
  } catch (err) {
    console.error('[Register] Error:', err);
    showToast('注册失败：' + (err.message || '请稍后重试'));
  }
}

function logout() {
  currentUser = null;
  currentPermissions = [];
  currentMenuPermissions = {};
  currentButtonPermissions = {};
  localStorage.removeItem('yicai_buyer_user');
  localStorage.removeItem('yicai_buyer_token');
  localStorage.removeItem('yicai_buyer_refresh');
  showLogin();
}

// ==================== 平台检测 ====================
function detectPlatform() {
  const ua = navigator.userAgent || '';
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const isSmallScreen = window.innerWidth < 768;
  return (isMobile || isSmallScreen) ? 'h5' : 'pc';
}

// ==================== 权限加载 ====================
async function loadUserPermissions() {
  try {
    const result = await supabase.rpc('get_user_permissions', { p_user_id: currentUser.id });

    if (result && result.permissions) {
      // 检测当前平台
      const currentPlatform = detectPlatform();
      console.log('[Permissions] 当前平台:', currentPlatform);
      
      // 根据平台过滤权限
      currentPermissions = result.permissions.filter(p => {
        const permPlatform = p.platform || 'all';
        return permPlatform === 'all' || permPlatform === currentPlatform;
      });
      
      currentUser.companyId = result.company_id;
      currentUser.companyName = result.company_name;
      currentUser.roles = result.roles || [];
      currentUser.isPlatformAdmin = result.is_platform_admin || false;
      currentUser.isCompanyAdmin = result.is_company_admin || false;
      
      // 保存更新后的用户信息到 localStorage
      localStorage.setItem('yicai_buyer_user', JSON.stringify(currentUser));
    } else {
      currentPermissions = [];
    }

    buildPermissionMaps();
    applyPermissionsToUI();
    showApp();

    // 加载首页数据
    loadDashboard();
  } catch (e) {
    console.warn('Load permissions failed:', e);
    currentPermissions = [];
    buildPermissionMaps();
    applyPermissionsToUI();
    showApp();
    loadDashboard();
  }
}

function buildPermissionMaps() {
  currentMenuPermissions = {};
  currentButtonPermissions = {};

  for (const perm of currentPermissions) {
    if (perm.effect !== 'allow') continue;
    if (perm.menu_path) {
      currentMenuPermissions[perm.menu_path] = true;
    }
    if (perm.button_key) {
      currentButtonPermissions[perm.button_key] = true;
    }
  }
}

function hasMenuPermission(menuPath) {
  return currentMenuPermissions[menuPath] === true;
}

function hasButtonPermission(buttonKey) {
  return currentButtonPermissions[buttonKey] === true;
}

function applyPermissionsToUI() {
  // Tab bar 显隐
  const tabAdmin = document.getElementById('tab-admin');
  if (tabAdmin) {
    tabAdmin.style.display = hasMenuPermission('page-admin') ? '' : 'none';
  }

  // 用户信息
  updateProfileInfo();
}

function updateProfileInfo() {
  if (!currentUser) return;
  const nameEl = document.getElementById('profile-user-name');
  if (nameEl) nameEl.textContent = currentUser.name || currentUser.email;

  const roleEl = document.getElementById('profile-user-role');
  if (roleEl) roleEl.textContent = currentUser.roles?.join(', ') || '普通用户';

  const avatarEl = document.getElementById('profile-avatar-text');
  if (avatarEl) avatarEl.textContent = (currentUser.name || currentUser.email || '?')[0];

  const companyEl = document.getElementById('profile-company-info');
  if (companyEl) companyEl.textContent = currentUser.companyName || '个人用户';

  const infoName = document.getElementById('info-name');
  if (infoName) infoName.textContent = currentUser.name || '-';

  const infoEmail = document.getElementById('info-email');
  if (infoEmail) infoEmail.textContent = currentUser.email || '-';

  const infoCompany = document.getElementById('info-company');
  if (infoCompany) infoCompany.textContent = currentUser.companyName || '个人用户';

  const infoRole = document.getElementById('info-role');
  if (infoRole) infoRole.textContent = currentUser.roles?.join(', ') || '普通用户';

  const infoUserType = document.getElementById('info-user-type');
  if (infoUserType) infoUserType.textContent = currentUser.companyId ? '企业用户' : '个人用户';

  // 权限列表
  const permList = document.getElementById('permissions-list');
  if (permList) {
    if (currentPermissions.length === 0) {
      permList.innerHTML = '<div style="color:#999;padding:16px 0;">暂无权限数据</div>';
    } else {
      permList.innerHTML = currentPermissions.map(p => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f0f0f0;">
          <div>
            <div style="font-weight:500;">${p.display_name || p.resource + ':' + p.action}</div>
            <div style="font-size:12px;color:#999;">${p.menu_path || p.button_key || ''}</div>
          </div>
          <span style="font-size:12px;color:${p.effect === 'allow' ? '#52c41a' : '#ff4d4f'}">${p.effect}</span>
        </div>
      `).join('');
    }
  }

  // Header role badge
  const roleBadge = document.getElementById('header-role-badge');
  if (roleBadge) {
    roleBadge.textContent = currentUser.companyId ? '企业' : '个人';
  }

  // Sidebar user info (PC)
  const sidebarAvatarText = document.getElementById('sidebar-avatar-text');
  if (sidebarAvatarText) sidebarAvatarText.textContent = (currentUser.name || currentUser.email || '?')[0];
  const sidebarUserName = document.getElementById('sidebar-user-name');
  if (sidebarUserName) sidebarUserName.textContent = currentUser.name || currentUser.email || '-';
  const sidebarUserRole = document.getElementById('sidebar-user-role');
  if (sidebarUserRole) sidebarUserRole.textContent = currentUser.companyName || (currentUser.companyId ? '企业用户' : '个人用户');

  // Dashboard greeting
  const greeting = document.getElementById('user-greeting');
  if (greeting) {
    greeting.textContent = `你好，${currentUser.name || currentUser.email}`;
  }
}

// ==================== 页面显示 ====================
function showLogin() {
  document.body.classList.remove('app-mode');
  document.getElementById('login-page').style.display = '';
  document.getElementById('main-app').style.display = 'none';
  // 重置到身份选择页
  document.getElementById('login-step-choice').style.display = '';
  document.getElementById('login-step-company').style.display = 'none';
  document.getElementById('login-step-individual').style.display = 'none';
}

function showApp() {
  document.body.classList.add('app-mode');
  document.getElementById('login-page').style.display = 'none';
  document.getElementById('main-app').style.display = '';
}

function switchPage(page) {
  console.log('[switchPage] === 开始切换页面:', page, '===');
  
  // 切换页面 - 先强制隐藏所有页面
  const allPages = document.querySelectorAll('.page');
  console.log('[switchPage] 找到', allPages.length, '个页面');
  allPages.forEach(p => {
    p.classList.remove('active');
    p.style.display = 'none'; // 强制隐藏
  });

  // 确保目标页面显示
  const target = document.getElementById('page-' + page);
  console.log('[switchPage] 目标页面元素:', target);
  if (target) {
    target.classList.add('active');
    target.style.display = 'block'; // 强制显示
    console.log('[switchPage] 目标页面已显示, display:', target.style.display);
  } else {
    console.error('[switchPage] ❌ 未找到目标页面: page-' + page);
  }

  // 切换 tab 高亮
  document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
  const activeTab = document.querySelector(`.tab-item[data-page="${page}"]`);
  if (activeTab) activeTab.classList.add('active');

  // 加载对应数据 - 使用 setTimeout 确保页面已渲染
  setTimeout(() => {
    console.log('[switchPage] 开始加载数据...');
    if (page === 'dashboard') {
      console.log('[switchPage] 加载 dashboard');
      loadDashboard();
    }
    if (page === 'inquiries') {
      console.log('[switchPage] 加载 inquiries, typeof:', typeof inquiries);
      if (typeof inquiries !== 'undefined' && inquiries.load) {
        inquiries.load().catch(err => console.error('[switchPage] inquiries.load() 失败:', err));
      } else {
        console.error('[switchPage] ❌ inquiries 未定义或没有 load 方法!');
      }
    }
    if (page === 'quotes') {
      console.log('[switchPage] 加载 quotes, typeof:', typeof quotes);
      if (typeof quotes !== 'undefined' && quotes.load) quotes.load();
    }
    if (page === 'orders') {
      console.log('[switchPage] 加载 orders, typeof:', typeof orders);
      if (typeof orders !== 'undefined' && orders.load) orders.load();
    }
    if (page === 'suppliers') {
      console.log('[switchPage] 加载 suppliers, typeof:', typeof suppliers);
      if (typeof suppliers !== 'undefined' && suppliers.load) suppliers.load();
      // 同时加载商品发现数据（默认显示商品Tab）
      if (typeof productDiscovery !== 'undefined' && productDiscovery.load && !productDiscovery._loaded) {
        productDiscovery.load();
        productDiscovery._loaded = true;
      }
    }
    if (page === 'favorites') {
      console.log('[switchPage] 加载 favorites');
      if (typeof favorites !== 'undefined' && favorites.init) favorites.init();
    }
    if (page === 'my-suppliers') {
      console.log('[switchPage] 加载 my-suppliers');
      if (typeof mySuppliers !== 'undefined' && mySuppliers.init) mySuppliers.init();
    }
  }, 50);
  
  // 隐藏供应商详情页
  const supplierDetailPage = document.getElementById('page-supplier-detail');
  if (supplierDetailPage) supplierDetailPage.classList.remove('active');
}

// ==================== 数据加载 ====================
async function loadDashboard() {
  // 简单的统计，后续可以扩展
  const statInquiries = document.getElementById('stat-inquiries');
  const statOrders = document.getElementById('stat-orders');
  const statSuppliers = document.getElementById('stat-suppliers');

  try {
    const filter = currentUser?.companyId ? { company_id: currentUser.companyId } : { created_by: currentUser?.id };
    const countI = await supabase.getCount('buyer_inquiries', filter);
    if (statInquiries) statInquiries.textContent = countI;
  } catch { if (statInquiries) statInquiries.textContent = '0'; }

  try {
    const filter = currentUser?.companyId ? { company_id: currentUser.companyId } : { buyer_user_id: currentUser?.id };
    const countO = await supabase.getCount('buyer_orders', filter);
    if (statOrders) statOrders.textContent = countO;
  } catch { if (statOrders) statOrders.textContent = '0'; }

  try {
    const countS = await supabase.getCount('suppliers', { status: 'active' });
    if (statSuppliers) statSuppliers.textContent = countS;
  } catch { if (statSuppliers) statSuppliers.textContent = '0'; }
}

// ==================== Toast ====================
function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

// ==================== Modal ====================
function showModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.style.display = 'flex';
}

function hideModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.style.display = 'none';
}
