// ============ Chat Page JavaScript ============

let lawIdCounter = 5;

// ============ Task Type Configuration ============
const taskTypes = {
    JUDGMENT: 'judgment',      // 裁判文书
    INDICTMENT: 'indictment',  // 起诉状
    DEFENSE: 'defense',        // 答辩状
    MEDIATION: 'mediation',    // 调解书
    RULING: 'ruling',          // 裁定书
    NOTICE: 'notice',          // 通知书
    OTHER: 'other'             // 其他
};

// Current task type (can be set via URL param or localStorage)
let currentTaskType = taskTypes.JUDGMENT;

// Task type configuration
const taskConfig = {
    [taskTypes.JUDGMENT]: {
        name: '裁判文书',
        requiresLawConfirmation: true,
        steps: ['organize', 'cause', 'basic', 'rights', 'dispute', 'preset', 'improve', 'supplement', 'facts', 'notes', 'laws', 'cases', 'draft'],
        checkpoints: ['cause', 'dispute', 'facts', 'notes', 'laws', 'cases', 'draft'],
        documentType: '民事判决书',
        showLawSelection: true
    },
    [taskTypes.INDICTMENT]: {
        name: '起诉状',
        requiresLawConfirmation: false,
        steps: ['organize', 'cause', 'basic', 'claims', 'facts', 'evidence', 'draft'],
        checkpoints: ['cause', 'claims', 'draft'],
        documentType: '民事起诉状',
        showLawSelection: false
    },
    [taskTypes.DEFENSE]: {
        name: '答辩状',
        requiresLawConfirmation: false,
        steps: ['organize', 'cause', 'basic', 'defense', 'facts', 'refute', 'draft'],
        checkpoints: ['cause', 'defense', 'draft'],
        documentType: '民事答辩状',
        showLawSelection: false
    },
    [taskTypes.MEDIATION]: {
        name: '调解书',
        requiresLawConfirmation: false,
        steps: ['organize', 'basic', 'mediation', 'agreement', 'draft'],
        checkpoints: ['mediation', 'agreement', 'draft'],
        documentType: '民事调解书',
        showLawSelection: false
    },
    [taskTypes.RULING]: {
        name: '裁定书',
        requiresLawConfirmation: false,
        steps: ['organize', 'basic', 'procedure', 'ruling', 'draft'],
        checkpoints: ['procedure', 'ruling', 'draft'],
        documentType: '民事裁定书',
        showLawSelection: false
    },
    [taskTypes.NOTICE]: {
        name: '通知书',
        requiresLawConfirmation: false,
        steps: ['organize', 'basic', 'content', 'draft'],
        checkpoints: ['content', 'draft'],
        documentType: '应诉通知书',
        showLawSelection: false
    },
    [taskTypes.OTHER]: {
        name: '其他文书',
        requiresLawConfirmation: false,
        steps: ['organize', 'analysis', 'draft'],
        checkpoints: ['draft'],
        documentType: '法律文书',
        showLawSelection: false
    }
};

// Get current task configuration
function getCurrentTaskConfig() {
    return taskConfig[currentTaskType] || taskConfig[taskTypes.OTHER];
}

// Set task type from URL parameter or default
function initTaskType() {
    const urlParams = new URLSearchParams(window.location.search);
    const taskParam = urlParams.get('task');
    if (taskParam && taskConfig[taskParam]) {
        currentTaskType = taskParam;
    }
    updatePageForTaskType();
}

// Update page elements based on task type
function updatePageForTaskType() {
    const config = getCurrentTaskConfig();
    
    // Update page title
    const titleEl = document.querySelector('.chat-page-title');
    if (titleEl) {
        titleEl.textContent = `民间借贷纠纷案${config.name}`;
    }
    
    // Update user message tag
    const taskTag = document.querySelector('.msg-tag.task');
    if (taskTag) {
        taskTag.innerHTML = `<i class="fas fa-tasks"></i> ${config.name}`;
    }
    
    // Show/hide law selection panel
    const lawPanel = document.getElementById('lawSelectionPanel');
    if (lawPanel) {
        lawPanel.style.display = config.showLawSelection ? 'block' : 'none';
    }
    
    // Update waiting message
    const waitingMsg = document.getElementById('waitingMessage');
    if (waitingMsg) {
        if (config.requiresLawConfirmation) {
            waitingMsg.textContent = '请确认上述法条适用后继续生成文书……';
        } else {
            waitingMsg.textContent = '正在生成文书内容，请稍候……';
        }
    }
    
    // Update document card title
    const docTitle = document.querySelector('.doc-card-title');
    if (docTitle) {
        docTitle.textContent = `广东省广州市中级人民法院${config.documentType}`;
    }
    
    // Update document type in preview
    const docTypeEl = document.querySelector('.doc-type');
    if (docTypeEl) {
        docTypeEl.innerHTML = `<span class="traceable" data-source-type="format" data-source-id="format-2">${config.documentType}</span>`;
    }
}

