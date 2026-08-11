// ============ Knowledge Page JavaScript ============

// 用户角色管理（实际应用中应从后端获取）
let currentUserRole = 'user'; // 'user' 或 'admin'

// 检查是否为管理员
function isAdmin() {
    return currentUserRole === 'admin';
}

// 设置用户角色（用于测试或从后端获取后设置）
function setUserRole(role) {
    currentUserRole = role;
    // 刷新 UI 以应用权限变更
    renderPublicCategories();
    renderPersonalCategories();
    updatePublicCategoryAddButton();
}

// Knowledge base data
const knowledgeBaseData = [
    {
        id: 'kb1',
        name: '民法典知识库',
        category: 'law',
        description: '《中华人民共和国民法典》全文及相关司法解释，涵盖总则、物权、合同、人格权、婚姻家庭、继承、侵权责任等各编内容。',
        tags: ['民法典', '法律条文', '司法解释'],
        icon: 'blue',
        iconClass: 'fa-book',
        documentCount: 1523,
        updateTime: '2024-12-20'
    },
    {
        id: 'kb2',
        name: '刑法知识库',
        category: 'law',
        description: '《中华人民共和国刑法》全文及修正案，包含罪名释义、量刑标准、司法解释等内容。',
        tags: ['刑法', '罪名', '量刑'],
        icon: 'green',
        iconClass: 'fa-gavel',
        documentCount: 892,
        updateTime: '2024-12-18'
    },
    {
        id: 'kb3',
        name: '行政法知识库',
        category: 'law',
        description: '行政法规、规章汇编，涵盖行政处罚、行政许可、行政强制、行政复议等领域。',
        tags: ['行政法', '法规', '规章'],
        icon: 'orange',
        iconClass: 'fa-landmark',
        documentCount: 756,
        updateTime: '2024-12-15'
    },
    {
        id: 'kb4',
        name: '最高法指导案例',
        category: 'case',
        description: '最高人民法院发布的指导性案例，涵盖民事、刑事、行政等各类案件。',
        tags: ['指导案例', '最高法', '判例'],
        icon: 'orange',
        iconClass: 'fa-balance-scale',
        documentCount: 234,
        updateTime: '2024-12-10'
    },
    {
        id: 'kb5',
        name: '最高检指导案例',
        category: 'case',
        description: '最高人民检察院发布的指导性案例，涵盖刑事检察、民事检察、行政检察、公益诉讼等领域。',
        tags: ['指导案例', '最高检', '检察'],
        icon: 'orange',
        iconClass: 'fa-balance-scale',
        documentCount: 186,
        updateTime: '2024-12-09'
    },
    {
        id: 'kb6',
        name: '地方法院典型案例',
        category: 'case',
        description: '各地方法院发布的典型案例，包含裁判要旨、法律适用分析等内容。',
        tags: ['典型案例', '地方', '裁判'],
        icon: 'orange',
        iconClass: 'fa-file-contract',
        documentCount: 567,
        updateTime: '2024-12-08'
    },
    {
        id: 'kb8',
        name: '民事判决书示例',
        category: 'template',
        description: '各类民事判决书标准示例，包括一审、二审、再审等程序示例。',
        tags: ['示例', '判决书', '民事'],
        icon: 'purple',
        iconClass: 'fa-file-signature',
        documentCount: 45,
        updateTime: '2024-12-05'
    },
    {
        id: 'kb9',
        name: '裁定书与调解书示例',
        category: 'template',
        description: '各类裁定书、调解书标准示例，涵盖财产保全、先予执行、调解协议等。',
        tags: ['示例', '裁定书', '调解书'],
        icon: 'purple',
        iconClass: 'fa-file-alt',
        documentCount: 38,
        updateTime: '2024-12-01'
    },
    {
        id: 'kb10',
        name: '广东省地方法规',
        category: 'local',
        description: '广东省地方性法规、规章汇编，涵盖经济、社会、文化等各领域。',
        tags: ['地方法规', '广东', '地方性'],
        icon: 'cyan',
        iconClass: 'fa-map-marker-alt',
        documentCount: 342,
        updateTime: '2024-11-20'
    },
    {
        id: 'kb11',
        name: '劳动争议法规库',
        category: 'law',
        description: '劳动法律法规汇编，包含劳动法、劳动合同法、社会保险法等。',
        tags: ['劳动法', '劳动合同', '社保'],
        icon: 'green',
        iconClass: 'fa-users',
        documentCount: 456,
        updateTime: '2024-11-15'
    },
    {
        id: 'kb12',
        name: '知识产权法规库',
        category: 'law',
        description: '知识产权法律法规汇编，包含专利法、商标法、著作权法等。',
        tags: ['知识产权', '专利', '商标'],
        icon: 'blue',
        iconClass: 'fa-lightbulb',
        documentCount: 289,
        updateTime: '2024-11-10'
    },
    {
        id: 'kb13',
        name: '建设工程法规库',
        category: 'law',
        description: '建设工程领域法律法规汇编，包含建筑法、招标投标法等。',
        tags: ['建设工程', '建筑法', '招投标'],
        icon: 'orange',
        iconClass: 'fa-hard-hat',
        documentCount: 198,
        updateTime: '2024-11-05'
    }
];

// Public categories data (动态分类)
let publicCategories = [
    { id: 'law', name: '法律法规', icon: 'green', iconClass: 'fa-gavel', count: 6 },
    { id: 'case', name: '案例库', icon: 'orange', iconClass: 'fa-balance-scale', count: 3 },
    { id: 'template', name: '文书示例', icon: 'purple', iconClass: 'fa-file-alt', count: 2 },
    { id: 'local', name: '地方法规', icon: 'cyan', iconClass: 'fa-map-marker-alt', count: 1 }
];

// Personal categories data (动态分类)
let personalCategories = [
    { id: 'my-favorites', name: '我的收藏', icon: 'pink', iconClass: 'fa-star', count: 5 },
    { id: 'my-templates', name: '我的示例', icon: 'teal', iconClass: 'fa-file-code', count: 3 },
    { id: 'my-notes', name: '我的笔记', icon: 'purple', iconClass: 'fa-sticky-note', count: 4 }
];

// Category names (动态生成)
function getCategoryNames() {
    const names = { 'all': '全部知识库' };
    publicCategories.forEach(cat => names[cat.id] = cat.name);
    personalCategories.forEach(cat => names[cat.id] = cat.name);
    return names;
}

let categoryNames = getCategoryNames();

