// ============ Index Page JavaScript ============

// Task data
const taskData = [
    { name: '庭审提纲', keywords: ['庭审', '提纲', '审理'], type: 'case' },
    { name: '争议焦点', keywords: ['争议', '焦点', '分歧'], type: 'case' },
    { name: '裁判文书', keywords: ['裁判', '文书', '判决', '裁定'], type: 'case' },
    { name: '类案检索', keywords: ['类案', '检索', '相似', '案例'], type: 'case' },
    { name: '法条适用', keywords: ['法条', '适用', '法律', '条文'], type: 'case' }
];

// 通用任务数据
const generalTaskData = [
    { name: '文本总结', keywords: ['总结', '概括', '摘要', '精简'], type: 'general' },
    { name: '文本润色', keywords: ['润色', '优化', '修改', '改写'], type: 'general' },
    { name: '票据汇总', keywords: ['票据', '汇总', '统计', '整理'], type: 'general' }
];

// Knowledge base data
// 全员公开库数据
const publicKBData = [
    { id: 'kb1', name: '民法典知识库', desc: '民法典全文及司法解释', type: 'public' },
    { id: 'kb2', name: '刑法知识库', desc: '刑法典及相关司法解释', type: 'public' },
    { id: 'kb3', name: '行政法知识库', desc: '行政法规及规章汇编', type: 'public' },
    { id: 'kb4', name: '最高法指导案例', desc: '最高人民法院指导性案例', type: 'public' },
    { id: 'kb5', name: '地方法规库', desc: '各省市地方性法规汇编', type: 'public' },
    { id: 'kb6', name: '法律文书示例库', desc: '常用法律文书示例', type: 'public' }
];

// 个人知识库数据
const personalKBData = [
    { id: 'personal-kb6', name: '我的起诉状示例', desc: '我的示例 · 12个文档', type: 'personal' },
    { id: 'personal-kb7', name: '我的答辩状示例', desc: '我的示例 · 8个文档', type: 'personal' }
];

// 合并所有知识库数据
const knowledgeBaseData = [...publicKBData, ...personalKBData];

// Case data
const caseData = [
    { id: 'case1', caseNumber: '(2024)粤01民初12345号', cause: '民间借贷纠纷', plaintiff: '张三', defendant: '李四', status: 'ongoing', statusText: '审理中', date: '2024-12-15' },
    { id: 'case2', caseNumber: '(2024)粤01民初12346号', cause: '买卖合同纠纷', plaintiff: '广州某公司', defendant: '深圳某公司', status: 'pending', statusText: '待开庭', date: '2024-12-18' },
    { id: 'case3', caseNumber: '(2024)粤01民初12347号', cause: '房屋租赁合同纠纷', plaintiff: '王五', defendant: '赵六', status: 'ongoing', statusText: '审理中', date: '2024-12-10' },
    { id: 'case4', caseNumber: '(2024)粤01民初11234号', cause: '劳动争议', plaintiff: '陈某', defendant: '某科技有限公司', status: 'closed', statusText: '已结案', date: '2024-11-20' },
    { id: 'case5', caseNumber: '(2024)粤01民初11235号', cause: '机动车交通事故责任纠纷', plaintiff: '刘某', defendant: '保险公司', status: 'ongoing', statusText: '审理中', date: '2024-12-08' },
    { id: 'case6', caseNumber: '(2024)粤01民初10086号', cause: '民间借贷纠纷', plaintiff: '某银行', defendant: '周某', status: 'pending', statusText: '待开庭', date: '2024-12-20' },
    { id: 'case7', caseNumber: '(2023)粤01民终8765号', cause: '建设工程施工合同纠纷', plaintiff: '某建筑公司', defendant: '某房地产公司', status: 'closed', statusText: '已结案', date: '2023-10-15' },
    { id: 'case8', caseNumber: '(2024)粤01民初9876号', cause: '股权转让纠纷', plaintiff: '吴某', defendant: '郑某', status: 'ongoing', statusText: '审理中', date: '2024-11-28' }
];

