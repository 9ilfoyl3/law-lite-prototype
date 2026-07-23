// ============ Common JavaScript ============

// History conversation data (demo)
const historyData = [
    {
        date: '今天',
        items: [
            { id: 'h1', title: '民间借贷纠纷案裁判文书', preview: '生成一份民间借贷纠纷的判决书……', active: true, pinned: false },
            { id: 'h2', title: '合同纠纷争议焦点分析', preview: '分析买卖合同纠纷的争议焦点……', active: false, pinned: false }
        ]
    },
    {
        date: '昨天',
        items: [
            { id: 'h3', title: '交通事故责任认定', preview: '机动车交通事故责任划分问题……', active: false, pinned: false },
            { id: 'h4', title: '劳动合同解除赔偿', preview: '计算经济补偿金和赔偿金……', active: false, pinned: false }
        ]
    },
    {
        date: '本周',
        items: [
            { id: 'h5', title: '房屋买卖合同效力', preview: '审查房屋买卖合同的效力问题……', active: false, pinned: false },
            { id: 'h6', title: '继承纠纷法定继承', preview: '法定继承的份额计算……', active: false, pinned: false },
            { id: 'h7', title: '知识产权侵权类案', preview: '检索商标权侵权相关案例……', active: false, pinned: false }
        ]
    },
    {
        date: '更早',
        items: [
            { id: 'h8', title: '行政处罚程序审查', preview: '行政处罚的程序合法性审查……', active: false, pinned: false },
            { id: 'h9', title: '刑事案件量刑建议', preview: '盗窃罪的量刑情节分析……', active: false, pinned: false }
        ]
    }
];

// Current editing history item
let currentEditingItemId = null;

// Hide all history item menus
function hideAllHistoryMenus() {
    document.querySelectorAll('.history-item-menu').forEach(menu => {
        menu.classList.remove('show');
    });
}

// Toggle history item menu
function toggleHistoryMenu(event, itemId) {
    event.stopPropagation();
    hideAllHistoryMenus();
    
    const menu = document.getElementById(`menu-${itemId}`);
    if (menu) {
        menu.classList.toggle('show');
    }
}

// Edit history item title
function editHistoryTitle(itemId) {
    const item = findHistoryItem(itemId);
    if (!item) return;
    
    const newTitle = prompt('请输入新的会话标题：', item.title);
    if (newTitle !== null && newTitle.trim() !== '') {
        item.title = newTitle.trim();
        renderHistoryList();
        showNotification('标题已更新', 'success');
    }
    hideAllHistoryMenus();
}

// Pin/Unpin history item
function pinHistoryItem(itemId) {
    const item = findHistoryItem(itemId);
    if (!item) return;
    
    item.pinned = !item.pinned;
    renderHistoryList();
    
    if (item.pinned) {
        showNotification('会话已置顶', 'success');
    } else {
        showNotification('已取消置顶', 'success');
    }
    hideAllHistoryMenus();
}

// Delete history item
function deleteHistoryItem(itemId) {
    if (!confirm('确定要删除这个会话吗？')) return;
    
    for (let group of historyData) {
        const index = group.items.findIndex(item => item.id === itemId);
        if (index !== -1) {
            group.items.splice(index, 1);
            break;
        }
    }
    
    renderHistoryList();
    showNotification('会话已删除', 'success');
    hideAllHistoryMenus();
}

// Find history item by id
function findHistoryItem(itemId) {
    for (let group of historyData) {
        const item = group.items.find(item => item.id === itemId);
        if (item) return item;
    }
    return null;
}

// History sidebar state
let isHistorySidebarOpen = false;

// Highlight search text
function highlightText(text, query) {
    if (!query) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<span class="search-highlight">$1</span>');
}