// Personal knowledge base data
const personalKnowledgeBaseData = [
    {
        id: 'personal-kb1',
        name: '收藏的民法典条文',
        category: 'my-favorites',
        description: '个人收藏的民法典重要条文，包含物权、合同、侵权责任等相关条款。',
        tags: ['收藏', '民法典', '重点条文'],
        icon: 'pink',
        iconClass: 'fa-star',
        documentCount: 28,
        updateTime: '2024-12-25',
        isFavorite: true
    },
    {
        id: 'personal-kb2',
        name: '常用司法解释汇编',
        category: 'my-favorites',
        description: '日常办案中经常引用的司法解释，已按领域分类整理。',
        tags: ['收藏', '司法解释', '常用'],
        icon: 'pink',
        iconClass: 'fa-star',
        documentCount: 15,
        updateTime: '2024-12-22',
        isFavorite: true
    },
    {
        id: 'personal-kb3',
        name: '典型案例集锦',
        category: 'my-favorites',
        description: '收集的具有参考价值的典型案例，涵盖各类案由。',
        tags: ['收藏', '案例', '参考'],
        icon: 'pink',
        iconClass: 'fa-star',
        documentCount: 42,
        updateTime: '2024-12-18',
        isFavorite: true
    },
    {
        id: 'personal-kb4',
        name: '劳动争议案例库',
        category: 'my-favorites',
        description: '劳动争议相关典型案例，用于参考裁判思路和赔偿标准。',
        tags: ['收藏', '劳动争议', '案例'],
        icon: 'pink',
        iconClass: 'fa-star',
        documentCount: 35,
        updateTime: '2024-12-15',
        isFavorite: true
    },
    {
        id: 'personal-kb5',
        name: '合同纠纷裁判规则',
        category: 'my-favorites',
        description: '合同纠纷案件裁判规则汇总，包含各类合同的审理要点。',
        tags: ['收藏', '合同纠纷', '裁判规则'],
        icon: 'pink',
        iconClass: 'fa-star',
        documentCount: 22,
        updateTime: '2024-12-10',
        isFavorite: true
    },
    {
        id: 'personal-kb6',
        name: '民事判决书示例',
        category: 'my-templates',
        description: '各类民事判决书示例，包含一审、二审、再审等程序示例。',
        tags: ['示例', '判决书', '民事'],
        icon: 'teal',
        iconClass: 'fa-file-signature',
        documentCount: 15,
        updateTime: '2024-12-24',
        isPersonalTemplate: true
    },
    {
        id: 'personal-kb7',
        name: '庭审笔录示例',
        category: 'my-templates',
        description: '各类庭审笔录示例，适用于普通程序、简易程序、听证等场景。',
        tags: ['示例', '庭审笔录', '开庭'],
        icon: 'teal',
        iconClass: 'fa-clipboard-list',
        documentCount: 8,
        updateTime: '2024-12-20',
        isPersonalTemplate: true
    },
    {
        id: 'personal-kb8',
        name: '裁定书与调解书示例',
        category: 'my-templates',
        description: '各类裁定书、调解书示例，涵盖财产保全、先予执行、调解协议等。',
        tags: ['示例', '裁定书', '调解书'],
        icon: 'teal',
        iconClass: 'fa-file-alt',
        documentCount: 12,
        updateTime: '2024-12-15',
        isPersonalTemplate: true
    },
    {
        id: 'personal-kb9',
        name: '办案心得笔记',
        category: 'my-notes',
        description: '记录日常办案中的经验总结和心得体会。',
        tags: ['笔记', '心得', '经验'],
        icon: 'purple',
        iconClass: 'fa-sticky-note',
        documentCount: 15,
        updateTime: '2024-12-26',
        isPersonalNote: true
    },
    {
        id: 'personal-kb10',
        name: '法律研究笔记',
        category: 'my-notes',
        description: '针对疑难法律问题的研究笔记和学术思考。',
        tags: ['笔记', '研究', '学术'],
        icon: 'purple',
        iconClass: 'fa-sticky-note',
        documentCount: 12,
        updateTime: '2024-12-24',
        isPersonalNote: true
    },
    {
        id: 'personal-kb11',
        name: '会议记录整理',
        category: 'my-notes',
        description: '重要会议、培训的学习记录和要点整理。',
        tags: ['笔记', '会议', '培训'],
        icon: 'purple',
        iconClass: 'fa-sticky-note',
        documentCount: 8,
        updateTime: '2024-12-20',
        isPersonalNote: true
    },
    {
        id: 'personal-kb12',
        name: '案件分析笔记',
        category: 'my-notes',
        description: '典型案件的深度分析和复盘笔记。',
        tags: ['笔记', '案例分析', '复盘'],
        icon: 'purple',
        iconClass: 'fa-sticky-note',
        documentCount: 10,
        updateTime: '2024-12-18',
        isPersonalNote: true
    }
];

// Combined knowledge base data
const allKnowledgeBaseData = [...knowledgeBaseData, ...personalKnowledgeBaseData];

// 知识库文件数据（模拟数据）
const kbFilesData = {
    'kb1': [
        { id: 'f1', name: '中华人民共和国民法典.pdf', size: '5.2 MB', updateTime: '2024-12-20', type: 'pdf' },
        { id: 'f2', name: '民法典总则编司法解释.docx', size: '1.8 MB', updateTime: '2024-12-18', type: 'docx' },
        { id: 'f3', name: '民法典物权编重点条文.txt', size: '256 KB', updateTime: '2024-12-15', type: 'txt' },
    ],
    'kb2': [
        { id: 'f4', name: '中华人民共和国刑法.pdf', size: '3.8 MB', updateTime: '2024-12-18', type: 'pdf' },
        { id: 'f5', name: '刑法修正案（十二）.doc', size: '890 KB', updateTime: '2024-12-10', type: 'doc' },
    ],
    'kb3': [
        { id: 'f6', name: '行政处罚法实施条例.pdf', size: '2.1 MB', updateTime: '2024-12-15', type: 'pdf' },
        { id: 'f7', name: '行政许可法要点整理.docx', size: '1.2 MB', updateTime: '2024-12-12', type: 'docx' },
    ],
    'kb4': [
        { id: 'f8', name: '最高法指导案例第1-10号.pdf', size: '4.5 MB', updateTime: '2024-12-10', type: 'pdf' },
        { id: 'f9', name: '指导案例裁判要旨汇编.docx', size: '2.3 MB', updateTime: '2024-12-08', type: 'docx' },
    ],
    'kb5': [
        { id: 'f10', name: '最高检第一批指导性案例.pdf', size: '2.8 MB', updateTime: '2024-12-09', type: 'pdf' },
        { id: 'f10b', name: '最高检公益诉讼指导案例汇编.docx', size: '4.5 MB', updateTime: '2024-12-08', type: 'docx' },
    ],
    'kb6': [
        { id: 'f10c', name: '广东高院典型案例2024.pdf', size: '6.2 MB', updateTime: '2024-12-08', type: 'pdf' },
    ],
    'kb8': [
        { id: 'f11', name: '民事判决书示例（一审）.docx', size: '45 KB', updateTime: '2024-12-05', type: 'docx' },
        { id: 'f12', name: '民事判决书示例（二审）.docx', size: '48 KB', updateTime: '2024-12-05', type: 'docx' },
    ],
    'kb9': [
        { id: 'f13', name: '财产保全裁定书示例.doc', size: '32 KB', updateTime: '2024-12-01', type: 'doc' },
        { id: 'f14', name: '调解书示例.docx', size: '28 KB', updateTime: '2024-12-01', type: 'docx' },
    ],
    'kb10': [
        { id: 'f16', name: '广东省地方性法规汇编2024.pdf', size: '8.5 MB', updateTime: '2024-11-20', type: 'pdf' },
        { id: 'f17', name: '深圳市经济特区法规选编.docx', size: '2.1 MB', updateTime: '2024-11-18', type: 'docx' },
    ],
    'kb11': [
        { id: 'f18', name: '劳动法全文及司法解释.pdf', size: '3.2 MB', updateTime: '2024-11-15', type: 'pdf' },
    ],
    'kb12': [
        { id: 'f19', name: '专利法实施细则.pdf', size: '2.8 MB', updateTime: '2024-11-10', type: 'pdf' },
    ],
    'kb13': [
        { id: 'f20', name: '建筑法及配套法规.pdf', size: '4.1 MB', updateTime: '2024-11-05', type: 'pdf' },
    ],
    'personal-kb6': [
        { id: 't1', name: '民事判决书示例（一审普通程序）.docx', size: '52 KB', updateTime: '2024-12-24', type: 'docx' },
        { id: 't2', name: '民事判决书示例（二审）.docx', size: '48 KB', updateTime: '2024-12-24', type: 'docx' },
        { id: 't3', name: '民事判决书示例（简易程序）.docx', size: '45 KB', updateTime: '2024-12-22', type: 'docx' },
        { id: 't4', name: '民事判决书示例（再审）.docx', size: '50 KB', updateTime: '2024-12-20', type: 'docx' },
    ],
    'personal-kb7': [
        { id: 't5', name: '庭审笔录示例（普通程序）.docx', size: '38 KB', updateTime: '2024-12-20', type: 'docx' },
        { id: 't6', name: '庭审笔录示例（简易程序）.docx', size: '32 KB', updateTime: '2024-12-20', type: 'docx' },
        { id: 't7', name: '听证笔录示例.docx', size: '35 KB', updateTime: '2024-12-18', type: 'docx' },
    ],
    'personal-kb8': [
        { id: 't8', name: '财产保全裁定书示例.doc', size: '28 KB', updateTime: '2024-12-18', type: 'doc' },
        { id: 't9', name: '先予执行裁定书示例.docx', size: '26 KB', updateTime: '2024-12-18', type: 'docx' },
        { id: 't10', name: '民事调解书示例.docx', size: '30 KB', updateTime: '2024-12-15', type: 'docx' },
        { id: 't11', name: '撤诉裁定书示例.docx', size: '25 KB', updateTime: '2024-12-15', type: 'docx' },
    ],
    'personal-kb9': [
        { id: 'n1', name: '2024年办案心得总结.docx', size: '125 KB', updateTime: '2024-12-26', type: 'docx' },
        { id: 'n2', name: '民事案件调解技巧笔记.pdf', size: '890 KB', updateTime: '2024-12-25', type: 'pdf' },
        { id: 'n3', name: '证据收集与整理心得.txt', size: '15 KB', updateTime: '2024-12-24', type: 'txt' },
    ],
    'personal-kb10': [
        { id: 'n4', name: '合同纠纷法律适用研究.docx', size: '256 KB', updateTime: '2024-12-24', type: 'docx' },
        { id: 'n5', name: '侵权责任法疑难问题探讨.pdf', size: '1.2 MB', updateTime: '2024-12-22', type: 'pdf' },
    ],
    'personal-kb11': [
        { id: 'n6', name: '省高院培训会议记录.docx', size: '89 KB', updateTime: '2024-12-20', type: 'docx' },
        { id: 'n7', name: '新司法解释学习笔记.pdf', size: '456 KB', updateTime: '2024-12-18', type: 'pdf' },
    ],
    'personal-kb12': [
        { id: 'n8', name: '民间借贷典型案例分析.docx', size: '178 KB', updateTime: '2024-12-18', type: 'docx' },
        { id: 'n9', name: '劳动争议案件复盘笔记.pdf', size: '567 KB', updateTime: '2024-12-16', type: 'pdf' },
    ],
};