// Cause hierarchy data
const causeData = [
    {
        name: '民事案由',
        children: [
            {
                name: '人格权纠纷',
                children: [
                    { name: '生命权、身体权、健康权纠纷' },
                    { name: '姓名权纠纷' },
                    { name: '肖像权纠纷' },
                    { name: '名誉权纠纷' },
                    { name: '隐私权纠纷' },
                    { name: '个人信息保护纠纷' }
                ]
            },
            {
                name: '婚姻家庭纠纷',
                children: [
                    { name: '离婚纠纷' },
                    { name: '抚养纠纷', children: [{ name: '抚养费纠纷' }, { name: '变更抚养关系纠纷' }] },
                    { name: '赡养纠纷' },
                    { name: '收养关系纠纷' },
                    { name: '同居关系纠纷' }
                ]
            },
            {
                name: '继承纠纷',
                children: [
                    { name: '法定继承纠纷' },
                    { name: '遗嘱继承纠纷' },
                    { name: '遗赠纠纷' },
                    { name: '遗赠扶养协议纠纷' }
                ]
            },
            {
                name: '合同纠纷',
                children: [
                    { name: '买卖合同纠纷', children: [{ name: '房屋买卖合同纠纷' }, { name: '商品房预售合同纠纷' }, { name: '网络购物合同纠纷' }] },
                    { name: '借款合同纠纷', children: [{ name: '金融借款合同纠纷' }, { name: '民间借贷纠纷' }] },
                    { name: '租赁合同纠纷' },
                    { name: '建设工程合同纠纷' },
                    { name: '运输合同纠纷' },
                    { name: '技术合同纠纷' },
                    { name: '保险合同纠纷' }
                ]
            },
            {
                name: '物权纠纷',
                children: [
                    { name: '所有权纠纷' },
                    { name: '用益物权纠纷' },
                    { name: '担保物权纠纷' },
                    { name: '占有保护纠纷' }
                ]
            },
            {
                name: '劳动争议',
                children: [
                    { name: '劳动合同纠纷' },
                    { name: '社会保险纠纷' },
                    { name: '福利待遇纠纷' },
                    { name: '工伤认定纠纷' }
                ]
            },
            {
                name: '知识产权纠纷',
                children: [
                    { name: '著作权纠纷' },
                    { name: '商标权纠纷' },
                    { name: '专利权纠纷' },
                    { name: '不正当竞争纠纷' },
                    { name: '商业秘密纠纷' }
                ]
            },
            {
                name: '侵权责任纠纷',
                children: [
                    { name: '机动车交通事故责任纠纷' },
                    { name: '医疗损害责任纠纷' },
                    { name: '产品责任纠纷' },
                    { name: '环境污染责任纠纷' }
                ]
            }
        ]
    },
    {
        name: '刑事案由',
        children: [
            {
                name: '危害国家安全罪',
                children: [{ name: '背叛国家罪' }, { name: '分裂国家罪' }, { name: '间谍罪' }]
            },
            {
                name: '危害公共安全罪',
                children: [{ name: '放火罪' }, { name: '爆炸罪' }, { name: '交通肇事罪' }, { name: '危险驾驶罪' }]
            },
            {
                name: '破坏社会主义市场经济秩序罪',
                children: [{ name: '生产、销售伪劣产品罪' }, { name: '走私罪' }, { name: '金融诈骗罪' }, { name: '侵犯知识产权罪' }]
            },
            {
                name: '侵犯公民人身权利罪',
                children: [{ name: '故意杀人罪' }, { name: '故意伤害罪' }, { name: '绑架罪' }, { name: '非法拘禁罪' }]
            },
            {
                name: '侵犯财产罪',
                children: [{ name: '抢劫罪' }, { name: '盗窃罪' }, { name: '诈骗罪' }, { name: '侵占罪' }, { name: '敲诈勒索罪' }]
            },
            {
                name: '妨害社会管理秩序罪',
                children: [{ name: '妨害公务罪' }, { name: '寻衅滋事罪' }, { name: '聚众斗殴罪' }, { name: '组织卖淫罪' }]
            },
            {
                name: '贪污贿赂罪',
                children: [{ name: '贪污罪' }, { name: '受贿罪' }, { name: '行贿罪' }, { name: '挪用公款罪' }]
            }
        ]
    },
    {
        name: '行政案由',
        children: [
            { name: '行政处罚', children: [{ name: '行政拘留' }, { name: '行政罚款' }, { name: '吊销许可证' }, { name: '没收违法所得' }] },
            { name: '行政许可', children: [{ name: '建设工程规划许可' }, { name: '营业执照许可' }, { name: '驾驶证许可' }] },
            { name: '行政强制', children: [{ name: '行政强制措施' }, { name: '行政强制执行' }] },
            { name: '行政征收征用', children: [{ name: '土地征收' }, { name: '房屋征收' }, { name: '税费征收' }] },
            { name: '行政确认', children: [{ name: '不动产登记' }, { name: '婚姻登记' }, { name: '工伤认定' }] },
            { name: '行政复议', children: [{ name: '维持决定' }, { name: '撤销决定' }, { name: '变更决定' }] }
        ]
    },
    {
        name: '国家赔偿案由',
        children: [
            { name: '行政赔偿', children: [{ name: '违法行政行为赔偿' }, { name: '行政不作为赔偿' }] },
            { name: '司法赔偿', children: [{ name: '刑事赔偿' }, { name: '非刑事司法赔偿' }] }
        ]
    },
    {
        name: '执行案由',
        children: [
            { name: '执行异议' },
            { name: '执行异议之诉' },
            { name: '执行分配方案异议' },
            { name: '案外人执行异议之诉' }
        ]
    }
];

