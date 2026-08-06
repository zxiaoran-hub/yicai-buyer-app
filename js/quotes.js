/**
 * 报价管理模块
 * 含：报价列表、接受/拒绝、查看详情、勾选导出 Excel 对比单
 */
const quotes = {
  currentFilter: 'all',
  items: [],          // 最近一次加载的报价数据
  selected: new Set(),// 勾选导出的报价 id

  async load() {
    this.selected.clear();
    await this.render(this.currentFilter);
  },

  filter(status) {
    this.currentFilter = status;
    document.querySelectorAll('#page-quotes .filter-tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    this.render(status);
  },

  async render(filter) {
    const container = document.getElementById('quotes-list');
    container.innerHTML = '<div class="text-center" style="padding:20px;color:var(--text-secondary);">加载中...</div>';

    try {
      const params = {
        select: '*',
        order: 'created_at.desc'
      };

      // 公司用户看公司收到的报价，个人用户看自己的
      if (appState.companyId) {
        params.filter = { inquiry_company_id: appState.companyId };
      } else {
        params.filter = { inquiry_created_by: appState.user?.id };
      }

      if (filter && filter !== 'all') {
        params.filter.status = filter;
      }

      const data = await supabase.query('supplier_quotes', params);
      this.items = Array.isArray(data) ? data : [];

      if (!this.items.length) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">💰</div><div class="empty-text">暂无报价记录</div></div>';
        this.updateExportBtn();
        return;
      }

      container.innerHTML = this.items.map(item => `
        <div class="quote-card">
          <div class="quote-header">
            <div style="display:flex;align-items:flex-start;gap:8px;">
              <input type="checkbox" class="quote-select-box" data-id="${item.id}"
                ${this.selected.has(item.id) ? 'checked' : ''}
                onchange="quotes.toggleSelect('${item.id}', this.checked)"
                title="勾选用于导出对比单" style="margin-top:4px;cursor:pointer;">
              <div>
                <div class="quote-supplier">${escapeHtml(item.supplier_name || '供应商')}</div>
                <div style="font-size:12px;color:var(--text-secondary);">${escapeHtml(item.inquiry_title || '')}</div>
              </div>
            </div>
            <div class="quote-price">${formatMoney(item.unit_price)}</div>
          </div>
          <div class="quote-details">
            <span>📦 起订量: ${item.moq || '-'}</span>
            <span>📅 交期: ${escapeHtml(item.lead_time || '-')}</span>
            <span>📊 状态: ${this.getQuoteStatusLabel(item.status)}</span>
          </div>
          ${item.message ? `<div style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;padding:8px;background:var(--bg);border-radius:6px;">💬 ${escapeHtml(item.message)}</div>` : ''}
          <div class="quote-actions">
            ${item.status === 'pending' ? `
              <button class="btn btn-success btn-sm" onclick="quotes.acceptQuote('${item.id}')">接受</button>
              <button class="btn btn-sm" style="color:var(--danger);border:1px solid var(--danger);" onclick="quotes.rejectQuote('${item.id}')">拒绝</button>
            ` : ''}
            <button class="btn btn-sm" style="border:1px solid var(--primary);color:var(--primary);" onclick="quotes.showDetail('${item.id}')">查看详情</button>
            <span style="font-size:12px;color:var(--text-secondary);align-self:center;">${formatDateTime(item.created_at)}</span>
          </div>
        </div>
      `).join('');
      this.updateExportBtn();
    } catch (e) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-text">加载失败: ${escapeHtml(e.message)}</div></div>`;
    }
  },

  toggleSelect(id, checked) {
    if (checked) this.selected.add(id); else this.selected.delete(id);
    this.updateExportBtn();
  },

  updateExportBtn() {
    const btn = document.getElementById('quotes-export-btn');
    if (btn) {
      btn.disabled = this.selected.size === 0;
      btn.textContent = this.selected.size > 0 ? `导出对比单 (${this.selected.size})` : '导出对比单';
    }
  },

  // 导出勾选报价为 Excel 对比单
  exportExcel() {
    if (typeof XLSX === 'undefined') { showToast('导出组件未加载，请刷新重试'); return; }
    const rows = this.items
      .filter(i => this.selected.has(i.id))
      .map(i => ({
        '询价标题': i.inquiry_title || '',
        '供应商': i.supplier_name || '',
        '单价(元)': i.unit_price != null ? Number(i.unit_price) : '',
        '起订量': i.moq || '',
        '交期': i.lead_time || '',
        '打样周期': i.sample_lead_time || '',
        '打样费': i.sample_fee || '',
        '工艺/尺寸描述': i.spec_description || '',
        '报价留言': i.message || '',
        '状态': this.getQuoteStatusLabel(i.status),
        '报价时间': formatDateTime(i.created_at)
      }));
    if (!rows.length) { showToast('请先勾选要导出的报价'); return; }
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [30, 24, 10, 8, 10, 10, 18, 40, 30, 8, 16].map(wch => ({ wch }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '报价对比');
    const d = new Date();
    const fname = `报价对比单_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.xlsx`;
    XLSX.writeFile(wb, fname);
    showToast('已导出 ✅');
  },

  // 报价详情弹窗
  showDetail(id) {
    const q = this.items.find(i => i.id === id);
    if (!q) return;
    const row = (label, val) => `
      <div style="display:flex;padding:10px 0;border-bottom:1px solid var(--border);font-size:14px;">
        <div style="width:110px;color:var(--text-secondary);flex-shrink:0;">${label}</div>
        <div style="flex:1;">${val || '-'}</div>
      </div>`;
    document.getElementById('quote-detail-body').innerHTML =
      row('供应商', escapeHtml(q.supplier_name)) +
      row('询价标题', escapeHtml(q.inquiry_title)) +
      row('单价', formatMoney(q.unit_price)) +
      row('起订量', q.moq || '-') +
      row('交期', escapeHtml(q.lead_time)) +
      row('打样周期', escapeHtml(q.sample_lead_time)) +
      row('打样费', escapeHtml(q.sample_fee)) +
      row('工艺/尺寸描述', escapeHtml(q.spec_description)) +
      row('报价留言', escapeHtml(q.message)) +
      row('状态', this.getQuoteStatusLabel(q.status)) +
      row('报价时间', formatDateTime(q.created_at));
    document.getElementById('quote-detail-modal').style.display = 'flex';
  },

  getQuoteStatusLabel(status) {
    const map = {
      pending: '待评审',
      accepted: '已接受',
      rejected: '已拒绝'
    };
    return map[status] || status;
  },

  async acceptQuote(id) {
    if (!confirm('确认接受此报价？')) return;
    try {
      await supabase.update('supplier_quotes', { status: 'accepted' }, { id: id });
      showToast('已接受报价 ✅');
      this.load();
    } catch (e) {
      showToast('操作失败: ' + e.message);
    }
  },

  async rejectQuote(id) {
    if (!confirm('确认拒绝此报价？')) return;
    try {
      await supabase.update('supplier_quotes', { status: 'rejected' }, { id: id });
      showToast('已拒绝报价');
      this.load();
    } catch (e) {
      showToast('操作失败: ' + e.message);
    }
  }
};