// 当前查看的知识库ID
let currentViewingKbId = null;

// 我的收藏文档数据（模拟数据）
let myFavoritesData = [
    {
        id: 'fav-001',
        name: '民法典合同编重点条文.pdf',
        size: '2.1 MB',
        addTime: '2024-12-25 10:30',
        type: 'pdf'
    },
    {
        id: 'fav-002',
        name: '民间借贷纠纷裁判规则汇编.docx',
        size: '3.5 MB',
        addTime: '2024-12-24 15:20',
        type: 'docx'
    },
    {
        id: 'fav-003',
        name: '劳动争议典型案例集.pdf',
        size: '4.2 MB',
        addTime: '2024-12-22 09:15',
        type: 'pdf'
    },
    {
        id: 'fav-004',
        name: '知识产权侵权赔偿计算标准.doc',
        size: '1.8 MB',
        addTime: '2024-12-20 14:45',
        type: 'doc'
    },
    {
        id: 'fav-005',
        name: '建设工程合同纠纷审理要点.pdf',
        size: '2.6 MB',
        addTime: '2024-12-18 11:00',
        type: 'pdf'
    }
];

// Current category
let currentCategory = 'all';

// Category management variables
let editingCategoryId = null;
let editingCategoryType = null;
let selectedCategoryIcon = 'blue';
let selectedCategoryIconClass = 'fa-folder';

// Render public categories in sidebar
function renderPublicCategories() {
    const container = document.getElementById('publicCategories');
    if (!container) return;
    
    container.innerHTML = publicCategories.map(cat => `
        <div class="kb-category no-actions" data-category="${cat.id}">
            <div class="kb-category-header">
                <div class="kb-category-icon ${cat.icon}">
                    <i class="fas ${cat.iconClass}"></i>
                </div>
                <div class="kb-category-info">
                    <div class="kb-category-name">${cat.name}</div>
                    <div class="kb-category-count">${cat.count}个知识库</div>
                </div>
            </div>
        </div>
    `).join('');
    
    // Re-attach click handlers
    container.querySelectorAll('.kb-category').forEach(category => {
        category.addEventListener('click', () => {
            const categoryValue = category.dataset.category;
            filterByCategory(categoryValue);
        });
    });
}

// Render personal categories in sidebar
function renderPersonalCategories() {
    const container = document.getElementById('personalCategories');
    if (!container) return;
    
    container.innerHTML = personalCategories.map(cat => {
        // 我的收藏分类不显示删除和编辑操作
        const isMyFavorites = cat.id === 'my-favorites';
        const categoryClass = isMyFavorites ? 'kb-category no-actions' : 'kb-category';
        
        // 确定数量单位
        let countLabel = '示例';
        if (cat.id === 'my-favorites' || cat.id.includes('favorite')) {
            countLabel = '收藏';
        } else if (cat.id === 'my-notes') {
            countLabel = '笔记';
        }
        
        return `
        <div class="${categoryClass}" data-category="${cat.id}">
            <div class="kb-category-header">
                <div class="kb-category-icon ${cat.icon}">
                    <i class="fas ${cat.iconClass}"></i>
                </div>
                <div class="kb-category-info">
                    <div class="kb-category-name">${cat.name}</div>
                    <div class="kb-category-count">${cat.count}个${countLabel}</div>
                </div>
                ${!isMyFavorites ? `
                <div class="category-actions">
                    <button class="category-action-btn" title="编辑" onclick="event.stopPropagation(); editCategory('${cat.id}', 'personal')">
                        <i class="fas fa-pen"></i>
                    </button>
                    <button class="category-action-btn delete" title="删除" onclick="event.stopPropagation(); deleteCategory('${cat.id}', 'personal')">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
                ` : ''}
            </div>
        </div>
    `}).join('');
    
    // Re-attach click handlers
    container.querySelectorAll('.kb-category').forEach(category => {
        category.addEventListener('click', () => {
            const categoryValue = category.dataset.category;
            filterByCategory(categoryValue);
        });
    });
}

// Open category modal
function openCategoryModal(type, categoryId = null) {
    // 权限检查：非管理员不能操作全员公开库
    if (type === 'public' && !isAdmin()) {
        showNotification('只有管理员可以管理全员公开库', 'warning');
        return;
    }
    
    editingCategoryId = categoryId;
    editingCategoryType = type;
    
    const modal = document.getElementById('categoryModal');
    const title = document.getElementById('categoryModalTitle');
    const nameInput = document.getElementById('categoryName');
    const typeInput = document.getElementById('categoryType');
    
    if (categoryId) {
        // Edit mode
        const categories = type === 'public' ? publicCategories : personalCategories;
        const category = categories.find(c => c.id === categoryId);
        if (!category) return;
        
        title.textContent = '编辑分类';
        nameInput.value = category.name;
        selectedCategoryIcon = category.icon;
        selectedCategoryIconClass = category.iconClass;
    } else {
        // Create mode
        title.textContent = '新建分类';
        nameInput.value = '';
        selectedCategoryIcon = 'blue';
        selectedCategoryIconClass = 'fa-folder';
    }
    
    typeInput.value = type;
    renderCategoryIconSelector();
    modal.classList.add('show');
}

// Close category modal
function closeCategoryModal() {
    document.getElementById('categoryModal').classList.remove('show');
    editingCategoryId = null;
    editingCategoryType = null;
}

// Render category icon selector
function renderCategoryIconSelector() {
    document.querySelectorAll('#categoryIconSelector .icon-option').forEach(option => {
        option.classList.remove('selected');
        if (option.dataset.icon === selectedCategoryIcon) {
            option.classList.add('selected');
        }
    });
}