// Render history list
function renderHistoryList(query = '') {
    const list = document.getElementById('historyList');
    if (!list) return;
    
    const lowerQuery = query.toLowerCase();

    let html = '';
    let totalCount = 0;
    
    historyData.forEach(group => {
        const filteredItems = group.items.filter(item => {
            if (!query) return true;
            return item.title.toLowerCase().includes(lowerQuery) ||
                   item.preview.toLowerCase().includes(lowerQuery);
        });

        if (filteredItems.length > 0) {
            html += `<div class="history-date-group">`;
            html += `<div class="history-date-label">${group.date}</div>`;
            filteredItems.forEach(item => {
                totalCount++;
                html += `
                    <div class="history-item ${item.active ? 'active' : ''}" data-id="${item.id}" onclick="loadConversationDetail('${item.id}')">
                        <div class="history-item-icon">
                            ${item.pinned ? '<i class="fas fa-thumbtack" style="color: var(--accent-primary);"></i>' : '<i class="fas fa-comment-dots"></i>'}
                        </div>
                        <div class="history-item-content">
                            <div class="history-item-title-row">
                                <div class="history-item-title">${highlightText(item.title, query)}</div>
                                <button class="history-item-menu-btn" onclick="toggleHistoryMenu(event, '${item.id}')" title="更多操作">
                                    <i class="fas fa-ellipsis-h"></i>
                                </button>
                            </div>
                            <div class="history-item-preview">${highlightText(item.preview, query)}</div>
                        </div>
                        <div class="history-item-menu" id="menu-${item.id}">
                            <div class="history-menu-item" onclick="event.stopPropagation(); editHistoryTitle('${item.id}')">
                                <i class="fas fa-edit"></i>
                                <span>编辑标题</span>
                            </div>
                            <div class="history-menu-item" onclick="event.stopPropagation(); pinHistoryItem('${item.id}')">
                                <i class="fas fa-thumbtack"></i>
                                <span>${item.pinned ? '取消置顶' : '置顶'}</span>
                            </div>
                            <div class="history-menu-item delete" onclick="event.stopPropagation(); deleteHistoryItem('${item.id}')">
                                <i class="fas fa-trash-alt"></i>
                                <span>删除</span>
                            </div>
                        </div>
                    </div>
                `;
            });
            html += `</div>`;
        }
    });

    if (!html) {
        html = '<div class="kb-menu-empty">未找到匹配的会话</div>';
    }
    
    // Add footer tip
    html += `<div class="history-footer-tip">只展示近100条会话数据</div>`;

    list.innerHTML = html;
}

// Load conversation detail - 加载对话详情（写死数据）
function loadConversationDetail(itemId) {
    const item = findHistoryItem(itemId);
    if (!item) return;
    
    // 更新活动状态
    historyData.forEach(group => {
        group.items.forEach(i => i.active = (i.id === itemId));
    });
    renderHistoryList();
    
    // 关闭历史侧边栏
    closeHistorySidebar();
    
    // 根据当前页面类型执行不同的加载逻辑
    const currentPage = window.location.pathname;
    
    if (currentPage.includes('chat.html')) {
        // 在聊天页面，加载对话详情
        loadChatConversationDetail(item);
    } else {
        // 在其他页面，跳转到聊天页面并带上会话ID
        window.location.href = `pages/chat.html?conversation=${itemId}`;
    }
}

