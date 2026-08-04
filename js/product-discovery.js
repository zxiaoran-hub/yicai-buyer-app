/**
 * 商品发现模块 - 异采 YiCai 品牌方端
 * 功能：按商品维度浏览、搜索、筛选、收藏、商品详情、从商品发起询价
 */

// Tab 切换
function discoverySwitchTab(tab) {
  const supplierView = document.getElementById('view-supplier');
  const productView = document.getElementById('view-product');
  const tabSupplier = document.getElementById('tab-supplier');
  const tabProduct = document.getElementById('tab-product');

  if (tab === 'supplier') {
    supplierView.style.display = '';
    productView.style.display = 'none';
    tabSupplier.classList.add('active');
    tabProduct.classList.remove('active');
  } else {
    supplierView.style.display = 'none';
    productView.style.display = '';
    tabProduct.classList.add('active');
    tabSupplier.classList.remove('active');
    // 首次切换到商品时加载
    if (!productDiscovery._loaded) {
      productDiscovery.load();
      productDiscovery._loaded = true;
    }
  }
}

// 初始化 Tab 样式
document.addEventListener('DOMContentLoaded', function() {
  const tabSupplier = document.getElementById('tab-supplier');
  if (tabSupplier) {
    tabSupplier.style.background = 'white';
    tabSupplier.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
    tabSupplier.style.color = 'var(--primary)';
  }
});