// Save category
function saveCategory() {
    const name = document.getElementById('categoryName').value.trim();
    const type = document.getElementById('categoryType').value;
    
    if (!name) {
        showNotification('请输入分类名称', 'warning');
        return;
    }
    
    const categories = type === 'public' ? publicCategories : personalCategories;
    
    if (editingCategoryId) {
        // Update existing
        const category = categories.find(c => c.id === editingCategoryId);
        if (category) {
            category.name = name;
            category.icon = selectedCategoryIcon;
            category.iconClass = selectedCategoryIconClass;
            showNotification('分类已更新', 'success');
        }
    } else {
        // Create new
        const newId = type === 'public' 
            ? 'public-' + Date.now() 
            : 'personal-' + Date.now();
        const newCategory = {
            id: newId,
            name: name,
            icon: selectedCategoryIcon,
            iconClass: selectedCategoryIconClass,
            count: 0
        };
        categories.push(newCategory);
        showNotification('分类创建成功', 'success');
    }
    
    // Refresh UI
    categoryNames = getCategoryNames();
    renderPublicCategories();
    renderPersonalCategories();
    updateCategorySelectOptions();
    closeCategoryModal();
}

// Edit category
function editCategory(categoryId, type) {
    // 全员公开库分类不允许编辑
    if (type === 'public') {
        showNotification('全员公开库分类不允许编辑', 'warning');
        return;
    }
    // 我的收藏分类不允许编辑
    if (type === 'personal' && categoryId === 'my-favorites') {
        showNotification('我的收藏分类不允许编辑', 'warning');
        return;
    }
    openCategoryModal(type, categoryId);
}

// Delete category
function deleteCategory(categoryId, type) {
    // 全员公开库分类不允许删除
    if (type === 'public') {
        showNotification('全员公开库分类不允许删除', 'warning');
        return;
    }
    // 我的收藏分类不允许删除
    if (type === 'personal' && categoryId === 'my-favorites') {
        showNotification('我的收藏分类不允许删除', 'warning');
        return;
    }
    
    if (!confirm('确定要删除此分类吗？该分类下的知识库将被移到"全部知识库"中。')) {
        return;
    }
    
    const categories = type === 'public' ? publicCategories : personalCategories;
    const index = categories.findIndex(c => c.id === categoryId);
    
    if (index > -1) {
        categories.splice(index, 1);
        
        // If current category is the deleted one, switch to 'all'
        if (currentCategory === categoryId) {
            filterByCategory('all');
        }
        
        // Refresh UI
        categoryNames = getCategoryNames();
        renderPublicCategories();
        renderPersonalCategories();
        updateCategorySelectOptions();
        showNotification('分类已删除', 'success');
    }
}

// Update category select options in knowledge base modal
function updateCategorySelectOptions() {
    const select = document.getElementById('kbCategory');
    if (!select) return;
    
    // 非管理员只显示个人知识库选项
    if (!isAdmin()) {
        select.innerHTML = `
            <optgroup label="个人知识库">
                ${personalCategories.filter(cat => cat.id !== 'my-favorites').map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('')}
            </optgroup>
        `;
        return;
    }
    
    select.innerHTML = `
        <optgroup label="全员公开库">
            ${publicCategories.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('')}
        </optgroup>
        <optgroup label="个人知识库">
            ${personalCategories.filter(cat => cat.id !== 'my-favorites').map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('')}
        </optgroup>
    `;
}

// Highlight text function
function highlightText(text, query) {
    if (!query || !query.trim()) return text;
    
    // Escape special regex characters
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    return text.replace(regex, '<span class="search-highlight">$1</span>');
}