// 在聊天页面加载对话详情（写死数据展示）
function loadChatConversationDetail(item) {
    // 隐藏欢迎页面，显示聊天消息区域
    const welcomePage = document.getElementById('welcomePage');
    const chatMessages = document.getElementById('chatMessages');
    const chatInputContainer = document.getElementById('chatInputContainer');
    
    if (welcomePage) welcomePage.style.display = 'none';
    if (chatMessages) chatMessages.style.display = 'block';
    if (chatInputContainer) chatInputContainer.style.display = 'block';
    
    // 更新页面标题
    const pageTitle = document.querySelector('.chat-page-title');
    if (pageTitle) {
        pageTitle.textContent = `裁判文书 - ${item.title}`;
    }
    
    // 清空现有消息
    chatMessages.innerHTML = '';
    
    // 构建对话详情HTML（写死数据，类似截图中的裁判文书任务对话页面）
    const conversationHtml = `
        <!-- 用户消息 -->
        <div class="message-row user">
            <div class="user-message-card">
                <div class="user-message-prompt">${item.preview}</div>
                <div class="user-message-tags">
                    <span class="msg-tag task"><i class="fas fa-gavel"></i> 裁判文书</span>
                    <span class="msg-tag cause"><i class="fas fa-folder"></i> (2024)粤01民初12345号</span>
                </div>
            </div>
        </div>
        
        <!-- AI回复 -->
        <div class="message-row ai">
            <div class="ai-message-card">
                <!-- 任务过程 - 默认收起 -->
                <div class="task-process-section collapsed" id="taskProcessSection">
                    <div class="task-process-header" id="taskProcessToggle">
                        <i class="fas fa-chevron-down toggle-icon"></i>
                        <span class="task-process-header-text">任务过程</span>
                        <span class="task-process-status completed" id="taskProcessStatus"><i class="fas fa-check-circle"></i> 已完成</span>
                    </div>
                    <div class="task-process-body">
                        <div class="task-timeline">
                            <div class="task-node completed">
                                <div class="task-node-header">
                                    <span class="task-node-title">整理材料</span>
                                    <span class="node-status-badge completed">已完成</span>
                                </div>
                            </div>
                            <div class="task-node completed">
                                <div class="task-node-header">
                                    <span class="task-node-title">确定案由</span>
                                    <span class="node-status-badge completed">已完成</span>
                                </div>
                            </div>
                            <div class="task-node completed">
                                <div class="task-node-header">
                                    <span class="task-node-title">归纳争议焦点</span>
                                    <span class="node-status-badge completed">已完成</span>
                                </div>
                            </div>
                            <div class="task-node completed">
                                <div class="task-node-header">
                                    <span class="task-node-title">分析要件事实</span>
                                    <span class="node-status-badge completed">已完成</span>
                                </div>
                            </div>
                            <div class="task-node completed">
                                <div class="task-node-header">
                                    <span class="task-node-title">认定案件事实</span>
                                    <span class="node-status-badge completed">已完成</span>
                                </div>
                            </div>
                            <div class="task-node completed">
                                <div class="task-node-header">
                                    <span class="task-node-title">撰写裁判文书</span>
                                    <span class="node-status-badge completed">已完成</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- 生成的文档 -->
                <div class="ai-message-text">为您生成以下民事判决书</div>
                
                <div class="doc-card active" id="docCard" onclick="toggleDocCard(this)">
                    <div class="doc-card-icon">
                        <i class="fas fa-file-contract"></i>
                    </div>
                    <div class="doc-card-info">
                        <div class="doc-card-title">广东省广州市中级人民法院民事判决书</div>
                        <div class="doc-card-meta">创建时间：2024-02-23 12:01</div>
                    </div>
                    <button class="doc-action-btn" onclick="event.stopPropagation(); showNotification('已收藏', 'success')">
                        <i class="fas fa-star"></i>
                        收藏
                    </button>
                </div>
                
                <!-- AI提示信息 -->
                <div class="ai-guidance" style="margin-top: 12px; font-size: 13px; color: var(--text-muted);">
                    本内容由AI生成，仅供参考！您可以在右侧对文书进行编辑修改……
                </div>
                
                <!-- 消息操作栏 -->
                <div class="message-actions">
                    <button class="msg-action-btn" title="复制" onclick="showNotification('已复制到剪贴板', 'success')">
                        <i class="fas fa-copy"></i>
                    </button>
                    <button class="msg-action-btn" title="重新生成" onclick="showNotification('正在重新生成……', 'success')">
                        <i class="fas fa-redo"></i>
                    </button>
                    <button class="msg-action-btn" title="点赞" onclick="showNotification('感谢反馈', 'success')">
                        <i class="fas fa-thumbs-up"></i>
                    </button>
                    <button class="msg-action-btn" title="点踩" onclick="showNotification('我们会继续改进', 'success')">
                        <i class="fas fa-thumbs-down"></i>
                    </button>
                    <div style="flex: 1;"></div>
                    <button class="msg-action-btn msg-action-btn-text" title="创建案件" onclick="showNotification('正在创建案件……', 'success')">
                        <i class="fas fa-plus"></i>
                        创建案件
                    </button>
                </div>
            </div>
        </div>
    `;
    
    chatMessages.innerHTML = conversationHtml;
    
    // 重新绑定任务过程折叠/展开事件
    const taskProcessToggle = document.getElementById('taskProcessToggle');
    if (taskProcessToggle) {
        taskProcessToggle.addEventListener('click', function() {
            const section = document.getElementById('taskProcessSection');
            section.classList.toggle('collapsed');
        });
    }
    
    // 滚动到底部
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 切换文档卡片选中状态
function toggleDocCard(card) {
    card.classList.toggle('active');
}

// Toggle history sidebar
function toggleHistorySidebar() {
    const sidebar = document.getElementById('historySidebar');
    const overlay = document.getElementById('historyOverlay');
    const btn = document.getElementById('historyToggleBtn');

    if (!sidebar || !overlay || !btn) return;

    isHistorySidebarOpen = !isHistorySidebarOpen;

    if (isHistorySidebarOpen) {
        sidebar.classList.add('show');
        overlay.classList.add('show');
        btn.classList.add('active');
        renderHistoryList();
    } else {
        sidebar.classList.remove('show');
        overlay.classList.remove('show');
        btn.classList.remove('active');
    }
}

// Close history sidebar
function closeHistorySidebar() {
    const sidebar = document.getElementById('historySidebar');
    const overlay = document.getElementById('historyOverlay');
    const btn = document.getElementById('historyToggleBtn');

    isHistorySidebarOpen = false;
    if (sidebar) sidebar.classList.remove('show');
    if (overlay) overlay.classList.remove('show');
    if (btn) btn.classList.remove('active');
}

// Show notification
function showNotification(message, type = 'success', duration = 2500) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;

    const iconMap = {
        success: 'fa-check-circle',
        warning: 'fa-exclamation-triangle',
        error: 'fa-times-circle',
        info: 'fa-info-circle'
    };

    notification.innerHTML = `<i class="fas ${iconMap[type] || iconMap.success}"></i> ${message}`;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transition = 'opacity 0.3s';
        setTimeout(() => notification.remove(), 300);
    }, duration);
}

