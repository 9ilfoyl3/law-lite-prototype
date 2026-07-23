// ============ 引导式生成模式（五步法）核心逻辑 ============

let currentStep = 1;
const TOTAL_STEPS = 5;
let guidedData = {
    caseId: '', template: 'judgment-civil-1st',
    step1: { materials: [], analysis: null },
    step2: { materials: [], analysis: null },
    step3: { disputes: [], userConfirm: '' },
    step4: { materials: [], facts: null },
    step5: { direction: '', notes: '' },
    document: null
};

const mockCases = [
    { id: 'case-001', caseNo: '(2025)粤01民初1143号', causeName: '民间借贷纠纷' },
    { id: 'case-002', caseNo: '(2025)粤01民初1144号', causeName: '合同纠纷' },
    { id: 'case-003', caseNo: '(2025)粤01民初1145号', causeName: '劳动争议' }
];

document.addEventListener('DOMContentLoaded', () => {
    renderStepIndicator();
    renderStep(currentStep);
});

// ====== 步骤指示器 ======
function renderStepIndicator() {
    const steps = [
        { num: 1, label: '原告材料', icon: 'user' },
        { num: 2, label: '被告材料', icon: 'user-shield' },
        { num: 3, label: '争议焦点', icon: 'balance-scale' },
        { num: 4, label: '事实认定', icon: 'clipboard-check' },
        { num: 5, label: '撰写文书', icon: 'file-alt' }
    ];

    let html = '';
    steps.forEach((s, i) => {
        const isActive = s.num === currentStep;
        const isCompleted = s.num < currentStep;
        const isDisabled = s.num > currentStep;

        let cls = 'step-item';
        if (isActive) cls += ' active';
        else if (isCompleted) cls += ' completed';
        else if (isDisabled) cls += ' disabled';

        html += `<div class="${cls}" onclick="goToStep(${s.num})" ${isDisabled ? 'style="pointer-events:none"' : ''}>
            <div class="step-num">${isCompleted ? '<i class="fas fa-check" style="font-size:11px"></i>' : s.num}</div>
            <span><i class="fas fa-${s.icon}"></i> ${s.label}</span>
        </div>`;

        if (i < steps.length - 1) {
            html += `<div class="step-connector ${isCompleted ? 'done' : ''}"></div>`;
        }
    });

    document.getElementById('stepsContainer').innerHTML = html;
}