// Source data
const sourceData = {
    'fact-case': {
        type: 'fact',
        typeName: '事实类',
        content: '（2025）粤01民初1143-1145号',
        origins: [
            { name: '立案登记表', file: '卷宗材料/01-立案登记表.pdf', page: 1, excerpt: '案号：<mark>（2025）粤01民初1143-1145号</mark>，立案日期：2025年1月2日' }
        ]
    },
    'fact-plaintiff': {
        type: 'fact',
        typeName: '事实类',
        content: '原告：广州农村商业银行股份有限公司黄埔支行',
        origins: [
            { name: '起诉状', file: '卷宗材料/02-起诉状.pdf', page: 1, excerpt: '原告：<mark>广州农村商业银行股份有限公司黄埔支行</mark>' },
            { name: '营业执照', file: '卷宗材料/03-营业执照.pdf', page: 1, excerpt: '企业名称：广州农村商业银行股份有限公司黄埔支行' }
        ]
    },
    'fact-defendant': {
        type: 'fact',
        typeName: '事实类',
        content: '被告：王五',
        origins: [
            { name: '起诉状', file: '卷宗材料/02-起诉状.pdf', page: 1, excerpt: '被告：<mark>王五</mark>' },
            { name: '身份证复印件', file: '卷宗材料/04-被告身份证.pdf', page: 1, excerpt: '姓名：王五，性别：男' }
        ]
    },
    'fact-contract': {
        type: 'fact',
        typeName: '事实类',
        content: '2024年1月1日，原告与被告王五签订《个人借款合同》……',
        origins: [
            { name: '个人借款合同', file: '卷宗材料/05-借款合同.pdf', page: 1, excerpt: '甲方（贷款人）：广州农村商业银行……乙方（借款人）：王五……签订日期：<mark>2024年1月1日</mark>' },
            { name: '合同附件', file: '卷宗材料/05-借款合同.pdf', page: 3, excerpt: '借款金额：人民币<mark>伍仟万元整</mark>，年利率：6%' }
        ]
    },
    'fact-transfer': {
        type: 'fact',
        typeName: '事实类',
        content: '原告依约于2024年1月5日通过银行转账方式发放借款',
        origins: [
            { name: '银行转账凭证', file: '卷宗材料/06-转账凭证.pdf', page: 1, excerpt: '转账日期：<mark>2024年1月5日</mark>，金额：50,000,000.00元，收款人：王五' }
        ]
    },
    'fact-repay': {
        type: 'fact',
        typeName: '事实类',
        content: '被告王五于2024年6月15日偿还本金500,000元',
        origins: [
            { name: '银行流水', file: '卷宗材料/07-银行流水.pdf', page: 12, excerpt: '2024年6月15日，转入：<mark>500,000.00元</mark>，付款人：王五，摘要：还款' }
        ]
    },
    'format-1': {
        type: 'format',
        typeName: '格式类',
        content: '广东省广州市中级人民法院',
        origins: [
            { name: '民事判决书示例', file: '示例库/民事判决书-标准格式.docx', page: 1, excerpt: '文书抬头应载明：<mark>XX省XX市中级人民法院</mark>' }
        ]
    },
    'format-2': {
        type: 'format',
        typeName: '格式类',
        content: '民事判决书',
        origins: [
            { name: '民事判决书示例', file: '示例库/民事判决书-标准格式.docx', page: 1, excerpt: '文书类型：<mark>民事判决书</mark>' }
        ]
    },
    'format-opinion': {
        type: 'format',
        typeName: '格式类',
        content: '本院认为',
        origins: [
            { name: '裁判文书规范', file: '示例库/裁判文书写作规范.pdf', page: 15, excerpt: '裁判理由部分以"<mark>本院认为</mark>"开头' }
        ]
    },
    'format-judgment': {
        type: 'format',
        typeName: '格式类',
        content: '判决如下',
        origins: [
            { name: '裁判文书规范', file: '示例库/裁判文书写作规范.pdf', page: 18, excerpt: '判决主文以"<mark>判决如下</mark>"引出' }
        ]
    },
    'format-procedure1': {
        type: 'format',
        typeName: '格式类',
        content: '如不服本判决，可在判决书送达之日起十五日内……',
        origins: [
            { name: '民事判决书示例', file: '示例库/民事判决书-标准格式.docx', page: 3, excerpt: '上诉权告知：<mark>如不服本判决，可在判决书送达之日起十五日内</mark>' }
        ]
    },
    'reasoning-valid': {
        type: 'reasoning',
        typeName: '说理类',
        content: '原告与被告签订的《个人借款合同》系双方真实意思表示，应认定为合法有效',
        matchAnalysis: '本案与下列类案均涉及民间借贷合同效力认定问题。类案中法院认定合同有效的核心要件为：(1)双方具有完全民事行为能力；(2)意思表示真实；(3)不违反法律强制性规定。',
        origins: [
            { name: '(2023)粤01民终12345号', file: '类案/案例1.pdf', page: 5, excerpt: '本院认为，原、被告签订的借款合同系双方真实意思表示，<mark>不违反法律强制性规定，应认定合法有效</mark>', similarity: '93%', matchPoints: '合同效力认定、意思表示真实性审查' },
            { name: '(2024)粤01民初6789号', file: '类案/案例2.pdf', page: 4, excerpt: '涉案借款合同系当事人真实意思表示，<mark>内容合法，应属有效合同</mark>', similarity: '89%', matchPoints: '合同效力认定、合法性审查' }
        ]
    },
    'reasoning-obligation': {
        type: 'reasoning',
        typeName: '说理类',
        content: '原告已按约发放借款，被告应按约定期限返还借款本金并支付利息',
        matchAnalysis: '类案确立了借贷关系中"履行对价"原则：出借人完成放款义务后，借款人即负有还款义务。',
        origins: [
            { name: '(2023)粤01民终12345号', file: '类案/案例1.pdf', page: 6, excerpt: '贷款人已履行放款义务，<mark>借款人应按约返还本金及利息</mark>', similarity: '91%', matchPoints: '还款义务认定、履行对价原则' }
        ]
    },
    'reasoning-amount': {
        type: 'reasoning',
        typeName: '说理类',
        content: '关于借款本金，被告已偿还500,000元，剩余本金为49,500,000元',
        matchAnalysis: '类案对于部分还款的处理规则为：已偿还金额应从本金中扣除，按实际欠款计算剩余债务。',
        origins: [
            { name: '(2024)粤01民初6789号', file: '类案/案例2.pdf', page: 5, excerpt: '对于已偿还部分，应从借款本金中扣除，<mark>按实际欠款金额计算</mark>', similarity: '87%', matchPoints: '还款金额认定、本金计算方法' }
        ]
    },
    'law-667': {
        type: 'law',
        typeName: '法条类',
        content: '根据《中华人民共和国民法典》第六百六十七条规定……',
        applicationAnalysis: '本条是借款合同的定义性条款，明确了借款合同的法律性质和基本特征。本案原、被告签订的《个人借款合同》符合该条规定的借款合同构成要件。',
        origins: [
            { name: '《民法典》第667条', file: '法律法规/民法典.pdf', page: 89, excerpt: '<mark>第六百六十七条</mark>　借款合同是借款人向贷款人借款，到期返还借款并支付利息的合同。', keyElements: '借款合同定义、借贷关系构成要件' }
        ]
    },
    'law-676': {
        type: 'law',
        typeName: '法条类',
        content: '根据《中华人民共和国民法典》第六百七十六条规定……',
        applicationAnalysis: '本条规定了借款人逾期还款的法律后果。本案中，被告未按合同约定的2024年6月30日前还款，构成逾期。',
        origins: [
            { name: '《民法典》第676条', file: '法律法规/民法典.pdf', page: 91, excerpt: '<mark>第六百七十六条</mark>　借款人未按照约定的期限返还借款的，应当按照约定或者国家有关规定支付逾期利息。', keyElements: '逾期还款责任、逾期利息计算依据' }
        ]
    },
    // 庭审提纲任务溯源数据
    'trial-format-1': {
        type: 'format',
        typeName: '格式类',
        content: '庭审提纲',
        origins: [
            { name: '庭审提纲示例', file: '示例库/庭审提纲-标准格式.docx', page: 1, excerpt: '文书类型：<mark>庭审提纲</mark>' }
        ]
    },
    'trial-cause': {
        type: 'fact',
        typeName: '事实类',
        content: '民间借贷纠纷案件',
        origins: [
            { name: '立案登记表', file: '卷宗材料/01-立案登记表.pdf', page: 1, excerpt: '案由：<mark>民间借贷纠纷</mark>' }
        ]
    },
    'trial-case-no': {
        type: 'fact',
        typeName: '事实类',
        content: '（2024）粤01民初12345号',
        origins: [
            { name: '立案登记表', file: '卷宗材料/01-立案登记表.pdf', page: 1, excerpt: '案号：<mark>（2024）粤01民初12345号</mark>' }
        ]
    },
    'trial-format-basic': {
        type: 'format',
        typeName: '格式类',
        content: '案件基本信息',
        origins: [
            { name: '庭审提纲示例', file: '示例库/庭审提纲-标准格式.docx', page: 1, excerpt: '一、<mark>案件基本信息</mark>' }
        ]
    },
    'trial-cause-detail': {
        type: 'fact',
        typeName: '事实类',
        content: '民间借贷纠纷',
        origins: [
            { name: '起诉状', file: '卷宗材料/02-起诉状.pdf', page: 1, excerpt: '案由：<mark>民间借贷纠纷</mark>' }
        ]
    },
    'trial-plaintiff': {
        type: 'fact',
        typeName: '事实类',
        content: '张某',
        origins: [
            { name: '起诉状', file: '卷宗材料/02-起诉状.pdf', page: 1, excerpt: '原告：<mark>张某</mark>' },
            { name: '身份证复印件', file: '卷宗材料/03-原告身份证.pdf', page: 1, excerpt: '姓名：张某' }
        ]
    },
    'trial-defendant': {
        type: 'fact',
        typeName: '事实类',
        content: '李某',
        origins: [
            { name: '起诉状', file: '卷宗材料/02-起诉状.pdf', page: 1, excerpt: '被告：<mark>李某</mark>' },
            { name: '身份证复印件', file: '卷宗材料/04-被告身份证.pdf', page: 1, excerpt: '姓名：李某' }
        ]
    },
    'trial-amount': {
        type: 'fact',
        typeName: '事实类',
        content: '53.2万元（50万元本金+3.2万元利息）',
        origins: [
            { name: '起诉状', file: '卷宗材料/02-起诉状.pdf', page: 2, excerpt: '诉讼请求：1.归还本金<mark>50万元</mark>；2.支付利息<mark>3.2万元</mark>' },
            { name: '借款合同', file: '卷宗材料/05-借款合同.pdf', page: 1, excerpt: '借款金额：人民币<mark>伍拾万元整</mark>' }
        ]
    },
    'trial-format-focus': {
        type: 'format',
        typeName: '格式类',
        content: '争议焦点',
        origins: [
            { name: '庭审提纲示例', file: '示例库/庭审提纲-标准格式.docx', page: 2, excerpt: '二、<mark>争议焦点</mark>' }
        ]
    },
    'trial-focus-1': {
        type: 'reasoning',
        typeName: '说理类',
        content: '借贷关系是否成立（是否有真实的借贷合意和款项交付）',
        matchAnalysis: '本案争议焦点集中于借贷合意和款项交付两个核心要素，需结合书面合同和转账凭证综合认定。',
        origins: [
            { name: '(2023)粤01民终12345号', file: '类案/案例1.pdf', page: 5, excerpt: '本院认为，借贷关系的成立需要具备<mark>借贷合意</mark>和<mark>款项交付</mark>两个要件', similarity: '95%', matchPoints: '借贷关系成立要件' }
        ]
    },
    'trial-focus-2': {
        type: 'reasoning',
        typeName: '说理类',
        content: '利息约定是否合法（年利率6.4%是否超过法定上限）',
        matchAnalysis: '根据最高人民法院规定，民间借贷利率不得超过一年期LPR的四倍，当前LPR为3.45%，四倍为13.8%，本案年利率6.4%未超过法定上限。',
        origins: [
            { name: '(2024)粤01民初6789号', file: '类案/案例2.pdf', page: 8, excerpt: '本院认为，双方约定的年利率<mark>未超过LPR四倍</mark>，属于合法利率', similarity: '91%', matchPoints: '利率合法性认定' }
        ]
    },
    'trial-format-prepare': {
        type: 'format',
        typeName: '格式类',
        content: '开庭准备',
        origins: [
            { name: '庭审提纲示例', file: '示例库/庭审提纲-标准格式.docx', page: 3, excerpt: '三、<mark>开庭准备</mark>' }
        ]
    },
    'trial-format-investigate': {
        type: 'format',
        typeName: '格式类',
        content: '法庭调查',
        origins: [
            { name: '庭审提纲示例', file: '示例库/庭审提纲-标准格式.docx', page: 4, excerpt: '四、<mark>法庭调查</mark>' }
        ]
    },
    'trial-claim': {
        type: 'fact',
        typeName: '事实类',
        content: '归还本金50万、支付利息3.2万',
        origins: [
            { name: '起诉状', file: '卷宗材料/02-起诉状.pdf', page: 2, excerpt: '1.判令被告归还本金<mark>50万元</mark>；2.支付利息<mark>3.2万元</mark>' }
        ]
    },
    'trial-facts': {
        type: 'fact',
        typeName: '事实类',
        content: '借款合同签订、款项交付、催款经过',
        origins: [
            { name: '起诉状', file: '卷宗材料/02-起诉状.pdf', page: 2, excerpt: '<mark>2023年1月1日签订借款合同</mark>，<mark>次日银行转账50万元</mark>，<mark>多次微信催款未果</mark>' }
        ]
    },
    'trial-repay': {
        type: 'fact',
        typeName: '事实类',
        content: '已归还本金10万元',
        origins: [
            { name: '还款收据', file: '卷宗材料/08-还款收据.pdf', page: 1, excerpt: '今收到李某归还借款本金<mark>壹拾万元整</mark>（￥100,000.00）' },
            { name: '银行流水', file: '卷宗材料/07-银行流水.pdf', page: 5, excerpt: '2024年1月15日，转入：<mark>100,000.00元</mark>，付款人：李某' }
        ]
    },
    'trial-defense': {
        type: 'reasoning',
        typeName: '说理类',
        content: '对利息计算方式提出异议',
        matchAnalysis: '被告对利息计算方式提出异议，属于常见的抗辩事由，需审查合同约定和法律规定。',
        origins: [
            { name: '(2023)粤01民终12345号', file: '类案/案例1.pdf', page: 6, excerpt: '被告主张<mark>利息计算方式不当</mark>，法院应依法审查', similarity: '88%', matchPoints: '利息抗辩审查' }
        ]
    },
    'trial-evidence-1': {
        type: 'fact',
        typeName: '事实类',
        content: '借款合同、转账凭证、催款记录',
        origins: [
            { name: '证据清单', file: '卷宗材料/09-证据清单.pdf', page: 1, excerpt: '证据1：<mark>借款合同</mark>；证据2：<mark>银行转账凭证</mark>；证据3：<mark>微信催款记录</mark>' }
        ]
    },
    'trial-evidence-2': {
        type: 'fact',
        typeName: '事实类',
        content: '还款收据',
        origins: [
            { name: '证据清单', file: '卷宗材料/09-证据清单.pdf', page: 2, excerpt: '被告证据1：<mark>还款收据</mark>' }
        ]
    },
    'trial-law-check': {
        type: 'law',
        typeName: '法条类',
        content: '利息约定是否超过LPR四倍',
        applicationAnalysis: '根据《最高人民法院关于审理民间借贷案件适用法律若干问题的规定》第25条，民间借贷利率不得超过合同成立时一年期LPR的四倍。',
        origins: [
            { name: '《民间借贷司法解释》第25条', file: '法律法规/民间借贷司法解释.pdf', page: 5, excerpt: '出借人请求借款人按照合同约定利率支付利息的，人民法院应予支持，但是双方约定的利率<mark>超过合同成立时一年期贷款市场报价利率四倍</mark>的除外。', keyElements: '利率上限规定、LPR四倍标准' }
        ]
    },
    'trial-format-debate': {
        type: 'format',
        typeName: '格式类',
        content: '法庭辩论',
        origins: [
            { name: '庭审提纲示例', file: '示例库/庭审提纲-标准格式.docx', page: 5, excerpt: '五、<mark>法庭辩论</mark>' }
        ]
    },
    'trial-format-statement': {
        type: 'format',
        typeName: '格式类',
        content: '最后陈述',
        origins: [
            { name: '庭审提纲示例', file: '示例库/庭审提纲-标准格式.docx', page: 6, excerpt: '六、<mark>最后陈述</mark>' }
        ]
    },
    'trial-format-mediation': {
        type: 'format',
        typeName: '格式类',
        content: '调解',
        origins: [
            { name: '庭审提纲示例', file: '示例库/庭审提纲-标准格式.docx', page: 7, excerpt: '七、<mark>调解</mark>' }
        ]
    },
    'trial-format-close': {
        type: 'format',
        typeName: '格式类',
        content: '休庭注意事项',
        origins: [
            { name: '庭审提纲示例', file: '示例库/庭审提纲-标准格式.docx', page: 8, excerpt: '八、<mark>休庭注意事项</mark>' }
        ]
    }
};