// Demo files for attachment
const demoFiles = [
    { name: '起诉状.pdf', size: '256KB' },
    { name: '证据材料清单.docx', size: '128KB' },
    { name: '身份证复印件.jpg', size: '1.2MB' },
    { name: '合同原件扫描.pdf', size: '3.5MB' },
    { name: '银行转账记录.xlsx', size: '89KB' },
    { name: '答辩状.pdf', size: '156KB' },
    { name: '授权委托书.docx', size: '45KB' }
];

// State
let selectedTags = [];
let uploadedFiles = [];
let selectedKBs = [];
let selectedCase = null;
let causePath = [];
let causeSearchQuery = '';

// Flatten cause data
function getCauseData() {
    const stored = localStorage.getItem('causeData');
    if (stored) {
        try {
            return JSON.parse(stored);
        } catch (e) {}
    }
    return causeData;
}

function flattenCauseData(data, path = [], level = 1) {
    let results = [];
    data.forEach(item => {
        const currentPath = path.concat([item.name]);
        results.push({
            name: item.name,
            path: currentPath,
            pathString: currentPath.join(' > '),
            level: level,
            hasChildren: !!(item.children && item.children.length > 0)
        });
        if (item.children) {
            results = results.concat(flattenCauseData(item.children, currentPath, level + 1));
        }
    });
    return results;
}

const flatCauseData = flattenCauseData(getCauseData());

function getCurrentCauseData() {
    if (causePath.length === 0) {
        return getCauseData();
    }
    const lastNode = causePath[causePath.length - 1];
    return lastNode.children || [];
}

// ===== Menu Management =====
// Note: showBackdrop(), hideBackdrop(), closeAllMenus() are defined in common.js

function closeAllDropdowns() {
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
    
    // Close KB menu
    const kbMenu = document.getElementById('kbMenu');
    const kbBtn = document.getElementById('kbBtn');
    if (kbMenu) kbMenu.classList.remove('show');
    if (kbBtn) kbBtn.classList.remove('active');
}

function closeCausePanel() {
    const container = document.getElementById('causeMenuContainer');
    const btn = document.getElementById('causeBtn');
    if (container) container.classList.remove('show');
    if (btn) btn.classList.remove('active');
}

// ===== Task Menu =====

function renderTaskMenu(query = '') {
    const list = document.getElementById('taskMenuList');
    if (!list) return;
    
    const lowerQuery = query.toLowerCase();
    
    // 筛选办案任务
    const filteredCaseTasks = taskData.filter(task => {
        if (!query) return true;
        return task.name.toLowerCase().includes(lowerQuery) ||
               task.keywords.some(k => k.toLowerCase().includes(lowerQuery));
    });
    
    // 筛选通用任务
    const filteredGeneralTasks = generalTaskData.filter(task => {
        if (!query) return true;
        return task.name.toLowerCase().includes(lowerQuery) ||
               task.keywords.some(k => k.toLowerCase().includes(lowerQuery));
    });

    if (filteredCaseTasks.length === 0 && filteredGeneralTasks.length === 0) {
        list.innerHTML = '<div class="dropdown-menu-empty">未找到匹配的任务</div>';
        return;
    }

    let html = '';
    
    // 办案任务分组
    if (filteredCaseTasks.length > 0) {
        html += '<div class="task-menu-group">';
        html += '<div class="task-menu-group-title"><i class="fas fa-gavel"></i>办案任务</div>';
        html += filteredCaseTasks.map(task => `
            <div class="dropdown-menu-item" data-value="${task.name}">
                ${highlightText(task.name, query)}
            </div>
        `).join('');
        html += '</div>';
    }
    
    // 通用任务分组
    if (filteredGeneralTasks.length > 0) {
        html += '<div class="task-menu-group">';
        html += '<div class="task-menu-group-title"><i class="fas fa-magic"></i>通用任务</div>';
        html += filteredGeneralTasks.map(task => `
            <div class="dropdown-menu-item" data-value="${task.name}">
                ${highlightText(task.name, query)}
            </div>
        `).join('');
        html += '</div>';
    }

    list.innerHTML = html;
}