function goToStep(step) {
    if (step >= 1 && step <= TOTAL_STEPS && step <= currentStep + 1) {
        if (step === currentStep + 1 && !validateCurrentStep()) return;
        currentStep = step;
        renderStepIndicator();
        renderStep(currentStep);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function nextStep() { goToStep(currentStep + 1); }
function prevStep() { goToStep(currentStep - 1); }

function validateCurrentStep() {
    switch (currentStep) {
        case 1: return !!guidedData.step1.materials.length;
        case 2: return !!guidedData.step2.materials.length;
        case 3: return true; // 可选确认
        case 4: return true; // 可选补充
        case 5: return !!guidedData.step5.direction.trim();
        default: return true;
    }
}

// ====== 步骤渲染 ======
function renderStep(step) {
    const el = document.getElementById('mainWorkspace');
    switch (step) {
        case 1: el.innerHTML = renderStep1(); break;
        case 2: el.innerHTML = renderStep2(); break;
        case 3: el.innerHTML = renderStep3(); break;
        case 4: el.innerHTML = renderStep4(); break;
        case 5: el.innerHTML = renderStep5(); break;
    }
}

// ====== Step 1: 原告材料 ======
function renderStep1() {
    return `
        <div class="workspace-container">
            <div class="phase-header">
                <div class="phase-icon step1"><i class="fas fa-user"></i></div>
                <h2 class="phase-title">第一步：原告材料选择与分析</h2>
                <p class="phase-desc">请上传或选择原告相关的关键材料，AI将提取分析原告信息、诉讼请求及证据情况</p>
            </div>

            <div class="form-card">
                <div class="form-card-title"><i class="fas fa-folder-open"></i> 选择案件与模板</div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                    <div class="form-group">
                        <label class="form-label">关联案件<span class="required">*</span></label>
                        <select class="form-select" onchange="guidedData.caseId=this.value">
                            <option value="">-- 请选择 --</option>
                            ${mockCases.map(c => `<option value="${c.id}" ${guidedData.caseId===c.id?'selected':''}>${c.caseNo} - ${c.causeName}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">文书模板</label>
                        <select class="form-select" onchange="guidedData.template=this.value">
                            <option value="judgment-civil-1st" ${guidedData.template==='judgment-civil-1st'?'selected':''}>民事判决书（一审普通程序）</option>
                            <option value="ruling-civil" ${guidedData.template==='ruling-civil'?'selected':''}>民事裁定书</option>
                        </select>
                    </div>
                </div>
            </div>

            <div class="form-card">
                <div class="form-card-title"><i class="fas fa-file-upload"></i> 上传原告相关材料</div>
                <div class="upload-zone" onclick="document.getElementById('step1FileInput').click()">
                    <i class="fas fa-cloud-upload-alt"></i>
                    <p>点击上传原告方的起诉状、证据材料等</p>
                    <p class="hint">支持 PDF、Word、TXT 格式 · 建议包含起诉状、身份证明、主要证据</p>
                </div>
                <input type="file" id="step1FileInput" multiple accept=".pdf,.doc,.docx,.txt" style="display:none;" onchange="handleFileUpload(1, this.files)">
                <div class="material-list" id="step1MaterialList">${renderMaterialList(1)}</div>
            </div>

            ${guidedData.step1.analysis ? `
                <div class="ai-result-card">
                    <div class="ai-result-header">
                        <span class="ai-result-badge"><i class="fas fa-robot"></i> AI 分析结果 - 原告信息</span>
                        <button class="btn-secondary" style="padding:4px 12px;font-size:12px;" onclick="reanalyzeStep1()"><i class="fas fa-redo"></i> 重新分析</button>
                    </div>
                    <div class="ai-result-content">${guidedData.step1.analysis}</div>
                </div>
            ` : ''}

            <div class="btn-group">
                <button class="btn-secondary" onclick="location.href='chat.html'"><i class="fas fa-arrow-left"></i> 返回聊天</button>
                <button class="btn-primary" onclick="analyzeAndNext(1)" ${!guidedData.step1.materials.length?'disabled':''}>
                    分析材料并继续 <i class="fas fa-arrow-right"></i>
                </button>
            </div>
        </div>
    `;
}

// ====== Step 2: 被告材料 ======
function renderStep2() {
    return `
        <div class="workspace-container">
            <div class="phase-header">
                <div class="phase-icon step2"><i class="fas fa-user-shield"></i></div>
                <h2 class="phase-title">第二步：被告材料选择与分析</h2>
                <p class="phase-desc">基于原告信息，请上传被告相关材料，AI将提取被告信息及答辩意见</p>
            </div>

            <!-- 上一步摘要 -->
            <div class="previous-summary">
                <div class="summary-toggle" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='block'?'none':'block'">
                    <span><i class="fas fa-history"></i> 查看上一步：原告信息提取结果</span>
                    <i class="fas fa-chevron-down"></i>
                </div>
                <div class="summary-body" style="display:none;">${guidedData.step1.analysis || '（暂无数据）'}</div>
            </div>

            <div class="form-card">
                <div class="form-card-title"><i class="fas fa-file-upload"></i> 上传被告相关材料</div>
                <div class="upload-zone" onclick="document.getElementById('step2FileInput').click()">
                    <i class="fas fa-cloud-upload-alt"></i>
                    <p>点击上传被告方的答辩状、证据材料等</p>
                    <p class="hint">建议包含答辩状、身份证/营业执照、反证材料</p>
                </div>
                <input type="file" id="step2FileInput" multiple accept=".pdf,.doc,.docx,.txt" style="display:none;" onchange="handleFileUpload(2, this.files)">
                <div class="material-list" id="step2MaterialList">${renderMaterialList(2)}</div>
            </div>

            ${guidedData.step2.analysis ? `
                <div class="ai-result-card">
                    <div class="ai-result-header">
                        <span class="ai-result-badge"><i class="fas fa-robot"></i> AI 分析结果 - 被告信息</span>
                        <button class="btn-secondary" style="padding:4px 12px;font-size:12px;" onclick="reanalyzeStep2()"><i class="fas fa-redo"></i> 重新分析</button>
                    </div>
                    <div class="ai-result-content">${guidedData.step2.analysis}</div>
                </div>
            ` : ''}

            <div class="btn-group">
                <button class="btn-secondary" onclick="prevStep()"><i class="fas fa-arrow-left"></i> 返回上一步</button>
                <button class="btn-primary" onclick="analyzeAndNext(2)" ${!guidedData.step2.materials.length?'disabled':''}>
                    分析材料并继续 <i class="fas fa-arrow-right"></i>
                </button>
            </div>
        </div>
    `;
}

// ====== Step 3: 争议焦点 ======
function renderStep3() {
    return `
        <div class="workspace-container">
            <div class="phase-header">
                <div class="phase-icon step3"><i class="fas fa-balance-scale"></i></div>
                <h2 class="phase-title">第三步：争议焦点归纳与分析</h2>
                <p class="phase-desc">基于原被告信息对比，AI已自动归纳以下争议焦点，请您确认或补充修改</p>
            </div>

            <div class="previous-summary">
                <div class="summary-toggle" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='block'?'none':'block'">
                    <span><i class="fas fa-history"></i> 查看前序步骤摘要</span>
                    <i class="fas fa-chevron-down"></i>
                </div>
                <div class="summary-body" style="display:none;">
                    <strong>原告信息：</strong>${guidedData.step1.analysis ? '已分析' : '待分析'}<br>
                    <strong>被告信息：</strong>${guidedData.step2.analysis ? '已分析' : '待分析'}
                </div>
            </div>

            <div class="ai-result-card">
                <div class="ai-result-header">
                    <span class="ai-result-badge"><i class="fas fa-brain"></i> AI 归纳的争议焦点</span>
                </div>
                <div class="ai-result-content">
                    <ul>
                        <li><strong>争议焦点一：借贷关系是否成立？</strong><br>双方对是否存在真实借贷合意及款项交付事实存在分歧</li>
                        <li><strong>争议焦点二：借款本金数额如何认定？</strong><br>被告主张部分款项非借款性质，原告对此不予认可</li>
                        <li><strong>争议焦点三：逾期利息的计算标准？</strong><br>双方对利率计算方式及起算时间存在不同理解</li>
                    </ul>
                </div>
            </div>

            <div class="form-card">
                <div class="form-card-title"><i class="fas fa-edit"></i> 您的确认与补充</div>
                <div class="form-group">
                    <label class="form-label">您对上述争议焦点的看法</label>
                    <textarea class="form-textarea" id="step3Confirm"
                              placeholder="例如：
• 同意上述争议焦点归纳
• 需要增加：XX问题也是本案的争议焦点
• 需要调整：将焦点一和焦点二合并为..."
                              onchange="guidedData.step3.userConfirm=this.value">${guidedData.step3.userConfirm || ''}</textarea>
                    <p class="hint-text">可选：您可以同意、修改或补充争议焦点</p>
                </div>
            </div>

            <div class="btn-group">
                <button class="btn-secondary" onclick="prevStep()"><i class="fas fa-arrow-left"></i> 返回上一步</button>
                <button class="btn-primary" onclick="nextStep()">
                    下一步：事实认定 <i class="fas fa-arrow-right"></i>
                </button>
            </div>
        </div>
    `;
}

// ====== Step 4: 事实认定 ======
function renderStep4() {
    return `
        <div class="workspace-container">
            <div class="phase-header">
                <div class="phase-icon step4"><i class="fas fa-clipboard-check"></i></div>
                <h2 class="phase-title">第四步：庭审笔录补充与事实认定梳理</h2>
                <p class="phase-desc">如庭审已完成，可上传庭审笔录；AI将帮您系统梳理庭审查明的事实</p>
            </div>

            <div class="previous-summary">
                <div class="summary-toggle" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='block'?'none':'block'">
                    <span><i class="fas fa-history"></i> 查看争议焦点确认</span>
                    <i class="fas fa-chevron-down"></i>
                </div>
                <div class="summary-body" style="display:none;">${guidedData.step3.userConfirm || '（用户未填写额外说明）'}</div>
            </div>

            <div class="form-card">
                <div class="form-card-title"><i class="fas fa-file-upload"></i> 补充庭审笔录（可选）</div>
                <div class="upload-zone" onclick="document.getElementById('step4FileInput').click()">
                    <i class="fas fa-gavel"></i>
                    <p>点击上传庭审笔录或其他事实认定材料</p>
                    <p class="hint">可选：如尚未开庭或无需补充，可直接跳过此步</p>
                </div>
                <input type="file" id="step4FileInput" multiple accept=".pdf,.doc,.docx,.txt" style="display:none;" onchange="handleFileUpload(4, this.files)">
                <div class="material-list" id="step4MaterialList">${renderMaterialList(4)}</div>
            </div>

            ${guidedData.step4.facts ? `
                <div class="ai-result-card">
                    <div class="ai-result-header">
                        <span class="ai-result-badge"><i class="fas fa-robot"></i> AI 梳理的事实认定</span>
                        <button class="btn-secondary" style="padding:4px 12px;font-size:12px;" onclick="reanalyzeStep4()"><i class="fas fa-redo"></i> 重新梳理</button>
                    </div>
                    <div class="ai-result-content">${guidedData.step4.facts}</div>
                </div>
            ` : `
                <div class="form-card">
                    <div class="form-card-title"><i class="fas fa-keyboard"></i> 手动输入事实认定要点（可选）</div>
                    <textarea class="form-textarea" placeholder="如果您不想上传庭审笔录，也可以直接在此输入您已经查明的主要事实..."
                              onchange="guidedData.step4.facts='<ul><li>'+this.value.split('\\n').map(l=>l.trim()).filter(l=>l).join('</li><li>')+'</li></ul>'"
                              rows="5"></textarea>
                </div>
            `}

            <div class="btn-group-center">
                <button class="btn-secondary" onclick="prevStep()"><i class="fas fa-arrow-left"></i> 返回上一步</button>
                <button class="btn-primary" onclick="nextStep()">
                    最后一步：明确裁判方向 <i class="fas fa-arrow-right"></i>
                </button>
            </div>
        </div>
    `;
}

// ====== Step 5: 裁判方向 & 生成 ======
function renderStep5() {
    return `
        <div class="workspace-container">
            <div class="phase-header">
                <div class="phase-icon step5"><i class="fas fa-file-alt"></i></div>
                <h2 class="phase-title">第五步：明确裁判方向 → AI撰写文书</h2>
                <p class="phase-desc">请明确您的裁判方向和核心理由，这是文书生成的最终依据</p>
            </div>

            <div class="previous-summary">
                <div class="summary-toggle" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='block'?'none':'block'">
                    <span><i class="fas fa-history"></i> 查看所有前置信息汇总</span>
                    <i class="fas fa-chevron-down"></i>
                </div>
                <div class="summary-body" style="display:none;">
                    <strong>原告材料：</strong>${guidedData.step1.materials.length}份<br>
                    <strong>被告材料：</strong>${guidedData.step2.materials.length}份<br>
                    <strong>争议焦点：</strong>已确认<br>
                    <strong>事实认定：</strong>${guidedData.step4.materials.length}份材料 / ${guidedData.step4.facts?'已梳理':'待梳理'}
                </div>
            </div>

            <div class="form-card" style="border-left: 4px solid #7c3aed;">
                <div class="form-card-title" style="color:#7c3aed;"><i class="fas fa-pen-fancy"></i> 法官笔记（SM因子 - 裁判结论核心依据）<span class="required">*</span></div>
                <div class="form-group">
                    <label class="form-label">裁判方向</label>
                    <select class="form-select" id="directionSelect" onchange="updateDirection(this.value)">
                        <option value="">-- 请选择 --</option>
                        <option value="support-all" ${guidedData.step5.direction==='support-all'?'selected':''}>支持原告全部诉讼请求</option>
                        <option value="support-part" ${guidedData.step5.direction==='support-part'?'selected':''}>支持原告部分诉讼请求</option>
                        <option value="reject" ${guidedData.step5.direction==='reject'?'selected':''}>驳回原告诉讼请求</option>
                        <option value="custom" ${guidedData.step5.direction==='custom'?'selected':''}>其他（自定义方向）</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">裁判理由与特殊考虑<span class="required">*</span></label>
                    <textarea class="form-textarea" id="judgeNotesInput"
                              placeholder="请详细说明您的裁判理由，例如：

1. 关于合同效力：原被告签订的借款合同系双方真实意思表示，内容合法有效
2. 关于款项交付：原告已提供完整转账凭证，被告对收到款项无异议
3. 关于违约责任：被告未按期还款构成违约，应承担相应责任
4. 特殊考虑：关于利息计算方式，应按照合同约定执行"
                              style="min-height:200px;"
                              onchange="guidedData.step5.notes=this.value">${guidedData.step5.notes || ''}</textarea>
                </div>
                <div style="background:#faf5ff;border:1px solid #ede9fe;border-radius:8px;padding:12px;margin-top:12px;">
                    <span style="font-size:13px;color:#6d28d9;"><i class="fas fa-info-circle"></i> 法官笔记是裁判结论的核心依据，AI将严格遵循您的判断生成文书。</span>
                </div>
            </div>

            <div class="btn-group-center">
                <button class="btn-secondary" onclick="prevStep()"><i class="fas fa-arrow-left"></i> 返回修改</button>
                <button class="btn-primary" onclick="generateDocument()" id="generateBtn" ${!guidedData.step5.direction||!guidedData.step5.notes.trim()?'disabled':''}>
                    <i class="fas fa-magic"></i> 开始生成文书
                </button>
            </div>
        </div>
    `;
}

// ====== 文件上传处理 ======
function handleFileUpload(stepNum, files) {
    const target = stepNum === 1 ? guidedData.step1 : stepNum === 2 ? guidedData.step2 : guidedData.step4;
    Array.from(files).forEach(f => {
        target.materials.push({
            id: Date.now()+Math.random().toString(36).substr(2,9),
            name: f.name, size: f.size,
            type: f.name.endsWith('.pdf')?'PDF文档':f.name.match(/\.docx?$/)?'Word文档':'文本文件'
        });
    });
    renderStep(currentStep);
}

function removeMaterial(stepNum, id) {
    const target = stepNum === 1 ? guidedData.step1 : stepNum === 2 ? guidedData.step2 : guidedData.step4;
    target.materials = target.materials.filter(m => m.id !== id);
    renderStep(currentStep);
}

function renderMaterialList(stepNum) {
    const target = stepNum === 1 ? guidedData.step1 : stepNum === 2 ? guidedData.step2 : guidedData.step4;
    if (!target.materials.length) return '';
    return target.materials.map(m => `
        <div class="material-item">
            <div class="material-info">
                <div class="material-icon"><i class="fas fa-file-${m.type.includes('PDF')?'pdf':'alt'}"></i></div>
                <div><div class="material-name">${m.name}</div><div class="material-meta">${m.type} · ${(m.size/1024/1024).toFixed(2)}MB</div></div>
            </div>
            <button class="remove-material-btn" onclick="removeMaterial(${stepNum},'${m.id}')"><i class="fas fa-times"></i></button>
        </div>
    `).join('');
}

// ====== AI分析与下一步 ======
async function analyzeAndNext(stepNum) {
    // 显示分析中状态
    const container = document.querySelector('.workspace-container');
    container.innerHTML = `
        <div class="analyzing-overlay">
            <div class="analyzing-icon"><i class="fas fa-brain"></i></div>
            <div class="analyzing-title">AI正在分析${stepNum===1?'原告':stepNum===2?'被告':'庭审'}材料...</div>
            <div class="analyzing-desc">预计需要 3-5 秒</div>
        </div>
    `;

    await new Promise(r => setTimeout(r, 1500 + Math.random() * 1000));

    // 生成Mock分析结果
    if (stepNum === 1) {
        guidedData.step1.analysis = `
            <ul>
                <li><strong>原告基本信息：</strong>广州农村商业银行股份有限公司黄埔支行（金融机构）</li>
                <li><strong>诉讼请求：</strong>
                    <ol style="margin-left:20px;margin-top:6px;">
                        <li>判令被告偿还借款本金人民币4950万元</li>
                        <li>判令被告支付利息（以4950万元为基数，年利率6%）</li>
                        <li>判令被告承担全部诉讼费用</li>
                    </ol>
                </li>
                <li><strong>核心证据识别：</strong>起诉状、个人借款合同、银行转账凭证、催款记录等共8份</li>
                <li><strong>案由初步判断：</strong>民间借贷纠纷，属于金钱给付之诉</li>
                <li><strong>复杂度评估：</strong>中等（涉及大额借款、多笔转账记录需核实）</li>
            </ul>`;
    } else if (stepNum === 2) {
        guidedData.step2.analysis = `
            <ul>
                <li><strong>被告基本信息：</strong>王五（自然人）</li>
                <li><strong>答辩意见：</strong>
                    <ol style="margin-left:20px;margin-top:6px;">
                        <li>对借款基本事实无异议</li>
                        <li>对利息计算方式有异议（认为不应计算复利）</li>
                        <li>主张已还款金额应为80万元而非50万元</li>
                    </ol>
                </li>
                <li><strong>提交证据：</strong>答辩状、银行流水、还款收据等共3份</li>
                <li><strong>抗辩要点提炼：</strong>① 还款金额存疑 ② 利息计算方式异议 ③ 诉讼时效可能抗辩</li>
            </ul>`;
    } else if (stepNum === 4) {
        guidedData.step4.facts = `
            <ul>
                <li><strong>事实一：</strong>2024年1月1日，原、被告签订《个人借款合同》，约定借款5000万元，年利率6%</li>
                <li><strong>事实二：</strong>原告于2024年1月5日通过银行转账向被告发放借款5000万元</li>
                <li><strong>事实三：</strong>被告于2024年6月15日偿还本金50万元后，剩余4950万元至今未还</li>
                <li><strong>事实四：</strong>被告对借款事实无异议，但对已还款金额存在争议</li>
                <li><strong>事实五：</strong>双方约定的年利率6%未超过法定上限</li>
            </ul>`;
    }

    renderStep(currentStep);
}

function reanalyzeStep1() { guidedData.step1.analysis = null; renderStep(1); }
function reanalyzeStep2() { guidedData.step2.analysis = null; renderStep(2); }
function reanalyzeStep4() { guidedData.step4.facts = null; renderStep(4); }

function updateDirection(v) { guidedData.step5.direction = v; }

// ====== 文书生成 ======
async function generateDocument() {
    if (!guidedData.step5.direction || !guidedData.step5.notes.trim()) return;

    const container = document.querySelector('.workspace-container');
    container.innerHTML = `
        <div class="analyzing-overlay">
            <div class="analyzing-icon"><i class="fas fa-file-alt"></i></div>
            <div class="analyzing-title">AI正在基于五步信息综合生成文书...</div>
            <div class="analyzing-desc">整合原告信息、被告信息、争议焦点、事实认定和法官笔记</div>
        </div>
    `;

    await new Promise(r => setTimeout(r, 2500));

    const c = mockCases.find(x=>x.id===guidedData.caseId)||mockCases[0];
    const dirMap = {'support-all':'支持原告全部诉讼请求','support-part':'支持原告部分诉讼请求','reject':'驳回原告诉讼请求','custom':guidedData.step5.direction};
    const templateNames = {'judgment-civil-1st':'民事判决书','ruling-civil':'民事裁定书'};

    guidedData.document = {
        title: `广东省广州市中级人民法院${templateNames[guidedData.template]||'法律文书'}`,
        content: `
<div style="font-family:'SimSun',serif;line-height:2.1;max-width:700px;margin:0 auto;padding:40px;">
<h2 style="text-align:center;font-size:22pt;font-weight:bold;margin-bottom:28px;">民 事 判 决 书</h2>
<p style="text-align:center;margin-bottom:18px;">${c.caseNo}</p>
<p style="text-indent:2em;margin-bottom:10px;"><strong>原告：</strong>广州农村商业银行股份有限公司黄埔支行，住所地广州市黄埔区。</p>
<p style="text-indent:2em;margin-bottom:10px;"><strong>被告：</strong>王五。</p>

<h3 style="font-size:14pt;margin:24px 0 14px;font-weight:bold;border-bottom:1px solid #e5e7eb;padding-bottom:6px;">一、案件由来和审理经过</h3>
<p style="text-indent:2em;margin-bottom:10px;">原告诉被告${c.causeName}一案，本院于2025年立案后依法适用普通程序公开开庭进行了审理。本案现已审理终结。</p>

<h3 style="font-size:14pt;margin:24px 0 14px;font-weight:bold;border-bottom:1px solid #e5e7eb;padding-bottom:6px;">二、原告诉称与被告辩称</h3>
<p style="text-indent:2em;margin-bottom:10px;"><strong>原告诉称：</strong>判令被告偿还借款本金4950万元及支付利息，承担诉讼费用。（详见原告材料）</p>
<p style="text-indent:2em;margin-bottom:10px;"><strong>被告辩称：</strong>对借款事实无异议，但对利息计算方式和已还款金额有异议。（详见被告材料）</p>

<h3 style="font-size:14pt;margin:24px 0 14px;font-weight:bold;border-bottom:1px solid #e5e7eb;padding-bottom:6px;">三、本院查明的事实</h3>
<p style="text-indent:2em;margin-bottom:10px;">经审理查明：2024年1月1日，原、被告签订《个人借款合同》，约定借款5000万元，年利率6%。原告于2024年1月5日发放了全部借款。被告仅于2024年6月15日偿还50万元后，余款至今未付。以上事实有借款合同、转账凭证、庭审笔录等证实。</p>

<h3 style="font-size:14pt;margin:24px 0 14px;font-weight:bold;border-bottom:1px solid #e5e7eb;padding-bottom:6px;">四、本院认为（法官裁判意志）</h3>
<p style="text-indent:2em;margin-bottom:10px;background:#fefce8;padding:14px;border-radius:8px;border-left:3px solid #7c3aed;">
<strong>【裁判方向】：${dirMap[guidedData.step5.direction]}</strong><br><br>
${guidedData.step5.notes.replace(/\n/g,'<br>')}
</p>

<h3 style="font-size:14pt;margin:24px 0 14px;font-weight:bold;border-bottom:1px solid #e5e7eb;padding-bottom:6px;">五、判决结果</h3>
<p style="text-indent:2em;margin-bottom:10px;">依照《中华人民共和国民法典》第六百六十七条、第六百七十六条之规定，判决如下：</p>
<p style="text-indent:2em;margin-bottom:10px;">一、被告于本判决生效之日起十日内偿还原告借款本金4950万元及利息；</p>
<p style="text-indent:2em;margin-bottom:10px;">二、驳回原告的其他诉讼请求。</p>
<p style="text-indent:2em;margin-bottom:24px;">如不服本判决，可在判决书送达之日起十五日内提起上诉。</p>
<p style="text-align:right;margin-bottom:8px;">审　判　长　XXX</p>
<p style="text-align:right;margin-bottom:20px;">二〇二六年四月十六日</p>
</div>`,
        generatedAt: new Date().toLocaleString(),
        wordCount: Math.round(2200 + Math.random()*800)
    };

    showResult();
}

function showResult() {
    const d = guidedData.document;
    document.getElementById('mainWorkspace').innerHTML = `
        <div class="completion-section">
            <div class="completion-icon"><i class="fas fa-check"></i></div>
            <h2 class="completion-title">五步引导完成！文书已生成</h2>
            <p class="completion-desc">通过5步引导式流程，AI已整合所有信息生成完整文书。<br>基于 <strong>${guidedData.step1.materials.length+guidedData.step2.materials.length+guidedData.step4.materials.length}</strong> 份材料和您的法官笔记。</p>

            <div class="stats-grid">
                <div class="stat-item"><div class="stat-value">5</div><div class="stat-label">引导步骤</div></div>
                <div class="stat-item"><div class="stat-value">${d.wordCount}</div><div class="stat-label">文书字数</div></div>
                <div class="stat-item"><div class="stat-value">~5</div><div class="stat-label">耗时（分钟）</div></div>
            </div>

            <div class="action-buttons">
                <button class="btn-action btn-download" onclick="toggleDocPreview(true)"><i class="fas fa-eye"></i> 预览文书</button>
                <button class="btn-action btn-download" onclick="downloadDoc()"><i class="fas fa-download"></i> 下载文书</button>
                <button class="btn-action btn-outline" onclick="regenerate()"><i class="fas fa-redo"></i> 重新生成</button>
                <button class="btn-action btn-outline" onclick="location.href='chat.html'"><i class="fas fa-comments"></i> 返回聊天</button>
            </div>

            <div style="margin-top:16px;padding-top:20px;border-top:1px solid #e5e7eb;display:flex;gap:12px;justify-content:center;">
                <button class="btn-action btn-outline" onclick="location.reload()"><i class="fas fa-plus"></i> 新建任务</button>
                <button class="btn-action btn-outline" onclick="location.href='cases.html'"><i class="fas fa-bolt"></i> 切换到快速模式</button>
            </div>
        </div>
    `;
    toggleDocPreview(true);
}

function toggleDocPreview(show) {
    const p = document.getElementById('docPreviewPanel');
    if (show && guidedData.document) {
        p.classList.add('show');
        document.getElementById('docPreviewContent').innerHTML = guidedData.document.content;
    } else {
        p.classList.remove('show');
    }
}
function downloadDoc() { alert('下载功能\n\n实际系统中会触发Word/PDF下载。\n（原型演示：请使用预览功能查看内容）'); }
function regenerate() { if(confirm('确定重新生成？')){guidedData.document=null;currentStep=5;renderStepIndicator();renderStep(5);} }
function showHelp(){
    alert(`引导式生成模式（五步法）使用指南
====================================

什么是引导式生成？
- 将"一次性生成文书"的大任务拆分为5个小任务
- 每一步都在AI能力范围内（控制单次处理的信息量）
- 分阶段渐进，法官可以逐步参与和把控

五步流程：
1️⃣ 原告材料 → 提取原告信息、诉讼请求、证据
2️⃣ 被告材料 → 提取被告信息、答辩意见、反证
3️⃣ 争议焦点 → 对比原被告信息，归纳争议点
4️⃣ 事实认定 → 补充庭审笔录，梳理查明事实
5️⃣ 裁判方向 → 明确法官意志，生成最终文书

适用场景：
✅ 中等复杂度案件
✅ 需要精确控制每个环节
✅ 卷宗较多但需要分批处理
✅ 希望深度参与文书生成过程

与其他模式对比：
- 快速生成：1-2分钟，简单案件
- 标准生成：1-2分钟，标准化案件（要件式）
- 引导式生成：5-10分钟，中等复杂度（分步式）
- 深度生成：10-30分钟，复杂案件（智能体）

如有疑问请联系技术支持。`);
}
