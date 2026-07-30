// ============ 文书精修页面 ============
// v1.0 精修独立页面：左侧文书内容展示区 + 右侧对话式精修区
// 通过 URL 参数 caseId + versionId 加载对应版本
// 精修结果保存为新版本（type='polish'），不覆盖原版本

let polishCaseId = '';
let polishVersionId = '';
let polishCaseItem = null;
let polishVersion = null;
let polishDoc = null;
let originalContent = '';      // 原始文书内容（用于撤销）
let currentContent = '';       // 当前文书内容
let editHistory = [];          // 精修历史（用于多步撤销）
let hasUnsavedChanges = false; // 是否有未保存的修改

// ===== 初始化 =====
function initPolishPage() {
    const params = new URLSearchParams(window.location.search);
    polishCaseId = params.get('caseId') || '';
    polishVersionId = params.get('versionId') || '';

    if (!polishCaseId || !polishVersionId) {
        // 兼容旧入口：从 localStorage.refineContext 读取（无 versionId 时）
        const ctx = JSON.parse(localStorage.getItem('refineContext') || 'null');
        if (ctx && ctx.docContent) {
            polishCaseId = ctx.caseId || '';
            polishVersionId = '';
            loadFromContext(ctx);
            return;
        }
        showError('缺少案件ID或版本ID参数');
        return;
    }

    loadVersionData();
}

// 从 URL 参数加载案件版本数据
function loadVersionData() {
    const result = findCaseById(polishCaseId);
    if (!result || !result.caseItem) {
        showError('未找到案件');
        return;
    }
    polishCaseItem = result.caseItem;

    // 查找对应版本
    for (const doc of (polishCaseItem.documents || [])) {
        if (!doc || !Array.isArray(doc.versions)) continue;
        const v = doc.versions.find(x => x.versionId === polishVersionId);
        if (v) {
            polishDoc = doc;
            polishVersion = v;
            break;
        }
    }

    if (!polishVersion) {
        showError('未找到文书版本');
        return;
    }

    originalContent = polishVersion.content || '';
    currentContent = originalContent;
    renderPolishPage();
}

// 从 localStorage 上下文加载（兼容无 versionId 的旧入口）
function loadFromContext(ctx) {
    originalContent = ctx.docContent || '';
    currentContent = originalContent;
    polishCaseItem = ctx.caseId ? findCaseById(ctx.caseId)?.caseItem : null;

    document.getElementById('polishDocTitle').textContent = ctx.docTitle || '法律文书';
    document.getElementById('polishCaseName').textContent = ctx.caseName || '';
    document.getElementById('versionTag').textContent = '未保存';
    document.getElementById('docPaper').innerHTML = currentContent || '<p style="color:var(--text-muted);">暂无内容</p>';
    renderContextInfo(ctx);
}

function renderPolishPage() {
    const title = polishDoc?.title || polishCaseItem.caseName || '法律文书';
    document.getElementById('polishDocTitle').textContent = title;
    document.getElementById('polishCaseName').textContent = polishCaseItem.caseName || polishCaseItem.caseNumber || '';

    // 版本标签
    const versions = polishDoc?.versions || [];
    const idx = versions.findIndex(v => v.versionId === polishVersionId);
    const versionNo = idx >= 0 ? `v${versions.length - idx}` : '原版本';
    document.getElementById('versionTag').textContent = versionNo;

    // 文书内容
    document.getElementById('docPaper').innerHTML = currentContent || '<p style="color:var(--text-muted);">暂无内容</p>';

    renderContextInfo();
}

// 渲染上下文信息（文书类型/模板/生成方式/模型）
function renderContextInfo(ctx) {
    const cfg = polishVersion?.config || {};
    const docTypes = getCurrentDocTypes();
    const docTypeName = cfg.docType ? (docTypes[cfg.docType]?.name || '法律文书') : '法律文书';
    const templates = cfg.docType ? getDocTypeTemplates(cfg.docType) : {};
    const templateName = cfg.template ? (getTemplateName(templates[cfg.template]) || '') : '';
    const genMethodLabel = polishVersion?.genMethod === 'step' ? '分步生成' : '一步生成';
    const modelName = getModelById(cfg.modelId)?.name || '';

    const caseName = ctx?.caseName || polishCaseItem?.caseName || '';
    const caseNumber = ctx?.caseNumber || polishCaseItem?.caseNumber || '';

    document.getElementById('contextRow').innerHTML = `
        <div class="polish-context-item"><i class="fas fa-folder"></i> ${caseName}${caseNumber ? '（' + caseNumber + '）' : ''}</div>
        <div class="polish-context-item"><i class="fas fa-file"></i> ${docTypeName}</div>
        ${templateName ? `<div class="polish-context-item"><i class="fas fa-th-large"></i> ${templateName}</div>` : ''}
        <div class="polish-context-item"><i class="fas fa-cog"></i> ${genMethodLabel}</div>
        ${modelName ? `<div class="polish-context-item"><i class="fas fa-microchip"></i> ${modelName}</div>` : ''}
    `;
}

function showError(msg) {
    document.getElementById('docPaper').innerHTML = `<p style="color:#dc2626;text-align:center;">${msg}</p>`;
    document.getElementById('sendBtn').disabled = true;
    document.getElementById('saveBtn').disabled = true;
}

// ===== 对话精修 =====
function handleChatKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendPolishMessage();
    }
    // 自适应高度
    const input = event.target;
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
}

function sendPolishMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    if (!message) return;

    // 移除空态提示
    const emptyEl = document.querySelector('.polish-chat-empty');
    if (emptyEl) emptyEl.remove();

    // 渲染用户消息
    appendMessage('user', message);
    input.value = '';
    input.style.height = 'auto';

    // 禁用发送按钮，模拟处理
    document.getElementById('sendBtn').disabled = true;

    setTimeout(() => {
        // 模拟精修：在文书末尾追加一段说明（原型演示）
        const editNote = `<p style="color:#6b7280;font-size:13px;border-left:3px solid #2563eb;padding-left:12px;margin-top:16px;background:#f0f7ff;padding:8px 12px;">【精修指令】${escapeHtml(message)}</p>`;
        // 保存当前内容到历史（用于撤销）
        editHistory.push(currentContent);
        currentContent = currentContent + editNote;

        // 更新文书展示
        const paper = document.getElementById('docPaper');
        paper.innerHTML = currentContent;
        paper.classList.add('editing');

        // 助手回复
        const replies = [
            '已根据您的指令调整文书内容，请查看左侧更新。',
            '已完成精修，您可继续输入指令进一步优化。',
            '文书内容已更新，点击"保存为新版本"可保存当前精修结果。'
        ];
        appendMessage('assistant', replies[Math.floor(Math.random() * replies.length)]);

        // 启用撤销与保存
        hasUnsavedChanges = true;
        document.getElementById('undoBtn').disabled = false;
        document.getElementById('sendBtn').disabled = false;
        document.getElementById('editHint').textContent = '有未保存的精修改动';
    }, 600);
}

function appendMessage(role, text) {
    const container = document.getElementById('chatMessages');
    const avatarIcon = role === 'user' ? 'fa-user' : 'fa-robot';
    const div = document.createElement('div');
    div.className = `polish-msg ${role}`;
    div.innerHTML = `
        <div class="polish-msg-avatar"><i class="fas ${avatarIcon}"></i></div>
        <div class="polish-msg-bubble">${escapeHtml(text)}</div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ===== 撤销 =====
function undoLastEdit() {
    if (editHistory.length === 0) {
        showNotification('没有可撤销的操作', 'info');
        return;
    }
    currentContent = editHistory.pop();
    document.getElementById('docPaper').innerHTML = currentContent;
    if (editHistory.length === 0) {
        document.getElementById('undoBtn').disabled = true;
        document.getElementById('docPaper').classList.remove('editing');
    }
    hasUnsavedChanges = editHistory.length > 0;
    if (!hasUnsavedChanges) {
        document.getElementById('editHint').textContent = '精修指令将在此区域生效';
    }
    showNotification('已撤销上一步精修', 'success');
}

// ===== 保存为新版本（任务 5.3）=====
function saveAsNewVersion() {
    if (!polishCaseItem) {
        showNotification('案件数据缺失，无法保存', 'error');
        return;
    }

    // 获取编辑区最新内容（支持用户手动编辑）
    const paper = document.getElementById('docPaper');
    const latestContent = paper.innerHTML;

    // 从原版本继承配置
    const origCfg = polishVersion?.config || {};
    const versionData = {
        type: 'polish',
        genMethod: polishVersion?.genMethod || 'material',
        source: 'ai',
        content: latestContent,
        createdBy: getCurrentUserName(),
        polishedFrom: polishVersionId || undefined,
        config: {
            docType: origCfg.docType || 'judgment',
            template: origCfg.template || '',
            prompt: origCfg.prompt || '',
            modelId: origCfg.modelId || '',
            materialIds: Array.isArray(origCfg.materialIds) ? [...origCfg.materialIds] : [],
            materialTokens: origCfg.materialTokens || 0,
            stepsSnapshot: Array.isArray(origCfg.stepsSnapshot) ? origCfg.stepsSnapshot : null
        }
    };

    const savedVersion = addDocumentVersion(polishCaseItem.id, versionData);
    if (savedVersion) {
        hasUnsavedChanges = false;
        editHistory = [];
        document.getElementById('undoBtn').disabled = true;
        document.getElementById('editHint').textContent = '已保存';
        document.getElementById('docPaper').classList.remove('editing');

        // 更新版本标签
        const versions = getAllDocumentVersions(polishCaseItem.id);
        document.getElementById('versionTag').textContent = `精修版（共 ${versions.length} 版）`;

        showNotification('已保存为新版本', 'success');
        // 提供返回入口
        const saveBtn = document.getElementById('saveBtn');
        saveBtn.innerHTML = '<i class="fas fa-check"></i> 已保存';
        saveBtn.disabled = true;
        setTimeout(() => {
            saveBtn.innerHTML = '<i class="fas fa-save"></i> 保存为新版本';
            saveBtn.disabled = false;
        }, 2000);
    } else {
        showNotification('保存失败，请重试', 'error');
    }
}

// ===== 返回案件（任务 5.4）=====
function goBackToCase() {
    if (hasUnsavedChanges) {
        if (!confirm('有未保存的精修改动，确定要离开吗？')) return;
    }
    if (polishCaseId) {
        window.location.href = `case-files.html?caseId=${encodeURIComponent(polishCaseId)}`;
    } else {
        window.location.href = 'cases.html';
    }
}

// 未保存时关闭页面二次确认
window.addEventListener('beforeunload', function(e) {
    if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
    }
});

// ===== 启动 =====
initPolishPage();