function getSourceTypeInfo(type) {
    const typeMap = {
        'fact': { label: '事实类', icon: 'fa-folder-open', color: 'fact' },
        'format': { label: '格式类', icon: 'fa-file-alt', color: 'format' },
        'reasoning': { label: '说理类', icon: 'fa-lightbulb', color: 'reasoning' },
        'law': { label: '法条类', icon: 'fa-gavel', color: 'law' }
    };
    return typeMap[type] || typeMap['fact'];
}

function showSourcePopup(sourceId, element) {
    const data = sourceData[sourceId];
    if (!data) return;

    document.querySelectorAll('.traceable.active').forEach(el => el.classList.remove('active'));
    element.classList.add('active');

    const typeInfo = getSourceTypeInfo(data.type);
    const popup = document.getElementById('sourcePopup');
    const badge = document.getElementById('sourceTypeBadge');
    const body = document.getElementById('sourcePopupBody');

    badge.textContent = data.typeName;
    badge.className = 'source-type-badge ' + data.type;

    let originsHtml = data.origins.map(origin => {
        let metaInfo = origin.page ? `第${origin.page}页` : '';
        let extraInfo = '';

        if (data.type === 'reasoning' && origin.similarity) {
            extraInfo = `
                <div class="source-origin-match-info">
                    <span class="match-similarity"><i class="fas fa-chart-pie"></i> 相似度 ${origin.similarity}</span>
                    <span class="match-points"><i class="fas fa-link"></i> ${origin.matchPoints}</span>
                </div>
            `;
        }

        if (data.type === 'law' && origin.keyElements) {
            extraInfo = `
                <div class="source-origin-match-info">
                    <span class="match-points"><i class="fas fa-key"></i> ${origin.keyElements}</span>
                </div>
            `;
        }

        return `
            <div class="source-origin-item">
                <div class="source-origin-item-header">
                    <div class="source-origin-icon ${data.type}">
                        <i class="fas ${typeInfo.icon}"></i>
                    </div>
                    <div class="source-origin-name">${origin.name}</div>
                    <div class="source-origin-meta">${metaInfo}</div>
                </div>
                ${extraInfo}
                <div class="source-origin-excerpt">${origin.excerpt}</div>
            </div>
        `;
    }).join('');

    const originTitles = {
        'fact': '卷宗材料来源',
        'format': '示例文件来源',
        'reasoning': '类案参考来源',
        'law': '法条适用来源'
    };

    let analysisHtml = '';
    if (data.type === 'reasoning' && data.matchAnalysis) {
        analysisHtml = `
            <div class="source-analysis-section" style="margin-bottom: 20px; padding: 16px; background: var(--bg-primary); border-radius: 10px; border-left: 3px solid var(--accent-primary);">
                <div class="source-analysis-title" style="display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: var(--accent-primary); margin-bottom: 10px;">
                    <i class="fas fa-brain"></i>
                    类案匹配分析
                </div>
                <div class="source-analysis-text" style="font-size: 13px; color: var(--text-primary); line-height: 1.8; text-align: justify;">${data.matchAnalysis}</div>
            </div>
        `;
    } else if (data.type === 'law' && data.applicationAnalysis) {
        analysisHtml = `
            <div class="source-analysis-section" style="margin-bottom: 20px; padding: 16px; background: var(--bg-primary); border-radius: 10px; border-left: 3px solid var(--accent-primary);">
                <div class="source-analysis-title" style="display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: var(--accent-primary); margin-bottom: 10px;">
                    <i class="fas fa-balance-scale"></i>
                    法条适用分析
                </div>
                <div class="source-analysis-text" style="font-size: 13px; color: var(--text-primary); line-height: 1.8; text-align: justify;">${data.applicationAnalysis}</div>
            </div>
        `;
    }

    body.innerHTML = `
        <div class="source-content-label">选中内容</div>
        <div class="source-content-text">${data.content}</div>
        ${analysisHtml}
        <div class="source-origin-section">
            <div class="source-origin-title">
                <i class="fas ${typeInfo.icon}"></i>
                ${originTitles[data.type]}
            </div>
            ${originsHtml}
        </div>
    `;

    popup.classList.add('show');
}