// Render knowledge grid
function renderKnowledgeGrid(kbs = knowledgeBaseData, highlightQuery = '') {
    const grid = document.getElementById('knowledgeGrid');
    
    if (kbs.length === 0) {
        grid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <div class="empty-icon">
                    <i class="fas fa-database"></i>
                </div>
                <div class="empty-title">暂无知识库</div>
                <div class="empty-desc">点击"新建知识库"按钮创建您的第一个知识库</div>
            </div>
        `;
        return;
    }

    grid.innerHTML = kbs.map(kb => {
        // 判断是否为个人知识库（全员公开库不显示编辑按钮）
        const isPersonalKb = personalKnowledgeBaseData.some(pkb => pkb.id === kb.id);
        
        return `
        <div class="kb-card" data-kb-id="${kb.id}">
            <div class="kb-card-header">
                <div class="kb-card-icon ${kb.icon}">
                    <i class="fas ${kb.iconClass}"></i>
                </div>
                <div class="kb-card-info">
                    <div class="kb-card-name">${highlightText(kb.name, highlightQuery)}</div>
                    <div class="kb-card-meta">${kb.documentCount} 个文档 · ${kb.updateTime} 更新</div>
                </div>
            </div>
            <div class="kb-card-desc">${highlightText(kb.description, highlightQuery)}</div>
            <div class="kb-card-tags">
                ${kb.tags.map(tag => `<span class="kb-tag"><i class="fas fa-tag"></i>${highlightText(tag, highlightQuery)}</span>`).join('')}
            </div>
            <div class="kb-card-footer">
                <div class="kb-card-stats">
                    <div class="kb-card-stat">
                        <i class="fas fa-file-alt"></i>
                        ${kb.documentCount}
                    </div>
                    <div class="kb-card-stat">
                        <i class="fas fa-clock"></i>
                        ${kb.updateTime}
                    </div>
                </div>
                <div class="kb-card-actions">
                    <button class="kb-card-action" title="查看" onclick="viewKB('${kb.id}')">
                        <i class="fas fa-eye"></i>
                    </button>
                    ${isPersonalKb ? `
                    <button class="kb-card-action" title="编辑" onclick="editKB('${kb.id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    ` : ''}
                </div>
            </div>
        </div>
    `}).join('');
}

// Filter by category
function filterByCategory(category) {
    currentCategory = category;
    
    // 获取各个视图容器
    const knowledgeGrid = document.getElementById('knowledgeGrid');
    const myUploadsContainer = document.getElementById('myUploadsContainer');
    const myFavoritesContainer = document.getElementById('myFavoritesContainer');
    const kbDetailContainer = document.getElementById('kbDetailContainer');
    const mainActions = document.querySelector('.knowledge-main-actions');
    const searchBox = document.querySelector('.knowledge-search');
    
    // 先隐藏所有视图
    if (knowledgeGrid) knowledgeGrid.style.display = 'none';
    if (myUploadsContainer) myUploadsContainer.style.display = 'none';
    if (myFavoritesContainer) myFavoritesContainer.style.display = 'none';
    if (kbDetailContainer) kbDetailContainer.style.display = 'none';
    if (mainActions) mainActions.style.display = 'flex';
    if (searchBox) searchBox.style.display = 'block';
    
    // Update sidebar active state
    document.querySelectorAll('.kb-category-header').forEach(header => {
        header.classList.remove('active');
    });
    const activeCategory = document.querySelector(`.kb-category[data-category="${category}"] .kb-category-header`);
    if (activeCategory) activeCategory.classList.add('active');
    
    // Update title
    document.querySelector('.knowledge-main-title').textContent = categoryNames[category] || '知识库';
    
    // 我的收藏 - 显示文档列表
    if (category === 'my-favorites') {
        if (myFavoritesContainer) {
            myFavoritesContainer.style.display = 'flex';
        }
        if (knowledgeGrid) knowledgeGrid.style.display = 'none';
        // 我的收藏不允许新建知识库和上传文档，隐藏按钮
        if (mainActions) mainActions.style.display = 'none';
        renderMyFavorites();
        updateFavoritesCount();
        return;
    }
    
    // 其他分类 - 显示知识库卡片
    if (knowledgeGrid) knowledgeGrid.style.display = 'grid';
    
    // 检查是否为公开库分类
    const isPublicCategory = category === 'all' || publicCategories.some(cat => cat.id === category);
    // 检查是否为个人库分类
    const isPersonalCategory = personalCategories.some(cat => cat.id === category);
    
    // 权限检查：非管理员在查看全员公开库时隐藏新建和上传按钮
    if (!isAdmin() && isPublicCategory) {
        if (mainActions) mainActions.style.display = 'none';
    }
    
    // Filter data
    let filtered = [];
    
    if (category === 'all') {
        // 全部知识库包含公开库和个人库
        filtered = [...knowledgeBaseData, ...personalKnowledgeBaseData];
    } else {
        if (isPublicCategory) {
            filtered = knowledgeBaseData.filter(kb => kb.category === category);
        } else if (isPersonalCategory) {
            filtered = personalKnowledgeBaseData.filter(kb => kb.category === category);
        }
    }
    
    // Apply search filter if exists
    const searchQuery = document.getElementById('kbSearchInput').value.trim();
    if (searchQuery) {
        filtered = filtered.filter(kb =>
            kb.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            kb.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
            kb.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
        );
    }
    
    renderKnowledgeGrid(filtered, searchQuery);
}

// 渲染我的收藏文档列表
function renderMyFavorites() {
    const grid = document.getElementById('favoritesFileGrid');
    if (!grid) return;
    
    if (myFavoritesData.length === 0) {
        grid.innerHTML = `
            <div class="uploads-empty-state" style="grid-column: 1 / -1;">
                <i class="fas fa-star"></i>
                <h3>暂无收藏文档</h3>
                <p>您可以在浏览知识库时收藏常用文档，方便日后快速查找</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = myFavoritesData.map(doc => {
        // 根据文件类型显示不同图标
        let fileIconClass = 'fa-file';
        let iconColorClass = '';
        if (doc.type === 'pdf') {
            fileIconClass = 'fa-file-pdf';
            iconColorClass = 'style="background: #fee2e2; color: #dc2626;"';
        } else if (doc.type === 'doc' || doc.type === 'docx') {
            fileIconClass = 'fa-file-word';
            iconColorClass = 'style="background: #dbeafe; color: #2563eb;"';
        }
        
        return `
        <div class="uploads-file-item" data-id="${doc.id}">
            <div class="uploads-file-header">
                <div class="uploads-file-icon" ${iconColorClass}>
                    <i class="fas ${fileIconClass}"></i>
                </div>
                <div class="uploads-file-info">
                    <div class="uploads-file-name" title="${doc.name}">${doc.name}</div>
                    <div class="uploads-file-meta">${doc.size} · 收藏于 ${doc.addTime}</div>
                </div>
            </div>
            <div class="uploads-file-actions">
                <button class="uploads-file-btn" onclick="viewFavorite('${doc.id}')">
                    <i class="fas fa-eye"></i>
                    查看
                </button>
                <button class="uploads-file-btn" onclick="downloadFavorite('${doc.id}')">
                    <i class="fas fa-download"></i>
                    下载
                </button>
                <button class="uploads-file-btn delete" onclick="removeFavorite('${doc.id}')">
                    <i class="fas fa-star"></i>
                    取消收藏
                </button>
            </div>
        </div>
    `}).join('');
}

// 更新收藏数量显示
function updateFavoritesCount() {
    const count = myFavoritesData.length;
    const countElement = document.querySelector('.kb-category[data-category="my-favorites"] .kb-category-count');
    if (countElement) {
        countElement.textContent = `${count}个收藏`;
    }
    // 同时更新侧边栏中的数量
    const cat = personalCategories.find(c => c.id === 'my-favorites');
    if (cat) {
        cat.count = count;
    }
}

// 查看收藏文档
function viewFavorite(docId) {
    const doc = myFavoritesData.find(d => d.id === docId);
    if (doc) {
        showNotification(`查看文档：${doc.name}`, 'success');
    }
}

// 下载收藏文档
function downloadFavorite(docId) {
    const doc = myFavoritesData.find(d => d.id === docId);
    if (doc) {
        showNotification(`下载文档：${doc.name}`, 'success');
    }
}

// 取消收藏
function removeFavorite(docId) {
    const doc = myFavoritesData.find(d => d.id === docId);
    if (!doc) return;
    
    if (confirm(`确定要取消收藏 "${doc.name}" 吗？`)) {
        myFavoritesData = myFavoritesData.filter(d => d.id !== docId);
        renderMyFavorites();
        updateFavoritesCount();
        showNotification('已取消收藏', 'success');
    }
}

// Search knowledge base
function searchKnowledge() {
    const searchQuery = document.getElementById('kbSearchInput').value.trim();
    
    let filtered = [];
    
    // 根据当前分类确定数据源
    if (currentCategory === 'all') {
        filtered = [...knowledgeBaseData, ...personalKnowledgeBaseData];
    } else {
        // 检查是否为公开库分类
        const isPublicCategory = publicCategories.some(cat => cat.id === currentCategory);
        // 检查是否为个人库分类
        const isPersonalCategory = personalCategories.some(cat => cat.id === currentCategory);
        
        if (isPublicCategory) {
            filtered = knowledgeBaseData.filter(kb => kb.category === currentCategory);
        } else if (isPersonalCategory) {
            filtered = personalKnowledgeBaseData.filter(kb => kb.category === currentCategory);
        }
    }
    
    if (searchQuery) {
        filtered = filtered.filter(kb =>
            kb.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            kb.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
            kb.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
        );
    }
    
    renderKnowledgeGrid(filtered, searchQuery);
}

// View knowledge base - 进入知识库详情页
function viewKB(kbId) {
    // 在公开库和个人库中查找
    let kb = knowledgeBaseData.find(k => k.id === kbId);
    if (!kb) {
        kb = personalKnowledgeBaseData.find(k => k.id === kbId);
    }
    if (!kb) return;
    
    currentViewingKbId = kbId;
    
    // 隐藏其他视图
    document.getElementById('knowledgeGrid').style.display = 'none';
    document.getElementById('myUploadsContainer').style.display = 'none';
    document.getElementById('myFavoritesContainer').style.display = 'none';
    document.querySelector('.knowledge-main-actions').style.display = 'none';
    document.querySelector('.knowledge-search').style.display = 'none';
    
    // 显示详情页
    const detailContainer = document.getElementById('kbDetailContainer');
    detailContainer.style.display = 'flex';
    
    // 设置头部信息
    document.getElementById('kbDetailName').textContent = kb.name;
    document.getElementById('kbDetailDesc').textContent = kb.description || '暂无描述';
    document.getElementById('kbDetailCount').textContent = kb.documentCount || 0;
    document.getElementById('kbDetailUpdate').textContent = kb.updateTime || '-';
    
    // 设置图标
    const iconEl = document.getElementById('kbDetailIcon');
    iconEl.className = `kb-detail-icon ${kb.icon}`;
    iconEl.innerHTML = `<i class="fas ${kb.iconClass}"></i>`;
    
    // 渲染文件列表
    renderKbFiles(kbId);
}

// 渲染知识库文件列表
function renderKbFiles(kbId) {
    const container = document.getElementById('kbFilesList');
    const files = kbFilesData[kbId] || [];
    
    if (files.length === 0) {
        container.innerHTML = `
            <div class="uploads-empty-state">
                <i class="fas fa-folder-open"></i>
                <h3>暂无文件</h3>
                <p>该知识库尚未上传任何文件</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = files.map(file => {
        // 根据文件类型设置图标样式
        let iconClass = 'fa-file';
        let fileTypeClass = '';
        if (file.type === 'pdf') {
            iconClass = 'fa-file-pdf';
            fileTypeClass = 'pdf';
        } else if (file.type === 'doc' || file.type === 'docx') {
            iconClass = 'fa-file-word';
            fileTypeClass = file.type;
        } else if (file.type === 'txt') {
            iconClass = 'fa-file-alt';
            fileTypeClass = 'txt';
        }
        
        return `
            <div class="kb-file-item">
                <div class="kb-file-icon ${fileTypeClass}">
                    <i class="fas ${iconClass}"></i>
                </div>
                <div class="kb-file-info">
                    <div class="kb-file-name" title="${file.name}">${file.name}</div>
                    <div class="kb-file-meta">${file.size} · 修改于 ${file.updateTime}</div>
                </div>
                <div class="kb-file-actions">
                    <button class="kb-file-download" onclick="downloadKbFile('${kbId}', '${file.id}')">
                        <i class="fas fa-download"></i>
                        下载
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// 下载知识库文件
function downloadKbFile(kbId, fileId) {
    const files = kbFilesData[kbId] || [];
    const file = files.find(f => f.id === fileId);
    if (file) {
        showNotification(`正在下载：${file.name}`, 'success');
    }
}

// 返回知识库列表
function backToKnowledgeList() {
    currentViewingKbId = null;
    
    // 隐藏详情页
    document.getElementById('kbDetailContainer').style.display = 'none';
    
    // 恢复其他视图
    document.getElementById('knowledgeGrid').style.display = 'grid';
    document.querySelector('.knowledge-main-actions').style.display = 'flex';
    document.querySelector('.knowledge-search').style.display = 'block';
    
    // 根据当前分类刷新列表
    filterByCategory(currentCategory);
}

// Edit knowledge base
function editKB(kbId) {
    const kb = knowledgeBaseData.find(k => k.id === kbId);
    if (kb) {
        showNotification(`编辑知识库：${kb.name}`, 'success');
    }
}

// Modal and Tag Management
let currentTags = [];
let selectedIcon = 'blue';
let selectedIconClass = 'fa-book';
let editingKbId = null;

// Upload Management
let pendingFiles = [];
let uploadQueue = [];

// File type icons mapping
const fileTypeIcons = {
    'pdf': { icon: 'fa-file-pdf', class: 'pdf' },
    'doc': { icon: 'fa-file-word', class: 'doc' },
    'docx': { icon: 'fa-file-word', class: 'docx' },
    'txt': { icon: 'fa-file-alt', class: 'txt' },
    'default': { icon: 'fa-file', class: 'default' }
};

// Get file icon config
function getFileIconConfig(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    return fileTypeIcons[ext] || fileTypeIcons.default;
}

// Format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Open upload modal
function openUploadModal() {
    pendingFiles = [];
    uploadQueue = [];
    renderUploadFileList();
    updateUploadTargetOptions();
    
    document.getElementById('uploadTargetKb').value = '';
    document.getElementById('uploadModal').classList.add('show');
}

// Close upload modal
function closeUploadModal() {
    document.getElementById('uploadModal').classList.remove('show');
}

// Update upload target knowledge base options
function updateUploadTargetOptions() {
    const select = document.getElementById('uploadTargetKb');
    // Keep the first option (placeholder)
    select.innerHTML = '<option value="">请选择知识库</option>';
    
    // 权限检查：非管理员不能上传到全员公开库
    const canUploadToPublic = isAdmin();
    
    // 根据当前选中的分类过滤知识库
    // currentCategory: 'all' 表示全部，其他值表示特定分类
    let filteredPublicKbs = canUploadToPublic ? knowledgeBaseData : [];
    let filteredPersonalKbs = personalKnowledgeBaseData;
    
    if (currentCategory !== 'all') {
        // 检查当前分类是公开库还是个人库
        const isPublicCategory = publicCategories.some(cat => cat.id === currentCategory);
        const isPersonalCategory = personalCategories.some(cat => cat.id === currentCategory);
        
        if (isPublicCategory) {
            // 如果是公开库分类，只显示该分类下的知识库（仅管理员）
            filteredPublicKbs = canUploadToPublic ? knowledgeBaseData.filter(kb => kb.category === currentCategory) : [];
            filteredPersonalKbs = []; // 个人库不显示
        } else if (isPersonalCategory) {
            // 如果是个人库分类，只显示该分类下的知识库
            filteredPublicKbs = []; // 公开库不显示
            filteredPersonalKbs = personalKnowledgeBaseData.filter(kb => kb.category === currentCategory);
        }
    }
    
    // 添加公开库分组（如果有数据，仅管理员可见）
    if (filteredPublicKbs.length > 0) {
        const publicGroup = document.createElement('optgroup');
        publicGroup.label = '全员公开库';
        filteredPublicKbs.forEach(kb => {
            const option = document.createElement('option');
            option.value = kb.id;
            option.textContent = kb.name;
            publicGroup.appendChild(option);
        });
        select.appendChild(publicGroup);
    }
    
    // 添加个人库分组（排除"我的收藏"分类）
    const uploadablePersonalKbs = filteredPersonalKbs.filter(kb => kb.category !== 'my-favorites');
    if (uploadablePersonalKbs.length > 0) {
        const personalGroup = document.createElement('optgroup');
        personalGroup.label = '个人知识库';
        uploadablePersonalKbs.forEach(kb => {
            const option = document.createElement('option');
            option.value = kb.id;
            option.textContent = kb.name;
            personalGroup.appendChild(option);
        });
        select.appendChild(personalGroup);
    }
}

// Handle file selection
function handleFileSelect(files) {
    const maxSize = 50 * 1024 * 1024; // 50MB
    const allowedTypes = ['.pdf', '.doc', '.docx', '.txt'];
    
    Array.from(files).forEach(file => {
        // Check file size
        if (file.size > maxSize) {
            showNotification(`文件 "${file.name}" 超过 50MB 限制`, 'error');
            return;
        }
        
        // Check file type
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        if (!allowedTypes.includes(ext)) {
            showNotification(`文件 "${file.name}" 格式不支持`, 'error');
            return;
        }
        
        // Check if already added
        if (pendingFiles.some(f => f.name === file.name && f.size === file.size)) {
            showNotification(`文件 "${file.name}" 已添加`, 'warning');
            return;
        }
        
        pendingFiles.push({
            id: Date.now() + Math.random(),
            file: file,
            name: file.name,
            size: file.size,
            status: 'pending', // pending, uploading, success, error
            progress: 0
        });
    });
    
    renderUploadFileList();
}

// Render upload file list
function renderUploadFileList() {
    const listContainer = document.getElementById('uploadFileList');
    const container = document.getElementById('fileListContainer');
    const emptyState = document.getElementById('uploadEmptyState');
    const fileCount = document.getElementById('fileCount');
    const uploadBtn = document.getElementById('startUploadBtn');
    
    if (pendingFiles.length === 0) {
        listContainer.style.display = 'none';
        emptyState.style.display = 'block';
        uploadBtn.disabled = true;
        return;
    }
    
    listContainer.style.display = 'block';
    emptyState.style.display = 'none';
    fileCount.textContent = pendingFiles.length;
    
    // Enable upload button if target is selected
    const targetKb = document.getElementById('uploadTargetKb').value;
    uploadBtn.disabled = !targetKb || pendingFiles.length === 0;
    
    container.innerHTML = pendingFiles.map((file, index) => {
        const iconConfig = getFileIconConfig(file.name);
        let statusIcon = '';
        let progressHtml = '';
        
        if (file.status === 'pending') {
            statusIcon = '<i class="fas fa-clock"></i>';
            progressHtml = '<div class="upload-file-size">等待上传</div>';
        } else if (file.status === 'uploading') {
            statusIcon = '<i class="fas fa-spinner fa-spin"></i>';
            progressHtml = `
                <div class="upload-file-progress">
                    <div class="upload-file-progress-bar" style="width: ${file.progress}%"></div>
                </div>
            `;
        } else if (file.status === 'success') {
            statusIcon = '<i class="fas fa-check-circle"></i>';
            progressHtml = '<div class="upload-file-size" style="color: #059669;">上传成功</div>';
        } else if (file.status === 'error') {
            statusIcon = '<i class="fas fa-exclamation-circle"></i>';
            progressHtml = '<div class="upload-file-size" style="color: #dc2626;">上传失败</div>';
        }
        
        return `
            <div class="upload-file-item" data-file-id="${file.id}">
                <div class="upload-file-icon ${iconConfig.class}">
                    <i class="fas ${iconConfig.icon}"></i>
                </div>
                <div class="upload-file-info">
                    <div class="upload-file-name">${file.name}</div>
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <span class="upload-file-size">${formatFileSize(file.size)}</span>
                        ${progressHtml}
                    </div>
                </div>
                <div class="upload-file-status">
                    <span class="upload-file-status-icon ${file.status}">${statusIcon}</span>
                    ${file.status === 'pending' ? `
                        <button class="upload-file-remove" onclick="removePendingFile(${index})" title="移除">
                            <i class="fas fa-times"></i>
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// Remove pending file
function removePendingFile(index) {
    pendingFiles.splice(index, 1);
    renderUploadFileList();
}

// Start upload
function startUpload() {
    const targetKb = document.getElementById('uploadTargetKb').value;
    if (!targetKb) {
        showNotification('请选择目标知识库', 'warning');
        return;
    }
    
    if (pendingFiles.length === 0) {
        showNotification('没有待上传的文件', 'warning');
        return;
    }
    
    const uploadBtn = document.getElementById('startUploadBtn');
    uploadBtn.disabled = true;
    
    // Mark all pending files as uploading
    pendingFiles.forEach(file => {
        if (file.status === 'pending') {
            file.status = 'uploading';
            file.progress = 0;
        }
    });
    renderUploadFileList();
    
    // Simulate upload for each file
    let completedCount = 0;
    const totalFiles = pendingFiles.filter(f => f.status === 'uploading').length;
    
    pendingFiles.forEach((file, index) => {
        if (file.status !== 'uploading') return;
        
        // Simulate progress
        const interval = setInterval(() => {
            file.progress += Math.random() * 15 + 5;
            
            if (file.progress >= 100) {
                file.progress = 100;
                clearInterval(interval);
                
                // Simulate success (95% chance) or error (5% chance)
                setTimeout(() => {
                    if (Math.random() > 0.05) {
                        file.status = 'success';
                        // Update knowledge base document count (公开库)
                        let kb = knowledgeBaseData.find(k => k.id === targetKb);
                        // 如果没找到，在个人库中查找
                        if (!kb) {
                            kb = personalKnowledgeBaseData.find(k => k.id === targetKb);
                        }
                        if (kb) {
                            kb.documentCount++;
                            kb.updateTime = new Date().toISOString().split('T')[0];
                        }
                    } else {
                        file.status = 'error';
                    }
                    
                    completedCount++;
                    renderUploadFileList();
                    
                    if (completedCount === totalFiles) {
                        const successCount = pendingFiles.filter(f => f.status === 'success').length;
                        if (successCount === totalFiles) {
                            showNotification(`成功上传 ${successCount} 个文件`, 'success');
                            setTimeout(() => {
                                closeUploadModal();
                                filterByCategory(currentCategory);
                            }, 1000);
                        } else {
                            showNotification(`上传完成: ${successCount}/${totalFiles} 成功`, 'warning');
                            uploadBtn.disabled = false;
                        }
                    }
                }, 300);
            }
            
            renderUploadFileList();
        }, 200);
    });
}

// Open modal for creating new knowledge base
function openCreateModal() {
    editingKbId = null;
    currentTags = [];
    selectedIcon = 'blue';
    selectedIconClass = 'fa-book';
    
    document.getElementById('modalTitle').textContent = '新建知识库';
    document.getElementById('kbId').value = '';
    document.getElementById('kbName').value = '';
    document.getElementById('kbCategory').value = 'law';
    document.getElementById('kbDescription').value = '';
    
    renderTags();
    renderIconSelector();
    
    document.getElementById('kbModal').classList.add('show');
}

// Open modal for editing knowledge base
function openEditModal(kbId) {
    // 在公开库和个人库中查找
    let kb = knowledgeBaseData.find(k => k.id === kbId);
    if (!kb) {
        kb = personalKnowledgeBaseData.find(k => k.id === kbId);
    }
    if (!kb) return;
    
    editingKbId = kbId;
    currentTags = [...kb.tags];
    selectedIcon = kb.icon;
    selectedIconClass = kb.iconClass;
    
    document.getElementById('modalTitle').textContent = '编辑知识库';
    document.getElementById('kbId').value = kb.id;
    document.getElementById('kbName').value = kb.name;
    document.getElementById('kbCategory').value = kb.category;
    document.getElementById('kbDescription').value = kb.description;
    
    renderTags();
    renderIconSelector();
    
    document.getElementById('kbModal').classList.add('show');
}

// Close modal
function closeModal() {
    document.getElementById('kbModal').classList.remove('show');
}

// Render tags in input container
function renderTags() {
    const container = document.getElementById('tagInputContainer');
    const input = document.getElementById('tagInput');
    
    // Clear existing tags (keep the input)
    container.innerHTML = '';
    
    // Add tag elements
    currentTags.forEach((tag, index) => {
        const tagEl = document.createElement('span');
        tagEl.className = 'tag-input-tag';
        tagEl.innerHTML = `
            ${tag}
            <i class="fas fa-times remove" onclick="removeTag(${index})"></i>
        `;
        container.appendChild(tagEl);
    });
    
    // Re-add input
    container.appendChild(input);
    input.value = '';
    input.focus();
}

// Add tag
function addTag(tag) {
    tag = tag.trim();
    if (!tag) return;
    if (currentTags.includes(tag)) {
        showNotification('标签已存在', 'warning');
        return;
    }
    if (currentTags.length >= 10) {
        showNotification('最多只能添加10个标签', 'warning');
        return;
    }
    currentTags.push(tag);
    renderTags();
}

// Remove tag
function removeTag(index) {
    currentTags.splice(index, 1);
    renderTags();
}

// Render icon selector
function renderIconSelector() {
    document.querySelectorAll('.icon-option').forEach(option => {
        option.classList.remove('selected');
        if (option.dataset.icon === selectedIcon) {
            option.classList.add('selected');
        }
    });
}

// Check if category is personal
function isPersonalCategory(category) {
    return personalCategories.some(cat => cat.id === category);
}

// Save knowledge base
function saveKnowledgeBase() {
    const name = document.getElementById('kbName').value.trim();
    const category = document.getElementById('kbCategory').value;
    const description = document.getElementById('kbDescription').value.trim();
    
    if (!name) {
        showNotification('请输入知识库名称', 'warning');
        return;
    }
    
    // 判断是个人知识库还是公开库
    const personal = isPersonalCategory(category);
    
    // 权限检查：非管理员不能在全员公开库中新建/编辑知识库
    if (!personal && !isAdmin()) {
        showNotification('只有管理员可以在全员公开库中新建知识库', 'warning');
        return;
    }
    
    if (editingKbId) {
        // Update existing
        let kb = knowledgeBaseData.find(k => k.id === editingKbId);
        let isPersonalKb = false;
        
        if (!kb) {
            kb = personalKnowledgeBaseData.find(k => k.id === editingKbId);
            isPersonalKb = true;
        }
        
        if (kb) {
            // 如果分类从公开库切换到个人库，或反之，需要移动数据
            if (isPersonalKb && !personal) {
                // 从个人库移到公开库
                personalKnowledgeBaseData.splice(personalKnowledgeBaseData.indexOf(kb), 1);
                knowledgeBaseData.push(kb);
            } else if (!isPersonalKb && personal) {
                // 从公开库移到个人库
                knowledgeBaseData.splice(knowledgeBaseData.indexOf(kb), 1);
                personalKnowledgeBaseData.push(kb);
            }
            
            kb.name = name;
            kb.category = category;
            kb.description = description;
            kb.tags = [...currentTags];
            kb.icon = selectedIcon;
            kb.iconClass = selectedIconClass;
            
            // 个人库添加标记
            if (personal) {
                if (category === 'my-favorites') kb.isFavorite = true;
                if (category === 'my-templates') kb.isPersonalTemplate = true;
                if (category === 'my-notes') kb.isPersonalNote = true;
            }
            
            showNotification('知识库已更新', 'success');
        }
    } else {
        // Create new
        const newKb = {
            id: 'kb' + Date.now(),
            name: name,
            category: category,
            description: description,
            tags: [...currentTags],
            documentCount: 0,
            updateTime: new Date().toISOString().split('T')[0]
        };
        
        // 个人库添加标记
        if (personal) {
            if (category === 'my-favorites') newKb.isFavorite = true;
            if (category === 'my-templates') newKb.isPersonalTemplate = true;
            if (category === 'my-notes') newKb.isPersonalNote = true;
            personalKnowledgeBaseData.push(newKb);
        } else {
            knowledgeBaseData.push(newKb);
        }
        
        showNotification('知识库创建成功', 'success');
    }
    
    // 更新侧边栏计数
    updateSidebarCounts();
    updatePersonalStorage();
    
    closeModal();
    filterByCategory(currentCategory);
}

// Update editKB function
function editKB(kbId) {
    openEditModal(kbId);
}

function updatePersonalStorage() {
    const STORAGE_TOTAL_MB = 500;
    let totalMB = 0;

    const allFiles = [
        ...(myUploadsData || []),
        ...personalKnowledgeBaseData.flatMap(kb => kb.files || [])
    ];

    allFiles.forEach(function(f) {
        const sizeStr = (f.size || '0 MB').replace(/\s/g, '');
        const match = sizeStr.match(/^([\d.]+)(KB|MB|GB)?$/i);
        if (match) {
            const val = parseFloat(match[1]) || 0;
            const unit = (match[2] || 'MB').toUpperCase();
            if (unit === 'GB') totalMB += val * 1024;
            else if (unit === 'KB') totalMB += val / 1024;
            else totalMB += val;
        }
    });

    const usedEl = document.getElementById('storageUsed');
    const fillEl = document.getElementById('storageProgressFill');
    if (!usedEl || !fillEl) return;

    usedEl.textContent = totalMB.toFixed(1);
    const pct = Math.min(100, (totalMB / STORAGE_TOTAL_MB) * 100);
    fillEl.style.width = pct + '%';

    if (pct > 90) {
        fillEl.style.background = 'linear-gradient(90deg, #ef4444, #dc2626)';
        usedEl.style.color = '#dc2626';
    } else if (pct > 70) {
        fillEl.style.background = 'linear-gradient(90deg, #f59e0b, #d97706)';
        usedEl.style.color = '#d97706';
    } else {
        fillEl.style.background = 'linear-gradient(90deg, #3b82f6, #2563eb)';
        usedEl.style.color = '#2563eb';
    }
}

// Update sidebar counts
function updateSidebarCounts() {
    // 更新全部知识库数量
    const allCount = knowledgeBaseData.length + personalKnowledgeBaseData.length;
    const allElement = document.querySelector('.kb-category[data-category="all"] .kb-category-count');
    if (allElement) allElement.textContent = `${allCount}个知识库`;
    
    // 更新公开分类数量
    publicCategories.forEach(cat => {
        const count = knowledgeBaseData.filter(kb => kb.category === cat.id).length;
        cat.count = count;
        const element = document.querySelector(`.kb-category[data-category="${cat.id}"] .kb-category-count`);
        if (element) element.textContent = `${count}个知识库`;
    });
    
    // 更新个人分类数量
    personalCategories.forEach(cat => {
        // 我的收藏使用文档数量
        if (cat.id === 'my-favorites') {
            cat.count = myFavoritesData.length;
            const element = document.querySelector(`.kb-category[data-category="${cat.id}"] .kb-category-count`);
            if (element) {
                element.textContent = `${cat.count}个收藏`;
            }
        } else if (cat.id === 'my-notes') {
            // 我的笔记使用知识库数量
            const count = personalKnowledgeBaseData.filter(kb => kb.category === cat.id).length;
            cat.count = count;
            const element = document.querySelector(`.kb-category[data-category="${cat.id}"] .kb-category-count`);
            if (element) {
                element.textContent = `${count}个笔记`;
            }
        } else {
            // 其他个人分类使用知识库数量
            const count = personalKnowledgeBaseData.filter(kb => kb.category === cat.id).length;
            cat.count = count;
            const element = document.querySelector(`.kb-category[data-category="${cat.id}"] .kb-category-count`);
            if (element) {
                element.textContent = `${count}个示例`;
            }
        }
    });
}

// 更新全员公开库的新建分类按钮显示状态
function updatePublicCategoryAddButton() {
    const addButton = document.getElementById('publicCategoryAddBtn');
    if (addButton) {
        addButton.style.display = isAdmin() ? 'flex' : 'none';
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    // 从 localStorage 读取用户角色（用于跨页面同步）
    const savedRole = localStorage.getItem('userRole');
    if (savedRole) {
        currentUserRole = savedRole;
    }
    
    // Render initial knowledge grid (显示全部)
    renderKnowledgeGrid([...knowledgeBaseData, ...personalKnowledgeBaseData]);
    
    // Render dynamic categories
    renderPublicCategories();
    renderPersonalCategories();
    updateCategorySelectOptions();
    
    // 更新全员公开库的新建分类按钮显示状态
    updatePublicCategoryAddButton();
    
    // Update sidebar counts
    updateSidebarCounts();
    updatePersonalStorage();
    
    // 初始化收藏数量
    updateFavoritesCount();
    
    // Category click handlers for static categories (all, my-favorites, my-templates)
    // 排除 my-uploads，因为它有自己的 onclick 处理函数 showMyUploads()
    document.querySelectorAll('.kb-category[data-category]').forEach(category => {
        const categoryValue = category.dataset.category;
        if (categoryValue === 'my-uploads') return; // 跳过我的上传
        
        category.addEventListener('click', () => {
            filterByCategory(categoryValue);
        });
    });
    
    // Search input handler
    document.getElementById('kbSearchInput').addEventListener('input', searchKnowledge);
    
    // Tag input handler
    const tagInput = document.getElementById('tagInput');
    if (tagInput) {
        tagInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                addTag(this.value);
            }
        });
    }
    
    // Category icon selector handler
    document.querySelectorAll('#categoryIconSelector .icon-option').forEach(option => {
        option.addEventListener('click', function() {
            selectedCategoryIcon = this.dataset.icon;
            selectedCategoryIconClass = this.dataset.class;
            renderCategoryIconSelector();
        });
    });
    
    // Close category modal on backdrop click
    const categoryModal = document.getElementById('categoryModal');
    if (categoryModal) {
        categoryModal.addEventListener('click', function(e) {
            if (e.target === this) {
                closeCategoryModal();
            }
        });
    }
    
    // Icon selector handler
    document.querySelectorAll('.icon-option').forEach(option => {
        option.addEventListener('click', function() {
            selectedIcon = this.dataset.icon;
            selectedIconClass = this.dataset.class;
            renderIconSelector();
        });
    });
    
    // Close modal on backdrop click
    document.getElementById('kbModal').addEventListener('click', function(e) {
        if (e.target === this) {
            closeModal();
        }
    });
    
    // Upload Modal - File input
    const fileInput = document.getElementById('fileInput');
    const uploadDropzone = document.getElementById('uploadDropzone');
    
    if (uploadDropzone && fileInput) {
        // Click to select files
        uploadDropzone.addEventListener('click', () => fileInput.click());
        
        // File selection change
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleFileSelect(e.target.files);
                fileInput.value = ''; // Reset for re-selection
            }
        });
        
        // Drag and drop events
        uploadDropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadDropzone.classList.add('dragover');
        });
        
        uploadDropzone.addEventListener('dragleave', () => {
            uploadDropzone.classList.remove('dragover');
        });
        
        uploadDropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadDropzone.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) {
                handleFileSelect(e.dataTransfer.files);
            }
        });
    }
    
    // Upload target selection change
    const uploadTargetKb = document.getElementById('uploadTargetKb');
    if (uploadTargetKb) {
        uploadTargetKb.addEventListener('change', renderUploadFileList);
    }
    
    // Close upload modal on backdrop click
    const uploadModal = document.getElementById('uploadModal');
    if (uploadModal) {
        uploadModal.addEventListener('click', function(e) {
            if (e.target === this) {
                closeUploadModal();
            }
        });
    }
});
