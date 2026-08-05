// ============ Admin Doc Templates Management ============
// v1.0 文书模板管理：维护各业务系统模板，关联文书类型
// v1.1 移除「关联案由」字段：模板作为所属文书类型的下属，案由匹配通过文书类型→workflow 链路间接实现
// v1.2 模板正文交互改造：① 模板正文从 textarea 在线编辑改为文件上传；② 新增/编辑弹窗提供模板示例下载；③ 列表新增「预览」「下载」「重新上传」三个操作按钮；④ 未上传正文时预览/下载置灰；⑤ 上传内容以纯文本持久化到 content 字段
// v1.3 内置模板预置默认正文：内置模板 content 赋予 TEMPLATE_EXAMPLE_TEXT，使预览/下载按钮默认可用（自定义模板未上传正文时仍置灰）
// v1.4 模板表格新增「上传时间」「更新时间」两列：保存时记录 createdAt / updatedAt（新增两者相同，编辑/重新上传仅更新 updatedAt）；内置模板无持久化时间显示为空
// 数据持久化：localStorage.adminDocTemplates（按业务系统分组）
// 用户侧联动：case-data.js mergeAdminDocTemplates 在加载时合并到 system.docTemplates

(function() {
    'use strict';

    // ===== 状态 =====
    let currentOrg = 'court';
    let currentDocTypeFilter = ''; // '' = 全部
    let editingKey = null;        // 当前编辑的模板 key（编辑模式时非空）
    let editingIsBuiltin = false; // 编辑的是内置模板（编辑后转为自定义）
    let pendingConfirmAction = null;
    let pendingTemplateContent = ''; // v1.2 新增/编辑弹窗中暂存的模板正文（由上传文件确定）
    let pendingTemplateFileName = ''; // 上传文件名展示

    // v1.2 模板示例正文（占位符格式参考用户提供的民事判决书截图）
    const TEMPLATE_EXAMPLE_TEXT = `{{courtName}}
民事判决书

                                                                       {{caseNumber}}

{{plaintiffDefendantInfo}}
{{proceduralInfo}}
{{plaintiffClaim}}
{{foundFacts}}
{{courtHolds}}
{{legalProvisionCitation}}
{{judgmentContent}}

    如不服本判决，可以在判决书送达之日起十五日内，向本院递交上诉状，并按对方当事人的人数或者代表人的人数提出副本，上诉于江苏省苏州市中级人民法院。同时按照国务院《诉讼费用交纳办法》规定向江苏省苏州市中级人民法院预交上诉案件受理费。





                                                    审判员 {{judgeName}}





                                                     {{judgmentDate}}





书记员 {{clerkName}}`;

    // ===== 工具函数 =====
    function getStorage() {
        try {
            return JSON.parse(localStorage.getItem('adminDocTemplates')) || {};
        } catch (e) {
            return {};
        }
    }
    function saveStorage(data) {
        localStorage.setItem('adminDocTemplates', JSON.stringify(data));
    }
    function getOrgData(org) {
        const all = getStorage();
        return all[org] || {};
    }
    function setOrgData(org, data) {
        const all = getStorage();
        all[org] = data;
        saveStorage(all);
    }

    // 获取当前业务系统的文书类型映射（v1.21: 统一走 getAdminDocTypes 合并源）
    function getDocTypes(org) {
        return getAdminDocTypes(org) || {};
    }

    // 获取当前业务系统的内置模板（来自 defaultDocTemplatesByOrg，字符串映射）
    function getBuiltinTemplates(org) {
        return defaultDocTemplatesByOrg[org] || {};
    }

    // 获取当前业务系统下被停用的内置模板 key 列表
    // 存于 adminDocTemplates[org].__builtinDisabled__ 数组中
    function getBuiltinDisabled(org) {
        const orgData = getOrgData(org);
        return Array.isArray(orgData.__builtinDisabled__) ? orgData.__builtinDisabled__ : [];
    }
    function setBuiltinDisabled(org, arr) {
        const orgData = getOrgData(org);
        orgData.__builtinDisabled__ = arr;
        setOrgData(org, orgData);
    }

    // 获取当前业务系统的全部模板（内置 + 自定义）
    // 返回统一对象结构：{key: {name, docType, content, isBuiltin, enabled}}
    function getAllTemplates(org) {
        const docTypes = getDocTypes(org);
        const builtins = getBuiltinTemplates(org);
        const customs = getOrgData(org);
        const builtinDisabled = getBuiltinDisabled(org);

        // 反查表：模板 key → 文书类型 key
        const tplToDocType = {};
        Object.entries(docTypes).forEach(([typeKey, typeCfg]) => {
            (typeCfg.templates || []).forEach(tplKey => {
                tplToDocType[tplKey] = typeKey;
            });
        });

        const result = {};
        // 内置模板（字符串）
        // 内置模板 content 赋予系统预置默认正文（TEMPLATE_EXAMPLE_TEXT），使预览/下载按钮可用
        Object.entries(builtins).forEach(([key, name]) => {
            result[key] = {
                name: name,
                docType: tplToDocType[key] || '',
                content: TEMPLATE_EXAMPLE_TEXT,
                isBuiltin: true,
                enabled: !builtinDisabled.includes(key)
            };
        });
        // 自定义模板（对象，覆盖同名内置）
        Object.entries(customs).forEach(([key, val]) => {
            if (key === '__builtinDisabled__') return; // 跳过内置停用列表
            if (val && typeof val === 'object') {
                result[key] = {
                    name: val.name || key,
                    docType: val.docType || tplToDocType[key] || '',
                    content: val.content || '',
                    isBuiltin: false,
                    enabled: val.enabled !== false,
                    createdAt: val.createdAt || '', // v1.4 上传/创建时间
                    updatedAt: val.updatedAt || ''  // v1.4 最近更新时间
                };
            }
        });
        return result;
    }

    // 生成唯一 key
    function genTemplateKey(name, docType) {
        const base = (docType || 'tpl') + '-' + Date.now().toString(36);
        return base;
    }

    // v1.2 通用工具：下载文本内容为文件
    function downloadTextFile(text, filename) {
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 0);
    }

    // v1.2 通用工具：在新窗口预览文本（保留换行）
    function previewTextInWindow(title, text) {
        const w = window.open('', '_blank');
        if (!w) {
            showNotification('预览窗口被浏览器拦截，请允许弹窗', 'warning');
            return;
        }
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
            <style>body{font-family:'Noto Sans SC',-apple-system,sans-serif;padding:32px;line-height:1.8;max-width:720px;margin:0 auto;color:#1a1a2e;white-space:pre-wrap;word-break:break-word;}</style>
            </head><body>${escapeHtml(text)}</body></html>`;
        w.document.open();
        w.document.write(html);
        w.document.close();
    }

    // ===== 通知 =====
    function showNotification(msg, type) {
        type = type || 'success';
        const icons = { success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-exclamation-circle' };
        const div = document.createElement('div');
        div.className = 'notification ' + type;
        div.innerHTML = '<i class="fas ' + (icons[type] || icons.success) + '"></i><span>' + msg + '</span>';
        document.getElementById('notificationContainer').appendChild(div);
        setTimeout(() => div.remove(), 2600);
    }

    // ===== 业务系统切换 =====
    window.switchBusiness = function(type) {
        if (type === currentOrg) return;
        currentOrg = type;
        currentDocTypeFilter = '';
        document.querySelectorAll('.business-switch-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.type === type);
        });
        renderLeft();
        renderRight();
    };

    // ===== 渲染左侧文书类型列表 =====
    function renderLeft() {
        const docTypes = getDocTypes(currentOrg);
        const allTemplates = getAllTemplates(currentOrg);
        const totalCount = Object.keys(allTemplates).length;

        const leftEl = document.getElementById('tplLeft');
        let html = '<div class="tpl-left-item' + (currentDocTypeFilter === '' ? ' active' : '') + '" onclick="selectDocType(\'\')">'
            + '<i class="fas fa-layer-group"></i><span>全部</span><span class="count">' + totalCount + '</span></div>';

        Object.entries(docTypes).forEach(([key, cfg]) => {
            const count = Object.values(allTemplates).filter(t => t.docType === key).length;
            html += '<div class="tpl-left-item' + (currentDocTypeFilter === key ? ' active' : '') + '" onclick="selectDocType(\'' + key + '\')">'
                + '<i class="fas ' + (cfg.icon || 'fa-folder') + '"></i>'
                + '<span>' + cfg.name + '</span>'
                + '<span class="count">' + count + '</span></div>';
        });
        leftEl.innerHTML = html;
    }
    window.selectDocType = function(key) {
        currentDocTypeFilter = key;
        renderLeft();
        renderRight();
    };

    // ===== 渲染右侧表格 =====
    function renderRight() {
        const docTypes = getDocTypes(currentOrg);
        const allTemplates = getAllTemplates(currentOrg);
        const rightTitle = document.getElementById('rightTitle');
        if (currentDocTypeFilter) {
            rightTitle.textContent = (docTypes[currentDocTypeFilter] || {}).name || '模板列表';
        } else {
            rightTitle.textContent = '全部模板';
        }

        const list = Object.entries(allTemplates).filter(([key, t]) => {
            return !currentDocTypeFilter || t.docType === currentDocTypeFilter;
        });

        const tbody = document.getElementById('tplTbody');
        const empty = document.getElementById('emptyState');
        if (list.length === 0) {
            tbody.innerHTML = '';
            empty.style.display = 'block';
            return;
        }
        empty.style.display = 'none';

        tbody.innerHTML = list.map(([key, t]) => {
            const docTypeName = (docTypes[t.docType] || {}).name || '-';
            const badge = t.isBuiltin
                ? '<span class="tpl-badge builtin">内置</span>'
                : '<span class="tpl-badge custom">自定义</span>';
            const isEnabled = t.enabled !== false;
            const statusBadge = isEnabled
                ? '<span class="status-badge status-on">已启用</span>'
                : '<span class="status-badge status-off">已停用</span>';
            const toggleBtn = isEnabled
                ? '<button class="action-btn toggle-off" onclick="toggleTemplateEnabled(\'' + key + '\')">停用</button>'
                : '<button class="action-btn toggle-on" onclick="toggleTemplateEnabled(\'' + key + '\')">启用</button>';
            const hasContent = (t.content || '').trim().length > 0;
            const viewDisabled = hasContent ? '' : ' disabled';
            const contentActions = '<button class="action-btn view"' + viewDisabled + ' onclick="previewTemplateContent(\'' + key + '\')">预览</button>'
                  + '<button class="action-btn view"' + viewDisabled + ' onclick="downloadTemplateByKey(\'' + key + '\')">下载</button>'
                  + '<button class="action-btn view" onclick="reuploadTemplateByKey(\'' + key + '\')">重新上传</button>';
            const actions = t.isBuiltin
                ? contentActions
                  + '<button class="action-btn edit" onclick="editTemplate(\'' + key + '\')">编辑</button>' + toggleBtn
                : contentActions
                  + '<button class="action-btn edit" onclick="editTemplate(\'' + key + '\')">编辑</button>'
                  + toggleBtn
                  + '<button class="action-btn delete" onclick="deleteTemplate(\'' + key + '\')">删除</button>';
            // v1.4 上传时间/更新时间（内置模板无持久化时间，显示为空）
            const createdAt = t.createdAt || '';
            const updatedAt = t.updatedAt || '';
            return '<tr>'
                + '<td class="tpl-name-cell">' + escapeHtml(t.name) + badge + '</td>'
                + '<td>' + escapeHtml(docTypeName) + '</td>'
                + '<td>' + statusBadge + '</td>'
                + '<td class="tpl-time-cell">' + (createdAt ? escapeHtml(createdAt) : '<span class="tpl-time-empty">-</span>') + '</td>'
                + '<td class="tpl-time-cell">' + (updatedAt ? escapeHtml(updatedAt) : '<span class="tpl-time-empty">-</span>') + '</td>'
                + '<td class="tpl-action-cell">' + actions + '</td>'
                + '</tr>';
        }).join('');
    }

    function escapeHtml(s) {
        if (s === undefined || s === null) return '';
        return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }

    // v1.4 时间工具：返回格式化时间（YYYY-MM-DD HH:mm）
    function nowTime() {
        const d = new Date();
        const p = n => (n < 10 ? '0' + n : '' + n);
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
            + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }

    // v1.2 刷新弹窗中模板正文上传区显示
    function refreshTplUploadUI() {
        const uploadArea = document.getElementById('tplUploadArea');
        const fileActions = document.getElementById('tplFileActions');
        const filenameEl = document.getElementById('tplUploadFilename');
        const hasContent = pendingTemplateContent.length > 0;
        if (uploadArea) uploadArea.style.display = hasContent ? 'none' : 'block';
        if (fileActions) fileActions.style.display = hasContent ? 'flex' : 'none';
        if (filenameEl) {
            filenameEl.style.display = pendingTemplateFileName ? 'block' : 'none';
            filenameEl.textContent = pendingTemplateFileName ? '已选择文件：' + pendingTemplateFileName : '';
        }
    }

    // ===== 新增/编辑弹窗 =====
    window.openAddModal = function() {
        editingKey = null;
        editingIsBuiltin = false;
        pendingTemplateContent = '';
        pendingTemplateFileName = '';
        document.getElementById('modalTitle').textContent = '新增模板';
        document.getElementById('tplName').value = '';
        fillDocTypeSelect('');
        document.getElementById('tplDocType').disabled = false;
        refreshTplUploadUI();
        document.getElementById('tplModal').classList.add('show');
        setTimeout(() => document.getElementById('tplName').focus(), 50);
    };

    window.editTemplate = function(key) {
        const all = getAllTemplates(currentOrg);
        const t = all[key];
        if (!t) return;
        editingKey = key;
        editingIsBuiltin = !!t.isBuiltin;
        pendingTemplateContent = t.content || '';
        pendingTemplateFileName = t.content ? '已保存的模板正文' : '';
        document.getElementById('modalTitle').textContent = editingIsBuiltin ? '编辑内置模板（另存为自定义）' : '编辑模板';
        document.getElementById('tplName').value = t.name;
        fillDocTypeSelect(t.docType);
        // 编辑内置时禁用文书类型切换，避免逻辑歧义（内置只能在原类型上覆盖）
        document.getElementById('tplDocType').disabled = editingIsBuiltin;
        refreshTplUploadUI();
        document.getElementById('tplModal').classList.add('show');
    };

    // v1.2 模板文件上传处理（原型阶段仅解析 .txt；doc/docx 提示需配套解析能力）
    window.handleTemplateFileUpload = function(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        const name = file.name || '';
        const ext = name.split('.').pop().toLowerCase();
        if (!['txt', 'doc', 'docx'].includes(ext)) {
            showNotification('仅支持 .txt / .doc / .docx 格式', 'warning');
            event.target.value = '';
            return;
        }
        if (ext === 'txt') {
            const reader = new FileReader();
            reader.onload = function(e) {
                pendingTemplateContent = (e.target.result || '').toString();
                pendingTemplateFileName = name;
                refreshTplUploadUI();
                showNotification('模板正文已读取', 'success');
            };
            reader.onerror = function() {
                showNotification('文件读取失败', 'error');
            };
            reader.readAsText(file, 'utf-8');
        } else {
            // doc/docx 原型阶段用 mock 解析提示：仅取文件名作为占位
            pendingTemplateContent = `// 文件：${name}\n// 注：doc/docx 格式需配套文档解析服务，原型阶段仅保存文件名标识。`;
            pendingTemplateFileName = name;
            refreshTplUploadUI();
            showNotification('已接收 ' + ext + ' 文件（原型阶段仅保存标识）', 'warning');
        }
        event.target.value = '';
    };

    // v1.2 下载模板示例
    window.downloadTemplateExample = function() {
        downloadTextFile(TEMPLATE_EXAMPLE_TEXT, '民事判决书模板示例.txt');
    };

    // v1.2 下载当前弹窗中的模板正文
    window.downloadCurrentTemplateContent = function() {
        if (!pendingTemplateContent) return;
        const title = document.getElementById('tplName').value.trim() || '模板正文';
        downloadTextFile(pendingTemplateContent, title + '.txt');
    };

    // v1.2 重新上传：清空当前内容，显示上传区
    window.reuploadTemplateContent = function() {
        pendingTemplateContent = '';
        pendingTemplateFileName = '';
        refreshTplUploadUI();
    };

    window.closeModal = function() {
        document.getElementById('tplModal').classList.remove('show');
        editingKey = null;
        editingIsBuiltin = false;
        pendingTemplateContent = '';
        pendingTemplateFileName = '';
    };

    function fillDocTypeSelect(selected) {
        const docTypes = getDocTypes(currentOrg);
        const sel = document.getElementById('tplDocType');
        sel.innerHTML = '<option value="">请选择...</option>' + Object.entries(docTypes).map(([key, cfg]) =>
            '<option value="' + key + '"' + (key === selected ? ' selected' : '') + '>' + escapeHtml(cfg.name) + '</option>'
        ).join('');
    }

    window.saveTemplate = function() {
        const name = document.getElementById('tplName').value.trim();
        const docType = document.getElementById('tplDocType').value;
        const content = pendingTemplateContent;

        if (!name) {
            showNotification('请填写模板名', 'error');
            document.getElementById('tplName').focus();
            return;
        }
        if (!docType) {
            showNotification('请选择所属文书类型', 'error');
            return;
        }

        const orgData = getOrgData(currentOrg);

        // 决定 key
        let key;
        if (editingKey && !editingIsBuiltin) {
            // 编辑自定义模板：保留原 key
            key = editingKey;
        } else if (editingKey && editingIsBuiltin) {
            // 编辑内置模板：使用内置 key 作为自定义覆盖（用户侧 mergeAdminDocTemplates 会覆盖）
            key = editingKey;
        } else {
            // 新增：生成新 key（确保不与内置 key 冲突）
            key = genTemplateKey(name, docType);
            while (orgData[key]) key = genTemplateKey(name, docType) + Math.floor(Math.random() * 100);
        }

        // 编辑时继承原启用状态；新增默认启用
        let origEnabled = true;
        if (editingKey) {
            const all = getAllTemplates(currentOrg);
            const origT = all[editingKey];
            if (origT) origEnabled = origT.enabled !== false;
        }

        // v1.4 记录上传/更新时间：新增时两者相同；编辑时保留原 createdAt，仅更新 updatedAt
        const now = nowTime();
        const prevTemplate = orgData[key];
        const createdAt = (editingKey && prevTemplate && prevTemplate.createdAt) ? prevTemplate.createdAt : now;

        orgData[key] = {
            name: name,
            docType: docType,
            content: content,
            enabled: origEnabled,
            createdAt: createdAt,
            updatedAt: now
        };

        // 编辑内置模板后，该 key 变为自定义；从 __builtinDisabled__ 清理冗余 key
        if (editingKey && editingIsBuiltin) {
            let arr = getBuiltinDisabled(currentOrg);
            if (arr.includes(editingKey)) {
                orgData.__builtinDisabled__ = arr.filter(k => k !== editingKey);
            }
        }

        setOrgData(currentOrg, orgData);

        closeModal();
        renderLeft();
        renderRight();
        showNotification(editingKey ? '模板已更新' : '模板已新增', 'success');
    };

    // v1.2 列表操作：预览模板正文
    window.previewTemplateContent = function(key) {
        const all = getAllTemplates(currentOrg);
        const t = all[key];
        if (!t || !(t.content || '').trim()) return;
        previewTextInWindow('模板预览：' + t.name, t.content);
    };

    // v1.2 列表操作：下载模板正文
    window.downloadTemplateByKey = function(key) {
        const all = getAllTemplates(currentOrg);
        const t = all[key];
        if (!t || !(t.content || '').trim()) return;
        downloadTextFile(t.content, (t.name || '模板正文') + '.txt');
    };

    // v1.2 列表操作：重新上传（直接打开编辑弹窗并定位到上传区）
    window.reuploadTemplateByKey = function(key) {
        editTemplate(key);
        // 打开编辑弹窗后，默认清空已有内容，让用户直接选择新文件
        setTimeout(() => {
            reuploadTemplateContent();
            document.getElementById('tplFileInput').click();
        }, 80);
    };

    // ===== 启用/停用切换 =====
    window.toggleTemplateEnabled = function(key) {
        const all = getAllTemplates(currentOrg);
        const t = all[key];
        if (!t) return;
        const newEnabled = t.enabled === false; // 反转：当前停用→启用；当前启用→停用
        if (t.isBuiltin) {
            // 内置模板：操作 __builtinDisabled__ 数组
            let arr = getBuiltinDisabled(currentOrg);
            if (newEnabled) {
                arr = arr.filter(k => k !== key);
            } else {
                if (!arr.includes(key)) arr.push(key);
            }
            setBuiltinDisabled(currentOrg, arr);
        } else {
            // 自定义模板：直接修改 enabled 字段
            const orgData = getOrgData(currentOrg);
            if (orgData[key] && typeof orgData[key] === 'object') {
                orgData[key].enabled = newEnabled;
                setOrgData(currentOrg, orgData);
            }
        }
        renderRight();
        showNotification(newEnabled ? '模板已启用' : '模板已停用', 'success');
    };

    // ===== 删除 =====
    window.deleteTemplate = function(key) {
        const all = getAllTemplates(currentOrg);
        const t = all[key];
        if (!t) return;
        if (t.isBuiltin) {
            showNotification('内置模板不可删除', 'warning');
            return;
        }
        showConfirm('删除模板', '确定删除模板「' + t.name + '」吗？此操作不可恢复。', () => {
            const orgData = getOrgData(currentOrg);
            delete orgData[key];
            setOrgData(currentOrg, orgData);
            renderLeft();
            renderRight();
            showNotification('模板已删除', 'success');
        });
    };

    // ===== 确认弹窗 =====
    function showConfirm(title, text, onConfirm) {
        document.getElementById('confirmTitle').textContent = title;
        document.getElementById('confirmText').textContent = text;
        pendingConfirmAction = onConfirm;
        const btn = document.getElementById('confirmBtn');
        btn.onclick = function() {
            closeConfirm();
            if (typeof pendingConfirmAction === 'function') pendingConfirmAction();
            pendingConfirmAction = null;
        };
        document.getElementById('confirmModal').classList.add('show');
    }
    window.closeConfirm = function() {
        document.getElementById('confirmModal').classList.remove('show');
        pendingConfirmAction = null;
    };

    // ===== ESC 关闭弹窗 =====
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            if (document.getElementById('tplModal').classList.contains('show')) closeModal();
            if (document.getElementById('confirmModal').classList.contains('show')) closeConfirm();
        }
    });

    // 点击遮罩关闭
    document.getElementById('tplModal').addEventListener('click', function(e) {
        if (e.target === this) closeModal();
    });
    document.getElementById('confirmModal').addEventListener('click', function(e) {
        if (e.target === this) closeConfirm();
    });

    // ===== 初始化 =====
    function init() {
        renderLeft();
        renderRight();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // 暴露调试 API
    window.AdminDocTemplates = { getAllTemplates, getOrgData, setOrgData };
})();