function toggleTaskMenu() {
    const menu = document.getElementById('taskMenu');
    const btn = document.getElementById('taskBtn');
    if (!menu || !btn) return;
    
    const isOpen = menu.classList.contains('show');
    
    if (isOpen) {
        // Close
        menu.classList.remove('show');
        btn.classList.remove('active');
        hideBackdrop();
    } else {
        // Open - close others first
        closeAllDropdowns();
        closeCausePanel();
        
        menu.classList.add('show');
        btn.classList.add('active');
        showBackdrop();
        
        // Reset and render
        const searchInput = document.getElementById('taskSearchInput');
        if (searchInput) searchInput.value = '';
        renderTaskMenu();
        
        setTimeout(() => {
            if (searchInput) searchInput.focus();
        }, 100);
    }
}

function selectTask(value) {
    addTag(value, 'task');
    closeAllMenus();
}

// ===== Case Menu =====

function renderCaseMenu(query = '') {
    const list = document.getElementById('caseMenuList');
    if (!list) return;
    
    const lowerQuery = query.toLowerCase().trim();

    const filteredCases = lowerQuery
        ? caseData.filter(c =>
            c.caseNumber.toLowerCase().includes(lowerQuery) ||
            c.cause.toLowerCase().includes(lowerQuery) ||
            c.plaintiff.toLowerCase().includes(lowerQuery) ||
            c.defendant.toLowerCase().includes(lowerQuery)
        )
        : caseData;

    if (filteredCases.length === 0) {
        list.innerHTML = '<div class="dropdown-menu-empty">未找到匹配的案件</div>';
        return;
    }

    list.innerHTML = filteredCases.map(c => {
        let displayNumber = c.caseNumber;
        if (lowerQuery && c.caseNumber.toLowerCase().includes(lowerQuery)) {
            displayNumber = highlightText(c.caseNumber, query);
        }

        return `
            <div class="case-menu-item" data-case-id="${c.id}">
                <div class="case-menu-item-number">${displayNumber}</div>
                <div class="case-menu-item-info">
                    <span class="case-menu-item-cause">${c.cause}</span>
                    <span class="case-menu-item-parties">
                        ${c.plaintiff} 诉 ${c.defendant}
                    </span>
                </div>
            </div>
        `;
    }).join('');
}

function toggleCaseMenu() {
    const menu = document.getElementById('caseMenu');
    const btn = document.getElementById('caseBtn');
    if (!menu || !btn) return;
    
    const isOpen = menu.classList.contains('show');
    
    if (isOpen) {
        // Close
        menu.classList.remove('show');
        btn.classList.remove('active');
        hideBackdrop();
    } else {
        // Open - close others first
        closeAllDropdowns();
        closeCausePanel();
        
        menu.classList.add('show');
        btn.classList.add('active');
        showBackdrop();
        
        // Reset and render
        const searchInput = document.getElementById('caseSearchInput');
        if (searchInput) searchInput.value = '';
        renderCaseMenu();
        
        setTimeout(() => {
            if (searchInput) searchInput.focus();
        }, 100);
    }
}

function selectCase(caseId) {
    const caseItem = caseData.find(c => c.id === caseId);
    if (!caseItem) return;

    selectedCase = caseItem;
    addTag(caseItem.caseNumber, 'case');
    closeAllMenus();
    showNotification(`已选择案件：${caseItem.caseNumber}`, 'success');
}

// ===== KB Menu =====

