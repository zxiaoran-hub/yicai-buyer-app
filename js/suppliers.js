/**
 * 供应商发现模块 - 异采 YiCai 品牌方端
 * 支持：搜索、筛选、精选置顶、供应商详情主页、联系供应商
 */
const suppliers = {
  searchTimer: null,
  currentFilters: { category: '', region: '', verified: '', featured: '' },
  currentKeyword: '',
  pageSize: 20,
  currentPage: 0,
  allData: [],
  useView: null, // null=未检测, true=用视图, false=回退表

  // 品类选项
  categories: ['护肤', '彩妆', '面膜', '精华', '洗护', '防晒', '香氛', '身体护理', '个护'],
  // 地区选项
  regions: ['广东', '浙江', '江苏', '上海', '山东', '福建', '北京', '四川', '湖北', '河南', '河北', '安徽', '江西', '其他'],

  async init() {
    // 检测是否可以使用视图
    if (this.useView === null) {
      try {
        const test = await supabase.query('public_supplier_profile', { select: 'id', limit: 1 });
        this.useView = Array.isArray(test) && test.length >= 0;
      } catch (e) {
        this.useView = false;
      }
    }
  },

  async load() {
    await this.init();
    this.currentPage = 0;
    this.allData = [];
    await this.loadData();
  },

  search(keyword) {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.currentKeyword = keyword.trim();
      this.currentPage = 0;
      this.allData = [];
      this.loadData();
    }, 300);
  },

  setFilter(key, value) {
    this.currentFilters[key] = value;
    this.currentPage = 0;
    this.allData = [];
    // 更新筛选按钮样式
    this.updateFilterButtons();
    this.loadData();
  },

  updateFilterButtons() {
    document.querySelectorAll('.sd-filter-btn[data-filter]').forEach(btn => {
      const key = btn.dataset.filter;
      const val = btn.dataset.value;
      if (this.currentFilters[key] === val || (!val && !this.currentFilters[key])) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  },

  _getContainers() {
    const ids = ['suppliers-list', 'suppliers-list-mobile'];
    return ids.map(id => document.getElementById(id)).filter(Boolean);
  },
  _setContainers(html) {
    this._getContainers().forEach(c => c.innerHTML = html);
  },

  async loadData() {
    const containers = this._getContainers();
    if (containers.length === 0) return;

    // 如果首次加载，显示loading
    if (this.currentPage === 0) {
      const loading = '<div class="text-center" style="padding:30px;color:var(--text-secondary);">加载中...</div>';
      this._setContainers(loading);
    }

    try {
      const tableName = this.useView ? 'public_supplier_profile' : 'suppliers';
      const params = {
        select: '*',
        order: 'company_name.asc',
        limit: this.pageSize,
        offset: this.currentPage * this.pageSize
      };

      // 构建筛选条件
      const filters = {};
      const likes = {};

      // 关键词搜索
      if (this.currentKeyword) {
        likes.company_name = '%' + this.currentKeyword + '%';
      }

      // 视图或表筛选
      if (this.useView) {
        // 视图中已筛选 is_verified=true OR is_featured=true
        if (this.currentFilters.verified === 'yes') {
          filters.is_verified = true;
        }
        if (this.currentFilters.featured === 'yes') {
          filters.is_featured = true;
        }
      } else {
        // 回退到表，需要确保只展示认证或精选的
        // 无法用 or 条件，先获取所有再前端过滤
      }

      if (this.currentFilters.category) {
        // category 可能是 ilike 模糊匹配
        likes.category = '%' + this.currentFilters.category + '%';
      }
      if (this.currentFilters.region) {
        filters.region = this.currentFilters.region;
      }

      if (Object.keys(filters).length > 0) params.filter = filters;
      if (Object.keys(likes).length > 0) params.like = likes;

      const data = await supabase.query(tableName, params);

      if (!Array.isArray(data)) {
        if (this.currentPage === 0) {
          this._setContainers('<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-text">加载失败</div></div>');
        }
        return;
      }

      // 如果用的是 suppliers 表（非视图），前端过滤
      let filtered = data;
      if (!this.useView) {
        filtered = data.filter(s => s.is_verified === true || s.is_featured === true);
        if (this.currentFilters.verified === 'yes') {
          filtered = filtered.filter(s => s.is_verified === true);
        }
        if (this.currentFilters.featured === 'yes') {
          filtered = filtered.filter(s => s.is_featured === true);
        }
      }

      // 关键词搜索（补充 description 和 category 字段）
      if (this.currentKeyword) {
        const kw = this.currentKeyword.toLowerCase();
        filtered = filtered.filter(s => {
          return (s.company_name || '').toLowerCase().includes(kw)
            || (s.short_name || '').toLowerCase().includes(kw)
            || (s.description || '').toLowerCase().includes(kw)
            || (s.category || '').toLowerCase().includes(kw);
        });
      }

      this.allData = this.allData.concat(filtered);
      this.renderAll();
    } catch (e) {
      if (this.currentPage === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-text">加载失败: ' + escapeHtml(e.message) + '</div></div>';
      }
    }
  },

  loadMore() {
    this.currentPage++;
    this.loadData();
  },

  renderAll() {
    if (this.allData.length === 0) {
      this._setContainers('<div class="empty-state"><div class="empty-icon">🏭</div><div class="empty-text">暂无匹配的供应商</div><div style="font-size:12px;color:var(--text-secondary);margin-top:8px;">试试调整筛选条件</div></div>');
      return;
    }

    // 分离精选和普通
    const featured = this.allData.filter(s => s.is_featured === true);
    const regular = this.allData.filter(s => s.is_featured !== true);

    // 精选排序
    featured.sort((a, b) => {
      const orderA = a.featured_order || 999;
      const orderB = b.featured_order || 999;
      if (orderA !== orderB) return orderA - orderB;
      return (b.rating || 0) - (a.rating || 0);
    });

    // 普通排序：按评分/名称
    regular.sort((a, b) => {
      if (a.is_verified && !b.is_verified) return -1;
      if (!a.is_verified && b.is_verified) return 1;
      return (b.rating || 0) - (a.rating || 0) || (a.company_name || '').localeCompare(b.company_name || '');
    });

    let html = '';

    // 精选区域
    if (featured.length > 0) {
      html += '<div class="sd-featured-section">';
      html += '<div class="sd-section-header"><span class="sd-section-icon">⭐</span><span class="sd-section-title">平台精选</span><span class="sd-section-count">' + featured.length + '家</span></div>';
      html += featured.map(item => this.renderCard(item, true)).join('');
      html += '</div>';
    }

    // 全部供应商（包含精选）
    const allSorted = [...featured, ...regular];
    if (allSorted.length > 0) {
      html += '<div class="sd-section-header" style="margin-top:20px;"><span class="sd-section-title" style="font-size:14px;">全部供应商</span><span class="sd-section-count">' + allSorted.length + '</span></div>';
      html += allSorted.map(item => this.renderCard(item, item.is_featured === true)).join('');
    }

    // 加载更多按钮
    if (this.allData.length >= this.pageSize * (this.currentPage + 1)) {
      html += '<div class="sd-load-more" onclick="suppliers.loadMore()"><span>加载更多</span><span style="font-size:12px;">↓</span></div>';
    }

    this._setContainers(html);
  },

  renderCard(item, isFeatured) {
    const name = escapeHtml(item.company_name || item.short_name || '未命名');
    const initial = (item.company_name || item.short_name || '供')[0];
    const region = item.region ? escapeHtml(item.region) : '';
    const category = item.category ? (Array.isArray(item.category) ? item.category : item.category.split(',').map(c => c.trim())) : [];
    const productCount = item.product_count || 0;
    const desc = item.description ? escapeHtml(item.description) : '';
    const descShort = desc.length > 60 ? desc.substring(0, 60) + '...' : desc;

    let badges = '';
    if (isFeatured) {
      badges += '<span class="sd-badge sd-badge-featured">⭐ 精选</span>';
    }
    if (item.is_verified) {
      badges += '<span class="sd-badge sd-badge-verified">✓ 已认证</span>';
    }

    const catTags = category.slice(0, 3).map(c => '<span class="sd-cat-tag">' + escapeHtml(c) + '</span>').join('');

    return `
      <div class="supplier-card sd-card" onclick="suppliers.showDetail('${item.id}')">
        <div class="supplier-avatar sd-avatar${isFeatured ? ' sd-avatar-featured' : ''}">${escapeHtml(initial)}</div>
        <div class="supplier-info sd-info">
          <div class="supplier-name sd-name">
            <span class="sd-name-text">${name}</span>
            <div class="sd-badges">${badges}</div>
          </div>
          <div class="supplier-meta sd-meta">
            ${region ? '<span>📍 ' + region + '</span>' : ''}
            ${item.established_year ? '<span>📅 ' + escapeHtml(String(item.established_year)) + '年成立</span>' : ''}
            ${productCount > 0 ? '<span>📦 ' + productCount + '个产品</span>' : ''}
            ${item.rating ? '<span>⭐ ' + Number(item.rating).toFixed(1) + '</span>' : ''}
          </div>
          ${catTags ? '<div class="supplier-tags sd-tags">' + catTags + '</div>' : ''}
          ${descShort ? '<div class="sd-desc">' + descShort + '</div>' : ''}
        </div>
      </div>
    `;
  },

  // ==================== 供应商详情主页 ====================
  async showDetail(supplierId) {
    const page = document.getElementById('page-supplier-detail');
    if (!page) {
      showToast('供应商详情页面未找到');
      return;
    }

    // 显示详情页，隐藏列表页
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    page.classList.add('active');

    const container = document.getElementById('supplier-detail-content');
    container.innerHTML = '<div class="text-center" style="padding:40px;color:var(--text-secondary);">加载中...</div>';

    try {
      // 加载供应商信息
      const tableName = this.useView ? 'public_supplier_profile' : 'suppliers';
      const data = await supabase.query(tableName, {
        select: '*',
        filter: { id: supplierId }
      });

      if (!data || !data[0]) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-text">未找到供应商信息</div></div>';
        return;
      }

      const s = data[0];
      this.currentDetailSupplier = s;

      // 渲染头部
      this.renderDetailHeader(s);
      // 默认加载简介tab
      this.switchDetailTab('intro');
      // 加载收藏状态并更新按钮
      await this.loadSupplierFavorites();
      this.updateDetailButtons();
    } catch (e) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-text">加载失败: ' + escapeHtml(e.message) + '</div></div>';
    }
  },

  renderDetailHeader(s) {
    const name = escapeHtml(s.company_name || s.short_name || '未命名');
    const initial = (s.company_name || s.short_name || '供')[0];
    const headerEl = document.getElementById('sd-header');

    let badges = '';
    if (s.is_featured) badges += '<span class="sd-badge sd-badge-featured">⭐ 精选</span>';
    if (s.is_verified) badges += '<span class="sd-badge sd-badge-verified">✓ 已认证</span>';

    let metaItems = '';
    if (s.region) metaItems += '<div class="sd-meta-item"><span class="sd-meta-icon">📍</span><span>' + escapeHtml(s.region) + '</span></div>';
    if (s.established_year) metaItems += '<div class="sd-meta-item"><span class="sd-meta-icon">📅</span><span>' + escapeHtml(String(s.established_year)) + '年成立</span></div>';
    if (s.employee_count) metaItems += '<div class="sd-meta-item"><span class="sd-meta-icon">👥</span><span>' + escapeHtml(String(s.employee_count)) + '人</span></div>';
    if (s.factory_area) metaItems += '<div class="sd-meta-item"><span class="sd-meta-icon">🏭</span><span>' + escapeHtml(String(s.factory_area)) + '㎡</span></div>';
    if (s.rating) metaItems += '<div class="sd-meta-item"><span class="sd-meta-icon">⭐</span><span>' + Number(s.rating).toFixed(1) + '分</span></div>';

    headerEl.innerHTML = `
      <div class="sd-header-top">
        <div class="sd-header-avatar">${escapeHtml(initial)}</div>
        <div class="sd-header-info">
          <div class="sd-header-name">${name}</div>
          <div class="sd-header-badges">${badges}</div>
        </div>
      </div>
      <div class="sd-header-meta">${metaItems}</div>
    `;
  },

  switchDetailTab(tab) {
    // 更新 tab 样式
    document.querySelectorAll('#page-supplier-detail .sd-detail-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tab);
    });

    const content = document.getElementById('sd-tab-content');
    const s = this.currentDetailSupplier;
    if (!s) return;

    switch (tab) {
      case 'intro':
        content.innerHTML = this.renderIntroTab(s);
        break;
      case 'products':
        content.innerHTML = '<div class="text-center" style="padding:20px;color:var(--text-secondary);">加载产品中...</div>';
        this.loadSupplierProducts(s.id);
        break;
      case 'certs':
        content.innerHTML = this.renderCertsTab(s);
        break;
    }
  },

  renderIntroTab(s) {
    const desc = s.description ? escapeHtml(s.description) : '<span style="color:var(--text-secondary);">暂无简介</span>';
    const category = s.category
      ? (Array.isArray(s.category) ? s.category : s.category.split(',').map(c => c.trim()))
          .map(c => '<span class="sd-cat-tag">' + escapeHtml(c) + '</span>').join('')
      : '';

    return `
      <div class="sd-intro">
        ${category ? '<div class="sd-intro-section"><div class="sd-intro-label">经营品类</div><div class="sd-tags">' + category + '</div></div>' : ''}
        <div class="sd-intro-section">
          <div class="sd-intro-label">公司简介</div>
          <div class="sd-intro-text">${desc}</div>
        </div>
        ${s.contact_name ? '<div class="sd-intro-section"><div class="sd-intro-label">联系人</div><div class="sd-intro-text">' + escapeHtml(s.contact_name) + '</div></div>' : ''}
        ${s.contact_email ? '<div class="sd-intro-section"><div class="sd-intro-label">联系邮箱</div><div class="sd-intro-text">' + escapeHtml(s.contact_email) + '</div></div>' : ''}
      </div>
    `;
  },

  async loadSupplierProducts(supplierId) {
    const content = document.getElementById('sd-tab-content');
    try {
      const products = await supabase.query('products', {
        select: '*',
        filter: { supplier_id: supplierId },
        order: 'created_at.desc'
      });

      if (!products || products.length === 0) {
        content.innerHTML = '<div class="empty-state"><div class="empty-icon">📦</div><div class="empty-text">暂无产品/服务</div></div>';
        return;
      }

      content.innerHTML = '<div class="sd-products">' + products.map(p => {
        const name = escapeHtml(p.name || '未命名产品');
        const cat = p.category ? '<span class="sd-cat-tag">' + escapeHtml(p.category) + '</span>' : '';
        const desc = p.description ? escapeHtml(p.description) : '';
        const descShort = desc.length > 80 ? desc.substring(0, 80) + '...' : desc;
        const price = p.price_range ? escapeHtml(p.price_range) : '';
        const moq = p.moq ? '起订量: ' + escapeHtml(String(p.moq)) : '';

        return `
          <div class="sd-product-card">
            <div class="sd-product-header">
              <span class="sd-product-name">${name}</span>
              ${cat}
            </div>
            ${descShort ? '<div class="sd-product-desc">' + descShort + '</div>' : ''}
            <div class="sd-product-meta">
              ${price ? '<span>💰 ' + price + '</span>' : ''}
              ${moq ? '<span>📊 ' + moq + '</span>' : ''}
            </div>
          </div>
        `;
      }).join('') + '</div>';
    } catch (e) {
      content.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-text">加载产品失败</div></div>';
    }
  },

  renderCertsTab(s) {
    const certs = s.certifications;
    const certImages = s.cert_images;

    let certsHtml = '';
    if (certs) {
      const certList = Array.isArray(certs) ? certs : String(certs).split(',').map(c => c.trim()).filter(Boolean);
      if (certList.length > 0) {
        certsHtml = '<div class="sd-intro-section"><div class="sd-intro-label">资质证书</div><div class="sd-cert-list">' +
          certList.map(c => '<div class="sd-cert-item">📜 ' + escapeHtml(c) + '</div>').join('') +
          '</div></div>';
      }
    }

    let imgsHtml = '';
    if (certImages) {
      const imgList = Array.isArray(certImages) ? certImages : String(certImages).split(',').map(c => c.trim()).filter(Boolean);
      if (imgList.length > 0) {
        imgsHtml = '<div class="sd-intro-section"><div class="sd-intro-label">证书图片</div><div class="sd-cert-images">' +
          imgList.map(url => '<img src="' + escapeHtml(url) + '" class="sd-cert-img" loading="lazy">').join('') +
          '</div></div>';
      }
    }

    if (!certsHtml && !imgsHtml) {
      return '<div class="empty-state"><div class="empty-icon">📜</div><div class="empty-text">暂无资质证书信息</div></div>';
    }

    return certsHtml + imgsHtml;
  },

  backToList() {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const listPage = document.getElementById('page-suppliers');
    if (listPage) listPage.classList.add('active');

    // 恢复 tab bar 高亮
    document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
    const tab = document.querySelector('.tab-item[data-page="suppliers"]');
    if (tab) tab.classList.add('active');
  },

  // 联系供应商 → 打开询盘表单
  contactSupplier() {
    const s = this.currentDetailSupplier;
    if (!s) return;

    // 回到供应商列表页
    this.backToList();

    // 打开询盘表单并预填供应商信息
    setTimeout(() => {
      if (typeof inquiries !== 'undefined') {
        inquiries.showCreateForm(s.company_name || s.short_name || '');
      }
    }, 100);
  },

  // 获取推荐供应商（供 inquiries 模块调用）
  async getMatchedSuppliers(category, region, limit) {
    limit = limit || 10;
    try {
      // 优先使用 RPC
      const result = await supabase.rpc('match_suppliers_for_inquiry', {
        p_category: category || null,
        p_region: region || null,
        p_limit: limit
      });
      if (Array.isArray(result) && result.length > 0) {
        return result;
      }
    } catch (e) {
      // RPC 失败，回退到前端匹配
    }

    // 前端回退匹配
    try {
      const tableName = this.useView ? 'public_supplier_profile' : 'suppliers';
      const allSuppliers = await supabase.query(tableName, {
        select: '*',
        limit: 50
      });

      if (!Array.isArray(allSuppliers)) return [];

      // 评分计算
      return allSuppliers
        .filter(s => s.is_verified === true || s.is_featured === true)
        .map(s => {
          let score = 0;
          if (category && s.category) {
            const cats = Array.isArray(s.category) ? s.category : s.category.split(',').map(c => c.trim());
            if (cats.some(c => c.includes(category) || category.includes(c))) score += 40;
          }
          if (region && s.region === region) score += 20;
          if (s.is_verified) score += 20;
          if (s.is_featured) score += 15;
          score += (s.rating || 0) * 5;
          return { ...s, match_score: score };
        })
        .filter(s => s.match_score > 0)
        .sort((a, b) => b.match_score - a.match_score)
        .slice(0, limit);
    } catch (e) {
      return [];
    }
  },

  // ==================== 供应商收藏 & 加为我的供应商 ====================
  supplierFavorites: new Set(),

  async loadSupplierFavorites() {
    if (!currentUser) return;
    try {
      const favs = await supabase.query('supplier_favorites', {
        select: 'supplier_id',
        filter: { user_id: currentUser.id }
      });
      this.supplierFavorites = new Set(favs.map(f => f.supplier_id));
    } catch (e) { /* table might not exist yet */ }
  },

  async updateDetailButtons() {
    if (!this.currentDetailSupplier || !currentUser) return;
    const sid = this.currentDetailSupplier.id;

    // 更新收藏按钮
    const favBtn = document.getElementById('sd-fav-btn');
    if (favBtn) {
      const isFav = this.supplierFavorites.has(sid);
      favBtn.textContent = isFav ? '❤️' : '🤍';
      favBtn.title = isFav ? '取消收藏' : '收藏';
    }
  },

  async toggleFavorite() {
    if (!currentUser) { showToast('请先登录'); return; }
    if (!this.currentDetailSupplier) return;
    const sid = this.currentDetailSupplier.id;
    const isFav = this.supplierFavorites.has(sid);

    try {
      if (isFav) {
        await supabase.delete('supplier_favorites', { user_id: currentUser.id, supplier_id: sid });
        this.supplierFavorites.delete(sid);
        showToast('已取消收藏');
      } else {
        await supabase.insert('supplier_favorites', { user_id: currentUser.id, supplier_id: sid });
        this.supplierFavorites.add(sid);
        showToast('已收藏 ❤️');
      }
      this.updateDetailButtons();
    } catch (e) {
      showToast('操作失败');
    }
  },

  async addToMySuppliers() {
    if (!currentUser) { showToast('请先登录'); return; }
    if (!this.currentDetailSupplier) return;
    const sid = this.currentDetailSupplier.id;

    try {
      // 检查是否已存在
      const existing = await supabase.query('buyer_supplier_relations', {
        filter: { buyer_user_id: currentUser.id, supplier_id: sid }
      });
      if (existing.length) {
        showToast('已在我的供应商列表中');
        return;
      }
      await supabase.insert('buyer_supplier_relations', {
        buyer_user_id: currentUser.id,
        supplier_id: sid,
        buyer_company_id: currentUser.companyId || null,
        status: 'potential',
        source: 'discovery',
        notes: '',
        tags: []
      });
      showToast('已添加到我的供应商 ✅');
    } catch (e) {
      showToast('添加失败');
    }
  }
};