function hideSourcePopup() {
    document.getElementById('sourcePopup').classList.remove('show');
    document.querySelectorAll('.traceable.active').forEach(el => el.classList.remove('active'));
}

// Complete document generation
function completeDocumentGeneration() {
    const lawPanel = document.getElementById('lawSelectionPanel');
    if (lawPanel) {
        lawPanel.style.display = 'none';
    }

    const taskProcessStatus = document.getElementById('taskProcessStatus');
    if (taskProcessStatus) {
        taskProcessStatus.innerHTML = '<i class="fas fa-check-circle"></i> 已完成';
        taskProcessStatus.classList.remove('in-progress');
        taskProcessStatus.classList.add('completed');
    }

    const nodeLaws = document.getElementById('node-laws');
    if (nodeLaws) {
        nodeLaws.classList.remove('in-progress');
        nodeLaws.classList.add('completed');
    }
    
    const nodeLawsBadge = document.getElementById('nodeLawsBadge');
    if (nodeLawsBadge) {
        nodeLawsBadge.textContent = '已完成';
        nodeLawsBadge.classList.remove('in-progress');
        nodeLawsBadge.classList.add('completed');
    }

    const pendingNodes = ['node-cases', 'node-draft'];
    const pendingBadges = ['nodeCasesBadge', 'nodeDraftBadge'];

    pendingNodes.forEach((nodeId) => {
        const node = document.getElementById(nodeId);
        if (node) {
            node.classList.remove('pending');
            node.classList.add('completed');
        }
    });

    pendingBadges.forEach((badgeId) => {
        const badge = document.getElementById(badgeId);
        if (badge) {
            badge.textContent = '已完成';
            badge.classList.remove('pending');
            badge.classList.add('completed');
        }
    });

    addCompletedNodeDetails();

    const waitingMsg = document.getElementById('waitingMessage');
    if (waitingMsg) {
        waitingMsg.style.display = 'none';
    }
    
    // 只在非动态流程中显示静态卡片（兼容旧代码）
    // 动态流程使用自己的卡片显示逻辑（startJudgmentStreaming等函数）
    const judgmentDocumentFlow = document.getElementById('judgmentDocumentFlow');
    const trialOutlineFlow = document.getElementById('trialOutlineFlow');
    const caseRetrievalFlow = document.getElementById('caseRetrievalFlow');
    
    // 如果存在动态流程元素，说明正在使用新流程，不显示静态卡片
    const isDynamicFlow = judgmentDocumentFlow || trialOutlineFlow || caseRetrievalFlow;
    
    if (!isDynamicFlow) {
        const docGeneratedSection = document.getElementById('docGeneratedSection');
        if (docGeneratedSection) {
            docGeneratedSection.classList.add('show');
        }
        
        const docPreviewPanel = document.getElementById('docPreviewPanel');
        if (docPreviewPanel) {
            docPreviewPanel.style.display = '';
        }
    }
}