function renderKBMenu(query = '') {
    const list = document.getElementById('kbMenuList');
    if (!list) return;
    
    const lowerQuery = query.toLowerCase();

    // 筛选公开库
    const filteredPublic = publicKBData.filter(kb => {
        if (!query) return true;
        return kb.name.toLowerCase().includes(lowerQuery) ||
               kb.desc.toLowerCase().includes(lowerQuery);
    });

    // 筛选个人库
    const filteredPersonal = personalKBData.filter(kb => {
        if (!query) return true;
        return kb.name.toLowerCase().includes(lowerQuery) ||
               kb.desc.toLowerCase().includes(lowerQuery);
    });

    // 如果没有匹配项
    if (filteredPublic.length === 0 && filteredPersonal.length === 0) {
        list.innerHTML = '<div class="kb-menu-empty">未找到匹配的知识库</div>';
        return;
    }

    // 渲染公开库
    const publicHtml = filteredPublic.map(kb => {
        const isSelected = selectedKBs.includes(kb.id);
        const iconClass = getKBIconClass(kb.id);
        const iconBg = getKBIconBg(kb.id);
        return `
            <div class="kb-menu-item ${isSelected ? 'selected' : ''}" data-id="${kb.id}" data-type="public">
                <div class="kb-checkbox"><i class="fas fa-check"></i></div>
                <div class="kb-item-icon ${iconBg}"><i class="fas ${iconClass}"></i></div>
                <div class="kb-item-info">
                    <div class="kb-item-name">${highlightText(kb.name, query)}</div>
                    <div class="kb-item-desc">${highlightText(kb.desc, query)}</div>
                </div>
            </div>
        `;
    }).join('');

    // 渲染个人库
    const personalHtml = filteredPersonal.map(kb => {
        const isSelected = selectedKBs.includes(kb.id);
        const iconClass = getKBIconClass(kb.id);
        const iconBg = getKBIconBg(kb.id);
        return `
            <div class="kb-menu-item ${isSelected ? 'selected' : ''}" data-id="${kb.id}" data-type="personal">
                <div class="kb-checkbox"><i class="fas fa-check"></i></div>
                <div class="kb-item-icon ${iconBg}"><i class="fas ${iconClass}"></i></div>
                <div class="kb-item-info">
                    <div class="kb-item-name">${highlightText(kb.name, query)}</div>
                    <div class="kb-item-desc">${highlightText(kb.desc, query)}</div>
                </div>
            </div>
        `;
    }).join('');

    // 组合HTML
    let html = '';
    if (filteredPublic.length > 0) {
        html += `
            <div class="kb-menu-group">
                <div class="kb-menu-group-title"><i class="fas fa-globe"></i>全员公开库</div>
                ${publicHtml}
            </div>
        `;
    }
    if (filteredPersonal.length > 0) {
        html += `
            <div class="kb-menu-group">
                <div class="kb-menu-group-title"><i class="fas fa-user-lock"></i>个人知识库</div>
                ${personalHtml}
            </div>
        `;
    }
    
    list.innerHTML = html;
}

// 获取知识库图标样式
function getKBIconClass(kbId) {
    const iconMap = {
        'kb1': 'fa-book',
        'kb2': 'fa-gavel',
        'kb3': 'fa-landmark',
        'kb4': 'fa-balance-scale',
        'kb5': 'fa-map-marker-alt',
        'kb6': 'fa-file-signature',
        'personal-kb6': 'fa-file-code',
        'personal-kb7': 'fa-file-code'
    };
    return iconMap[kbId] || 'fa-database';
}

// 获取知识库图标背景色
function getKBIconBg(kbId) {
    const bgMap = {
        'kb1': 'blue',
        'kb2': 'green',
        'kb3': 'orange',
        'kb4': 'orange',
        'kb5': 'cyan',
        'kb6': 'purple',
        'personal-kb6': 'teal',
        'personal-kb7': 'teal'
    };
    return bgMap[kbId] || 'blue';
}

function toggleKB(kbId) {
    const index = selectedKBs.indexOf(kbId);
    if (index === -1) {
        selectedKBs.push(kbId);
        const kb = knowledgeBaseData.find(k => k.id === kbId);
        if (kb) addTag(kb.name, 'kb');
    } else {
        selectedKBs.splice(index, 1);
        const kb = knowledgeBaseData.find(k => k.id === kbId);
        if (kb) removeTag(kb.name, 'kb');
    }
    const searchInput = document.getElementById('kbSearchInput');
    renderKBMenu(searchInput ? searchInput.value : '');
}