// Close all menus (this is the main function used across pages)
function closeAllMenus() {
    const backdrop = document.getElementById('menuBackdrop');
    
    // Close case menu
    const caseMenu = document.getElementById('caseMenu');
    const caseBtn = document.getElementById('caseBtn');
    if (caseMenu) caseMenu.classList.remove('show');
    if (caseBtn) caseBtn.classList.remove('active');
    
    // Close task menu
    const taskMenu = document.getElementById('taskMenu');
    const taskBtn = document.getElementById('taskBtn');
    if (taskMenu) taskMenu.classList.remove('show');
    if (taskBtn) taskBtn.classList.remove('active');
    
    // Close cause menu
    const causeMenuContainer = document.getElementById('causeMenuContainer');
    const causeBtn = document.getElementById('causeBtn');
    if (causeMenuContainer) causeMenuContainer.classList.remove('show');
    if (causeBtn) causeBtn.classList.remove('active');
    
    // Close KB menu
    const kbMenu = document.getElementById('kbMenu');
    const kbBtn = document.getElementById('kbBtn');
    if (kbMenu) kbMenu.classList.remove('show');
    if (kbBtn) kbBtn.classList.remove('active');
    
    // Hide backdrop
    if (backdrop) backdrop.classList.remove('show');
}

// Show backdrop
function showBackdrop() {
    const backdrop = document.getElementById('menuBackdrop');
    if (backdrop) backdrop.classList.add('show');
}

// Hide backdrop
function hideBackdrop() {
    const backdrop = document.getElementById('menuBackdrop');
    if (backdrop) backdrop.classList.remove('show');
}

// Initialize common functionality
document.addEventListener('DOMContentLoaded', function() {
    // History toggle button
    const historyToggleBtn = document.getElementById('historyToggleBtn');
    if (historyToggleBtn) {
        historyToggleBtn.addEventListener('click', toggleHistorySidebar);
    }
    
    // History overlay click
    const historyOverlay = document.getElementById('historyOverlay');
    if (historyOverlay) {
        historyOverlay.addEventListener('click', closeHistorySidebar);
    }
    
    // History search handler
    const historySearchInput = document.getElementById('historySearchInput');
    if (historySearchInput) {
        historySearchInput.addEventListener('input', (e) => {
            renderHistoryList(e.target.value);
        });
    }
    
    // New chat button
    const newChatBtn = document.getElementById('newChatBtn');
    if (newChatBtn) {
        newChatBtn.addEventListener('click', () => {
            document.querySelectorAll('.history-item').forEach(i => i.classList.remove('active'));
            closeHistorySidebar();
        });
    }
    
    // Escape key handler
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeAllMenus();
            closeHistorySidebar();
        }
    });
    
    // Menu backdrop click
    const menuBackdrop = document.getElementById('menuBackdrop');
    if (menuBackdrop) {
        menuBackdrop.addEventListener('click', closeAllMenus);
    }
    
    // Initialize history list
    renderHistoryList();
    
    // Click outside to close history menus
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.history-item-menu') && !e.target.closest('.history-item-menu-btn')) {
            hideAllHistoryMenus();
        }
    });
});