// Auto-complete for non-judgment tasks
function autoCompleteForNonJudgment() {
    const config = getCurrentTaskConfig();
    
    // Update waiting message
    const waitingMsg = document.getElementById('waitingMessage');
    if (waitingMsg) {
        waitingMsg.textContent = '正在生成文书内容，请稍候……';
    }
    
    // Hide law selection panel if not needed
    if (!config.showLawSelection) {
        const lawPanel = document.getElementById('lawSelectionPanel');
        if (lawPanel) {
            lawPanel.style.display = 'none';
        }
    }
    
    // Simulate processing delay for non-judgment tasks
    setTimeout(() => {
        completeDocumentGeneration();
    }, 1500);
}

function addCompletedNodeDetails() {
    const nodeCases = document.getElementById('node-cases');
    const casesDetails = document.createElement('div');
    casesDetails.className = 'task-node-details';
    casesDetails.innerHTML = `
        <!--div class="tool-call-block">
            <div class="tool-call-label"><i class="fas fa-cog"></i> 工具调用</div>
            <div class="tool-call-name">指导性案例库检索</div>
            <div class="tool-call-result success">✓ 找到3个高度相似案例，裁判方向一致</div>
        </div-->
    `;
    nodeCases.appendChild(casesDetails);

    const nodeDraft = document.getElementById('node-draft');
    const draftDetails = document.createElement('div');
    draftDetails.className = 'task-node-details';
    draftDetails.innerHTML = `
        <!--div class="reasoning-block">
            <div class="reasoning-label"><i class="fas fa-lightbulb"></i> 思考过程</div>
            <div class="reasoning-text">综合前述要件事实认定、法条适用及类案参考，生成民事判决书初稿。</div>
        </div-->
    `;
    nodeDraft.appendChild(draftDetails);
}

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    // Initialize task type based on URL or default
    initTaskType();
    
    // For non-judgment tasks, auto-complete the generation
    const config = getCurrentTaskConfig();
    if (!config.requiresLawConfirmation) {
        autoCompleteForNonJudgment();
    }
    
    // Task process toggle
    document.getElementById('taskProcessToggle').addEventListener('click', function() {
        const section = document.getElementById('taskProcessSection');
        section.classList.toggle('collapsed');
    });

    // Document card click
    document.getElementById('docCard').addEventListener('click', function() {
        this.classList.toggle('active');
    });

    // Document close button
    document.getElementById('docCloseBtn').addEventListener('click', () => {
        document.getElementById('docPreviewPanel').style.display = 'none';
    });

    // Law confirm button
    const lawConfirmBtn = document.getElementById('lawConfirmBtn');
    if (lawConfirmBtn) {
        lawConfirmBtn.addEventListener('click', function() {
            const config = getCurrentTaskConfig();
            
            // Only validate law selection for judgment documents
            if (config.requiresLawConfirmation) {
                const checkedLaws = document.querySelectorAll('#lawSelectionList .law-item input[type="checkbox"]:checked');
                if (checkedLaws.length === 0) {
                    showNotification('请至少选择一条法条', 'warning');
                    return;
                }
            }

            completeDocumentGeneration();
        });
    }

    // Add law button
    document.getElementById('addLawBtn').addEventListener('click', function() {
        const lawList = document.getElementById('lawSelectionList');
        const newLawItem = document.createElement('div');
        newLawItem.className = 'law-item';
        newLawItem.setAttribute('data-id', lawIdCounter++);
        newLawItem.innerHTML = `
            <input type="checkbox" checked>
            <div class="law-item-content">
                <div class="law-item-title" contenteditable="true" style="border: 1px dashed #fbbf24; padding: 4px; border-radius: 4px;">请输入法条名称</div>
                <div class="law-item-desc" contenteditable="true" style="border: 1px dashed #fde68a; padding: 4px; border-radius: 4px; margin-top: 4px;">请输入法条内容</div>
            </div>
            <div class="law-item-actions">
                <button class="law-item-btn edit" title="修改"><i class="fas fa-edit"></i></button>
                <button class="law-item-btn delete" title="删除"><i class="fas fa-trash-alt"></i></button>
            </div>
        `;
        lawList.appendChild(newLawItem);
        newLawItem.querySelector('.law-item-title').focus();
    });

    // Law item actions
    document.getElementById('lawSelectionList').addEventListener('click', function(e) {
        const deleteBtn = e.target.closest('.law-item-btn.delete');
        const editBtn = e.target.closest('.law-item-btn.edit');

        if (deleteBtn) {
            const lawItem = deleteBtn.closest('.law-item');
            lawItem.style.transform = 'translateX(-100%)';
            lawItem.style.opacity = '0';
            lawItem.style.transition = 'all 0.3s';
            setTimeout(() => lawItem.remove(), 300);
        }

        if (editBtn) {
            const lawItem = editBtn.closest('.law-item');
            const title = lawItem.querySelector('.law-item-title');
            const desc = lawItem.querySelector('.law-item-desc');

            title.contentEditable = 'true';
            desc.contentEditable = 'true';
            title.style.border = '1px dashed #fbbf24';
            title.style.padding = '4px';
            title.style.borderRadius = '4px';
            desc.style.border = '1px dashed #fde68a';
            desc.style.padding = '4px';
            desc.style.borderRadius = '4px';
            desc.style.marginTop = '4px';
            title.focus();

            const removeEditable = () => {
                title.contentEditable = 'false';
                desc.contentEditable = 'false';
                title.style.border = '';
                title.style.padding = '';
                desc.style.border = '';
                desc.style.padding = '';
                desc.style.marginTop = '';
            };

            title.addEventListener('blur', removeEditable, { once: true });
            desc.addEventListener('blur', removeEditable, { once: true });
        }
    });

    // Traceable elements
    document.getElementById('docPreviewPanel').addEventListener('click', (e) => {
        const traceable = e.target.closest('.traceable');
        if (traceable) {
            const sourceId = traceable.getAttribute('data-source-id');
            showSourcePopup(sourceId, traceable);
        }
    });

    // Source popup close
    document.getElementById('sourcePopupClose').addEventListener('click', hideSourcePopup);

    // View original button
    document.getElementById('viewOriginalBtn').addEventListener('click', () => {
        showNotification('正在打开原文档……', 'success');
    });

    // Chat history toggle
    const chatHistoryToggleBtn = document.getElementById('chatHistoryToggleBtn');
    if (chatHistoryToggleBtn) {
        chatHistoryToggleBtn.addEventListener('click', () => {
            toggleHistorySidebar();
        });
    }
});

// ============ Navigation Helper ============
// Usage: navigateToChat('indictment') will open chat page for generating indictment
function navigateToChat(taskType, params = {}) {
    const url = new URL('pages/chat.html', window.location.origin);
    url.searchParams.set('task', taskType);
    
    // Add additional params
    Object.keys(params).forEach(key => {
        url.searchParams.set(key, params[key]);
    });
    
    window.location.href = url.toString();
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { navigateToChat, taskTypes, getCurrentTaskConfig };
}