function toggleKBMenu() {
    const menu = document.getElementById('kbMenu');
    const btn = document.getElementById('kbBtn');
    if (!menu || !btn) return;
    
    const isOpen = menu.classList.contains('show');
    
    if (isOpen) {
        // Close
        menu.classList.remove('show');
        btn.classList.remove('active');
        hideBackdrop();
    } else {
        // Open - close others first
        closeAllDropdowns();
        closeCausePanel();
        
        menu.classList.add('show');
        btn.classList.add('active');
        showBackdrop();
        
        // Reset and render
        const searchInput = document.getElementById('kbSearchInput');
        if (searchInput) searchInput.value = '';
        renderKBMenu();
        
        setTimeout(() => {
            if (searchInput) searchInput.focus();
        }, 100);
    }
}

// ===== Cause Menu =====

function renderCauseBreadcrumb() {
    const breadcrumb = document.getElementById('causeBreadcrumb');
    if (!breadcrumb) return;
    
    let html = '';
    const isRoot = causePath.length === 0 && !causeSearchQuery;
    html += `<span class="breadcrumb-item ${isRoot ? 'current' : ''}" data-index="-1">
        <i class="fas fa-home"></i> 全部
    </span>`;

    causePath.forEach((node, index) => {
        const isLast = index === causePath.length - 1;
        html += `<i class="fas fa-chevron-right breadcrumb-separator"></i>`;
        html += `<span class="breadcrumb-item ${isLast ? 'current' : ''}" data-index="${index}">
            ${node.name}
        </span>`;
    });

    breadcrumb.innerHTML = html;
    
    // Add click handlers
    breadcrumb.querySelectorAll('.breadcrumb-item:not(.current)').forEach(item => {
        item.addEventListener('click', () => {
            const idx = parseInt(item.dataset.index);
            navigateCauseTo(idx);
        });
    });
}

function navigateCauseTo(index) {
    if (index === -1) {
        causePath = [];
    } else {
        causePath = causePath.slice(0, index + 1);
    }
    causeSearchQuery = '';
    const searchInput = document.getElementById('causeSearchInput');
    if (searchInput) searchInput.value = '';
    renderCauseMenu();
}

function renderCauseMenu() {
    const body = document.getElementById('causeMenuBody');
    if (!body) return;

    if (causeSearchQuery) {
        renderCauseSearchResults();
        return;
    }

    const data = getCurrentCauseData();
    renderCauseBreadcrumb();

    if (data.length === 0) {
        body.innerHTML = '<div class="cause-menu-empty">暂无数据</div>';
        return;
    }

    let html = '<div class="cause-menu-list">';
    data.forEach(item => {
        const hasChildren = item.children && item.children.length > 0;
        html += `
            <div class="cause-menu-item" data-name="${item.name}">
                <span class="cause-menu-item-text">${item.name}</span>
                <div class="cause-menu-item-actions">
                    <button class="cause-menu-item-select" data-name="${item.name}">选择</button>
                    ${hasChildren ? `<span class="cause-menu-item-arrow" data-name="${item.name}"><i class="fas fa-chevron-right"></i></span>` : ''}
                </div>
            </div>
        `;
    });
    html += '</div>';
    body.innerHTML = html;

    // Add click handlers
    body.querySelectorAll('.cause-menu-item').forEach(el => {
        el.addEventListener('click', (e) => {
            const name = el.dataset.name;
            const item = getCurrentCauseData().find(i => i.name === name);
            
            if (e.target.closest('.cause-menu-item-select')) {
                e.stopPropagation();
                selectCause(name);
            } else if (e.target.closest('.cause-menu-item-arrow')) {
                e.stopPropagation();
                drillDown(name);
            } else if (item && item.children && item.children.length > 0) {
                drillDown(name);
            } else {
                selectCause(name);
            }
        });
    });
}

function drillDown(name) {
    const data = getCurrentCauseData();
    const item = data.find(i => i.name === name);
    if (item && item.children && item.children.length > 0) {
        causePath.push(item);
        renderCauseMenu();
    }
}

