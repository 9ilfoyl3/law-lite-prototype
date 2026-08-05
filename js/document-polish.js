// ============ 文书精修页面 ============
// v1.2 左侧文书区接入 DocEditor 可复用文档编辑器，支持工具栏格式化与直接编辑
// v1.1 精修独立页面：左侧文书内容展示区 + 右侧对话式精修区
// 通过 URL 参数 caseId + versionId 加载对应版本
// 精修结果保存为新版本（type='polish'），不覆盖原版本
// 上下文区展示已选材料名与文书要求，移除固定文书类型/模型名展示

let polishCaseId = '';
let polishVersionId = '';
let polishCaseItem = null;
let polishVersion = null;
let polishDoc = null;
let originalContent = '';      // 原始文书内容（用于撤销）
let currentContent = '';       // 当前文书内容
let editHistory = [];          // 精修历史（用于多步撤销）
let hasUnsavedChanges = false; // 是否有未保存的修改
let docEditor = null;          // 左侧文档编辑器实例

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
    initDocEditor(currentContent || '<p style="color:var(--text-muted);">暂无内容</p>');
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

    // 文书内容：使用可复用文档编辑器
    initDocEditor(currentContent || '<p style="color:var(--text-muted);">暂无内容</p>');

    renderContextInfo();
}

// 初始化/复用左侧文档编辑器
function initDocEditor(content) {
    const root = document.getElementById('docEditorRoot');
    if (!root) return;
    if (docEditor) {
        docEditor.setContent(content);
    } else if (typeof DocEditor !== 'undefined') {
        docEditor = new DocEditor(root, {
            content: content,
            placeholder: '暂无内容',
            showToolbar: true,
            onChange: (html) => {
                currentContent = html;
                hasUnsavedChanges = true;
                document.getElementById('editHint').textContent = '有未保存的精修改动';
            }
        });
    } else {
        root.innerHTML = `<div class="polish-doc-paper">${content}</div>`;
    }
}

// 渲染上下文信息（案件名、已选材料、文书要求）
function renderContextInfo(ctx) {
    const cfg = polishVersion?.config || {};
    const caseName = ctx?.caseName || polishCaseItem?.caseName || '';
    const caseNumber = ctx?.caseNumber || polishCaseItem?.caseNumber || '';

    // 从版本配置或 fallback 上下文中解析已选材料名与文书要求
    const materialIds = cfg.materialIds || ctx?.materialIds || [];
    const materialNames = getMaterialNamesByIds(materialIds);
    const promptText = cfg.prompt || ctx?.prompt || '';

    // 案件名
    let contextHtml = `
        <div class="polish-context-item">
            <i class="fas fa-folder"></i>
            <span class="polish-context-label">案件：</span>
            <span class="polish-context-value">${caseName}${caseNumber ? '（' + caseNumber + '）' : ''}</span>
        </div>
    `;

    // 已选材料
    if (materialNames.length) {
        contextHtml += `
            <div class="polish-context-item">
                <i class="fas fa-file-alt"></i>
                <span class="polish-context-label">已选材料：</span>
                <span class="polish-context-value">${escapeHtml(materialNames.join('、'))}</span>
            </div>
        `;
    }

    // 文书要求（若有）
    if (promptText) {
        contextHtml += `
            <div class="polish-context-item">
                <i class="fas fa-comment"></i>
                <span class="polish-context-label">文书要求：</span>
                <span class="polish-context-value">${escapeHtml(promptText)}</span>
            </div>
        `;
    }

    document.getElementById('contextRow').innerHTML = contextHtml;
}

// 根据 materialIds 从案件材料中解析材料名
function getMaterialNamesByIds(ids) {
    if (!ids || !Array.isArray(ids) || ids.length === 0) return [];
    const materials = polishCaseItem?.materials || polishCaseItem?.files || [];
    return ids.map(id => {
        const item = materials.find(m => m && (m.id === id || m.fileId === id));
        return item ? (item.name || item.fileName || `材料${id}`) : `材料${id}`;
    }).filter(Boolean);
}

function showError(msg) {
    const root = document.getElementById('docEditorRoot');
    if (root) root.innerHTML = `<div class="polish-doc-paper"><p style="color:#dc2626;text-align:center;">${msg}</p></div>`;
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
        if (docEditor) {
            docEditor.setContent(currentContent);
        }
        document.getElementById('editHint').textContent = '有未保存的精修改动';

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
    if (docEditor) {
        docEditor.setContent(currentContent);
    }
    if (editHistory.length === 0) {
        document.getElementById('undoBtn').disabled = true;
    }
    hasUnsavedChanges = editHistory.length > 0;
    document.getElementById('editHint').textContent = hasUnsavedChanges ? '有未保存的精修改动' : '精修指令将在此区域生效';
    showNotification('已撤销上一步精修', 'success');
}

// ===== 保存为新版本（任务 5.3）=====
function saveAsNewVersion() {
    if (!polishCaseItem) {
        showNotification('案件数据缺失，无法保存', 'error');
        return;
    }

    // 获取编辑区最新内容（支持用户手动编辑）
    const latestContent = docEditor ? docEditor.getContent() : currentContent;

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

// ===== 可拖动分隔条（文书 / 精修对话 宽度调整） =====
// 默认 3:1（文书 75% / 对话 25%），用户可拖动分隔条调整
// 拖动时动态设置两列 flex-basis，松手后持久化到 localStorage
(function initPolishResizer() {
    const resizer = document.getElementById('polishResizer');
    const docCol = document.querySelector('.polish-doc-col');
    const chatCol = document.querySelector('.polish-chat-col');
    if (!resizer || !docCol || !chatCol) return;

    // 恢复上次比例
    try {
        const saved = localStorage.getItem('polishDocFlex');
        if (saved) {
            const parts = saved.split('|');
            if (parts.length === 2) {
                docCol.style.flex = parts[0];
                chatCol.style.flex = parts[1];
            }
        }
    } catch (e) { /* ignore */ }

    let dragging = false;
    let startX = 0;
    let startBodyWidth = 0;
    let startDocWidth = 0;

    resizer.addEventListener('mousedown', (e) => {
        dragging = true;
        startX = e.clientX;
        const body = document.querySelector('.polish-body');
        startBodyWidth = body ? body.getBoundingClientRect().width : window.innerWidth;
        startDocWidth = docCol.getBoundingClientRect().width;
        resizer.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const delta = e.clientX - startX;
        let newDocWidth = startDocWidth + delta;
        // 限制最小宽度（与 CSS min-width 对齐）
        const minDoc = 320;
        const minChat = 240;
        const maxDoc = startBodyWidth - 6 - minChat; // 6 = resizer 宽度
        if (newDocWidth < minDoc) newDocWidth = minDoc;
        if (newDocWidth > maxDoc) newDocWidth = maxDoc;
        const newChatWidth = startBodyWidth - 6 - newDocWidth;
        const docRatio = newDocWidth / startBodyWidth;
        const chatRatio = newChatWidth / startBodyWidth;
        docCol.style.flex = `${docRatio} 1 0`;
        chatCol.style.flex = `${chatRatio} 1 0`;
    });

    document.addEventListener('mouseup', () => {
        if (!dragging) return;
        dragging = false;
        resizer.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        // 持久化
        try {
            localStorage.setItem('polishDocFlex', `${docCol.style.flex}|${chatCol.style.flex}`);
        } catch (e) { /* ignore */ }
    });
})();
