/**
 * 异采 YiCai - 我的供应商模块
 * 功能：供应商关系管理、备注标签、状态管理、联系记录
 */
const mySuppliers = {
  currentView: 'list', // list | detail
  currentFilter: null,
  suppliers: [],

  statusLabels: {
    potential: '待接触',
    contacted: '已联系',
    cooperating: '合作中',
    blacklisted: '已拉黑'
  },
  statusColors: {
    potential: '#999',
    contacted: '#2196F3',
    cooperating: '#4CAF50',
    blacklisted: '#f44336'
  },

  init() {
    this.currentView = 'list';
    this.loadList();
  },

  // ==================== 列表视图 ====================
  async loadList() {
    const container = document.getElementById('my-suppliers-list');
    container.innerHTML = '<div class="loading-spinner">加载中...</div>';

    try {
      if (!currentUser) { container.innerHTML = '<div class="empty-state">请先登录</div>'; return; }

      // 用 RPC 获取完整列表
      let result;
      try {
        result = await supabase.rpc('get_my_suppliers', {
          p_user_id: currentUser.id,
          p_status: this.currentFilter
        });
      } catch (e) {
        // RPC 不可用，回退到直接查询
        const relations = await supabase.query('buyer_supplier_relations', {
          filter: { buyer_user_id: currentUser.id },
          order: 'updated_at.desc'
        });
        if (!relations.length) {
          this.suppliers = [];
          this.renderList();
          return;
        }
        // 获取供应商详情
        const supplierIds = relations.map(r => r.supplier_id);
        const allSuppliers = await supabase.query('suppliers', { select: 'id,company_name,region,category,is_verified,rating,contact_name,contact_email' });
        const suppMap = Object.fromEntries(allSuppliers.filter(s => supplierIds.includes(s.id)).map(s => [s.id, s]));
        this.suppliers = relations.map(r => ({
          relation_id: r.id,
          supplier_id: r.supplier_id,
          status: r.status,
          tags: r.tags || [],
          notes: r.notes || '',
          source: r.source,
          company_name: suppMap[r.supplier_id]?.company_name || '未知',
          region: suppMap[r.supplier_id]?.region || '',
          category: suppMap[r.supplier_id]?.category || [],
          is_verified: suppMap[r.supplier_id]?.is_verified || false,
          rating: suppMap[r.supplier_id]?.rating || 0,
          contact_name: suppMap[r.supplier_id]?.contact_name || '',
          contact_email: suppMap[r.supplier_id]?.contact_email || '',
          created_at: r.created_at,
          updated_at: r.updated_at
        }));
        this.renderList();
        return;
      }

      this.suppliers = result || [];
      this.renderList();
    } catch (e) {
      console.error('Load my suppliers error:', e);
      container.innerHTML = '<div class="empty-state">加载失败，请刷新重试</div>';
    }
  },

  renderList() {
    const container = document.getElementById('my-suppliers-list');
    const filterBar = this.renderFilterBar();

    if (!this.suppliers.length) {
      container.innerHTML = filterBar + '<div class="empty-state"><div style="font-size:48px;margin-bottom:12px;">📋</div><div>还没有供应商</div><div style="font-size:13px;color:#999;margin-top:4px;">在发现页联系供应商后会自动添加<br>也可以手动添加供应商到列表</div></div>';
      return;
    }

    const listHtml = this.suppliers.map(s => {
      const cats = Array.isArray(s.category) ? s.category.slice(0, 2).join('、') : '';
      const tags = (s.tags || []).map(t => `<span class="ms-tag">${escapeHtml(t)}</span>`).join('');
      const statusColor = this.statusColors[s.status] || '#999';
      const statusLabel = this.statusLabels[s.status] || s.status;

      return `
        <div class="ms-card" onclick="mySuppliers.viewDetail('${s.supplier_id}')">
          <div class="ms-card-header">
            <div class="ms-card-name">${escapeHtml(s.company_name)}</div>
            <span class="ms-status-badge" style="background:${statusColor}">${statusLabel}</span>
          </div>
          <div class="ms-card-meta">
            ${s.region ? `<span>📍 ${escapeHtml(s.region)}</span>` : ''}
            ${cats ? `<span>🏭 ${escapeHtml(cats)}</span>` : ''}
            ${s.is_verified ? '<span class="ms-verified">✓已认证</span>' : ''}
          </div>
          ${tags ? `<div class="ms-card-tags">${tags}</div>` : ''}
          ${s.notes ? `<div class="ms-card-notes">📝 ${escapeHtml(s.notes.substring(0, 50))}${s.notes.length > 50 ? '...' : ''}</div>` : ''}
          <div class="ms-card-footer">
            <span class="ms-source">来源: ${this.getSourceLabel(s.source)}</span>
            <span class="ms-time">${this.formatTime(s.updated_at)}</span>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = filterBar + listHtml;
  },

  renderFilterBar() {
    const filters = [
      { key: null, label: '全部' },
      { key: 'potential', label: '待接触' },
      { key: 'contacted', label: '已联系' },
      { key: 'cooperating', label: '合作中' },
      { key: 'blacklisted', label: '已拉黑' }
    ];
    return `
      <div class="ms-filter-bar">
        ${filters.map(f => `
          <div class="ms-filter-item ${this.currentFilter === f.key ? 'active' : ''}" onclick="mySuppliers.filterBy(${f.key ? `'${f.key}'` : 'null'})">${f.label}</div>
        `).join('')}
      </div>
    `;
  },

  filterBy(status) {
    this.currentFilter = status;
    this.loadList();
  },

  getSourceLabel(source) {
    const labels = { discovery: '发现', inquiry: '询盘', order: '订单', manual: '手动添加' };
    return labels[source] || source;
  },

  formatTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now - d;
    if (diff < 86400000) return '今天';
    if (diff < 172800000) return '昨天';
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;
    return `${d.getMonth() + 1}/${d.getDate()}`;
  },

  // ==================== 详情视图 ====================
  async viewDetail(supplierId) {
    this.currentView = 'detail';
    document.getElementById('my-suppliers-list-view').style.display = 'none';
    document.getElementById('my-suppliers-detail-view').style.display = '';

    const container = document.getElementById('ms-detail-content');
    container.innerHTML = '<div class="loading-spinner">加载中...</div>';

    const rel = this.suppliers.find(s => s.supplier_id === supplierId);
    if (!rel) { container.innerHTML = '<div class="empty-state">未找到该供应商</div>'; return; }

    const statusOptions = Object.entries(this.statusLabels).map(([k, v]) =>
      `<option value="${k}" ${rel.status === k ? 'selected' : ''}>${v}</option>`
    ).join('');

    const tags = (rel.tags || []).map(t => `<span class="ms-tag">${escapeHtml(t)} <span onclick="mySuppliers.removeTag('${supplierId}','${escapeHtml(t)}')" style="cursor:pointer;margin-left:2px;">×</span></span>`).join('');

    // 历史订单（便于复购时查看合作记录）
    let historyHtml = '<div style="font-size:13px;color:#999;padding:8px 0;">暂无历史订单</div>';
    try {
      const ordersData = await supabase.query('buyer_orders', {
        select: 'id,product_name,quantity,unit_price,status,created_at',
        filter: { supplier_id: supplierId },
        order: 'created_at.desc',
        limit: 20
      });
      if (ordersData && ordersData.length) {
        historyHtml = ordersData.map(o => `
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid var(--border);font-size:13px;cursor:pointer;" onclick="orders.viewDetail('${o.id}')">
            <div>
              <div style="font-weight:600;">${escapeHtml(o.product_name || '-')}</div>
              <div style="color:#999;font-size:12px;margin-top:2px;">#${o.id} · ${o.quantity || 0}件 · ${formatMoney((o.unit_price || 0) * (o.quantity || 0))}</div>
            </div>
            <span class="badge badge-${STATUS_MAP[o.status]?.color || 'info'}">${getStatusLabel(o.status)}</span>
          </div>`).join('');
      }
    } catch (e) {
      historyHtml = '<div style="font-size:13px;color:#999;padding:8px 0;">加载失败</div>';
    }

    container.innerHTML = `
      <div class="ms-detail-section">
        <div class="ms-detail-name">${escapeHtml(rel.company_name)}</div>
        <div class="ms-detail-meta">
          ${rel.region ? `<span>📍 ${escapeHtml(rel.region)}</span>` : ''}
          ${rel.is_verified ? '<span>✓ 已认证</span>' : ''}
          ${rel.rating ? `<span>⭐ ${rel.rating}</span>` : ''}
        </div>
      </div>

      <div class="ms-detail-section">
        <div class="ms-detail-label">合作状态</div>
        <select class="ms-status-select" onchange="mySuppliers.updateStatus('${supplierId}', this.value)">
          ${statusOptions}
        </select>
      </div>

      <div class="ms-detail-section">
        <div class="ms-detail-label">标签</div>
        <div class="ms-tags-container" id="ms-tags-area">
          ${tags || '<span style="color:#999;font-size:13px;">暂无标签</span>'}
        </div>
        <div class="ms-add-tag-row">
          <input type="text" id="ms-new-tag-input" placeholder="输入标签名" class="ms-tag-input">
          <button class="btn btn-outline btn-sm" onclick="mySuppliers.addTag('${supplierId}')">添加</button>
        </div>
      </div>

      <div class="ms-detail-section">
        <div class="ms-detail-label">备注</div>
        <textarea class="ms-notes-textarea" id="ms-notes-area" placeholder="添加备注信息..." onchange="mySuppliers.saveNotes('${supplierId}')">${escapeHtml(rel.notes || '')}</textarea>
      </div>

      <div class="ms-detail-section">
        <div class="ms-detail-label">联系方式</div>
        <div class="ms-contact-info">
          ${rel.contact_name ? `<div>👤 ${escapeHtml(rel.contact_name)}</div>` : ''}
          ${rel.contact_email ? `<div>📧 ${escapeHtml(rel.contact_email)}</div>` : ''}
        </div>
        <button class="btn btn-primary btn-sm" style="margin-top:8px;" onclick="mySuppliers.contactFromDetail('${supplierId}')">📩 发起询盘</button>
      </div>

      <div class="ms-detail-section">
        <div class="ms-detail-label">历史订单</div>
        ${historyHtml}
      </div>

      <div class="ms-detail-section" style="margin-top:20px;">
        <button class="btn btn-outline btn-block" style="color:var(--danger);border-color:var(--danger);" onclick="mySuppliers.removeSupplier('${supplierId}')">移除供应商</button>
      </div>

      <div class="ms-back-link" onclick="mySuppliers.backToList()">← 返回列表</div>
    `;
  },

  backToList() {
    this.currentView = 'list';
    document.getElementById('my-suppliers-list-view').style.display = '';
    document.getElementById('my-suppliers-detail-view').style.display = 'none';
    this.loadList();
  },

  // ==================== 操作 ====================
  async updateStatus(supplierId, newStatus) {
    if (!currentUser) return;
    try {
      await supabase.update('buyer_supplier_relations',
        { status: newStatus, updated_at: new Date().toISOString() },
        { buyer_user_id: currentUser.id, supplier_id: supplierId }
      );
      const rel = this.suppliers.find(s => s.supplier_id === supplierId);
      if (rel) rel.status = newStatus;
      showToast('状态已更新');
    } catch (e) {
      showToast('更新失败');
    }
  },

  async addTag(supplierId) {
    const input = document.getElementById('ms-new-tag-input');
    const tag = input?.value?.trim();
    if (!tag || !currentUser) return;

    const rel = this.suppliers.find(s => s.supplier_id === supplierId);
    if (!rel) return;

    const tags = rel.tags || [];
    if (tags.includes(tag)) { showToast('标签已存在'); return; }
    tags.push(tag);

    try {
      await supabase.update('buyer_supplier_relations',
        { tags: tags, updated_at: new Date().toISOString() },
        { buyer_user_id: currentUser.id, supplier_id: supplierId }
      );
      rel.tags = tags;
      input.value = '';
      this.viewDetail(supplierId);
      showToast('标签已添加');
    } catch (e) {
      showToast('添加失败');
    }
  },

  async removeTag(supplierId, tag) {
    if (!currentUser) return;
    const rel = this.suppliers.find(s => s.supplier_id === supplierId);
    if (!rel) return;

    const tags = (rel.tags || []).filter(t => t !== tag);
    try {
      await supabase.update('buyer_supplier_relations',
        { tags: tags, updated_at: new Date().toISOString() },
        { buyer_user_id: currentUser.id, supplier_id: supplierId }
      );
      rel.tags = tags;
      this.viewDetail(supplierId);
    } catch (e) {
      showToast('删除失败');
    }
  },

  async saveNotes(supplierId) {
    if (!currentUser) return;
    const notes = document.getElementById('ms-notes-area')?.value || '';
    const rel = this.suppliers.find(s => s.supplier_id === supplierId);
    if (!rel) return;

    try {
      await supabase.update('buyer_supplier_relations',
        { notes: notes, updated_at: new Date().toISOString() },
        { buyer_user_id: currentUser.id, supplier_id: supplierId }
      );
      rel.notes = notes;
      showToast('备注已保存');
    } catch (e) {
      showToast('保存失败');
    }
  },

  async removeSupplier(supplierId) {
    if (!currentUser) return;
    if (!confirm('确定要将该供应商从我的列表中移除吗？')) return;

    try {
      await supabase.delete('buyer_supplier_relations', { buyer_user_id: currentUser.id, supplier_id: supplierId });
      this.suppliers = this.suppliers.filter(s => s.supplier_id !== supplierId);
      this.backToList();
      showToast('已移除');
    } catch (e) {
      showToast('操作失败');
    }
  },

  // ==================== 添加供应商 ====================
  async addFromDiscovery(supplierId) {
    if (!currentUser) { showToast('请先登录'); return; }

    try {
      // 检查是否已存在
      const existing = await supabase.query('buyer_supplier_relations', {
        filter: { buyer_user_id: currentUser.id, supplier_id: supplierId }
      });
      if (existing.length) {
        showToast('已在我的供应商列表中');
        return;
      }

      // 获取供应商基本信息
      const supplierData = await supabase.query('suppliers', {
        select: 'company_name',
        filter: { id: supplierId }
      });

      await supabase.insert('buyer_supplier_relations', {
        buyer_user_id: currentUser.id,
        supplier_id: supplierId,
        buyer_company_id: currentUser.companyId || null,
        status: 'potential',
        source: 'discovery',
        notes: '',
        tags: []
      });

      showToast('已添加到我的供应商 ✅');
    } catch (e) {
      console.error('Add supplier error:', e);
      showToast('添加失败');
    }
  },

  contactFromDetail(supplierId) {
    if (typeof suppliers !== 'undefined') {
      suppliers.viewDetail(supplierId);
      setTimeout(() => suppliers.contactSupplier(), 200);
    }
  }
};