function renderCauseSearchResults() {
    const body = document.getElementById('causeMenuBody');
    const breadcrumb = document.getElementById('causeBreadcrumb');
    if (!body || !breadcrumb) return;

    breadcrumb.innerHTML = `
        <span class="breadcrumb-item" data-index="-1">
            <i class="fas fa-home"></i> 全部
        </span>
        <i class="fas fa-chevron-right breadcrumb-separator"></i>
        <span class="breadcrumb-item current">
            <i class="fas fa-search"></i> 搜索结果
        </span>
    `;
    
    breadcrumb.querySelector('.breadcrumb-item:not(.current)').addEventListener('click', () => {
        navigateCauseTo(-1);
    });

    const lowerQuery = causeSearchQuery.toLowerCase();
    const results = flatCauseData.filter(item =>
        item.name.toLowerCase().includes(lowerQuery)
    );

    if (results.length === 0) {
        body.innerHTML = '<div class="cause-menu-empty">未找到匹配的案由</div>';
        return;
    }

    let html = '<div class="cause-menu-list">';
    results.forEach(item => {
        html += `
            <div class="cause-search-item" data-name="${item.name}">
                <div class="cause-search-item-content">
                    <div class="cause-search-item-name">
                        ${highlightText(item.name, causeSearchQuery)}
                        <span class="cause-level-badge">第${item.level}级</span>
                    </div>
                    <div class="cause-search-item-path">${item.pathString}</div>
                </div>
                <button class="cause-search-item-btn" data-name="${item.name}">选择</button>
            </div>
        `;
    });
    html += '</div>';
    body.innerHTML = html;
    
    // Add click handlers
    body.querySelectorAll('.cause-search-item').forEach(el => {
        el.addEventListener('click', () => {
            selectCause(el.dataset.name);
        });
    });
    
    body.querySelectorAll('.cause-search-item-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            selectCause(btn.dataset.name);
        });
    });
}

function toggleCauseMenu() {
    const container = document.getElementById('causeMenuContainer');
    const btn = document.getElementById('causeBtn');
    if (!container || !btn) return;
    
    const isOpen = container.classList.contains('show');
    
    if (isOpen) {
        // Close
        container.classList.remove('show');
        btn.classList.remove('active');
        hideBackdrop();
    } else {
        // Open - close others first
        closeAllDropdowns();
        
        container.classList.add('show');
        btn.classList.add('active');
        showBackdrop();
        
        // Init
        causePath = [];
        causeSearchQuery = '';
        const searchInput = document.getElementById('causeSearchInput');
        if (searchInput) searchInput.value = '';
        renderCauseMenu();
        
        setTimeout(() => {
            if (searchInput) searchInput.focus();
        }, 100);
    }
}

function selectCause(value) {
    addTag(value, 'cause');
    closeAllMenus();
}

// ===== Tags & Attachments =====

function addTag(value, type) {
    if (selectedTags.some(tag => tag.value === value && tag.type === type)) {
        return;
    }
    selectedTags.push({ value, type });
    renderTags();
}

function removeTag(value, type) {
    selectedTags = selectedTags.filter(tag => !(tag.value === value && tag.type === type));
    renderTags();
}

function renderTags() {
    const container = document.getElementById('tagsContainer');
    if (!container) return;
    
    container.innerHTML = selectedTags.map(tag => `
        <div class="input-tag ${tag.type}-tag">
            ${tag.value}
            <span class="close" onclick="handleRemoveTag('${tag.value}', '${tag.type}')">
                <i class="fas fa-times"></i>
            </span>
        </div>
    `).join('');
}

function handleRemoveTag(value, type) {
    removeTag(value, type);
}

function addDemoFiles() {
    const numFiles = Math.floor(Math.random() * 3) + 2;
    const shuffled = demoFiles.slice().sort(function() { return 0.5 - Math.random(); });
    const selected = shuffled.slice(0, numFiles);

    selected.forEach(file => {
        if (!uploadedFiles.some(f => f.name === file.name)) {
            uploadedFiles.push(file);
        }
    });

    renderAttachments();
}

function removeFile(fileName) {
    uploadedFiles = uploadedFiles.filter(f => f.name !== fileName);
    renderAttachments();
}

function clearAllAttachments() {
    uploadedFiles = [];
    renderAttachments();
}

