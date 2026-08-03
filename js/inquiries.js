/**
 * 询价管理模块
 */
const inquiries = {
  currentFilter: 'all',

  async load() {
    await this.render(this.currentFilter);
  },

  filter(status) {
    this.currentFilter = status;
    // 更新tab样式
    document.querySelectorAll('#page-inquiries .filter-tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    this.render(status);
  },

  async render(filter) {
    console.log('[Inquiries] render 开始, filter:', filter);
    console.log('[Inquiries] currentUser:', currentUser);
    const container = document.getElementById('inquiries-list');
    console.log('[Inquiries] container:', container);
    if (!container) {
      console.error('[Inquiries] ❌ container 不存在!');
      return;
    }
    container.innerHTML = '<div class="text-center" style="padding:20px;color:var(--text-secondary);">加载中...</div>';

    try {
      const params = {
        select: '*',
        order: 'created_at.desc'
      };

      // 按公司隔离或个人用户只看自己的
      if (currentUser && currentUser.companyId) {
        params.filter = { company_id: currentUser.companyId };
      } else if (currentUser) {
        params.filter = { created_by: currentUser.id };
      }

      if (filter && filter !== 'all') {
        params.filter.status = filter;
      }

      const data = await supabase.query('buyer_inquiries', params);
      console.log('[Inquiries] query result:', data, 'length:', data ? data.length : 'null');

      if (!data || data.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-text">暂无询价记录</div></div>';
        return;
      }

      container.innerHTML = data.map(item => `
        <div class="inquiry-card ${getStatusClass(item.status)}">
          <div class="inquiry-header">
            <div class="inquiry-title">${item.title || '未命名询价'}</div>
            <span class="inquiry-badge">${getStatusLabel(item.status)}</span>
          </div>
          <div class="inquiry-desc">${item.description ? item.description.substring(0, 80) + (item.description.length > 80 ? '...' : '') : ''}</div>
          <div class="inquiry-meta">
            <span>📁 ${item.category || '-'}</span>
            <span>📊 数量: ${item.quantity || '-'}</span>
            ${item.target_price ? `<span>💰 目标价: ${formatMoney(item.target_price)}</span>` : ''}
            <span>📅 ${formatDateTime(item.created_at)}</span>
          </div>
          <div class="inquiry-actions">
            <button class="btn btn-outline btn-sm" onclick="inquiries.viewDetail('${item.id}')">查看详情</button>
            ${item.status === 'open' ? `<button class="btn btn-primary btn-sm" onclick="inquiries.viewQuotes('${item.id}')">查看报价</button>` : ''}
            ${item.status === 'open' ? `<button class="btn btn-sm" style="color:var(--danger);" onclick="inquiries.closeInquiry('${item.id}')">关闭</button>` : ''}
          </div>
        </div>
      `).join('');
    } catch (e) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-text">加载失败: ${e.message}</div></div>`;
    }
  },

  showCreateForm(targetSupplierName) {
    document.getElementById('inquiry-form-title').textContent = '发布询价';
    document.getElementById('inquiry-id').value = '';
    document.getElementById('inquiry-title').value = '';
    document.getElementById('inquiry-category').value = '';
    document.getElementById('inquiry-description').value = '';
    document.getElementById('inquiry-quantity').value = '';
    document.getElementById('inquiry-target-price').value = '';
    document.getElementById('inquiry-deadline').value = '';
    document.getElementById('inquiry-public').value = 'true';
    const anonCb = document.getElementById('inquiry-anonymous');
    if (anonCb) anonCb.checked = false;

    // 如果有指定供应商名称，预填到描述中
    if (targetSupplierName) {
      document.getElementById('inquiry-description').value = '定向询价：' + targetSupplierName;
      document.getElementById('inquiry-public').value = 'false';
    }

    // 清除关联商品ID
    const pidField = document.getElementById('inquiry-product-id');
    if (pidField) pidField.value = '';

    // 隐藏推荐区域
    const matchSection = document.getElementById('inquiry-match-section');
    if (matchSection) matchSection.style.display = 'none';
    this._matchedSuppliers = [];

    // 绑定品类变化事件（触发智能推荐）
    const catSelect = document.getElementById('inquiry-category');
    if (catSelect && !catSelect._matchBound) {
      catSelect.addEventListener('change', () => inquiries.onCategoryChange());
      catSelect._matchBound = true;
    }

    showModal('inquiry-modal');
  },

  async onCategoryChange() {
    const category = document.getElementById('inquiry-category').value;
    const matchSection = document.getElementById('inquiry-match-section');
    const matchList = document.getElementById('inquiry-match-list');

    if (!category) {
      if (matchSection) matchSection.style.display = 'none';
      return;
    }

    // 显示loading
    if (matchSection) matchSection.style.display = 'block';
    if (matchList) matchList.innerHTML = '<div style="padding:12px;color:var(--text-secondary);font-size:13px;">正在匹配供应商...</div>';

    try {
      let matched = [];
      if (typeof suppliers !== 'undefined' && suppliers.getMatchedSuppliers) {
        matched = await suppliers.getMatchedSuppliers(category, null, 8);
      }

      this._matchedSuppliers = matched || [];

      if (this._matchedSuppliers.length === 0) {
        if (matchList) matchList.innerHTML = '<div style="padding:12px;color:var(--text-secondary);font-size:13px;">暂无匹配的供应商推荐</div>';
        return;
      }

      if (matchList) {
        matchList.innerHTML = this._matchedSuppliers.map((s, idx) => {
          const name = (typeof escapeHtml === 'function') ? escapeHtml(s.company_name || s.short_name || '未命名') : (s.company_name || '未命名');
          const region = s.region ? '📍 ' + ((typeof escapeHtml === 'function') ? escapeHtml(s.region) : s.region) : '';
          const score = s.match_score ? '匹配度 ' + Math.round(s.match_score) : '';
          const verified = s.is_verified ? ' ✓' : '';
          return `
            <label class="sd-match-item">
              <input type="checkbox" class="sd-match-checkbox" value="${s.id}" data-name="${(s.company_name || '').replace(/"/g, '&quot;')}">
              <div class="sd-match-info">
                <div class="sd-match-name">${name}${verified}</div>
                <div class="sd-match-meta">${region} ${score}</div>
              </div>
            </label>
          `;
        }).join('');
      }
    } catch (e) {
      if (matchList) matchList.innerHTML = '<div style="padding:12px;color:var(--text-secondary);font-size:13px;">匹配失败，请手动选择供应商</div>';
    }
  },

  async save() {
    const id = document.getElementById('inquiry-id').value;
    const data = {
      title: document.getElementById('inquiry-title').value,
      category: document.getElementById('inquiry-category').value,
      description: document.getElementById('inquiry-description').value,
      quantity: parseInt(document.getElementById('inquiry-quantity').value) || null,
      target_price: parseFloat(document.getElementById('inquiry-target-price').value) || null,
      deadline: document.getElementById('inquiry-deadline').value || null,
      is_public: document.getElementById('inquiry-public').value === 'true',
      is_anonymous: document.getElementById('inquiry-anonymous')?.checked || false,
      status: 'open'
    };

    if (currentUser && currentUser.companyId) {
      data.company_id = currentUser.companyId;
    }
    data.created_by = currentUser?.id;

    // 关联商品ID（从商品详情发起询价时设置）
    const productIdField = document.getElementById('inquiry-product-id');
    if (productIdField && productIdField.value) {
      data.product_id = productIdField.value;
    }

    // 收集勾选的推荐供应商
    const selectedSupplierIds = [];
    document.querySelectorAll('.sd-match-checkbox:checked').forEach(cb => {
      selectedSupplierIds.push({ id: cb.value, name: cb.dataset.name || '' });
    });

    try {
      let savedInquiryId = id;
      if (id) {
        await supabase.update('buyer_inquiries', data, { id: id });
        showToast('询价已更新 ✅');
      } else {
        const result = await supabase.insert('buyer_inquiries', data);
        // 获取保存后的ID（如果返回了）
        if (result && result[0] && result[0].id) {
          savedInquiryId = result[0].id;
        }
        showToast('询价已发布 ✅');
      }

      // 为勾选的供应商创建定向询盘记录
      if (selectedSupplierIds.length > 0 && savedInquiryId) {
        for (const supplier of selectedSupplierIds) {
          try {
            await supabase.insert('buyer_inquiries', {
              title: data.title,
              category: data.category,
              description: data.description + '（定向发送给 ' + supplier.name + '）',
              quantity: data.quantity,
              target_price: data.target_price,
              deadline: data.deadline,
              is_public: false,
              status: 'open',
              supplier_id: supplier.id,
              company_id: data.company_id,
              created_by: data.created_by
            });
          } catch (e) {
            console.warn('Failed to create inquiry for supplier:', supplier.name, e);
          }
        }
        if (selectedSupplierIds.length > 0) {
          showToast('询价已发布，已发送给 ' + selectedSupplierIds.length + ' 家供应商 ✅');
        }
      }

      hideModal('inquiry-modal');
      this.load();
    } catch (e) {
      showToast('保存失败: ' + e.message);
    }
  },

  async viewDetail(id) {
    try {
      const data = await supabase.query('buyer_inquiries', {
        select: '*',
        filter: { id: id }
      });

      if (!data || !data[0]) {
        showToast('未找到询价详情');
        return;
      }

      const item = data[0];
      const content = document.getElementById('inquiry-detail-content');
      content.innerHTML = `
        <div class="info-row"><span class="info-label">标题</span><span class="info-value">${item.title}</span></div>
        <div class="info-row"><span class="info-label">品类</span><span class="info-value">${item.category || '-'}</span></div>
        <div class="info-row"><span class="info-label">状态</span><span class="info-value"><span class="badge badge-${STATUS_MAP[item.status]?.color || 'info'}">${getStatusLabel(item.status)}</span></span></div>
        <div class="info-row"><span class="info-label">采购数量</span><span class="info-value">${item.quantity || '-'}</span></div>
        <div class="info-row"><span class="info-label">目标单价</span><span class="info-value">${item.target_price ? formatMoney(item.target_price) : '-'}</span></div>
        <div class="info-row"><span class="info-label">期望交货</span><span class="info-value">${item.deadline || '-'}</span></div>
        <div class="info-row"><span class="info-label">询价方式</span><span class="info-value">${item.is_public ? '公开询价' : '定向询价'}</span></div>
        <div class="info-row"><span class="info-label">发布时间</span><span class="info-value">${formatDateTime(item.created_at)}</span></div>
        <div style="margin-top:12px;padding:12px;background:var(--bg);border-radius:8px;">
          <div style="font-size:13px;color:var(--text-secondary);margin-bottom:4px;">详细描述</div>
          <div style="font-size:14px;line-height:1.6;">${item.description || '-'}</div>
        </div>
      `;
      showModal('inquiry-detail-modal');
    } catch (e) {
      showToast('加载详情失败: ' + e.message);
    }
  },

  async viewQuotes(inquiryId) {
    try {
      const quotesData = await supabase.query('supplier_quotes', {
        select: '*',
        filter: { inquiry_id: inquiryId },
        order: 'created_at.desc'
      });

      if (!quotesData || quotesData.length === 0) {
        showToast('暂无供应商报价');
        return;
      }

      // 显示对比视图
      const content = document.getElementById('compare-content');
      let html = '<div style="margin-bottom:16px;font-size:14px;color:var(--text-secondary);">共收到 ' + quotesData.length + ' 个报价</div>';

      html += '<table class="compare-table"><thead><tr><th>供应商</th><th>单价</th><th>起订量</th><th>交货期</th><th>操作</th></tr></thead><tbody>';

      // 找最低价
      const prices = quotesData.map(q => parseFloat(q.unit_price) || 0).filter(p => p > 0);
      const minPrice = prices.length > 0 ? Math.min(...prices) : 0;

      quotesData.forEach(q => {
        const isBest = parseFloat(q.unit_price) === minPrice && minPrice > 0;
        html += `<tr>
          <td>${q.supplier_name || '供应商'}</td>
          <td class="${isBest ? 'best-price' : ''}">${formatMoney(q.unit_price)}</td>
          <td>${q.moq || '-'}</td>
          <td>${q.lead_time || '-'}</td>
          <td><button class="btn btn-primary btn-sm" onclick="inquiries.acceptQuote('${q.id}','${inquiryId}')">选择</button></td>
        </tr>`;
      });

      html += '</tbody></table>';
      content.innerHTML = html;
      showModal('compare-modal');
    } catch (e) {
      showToast('加载报价失败: ' + e.message);
    }
  },

  async acceptQuote(quoteId, inquiryId) {
    if (!confirm('确认选择此报价？将自动创建订单。')) return;

    try {
      // 更新报价状态
      await supabase.update('supplier_quotes', { status: 'accepted' }, { id: quoteId });

      // 更新询价状态
      await supabase.update('buyer_inquiries', { status: 'awarded' }, { id: inquiryId });

      hideModal('compare-modal');
      showToast('已选择报价 ✅');
      this.load();
    } catch (e) {
      showToast('操作失败: ' + e.message);
    }
  },

  async closeInquiry(id) {
    if (!confirm('确定关闭此询价？')) return;
    try {
      await supabase.update('buyer_inquiries', { status: 'closed' }, { id: id });
      showToast('询价已关闭');
      this.load();
    } catch (e) {
      showToast('关闭失败: ' + e.message);
    }
  }
};
