// ============ My Templates (用户侧自定义文书模板) ============
// v1.0 个人文书模板维护，关联文书类型
// v1.1 移除「关联案由」字段：模板作为所属文书类型的下属，案由匹配通过文书类型→workflow 链路间接实现
// v1.2 模板正文交互改造：① 模板正文从 textarea 在线编辑改为文件上传；② 新增/编辑表单提供模板示例下载；③ 卡片列表新增「预览」「下载」「重新上传」三个操作按钮；④ 未上传正文时预览/下载置灰；⑤ 上传内容以纯文本持久化到 content 字段；⑥ 修复保存时读取 content 及表单上传区显示逻辑
// v1.3 模板卡片新增「上传时间」「更新时间」展示：保存时记录 createdAt / updatedAt
// 数据持久化：localStorage.myDocTemplates（按业务系统分组）
// 用户侧联动：case-data.js mergeMyDocTemplates 在加载时合并到 system.docTemplates（key 加 my- 前缀）

(function() {
    'use strict';

    // ===== 状态 =====
    let currentOrg = 'court';
    let currentDocTypeFilter = ''; // '' = 全部
    let editingKey = null;         // 当前编辑的 key（null=新增模式）
    let pendingMyTemplateContent = '';    // v1.2 新增/编辑表单中暂存的模板正文
    let pendingMyTemplateFileName = '';   // v1.2 上传文件名展示

    // v1.2 模板示例正文
    const MY_TEMPLATE_EXAMPLE_TEXT = `{{courtName}}
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

    // ===== 存储 =====
    function getStorage() {
        try {
            return JSON.parse(localStorage.getItem('myDocTemplates')) || {};
        } catch (e) {
            return {};
        }
    }
    function saveStorage(data) {
        localStorage.setItem('myDocTemplates', JSON.stringify(data));
    }
    function getOrgData(org) {
        return getStorage()[org] || {};
    }
    function setOrgData(org, data) {
        const all = getStorage();
        all[org] = data;
        saveStorage(all);
    }

    function getDocTypes(org) {
        return getAdminDocTypes(org) || {};
    }

    function genKey() {
        return 't' + Date.now().toString(36) + Math.floor(Math.random() * 100);
    }

    function escapeHtml(s) {
        if (s === undefined || s === null) return '';
        return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }

    // v1.3 时间工具：返回格式化时间（YYYY-MM-DD HH:mm）
    function nowTime() {
        const d = new Date();
        const p = n => (n < 10 ? '0' + n : '' + n);
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
            + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }

    // v1.2 通用工具：下载文本文件
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

    // v1.2 通用工具：新窗口预览文本
    function previewTextInWindow(title, text) {
        const w = window.open('', '_blank');
        if (!w) {
            showToast('预览窗口被浏览器拦截，请允许弹窗', 'error');
            return;
        }
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
            <style>body{font-family:'Noto Sans SC',-apple-system,sans-serif;padding:32px;line-height:1.8;max-width:720px;margin:0 auto;color:#1e293b;white-space:pre-wrap;word-break:break-word;}</style>
            </head><body>${escapeHtml(text)}</body></html>`;
        w.document.open();
        w.document.write(html);
        w.document.close();
    }

    // ===== 通知 =====
    function showToast(msg, type) {
        type = type || 'success';
        const toast = document.getElementById('toast');
        toast.textContent = msg;
        toast.className = 'toast ' + type + ' show';
        setTimeout(() => toast.classList.remove('show'), 2200);
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
        renderList();
    };

    // ===== 渲染左侧文书类型列表 =====
    function renderLeft() {
        const docTypes = getDocTypes(currentOrg);
        const orgData = getOrgData(currentOrg);
        const totalCount = Object.keys(orgData).length;

        const leftEl = document.getElementById('leftList');
        let html = '<div class="left-item' + (currentDocTypeFilter === '' ? ' active' : '') + '" onclick="selectDocType(\'\')">'
            + '<span>全部</span><span class="count">' + totalCount + '</span></div>';

        Object.entries(docTypes).forEach(([key, cfg]) => {
            const count = Object.entries(orgData).filter(([k, v]) => v.docType === key).length;
            html += '<div class="left-item' + (currentDocTypeFilter === key ? ' active' : '') + '" onclick="selectDocType(\'' + key + '\')">'
                + '<span>' + escapeHtml(cfg.name) + '</span>'
                + '<span class="count">' + count + '</span></div>';
        });
        leftEl.innerHTML = html;
    }
    window.selectDocType = function(key) {
        currentDocTypeFilter = key;
        renderLeft();
        renderList();
    };

    // 渲染单个模板卡片（非编辑态）
    function renderCard(key, t, docTypes) {
        const docTypeName = (docTypes[t.docType] || {}).name || '-';
        const isEnabled = t.enabled !== false; // 缺省视为 true
        const statusBadge = isEnabled
            ? '<span class="item-badge status-on">已启用</span>'
            : '<span class="item-badge status-off">已停用</span>';
        const toggleBtn = isEnabled
            ? '<button class="action-btn toggle-off" onclick="toggleEnabled(\'' + key + '\')">停用</button>'
            : '<button class="action-btn toggle-on" onclick="toggleEnabled(\'' + key + '\')">启用</button>';
        const hasContent = (t.content || '').trim().length > 0;
        const viewDisabled = hasContent ? '' : ' disabled';
        // v1.3 展示上传时间与更新时间（缺省内容兼容旧数据）
        const createdAt = t.createdAt || '';
        const updatedAt = t.updatedAt || '';
        const timeMeta = (createdAt || updatedAt)
            ? '<div class="item-meta">'
                + (createdAt ? '<span class="tpl-time-block">上传：' + escapeHtml(createdAt) + '</span>' : '')
                + (createdAt && updatedAt ? '<span class="tpl-time-sep">·</span>' : '')
                + (updatedAt ? '<span class="tpl-time-block">更新：' + escapeHtml(updatedAt) + '</span>' : '')
                + '</div>'
            : '';
        return '<div class="item-card">'
            + '<div class="item-row">'
            + '<div>'
            + '<span class="item-name">' + escapeHtml(t.name || key) + '</span>'
            + '<span class="item-badge">我的</span>'
            + statusBadge
            + '<div class="item-meta">所属类型：' + escapeHtml(docTypeName) + '</div>'
            + timeMeta
            + '</div>'
            + '<div class="item-actions">'
            + '<button class="action-btn view"' + viewDisabled + ' onclick="previewMyTemplate(\'' + key + '\')">预览</button>'
            + '<button class="action-btn view"' + viewDisabled + ' onclick="downloadMyTemplate(\'' + key + '\')">下载</button>'
            + '<button class="action-btn view" onclick="reuploadMyTemplate(\'' + key + '\')">重新上传</button>'
            + '<button class="action-btn edit" onclick="editItem(\'' + key + '\')">编辑</button>'
            + toggleBtn
            + '<button class="action-btn delete" onclick="deleteItem(\'' + key + '\')">删除</button>'
            + '</div>'
            + '</div>'
            + '</div>';
    }

    // v1.2 卡片操作：预览/下载/重新上传
    window.previewMyTemplate = function(key) {
        const orgData = getOrgData(currentOrg);
        const t = orgData[key];
        if (!t || !(t.content || '').trim()) return;
        previewTextInWindow('模板预览：' + t.name, t.content);
    };
    window.downloadMyTemplate = function(key) {
        const orgData = getOrgData(currentOrg);
        const t = orgData[key];
        if (!t || !(t.content || '').trim()) return;
        downloadTextFile(t.content, (t.name || '我的模板正文') + '.txt');
    };
    window.reuploadMyTemplate = function(key) {
        editItem(key);
        setTimeout(() => {
            reuploadMyTemplateContent();
            document.getElementById('myTplFileInput').click();
        }, 80);
    };

    // 切换启用/停用状态
    window.toggleEnabled = function(key) {
        const orgData = getOrgData(currentOrg);
        const t = orgData[key];
        if (!t) return;
        const isEnabled = t.enabled !== false;
        t.enabled = !isEnabled;
        setOrgData(currentOrg, orgData);
        renderList();
        showToast(isEnabled ? '已停用' : '已启用', 'success');
    };

    // ===== 渲染右侧列表 =====
    function renderList() {
        const docTypes = getDocTypes(currentOrg);
        const orgData = getOrgData(currentOrg);
        const contentTitle = document.getElementById('contentTitle');
        contentTitle.textContent = currentDocTypeFilter
            ? ((docTypes[currentDocTypeFilter] || {}).name || '模板列表')
            : '全部我的模板';

        const list = Object.entries(orgData).filter(([k, v]) => {
            return !currentDocTypeFilter || v.docType === currentDocTypeFilter;
        });

        const listEl = document.getElementById('itemList');
        const empty = document.getElementById('emptyState');

        // 新增模式下，即使列表为空也要在顶部渲染编辑表单
        if (editingKey === '__new__') {
            empty.style.display = 'none';
            const existingHtml = list.map(([key, t]) => renderCard(key, t, docTypes)).join('');
            listEl.innerHTML = renderEditForm('__new__', null) + existingHtml;
            return;
        }

        if (list.length === 0) {
            listEl.innerHTML = '';
            empty.style.display = 'block';
            return;
        }
        empty.style.display = 'none';

        listEl.innerHTML = list.map(([key, t]) => {
            // 如果是编辑中的项，渲染表单
            if (editingKey === key) {
                return renderEditForm(key, t);
            }
            return renderCard(key, t, docTypes);
        }).join('');
    }

    // ===== 新增/编辑表单 =====
    window.openAddForm = function() {
        // 在列表顶部插入新表单
        if (editingKey !== null) {
            showToast('请先保存或取消当前编辑', 'error');
            return;
        }
        editingKey = '__new__';
        pendingMyTemplateContent = '';
        pendingMyTemplateFileName = '';
        renderList();
        // 滚动到顶部
        document.getElementById('itemList').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    window.editItem = function(key) {
        if (editingKey !== null) {
            showToast('请先保存或取消当前编辑', 'error');
            return;
        }
        editingKey = key;
        const orgData = getOrgData(currentOrg);
        const t = orgData[key];
        pendingMyTemplateContent = t ? (t.content || '') : '';
        pendingMyTemplateFileName = pendingMyTemplateContent ? '已保存的模板正文' : '';
        renderList();
    };

    window.cancelEdit = function() {
        editingKey = null;
        pendingMyTemplateContent = '';
        pendingMyTemplateFileName = '';
        renderList();
    };

    function renderEditForm(key, t) {
        const isNew = key === '__new__';
        const docTypes = getDocTypes(currentOrg);
        const docTypeOptions = Object.entries(docTypes).map(([k, cfg]) =>
            '<option value="' + k + '"' + (t && t.docType === k ? ' selected' : '') + '>' + escapeHtml(cfg.name) + '</option>'
        ).join('');
        const name = (t && t.name) || '';
        const hasContent = pendingMyTemplateContent.length > 0;

        const uploadArea = '<div class="tpl-upload-area" id="myTplUploadArea" style="display:' + (hasContent ? 'none' : 'block') + ';" onclick="document.getElementById(\'myTplFileInput\').click()">'
            + '<input type="file" id="myTplFileInput" accept=".txt,.doc,.docx" style="display:none" onchange="handleMyTemplateFileUpload(event)">'
            + '<i class="fas fa-cloud-upload-alt"></i>'
            + '<div class="tpl-upload-title">点击上传模板文件</div>'
            + '<div class="tpl-upload-hint">支持 .txt / .doc / .docx 格式；内容将解析为纯文本并持久化</div>'
            + '<div class="tpl-upload-filename" id="myTplUploadFilename" style="display:' + (pendingMyTemplateFileName ? 'block' : 'none') + ';">' + (pendingMyTemplateFileName ? '已选择文件：' + escapeHtml(pendingMyTemplateFileName) : '') + '</div>'
            + '</div>';
        const fileActions = '<div class="tpl-file-actions" id="myTplFileActions" style="display:' + (hasContent ? 'flex' : 'none') + ';">'
            + '<span class="tpl-content-status">已上传模板正文</span>'
            + '<button type="button" class="btn btn-secondary" onclick="downloadCurrentMyTemplateContent()"><i class="fas fa-download"></i> 下载当前正文</button>'
            + '<button type="button" class="btn btn-secondary" onclick="reuploadMyTemplateContent()"><i class="fas fa-redo"></i> 重新上传</button>'
            + '</div>';
        const exampleRow = '<div class="tpl-example-row">'
            + '<span>没有模板文件？</span><a href="javascript:void(0)" onclick="downloadMyTemplateExample()">下载模板示例</a>'
            + '<span class="tpl-example-hint">（含常见占位符，如 {{courtName}}、{{caseNumber}} 等）</span></div>';

        return '<div class="item-card editing">'
            + '<div class="form-group">'
            + '<label class="form-label">模板名 <span class="required">*</span></label>'
            + '<input type="text" class="form-input" id="formName" value="' + escapeHtml(name) + '" placeholder="如：我的民事判决书模板">'
            + '</div>'
            + '<div class="form-group">'
            + '<label class="form-label">所属文书类型 <span class="required">*</span></label>'
            + '<select class="form-select" id="formDocType">' + docTypeOptions + '</select>'
            + '</div>'
            + '<div class="form-group">'
            + '<label class="form-label">模板正文</label>'
            + fileActions + uploadArea
            + exampleRow
            + '<div class="form-hint">模板正文不支持在线编辑，请通过上传文件确定内容</div>'
            + '</div>'
            + '<div class="form-actions">'
            + '<button class="btn btn-primary" onclick="saveItem(\'' + (isNew ? '' : key) + '\')">保存</button>'
            + '<button class="btn btn-secondary" onclick="cancelEdit()">取消</button>'
            + '</div>'
            + '</div>';
    }

    window.saveItem = function(existingKey) {
        const name = document.getElementById('formName').value.trim();
        const docType = document.getElementById('formDocType').value;
        const content = pendingMyTemplateContent;

        if (!name) {
            showToast('请填写模板名', 'error');
            document.getElementById('formName').focus();
            return;
        }
        if (!docType) {
            showToast('请选择所属文书类型', 'error');
            return;
        }

        const orgData = getOrgData(currentOrg);
        let key = existingKey;
        if (!key) {
            // 新增：生成唯一 key
            key = genKey();
            while (orgData[key]) key = genKey();
        }
        // 编辑时保留原 enabled 字段；新增时默认启用
        const prevEnabled = existingKey && orgData[key] ? (orgData[key].enabled !== false) : true;
        // v1.3 记录上传时间与更新时间
        const now = nowTime();
        const createdAt = existingKey && orgData[key] && orgData[key].createdAt ? orgData[key].createdAt : now;
        orgData[key] = {
            name: name,
            docType: docType,
            content: content,
            enabled: prevEnabled,
            createdAt: createdAt,
            updatedAt: now
        };
        setOrgData(currentOrg, orgData);

        editingKey = null;
        pendingMyTemplateContent = '';
        pendingMyTemplateFileName = '';
        renderLeft();
        renderList();
        showToast(existingKey ? '模板已更新' : '模板已新增', 'success');
    };

    // v1.2 模板文件上传处理（原型阶段仅解析 .txt；doc/docx 提示需配套解析能力）
    window.handleMyTemplateFileUpload = function(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        const name = file.name || '';
        const ext = name.split('.').pop().toLowerCase();
        if (!['txt', 'doc', 'docx'].includes(ext)) {
            showToast('仅支持 .txt / .doc / .docx 格式', 'error');
            event.target.value = '';
            return;
        }
        if (ext === 'txt') {
            const reader = new FileReader();
            reader.onload = function(e) {
                pendingMyTemplateContent = (e.target.result || '').toString();
                pendingMyTemplateFileName = name;
                renderList();
                showToast('模板正文已读取', 'success');
            };
            reader.onerror = function() {
                showToast('文件读取失败', 'error');
            };
            reader.readAsText(file, 'utf-8');
        } else {
            // doc/docx 原型阶段用 mock 解析提示：仅取文件名作为占位
            pendingMyTemplateContent = '// 文件：' + name + '\n// 注：doc/docx 格式需配套文档解析服务，原型阶段仅保存文件名标识。';
            pendingMyTemplateFileName = name;
            renderList();
            showToast('已接收 ' + ext + ' 文件（原型阶段仅保存标识）', 'success');
        }
        event.target.value = '';
    };

    // v1.2 下载模板示例
    window.downloadMyTemplateExample = function() {
        downloadTextFile(MY_TEMPLATE_EXAMPLE_TEXT, '民事判决书模板示例.txt');
    };

    // v1.2 下载当前弹窗/表单中的模板正文
    window.downloadCurrentMyTemplateContent = function() {
        if (!pendingMyTemplateContent) return;
        const title = (document.getElementById('formName') && document.getElementById('formName').value.trim()) || '我的模板正文';
        downloadTextFile(pendingMyTemplateContent, title + '.txt');
    };

    // v1.2 重新上传：清空当前内容，恢复上传区
    window.reuploadMyTemplateContent = function() {
        pendingMyTemplateContent = '';
        pendingMyTemplateFileName = '';
        renderList();
    };

    // ===== 删除 =====
    window.deleteItem = function(key) {
        const orgData = getOrgData(currentOrg);
        const t = orgData[key];
        if (!t) return;
        if (!confirm('确定删除模板「' + (t.name || key) + '」吗？此操作不可恢复。')) return;
        delete orgData[key];
        setOrgData(currentOrg, orgData);
        renderLeft();
        renderList();
        showToast('模板已删除', 'success');
    };

    // ===== 初始化 =====
    function init() {
        // 从 URL 读取 org 参数
        const params = new URLSearchParams(window.location.search);
        const orgParam = params.get('org');
        if (orgParam && ['court', 'procuratorate', 'justice'].includes(orgParam)) {
            currentOrg = orgParam;
            document.querySelectorAll('.business-switch-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.type === orgParam);
            });
        }
        renderLeft();
        renderList();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