const productDiscovery = {
  _loaded: false,
  searchTimer: null,
  currentKeyword: '',
  filters: { category: '', sample: false, custom: false },
  allProducts: [],
  favorites: new Set(),

  _getContainers() {
    const ids = ['products-discovery-list', 'products-discovery-list-mobile'];
    return ids.map(id => document.getElementById(id)).filter(Boolean);
  },
  _setContainers(html) {
    this._getContainers().forEach(c => c.innerHTML = html);
  },

  async load() {
    this._setContainers('<div class="text-center" style="padding:30px;color:var(--text-secondary);">加载商品中...</div>');
    await this.loadFavorites();
    await this.searchProducts();
  },

  async loadFavorites() {
    try {
      if (!localStorage.getItem('yicai_buyer_user')) return;

      // 获取用户收藏列表（服务端按当前登录用户过滤）
      const result = await supabase.query('product_favorites', { select: 'product_id' });
      if (Array.isArray(result)) {
        this.favorites = new Set(result.map(f => f.product_id));
      }
    } catch (e) {
      // 静默失败
    }
  },

  search(keyword) {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.currentKeyword = keyword.trim();
      this.searchProducts();
    }, 400);
  },

  setFilter(key, value) {
    this.filters[key] = value;
    this.searchProducts();
  },

  toggleFilter(key) {
    if (key === 'sample') {
      this.filters.sample = !this.filters.sample;
      const btn = document.getElementById('pfilter-sample');
      if (btn) btn.classList.toggle('active', this.filters.sample);
    } else if (key === 'custom') {
      this.filters.custom = !this.filters.custom;
      const btn = document.getElementById('pfilter-custom');
      if (btn) btn.classList.toggle('active', this.filters.custom);
    }
    this.searchProducts();
  },

  async searchProducts() {
    try {
      const result = await supabase.rpc('search_products', {
        p_keyword: this.currentKeyword || null,
        p_category: this.filters.category || null,
        p_sample_available: this.filters.sample || null,
        p_custom_capability: this.filters.custom || null,
        p_limit: 100,
        p_offset: 0
      });

      if (!Array.isArray(result)) {
        await this.fallbackSearch();
        return;
      }

      this.allProducts = result;
      this.renderProducts();
    } catch (e) {
      await this.fallbackSearch();
    }
  },

  async fallbackSearch() {
    try {
      const params = { select: '*', filter: { status: 'active' }, order: 'created_at.desc', limit: 100 };
      const data = await supabase.query('products', params);

      if (!Array.isArray(data)) {
        this._setContainers('<div class="empty-state"><div class="empty-icon">📦</div><div class="empty-text">暂无商品</div><div style="font-size:12px;color:var(--text-secondary);margin-top:8px;">供应商还未上架商品</div></div>');
        return;
      }

      let filtered = data;
      if (this.currentKeyword) {
        const kw = this.currentKeyword.toLowerCase();
        filtered = filtered.filter(p =>
          (p.name || '').toLowerCase().includes(kw) ||
          (p.category || '').toLowerCase().includes(kw) ||
          (p.description || '').toLowerCase().includes(kw)
        );
      }
      if (this.filters.category) {
        filtered = filtered.filter(p => (p.category || '') === this.filters.category || (p.category || '').includes(this.filters.category));
      }
      if (this.filters.sample) {
        filtered = filtered.filter(p => p.sample_available);
      }
      if (this.filters.custom) {
        filtered = filtered.filter(p => p.custom_capability);
      }

      this.allProducts = filtered;
      this.renderProducts();
    } catch (e) {
      this._setContainers('<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-text">加载失败: ' + escapeHtml(e.message) + '</div></div>');
    }
  },

  renderProducts() {
    if (this.allProducts.length === 0) {
      this._setContainers('<div class="empty-state"><div class="empty-icon"></div><div class="empty-text">暂无匹配商品</div><div style="font-size:12px;color:var(--text-secondary);margin-top:8px;">试试调整筛选条件</div></div>');
      return;
    }

    this._setContainers('<div class="product-discovery-grid">' +
      this.allProducts.map(p => this.renderProductCard(p)).join('') +
      '</div>');
  },

  renderProductCard(p) {
    const name = escapeHtml(p.name || '未命名');
    const initial = (p.name || '商')[0];
    const category = escapeHtml(p.category || '');
    const priceMin = p.price_min ? Number(p.price_min).toFixed(2) : '0.00';
    const priceMax = p.price_max ? Number(p.price_max).toFixed(2) : '0.00';
    const unit = escapeHtml(p.price_unit || '件');
    const moq = p.moq || 0;
    const supplierName = escapeHtml(p.supplier_name || '');
    const isFav = this.favorites.has(p.id);
    const img = p.images && p.images.length ? p.images[0] : null;

    let badges = '';
    if (p.sample_available) badges += '<span style="font-size:10px;background:#e3f2fd;color:#1976d2;padding:1px 6px;border-radius:8px;">可取样</span> ';
    if (p.custom_capability) badges += '<span style="font-size:10px;background:#f3e5f5;color:#7b1fa2;padding:1px 6px;border-radius:8px;">可定制</span>';

    return `
      <div class="pd-card" onclick="productDiscovery.showDetail('${p.id}')">
        <div class="pd-card-img">
          ${img ? `<img src="${escapeHtml(img)}" loading="lazy" style="width:100%;height:100%;object-fit:cover;">` : `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:28px;color:var(--text-secondary);">🧴</div>`}
          <div class="pd-fav-btn ${isFav ? 'active' : ''}" onclick="event.stopPropagation();productDiscovery.toggleFavorite('${p.id}')" title="${isFav ? '取消收藏' : '收藏'}">${isFav ? '❤️' : '🤍'}</div>
        </div>
        <div class="pd-card-body">
          <div class="pd-card-name">${name}</div>
          ${category ? `<div class="pd-card-cat">${category}</div>` : ''}
          ${badges ? `<div class="pd-card-badges">${badges}</div>` : ''}
          <div class="pd-card-price">¥${priceMin} - ¥${priceMax}<span style="font-size:10px;color:var(--text-secondary);">/${unit}</span></div>
          <div class="pd-card-meta">
            <span>MOQ: ${moq}${unit}</span>
            ${supplierName ? `<span>🏭 ${supplierName}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  },

  // ==================== 商品详情 ====================
  showDetail(productId) {
    const p = this.allProducts.find(item => item.id === productId);
    if (!p) return;

    const content = document.getElementById('product-detail-content');
    const isFav = this.favorites.has(p.id);

    const img = p.images && p.images.length ? p.images[0] : null;
    const priceMin = p.price_min ? Number(p.price_min).toFixed(2) : '0.00';
    const priceMax = p.price_max ? Number(p.price_max).toFixed(2) : '0.00';
    const unit = escapeHtml(p.price_unit || '件');

    let html = '';

    // 商品图片
    if (p.images && p.images.length > 0) {
      html += '<div style="display:flex;gap:8px;overflow-x:auto;margin-bottom:16px;padding-bottom:4px;">';
      p.images.forEach(url => {
        html += `<img src="${escapeHtml(url)}" style="width:120px;height:120px;border-radius:8px;object-fit:cover;flex-shrink:0;">`;
      });
      html += '</div>';
    }

    // 名称 + 收藏
    html += `<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
      <h3 style="margin:0;font-size:18px;font-weight:600;">${escapeHtml(p.name)}</h3>
      <div onclick="event.stopPropagation();productDiscovery.toggleFavorite('${p.id}');productDiscovery.showDetail('${p.id}')" style="cursor:pointer;font-size:20px;padding:4px;">${isFav ? '❤️' : '🤍'}</div>
    </div>`;

    // 品类
    if (p.category) {
      html += `<div style="margin-bottom:12px;"><span style="font-size:12px;background:var(--bg-secondary,#f0f0f0);padding:4px 10px;border-radius:12px;color:var(--text-secondary);">${escapeHtml(p.category)}</span></div>`;
    }

    // 价格
    html += `<div style="background:linear-gradient(135deg,#fff5f5,#fff);border-radius:10px;padding:12px;margin-bottom:12px;">
      <div style="font-size:20px;font-weight:700;color:var(--danger,#e53935);">¥${priceMin} - ¥${priceMax}<span style="font-size:12px;font-weight:400;color:var(--text-secondary);">/${unit}</span></div>
      <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">最小起订量: ${p.moq || 0}${unit}</div>
    </div>`;

    // 标签
    let badges = '';
    if (p.sample_available) badges += `<span style="font-size:12px;background:#e3f2fd;color:#1976d2;padding:4px 10px;border-radius:12px;">🧪 可提供样品${p.sample_price ? ' ¥' + escapeHtml(p.sample_price) : ''}</span> `;
    if (p.custom_capability) badges += `<span style="font-size:12px;background:#f3e5f5;color:#7b1fa2;padding:4px 10px;border-radius:12px;">🔧 支持定制</span> `;
    if (p.lead_time) badges += `<span style="font-size:12px;background:#e8f5e9;color:#388e3c;padding:4px 10px;border-radius:12px;">📅 交期 ${escapeHtml(p.lead_time)}</span>`;
    if (badges) html += `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">${badges}</div>`;

    // 描述
    if (p.description) {
      html += `<div style="margin-bottom:16px;">
        <div style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:6px;">商品描述</div>
        <div style="font-size:14px;line-height:1.6;color:var(--text);">${escapeHtml(p.description)}</div>
      </div>`;
    }

    // 供应商信息
    if (p.supplier_name) {
      html += `<div style="background:var(--bg-secondary,#f5f5f5);border-radius:10px;padding:12px;margin-bottom:16px;">
        <div style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:6px;">供应商</div>
        <div style="font-size:15px;font-weight:600;">${escapeHtml(p.supplier_name)}</div>
        ${p.supplier_region ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">📍 ${escapeHtml(p.supplier_region)}</div>` : ''}
        ${p.supplier_verified ? `<div style="font-size:12px;color:#1976d2;margin-top:2px;">✓ 已认证</div>` : ''}
      </div>`;
    }

    // 操作按钮
    html += `<div style="display:flex;gap:8px;margin-top:16px;">
      <button class="btn btn-primary" style="flex:1;" onclick="productDiscovery.inquiryFromProduct('${p.id}')">💬 向供应商询价</button>
      ${p.supplier_id ? `<button class="btn btn-outline" onclick="productDiscovery.viewSupplier('${p.supplier_id}')">查看供应商</button>` : ''}
    </div>`;

    content.innerHTML = html;
    showModal('product-detail-modal');
  },

  // ==================== 收藏功能 ====================
  async toggleFavorite(productId) {
    const isFav = this.favorites.has(productId);

    try {
      if (isFav) {
        // 取消收藏
        await supabase.delete('product_favorites', { user_id: getCurrentUserId(), product_id: productId });
        this.favorites.delete(productId);
        showToast('已取消收藏');
      } else {
        // 添加收藏
        await supabase.insert('product_favorites', { user_id: getCurrentUserId(), product_id: productId });
        this.favorites.add(productId);
        showToast('已收藏 ❤️');
      }
      // 重新渲染列表
      this.renderProducts();
    } catch (e) {
      showToast('操作失败: ' + e.message);
    }
  },

  // ==================== 从商品发起询价 ====================
  inquiryFromProduct(productId) {
    const p = this.allProducts.find(item => item.id === productId);
    if (!p) return;

    hideModal('product-detail-modal');

    // 等弹窗关闭后打开询价表单
    setTimeout(() => {
      if (typeof inquiries !== 'undefined' && inquiries.showCreateForm) {
        // 预填商品信息
        const supplierName = p.supplier_name || '';
        inquiries.showCreateForm(supplierName);
        // 在询价描述中自动添加商品信息
        setTimeout(() => {
          const descEl = document.getElementById('inquiry-description');
          if (descEl && !descEl.value) {
            descEl.value = `询价商品：${p.name}\n品类：${p.category || '-'}\n期望数量：${p.moq || 0}${p.price_unit || '件'}\n\n请提供报价及交期信息。`;
          }
          // 记录 product_id 到隐藏字段
          let pidField = document.getElementById('inquiry-product-id');
          if (!pidField) {
            pidField = document.createElement('input');
            pidField.type = 'hidden';
            pidField.id = 'inquiry-product-id';
            const form = document.getElementById('inquiry-form') || descEl?.closest('form');
            if (form) form.appendChild(pidField);
          }
          pidField.value = productId;
        }, 200);
      }
    }, 300);
  },

  // 查看供应商详情
  viewSupplier(supplierId) {
    hideModal('product-detail-modal');
    setTimeout(() => {
      if (suppliers && suppliers.showDetail) {
        // 切回供应商 Tab
        discoverySwitchTab('supplier');
        suppliers.showDetail(supplierId);
      }
    }, 300);
  }
};

// 辅助：获取当前用户 ID
function getCurrentUserId() {
  try {
    const userJson = localStorage.getItem('yicai_buyer_user');
    if (userJson) {
      const user = JSON.parse(userJson);
      if (user && user.id) return user.id;
    }
    const token = localStorage.getItem('yicai_buyer_token');
    if (!token) return null;
    const payload = decodeJwtPayload(token);
    return payload ? payload.sub : null;
  } catch (e) {
    return null;
  }
}