function renderAttachments() {
    const area = document.getElementById('attachmentsArea');
    const list = document.getElementById('attachmentsList');
    if (!area || !list) return;

    if (uploadedFiles.length === 0) {
        area.style.display = 'none';
        return;
    }

    area.style.display = 'block';
    list.innerHTML = uploadedFiles.map(file => {
        // 检查是否为阅读失败的文件
        const isError = file.name === '合同原件扫描.pdf';
        return `
            <div class="attachment-item ${isError ? 'error' : ''}">
                <i class="fas ${isError ? 'fa-exclamation-circle' : 'fa-file-alt'}"></i>
                <span class="file-name">${file.name}</span>
                ${isError ? '<span class="error-msg"><i class="fas fa-exclamation-triangle"></i>阅读失败</span>' : `<span class="file-size">${file.size}</span>`}
                <span class="remove-file" onclick="removeFile('${file.name}')">
                    <i class="fas fa-times"></i>
                </span>
            </div>
        `;
    }).join('');
}

// ===== Initialize =====

document.addEventListener('DOMContentLoaded', function() {
    // Initialize menus
    renderTaskMenu();
    renderCaseMenu();
    renderKBMenu();
    
    // Task button
    const taskBtn = document.getElementById('taskBtn');
    if (taskBtn) taskBtn.addEventListener('click', toggleTaskMenu);
    
    // Task menu item click
    const taskMenuList = document.getElementById('taskMenuList');
    if (taskMenuList) {
        taskMenuList.addEventListener('click', (e) => {
            const item = e.target.closest('.dropdown-menu-item');
            if (item) selectTask(item.dataset.value);
        });
    }
    
    // Task search
    const taskSearchInput = document.getElementById('taskSearchInput');
    if (taskSearchInput) {
        taskSearchInput.addEventListener('input', (e) => renderTaskMenu(e.target.value));
    }
    
    // Case button
    const caseBtn = document.getElementById('caseBtn');
    if (caseBtn) caseBtn.addEventListener('click', toggleCaseMenu);
    
    // Case menu item click
    const caseMenuList = document.getElementById('caseMenuList');
    if (caseMenuList) {
        caseMenuList.addEventListener('click', (e) => {
            const item = e.target.closest('.case-menu-item');
            if (item) selectCase(item.dataset.caseId);
        });
    }
    
    // Case search
    const caseSearchInput = document.getElementById('caseSearchInput');
    if (caseSearchInput) {
        caseSearchInput.addEventListener('input', (e) => renderCaseMenu(e.target.value));
    }
    
    // KB button
    const kbBtn = document.getElementById('kbBtn');
    if (kbBtn) kbBtn.addEventListener('click', toggleKBMenu);
    
    // KB menu item click
    const kbMenuList = document.getElementById('kbMenuList');
    if (kbMenuList) {
        kbMenuList.addEventListener('click', (e) => {
            const item = e.target.closest('.kb-menu-item');
            if (item) toggleKB(item.dataset.id);
        });
    }
    
    // KB search
    const kbSearchInput = document.getElementById('kbSearchInput');
    if (kbSearchInput) {
        kbSearchInput.addEventListener('input', (e) => renderKBMenu(e.target.value));
    }
    
    // KB menu close
    const kbMenuClose = document.getElementById('kbMenuClose');
    if (kbMenuClose) {
        kbMenuClose.addEventListener('click', closeAllMenus);
    }
    
    // Cause button
    const causeBtn = document.getElementById('causeBtn');
    if (causeBtn) causeBtn.addEventListener('click', toggleCauseMenu);
    
    // Cause menu close
    const causeMenuClose = document.getElementById('causeMenuClose');
    if (causeMenuClose) causeMenuClose.addEventListener('click', closeAllMenus);
    
    // Cause search
    const causeSearchInput = document.getElementById('causeSearchInput');
    if (causeSearchInput) {
        causeSearchInput.addEventListener('input', (e) => {
            causeSearchQuery = e.target.value.trim();
            if (causeSearchQuery) causePath = [];
            renderCauseMenu();
        });
    }
    
    // Attachment button
    const attachBtn = document.getElementById('attachBtn');
    if (attachBtn) attachBtn.addEventListener('click', addDemoFiles);
    
    // Clear attachments
    const clearAttachments = document.getElementById('clearAttachments');
    if (clearAttachments) clearAttachments.addEventListener('click', clearAllAttachments);
    
    // Auto-resize textarea
    const inputField = document.getElementById('inputField');
    if (inputField) {
        inputField.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 120) + 'px';
        });
    }
    
    // Backdrop click
    const menuBackdrop = document.getElementById('menuBackdrop');
    if (menuBackdrop) {
        menuBackdrop.addEventListener('click', closeAllMenus);
    }
    
    // Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeAllMenus();
    });
});
