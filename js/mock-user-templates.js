/**
 * 管理端「用户模板检索」mock 数据（清单第 27 项）
 *
 * 背景：原型阶段 localStorage 只存"当前浏览器用户"一份数据（myDocTemplates /
 * myPromptTemplates / myElementPresetsByCause），无法体现"多个法官各自建了什么"。
 * 因此此处集中 mock 一批虚拟法官及其模板 / 指令 / 要件，供管理端检索页演示。
 *
 * 重要：mock 数据独立存放，只读取、不写入 localStorage，不污染真实用户数据。
 */
(function (global) {
    'use strict';

    // ===== 可复用的文书正文片段（避免 mock 文件过度膨胀） =====
    var BODY = {};

    BODY.judgment = function (cause, plaintiff, defendant) {
        return '民 事 判 决 书\n\n（2026）粤01民初XXXX号\n\n' +
            '原告：' + plaintiff + '，住广东省广州市XX区XX路XX号。\n' +
            '委托诉讼代理人：XXX，广东XX律师事务所律师。\n' +
            '被告：' + defendant + '，住广东省广州市XX区XX路XX号。\n\n' +
            '原告' + plaintiff + '与被告' + defendant + cause + '一案，本院于2026年X月X日立案后，' +
            '依法适用普通程序，公开开庭进行了审理。原告及其委托诉讼代理人、被告均到庭参加诉讼。本案现已审理终结。\n\n' +
            '原告向本院提出诉讼请求：1. 判令被告向原告支付款项XX元；2. 本案诉讼费用由被告承担。\n' +
            '事实与理由：……（此处概述案件事实与诉请依据）\n\n' +
            '被告辩称：……（此处概述答辩意见）\n\n' +
            '本院经审理认定事实如下：……（经质证采信的证据与查明事实）\n\n' +
            '本院认为，……（结合法律规定对争议焦点作出评判）。' +
            '依照《中华人民共和国民法典》相关规定，判决如下：\n\n' +
            '一、被告' + defendant + '于本判决生效之日起十日内向原告' + plaintiff + '支付款项XX元；\n' +
            '二、驳回原告' + plaintiff + '的其他诉讼请求。\n\n' +
            '如果未按本判决指定的期间履行给付金钱义务，应当依照《中华人民共和国民事诉讼法》' +
            '第二百六十四条之规定，加倍支付迟延履行期间的债务利息。\n\n' +
            '案件受理费XX元，由被告负担。\n\n' +
            '审判员　　[审判员姓名]\n二○二六年X月X日\n法官助理　　[法官助理姓名]\n书记员　　[书记员姓名]';
    };

    BODY.simpleJudgment = function (cause, plaintiff, defendant) {
        return '民 事 判 决 书（简易程序）\n\n（2026）粤01民初XXXX号\n\n' +
            '原告：' + plaintiff + '。\n被告：' + defendant + '。\n\n' +
            '原告' + plaintiff + '与被告' + defendant + cause + '一案，本院适用简易程序公开开庭进行了审理。本案现已审理终结。\n\n' +
            '本院查明：……（简要查明事实）\n\n' +
            '本院认为，……（简要说理）。依照相关法律规定，判决如下：\n\n' +
            '一、被告' + defendant + '于本判决生效之日起十日内向原告支付XX元；\n' +
            '二、驳回原告其他诉讼请求。\n\n' +
            '审判员　　[审判员姓名]\n二○二六年X月X日\n书记员　　[书记员姓名]';
    };

    BODY.mediation = function (cause, plaintiff, defendant) {
        return '民 事 调 解 书\n\n（2026）粤01民初XXXX号\n\n' +
            '原告：' + plaintiff + '。\n被告：' + defendant + '。\n\n' +
            '本院于2026年X月X日立案受理原告' + plaintiff + '与被告' + defendant + cause + '一案后，' +
            '依法适用简易程序，由审判员主持调解。\n\n' +
            '经本院主持调解，双方当事人自愿达成如下协议：\n' +
            '一、被告' + defendant + '确认尚欠原告' + plaintiff + '款项XX元，分期支付至2026年X月X日前付清；\n' +
            '二、原告自愿放弃其他诉讼请求；\n' +
            '三、案件受理费减半收取，由被告负担。\n\n' +
            '上述协议，不违反法律规定，本院予以确认。\n\n' +
            '审判员　　[审判员姓名]\n二○二六年X月X日\n书记员　　[书记员姓名]';
    };

    BODY.ruling = function (cause) {
        return '民 事 裁 定 书\n\n（2026）粤01民初XXXX号\n\n' +
            '申请人：XXX。\n被申请人：XXX。\n\n' +
            '关于申请人诉被申请人' + cause + '一案，申请人于2026年X月X日向本院提出财产保全申请，' +
            '请求对被申请人名下价值XX元的财产采取保全措施，并已提供担保。\n\n' +
            '本院经审查认为，申请人的申请符合法律规定。依照《中华人民共和国民事诉讼法》' +
            '第一百零三条之规定，裁定如下：\n\n' +
            '查封 / 冻结被申请人XXX名下价值XX元的财产。\n\n' +
            '本裁定立即开始执行。\n\n' +
            '审判员　　[审判员姓名]\n二○二六年X月X日\n书记员　　[书记员姓名]';
    };

    BODY.criminal = function (cause, defendant) {
        return '刑 事 判 决 书\n\n（2026）粤01刑初XXXX号\n\n' +
            '公诉机关：广东省广州市XX区人民检察院。\n' +
            '被告人：' + defendant + '，男，19XX年X月X日出生，汉族，初中文化，无业，住广东省XX市XX区。\n\n' +
            '广东省广州市XX区人民检察院以X检刑诉〔2026〕XX号起诉书指控被告人' + defendant + '犯' + cause.replace('罪', '') + '罪，' +
            '于2026年X月X日向本院提起公诉。本院依法组成合议庭，公开开庭审理了本案。现已审理终结。\n\n' +
            '公诉机关指控：……（指控事实）\n\n' +
            '被告人' + defendant + '对指控事实无异议，自愿认罪认罚。\n\n' +
            '本院认为，被告人' + defendant + '的行为已构成' + cause.replace('罪', '') + '罪。' +
            '依照《中华人民共和国刑法》相关规定，判决如下：\n\n' +
            '被告人' + defendant + '犯' + cause.replace('罪', '') + '罪，判处有期徒刑X年X个月，并处罚金人民币XX元。\n\n' +
            '审判长　　[审判长姓名]\n审判员　　[审判员姓名]\n二○二六年X月X日\n书记员　　[书记员姓名]';
    };

    // ===== 官方覆盖表（mock）=====
    // 维度对齐真实数据模型（关键）：
    //   · 模板 / 指令 → 挂在【文书类型】下，本身**不**关联案由；案由由文书类型承载
    //     （文书类型含 causes 字段，见 js/case-data.js:284 / admin-doc-types.js:363）
    //   · 要件       → 按【案由】索引（myElementPresetsByCause）
    // 故分布统计分两套：模板/指令按文书类型，要件按案由。

    // 文书类型 → 匹配案由（对应文书类型上的 causes 字段）
    var DOC_TYPE_CAUSES = {
        '民事判决书（一审普通程序）': ['民间借贷纠纷', '买卖合同纠纷', '房屋租赁合同纠纷', '建设工程施工合同纠纷', '股权转让纠纷'],
        '民事判决书（简易程序）': ['民间借贷纠纷', '买卖合同纠纷'],
        '民事裁定书': ['财产保全', '执行异议'],
        '民事调解书': ['离婚纠纷', '民间借贷纠纷', '房屋租赁合同纠纷'],
        '庭审提纲': [],
        '法庭调查提纲': [],
        '执行通知书': ['强制执行'],
        '财产报告令': ['强制执行'],
        '送达回证': [],
        '刑事判决书': ['盗窃罪', '诈骗罪', '故意伤害罪', '交通肇事罪'],
        '行政判决书': ['行政处罚']
    };

    // 文书类型 → 官方库已有模板数（0 表示尚无官方标准模板）
    var OFFICIAL_DOCTYPE_COVERAGE = {
        '民事判决书（一审普通程序）': 3,
        '民事判决书（简易程序）': 2,
        '民事裁定书': 2,
        '民事调解书': 2,
        '庭审提纲': 1,
        '法庭调查提纲': 0,
        '执行通知书': 1,
        '财产报告令': 0,
        '送达回证': 0,
        // 试点初期官方库尚未覆盖刑事 / 行政文书类型，但法官已自建 → 构成收编缺口
        '刑事判决书': 0,
        '行政判决书': 0
    };

    // 案由 → 官方库已有要件数（要件按案由组织）
    var OFFICIAL_ELEMENT_CAUSE_COVERAGE = {
        '民间借贷纠纷': 6,
        '买卖合同纠纷': 4,
        '离婚纠纷': 5,
        '劳动争议': 3,
        '房屋租赁合同纠纷': 2,
        '机动车交通事故责任纠纷': 0,
        '医疗损害责任纠纷': 0,
        '建设工程施工合同纠纷': 0,
        '盗窃罪': 3,
        '故意伤害罪': 2,
        '交通肇事罪': 0,
        '诈骗罪': 1,
        '行政处罚': 0
    };

    // ===== 虚拟法官及其物料 =====
    var MOCK_JUDGES = [
        {
            id: 'F001', name: '王建国', dept: '民一庭', title: '一级法官',
            templates: [
                { id: 'F001-T1', name: '民间借贷纠纷判决书（常规版）', docType: '民事判决书（一审普通程序）', updatedAt: '2026-09-02', enabled: true, content: BODY.judgment('民间借贷纠纷', '张三', '李四') },
                { id: 'F001-T2', name: '借贷案件调解书模板', docType: '民事调解书', updatedAt: '2026-08-19', enabled: true, content: BODY.mediation('民间借贷纠纷', '张三', '李四') },
                { id: 'F001-T3', name: '医疗损害责任纠纷判决书', docType: '民事判决书（一审普通程序）', updatedAt: '2026-09-08', enabled: true, content: BODY.judgment('医疗损害责任纠纷', '陈某', '某医院') },
                { id: 'F001-T4', name: '买卖合同简易判决模板', docType: '民事判决书（简易程序）', updatedAt: '2026-07-11', enabled: false, content: BODY.simpleJudgment('买卖合同纠纷', '某贸易公司', '某实业公司') }
            ],
            prompts: [
                { id: 'F001-P1', name: '借贷事实认定要点提示', docType: '民事判决书（一审普通程序）', updatedAt: '2026-08-25', content: '请重点审查：1. 借条/转账凭证是否相互印证；2. 款项交付时间与金额；3. 是否已过诉讼时效；4. 利息约定是否超过法定上限（LPR 四倍）。' },
                { id: 'F001-P2', name: '文书语气正式化', docType: '通用', updatedAt: '2026-06-30', content: '将全文语气调整为正式司法文书风格，避免口语化表述，删除情绪化形容词，统一使用"本院认为""经审理查明"等规范表述。' }
            ],
            elements: [
                { id: 'F001-E1', name: '借款合意', question: '双方是否存在真实的借贷合意？请提供借条、聊天记录等佐证。', cause: '民间借贷纠纷', caseWords: ['民初', '民终'], updatedAt: '2026-08-10' },
                { id: 'F001-E2', name: '款项交付', question: '出借人是否已实际交付借款？交付方式、时间、金额分别是？', cause: '民间借贷纠纷', caseWords: ['民初', '民终'], updatedAt: '2026-08-10' },
                { id: 'F001-E3', name: '诊疗过错', question: '医疗机构的诊疗行为是否存在过错？是否违反诊疗规范？', cause: '医疗损害责任纠纷', caseWords: ['民初', '民终'], updatedAt: '2026-09-01' }
            ]
        },
        {
            id: 'F002', name: '李慧敏', dept: '民一庭', title: '二级法官',
            templates: [
                { id: 'F002-T1', name: '交通事故责任纠纷判决书', docType: '民事判决书（一审普通程序）', updatedAt: '2026-09-06', enabled: true, content: BODY.judgment('机动车交通事故责任纠纷', '王某', '某保险公司') },
                { id: 'F002-T2', name: '交通事故赔偿调解书', docType: '民事调解书', updatedAt: '2026-08-28', enabled: true, content: BODY.mediation('机动车交通事故责任纠纷', '王某', '某保险公司') },
                { id: 'F002-T3', name: '离婚纠纷判决书（涉子女抚养）', docType: '民事判决书（一审普通程序）', updatedAt: '2026-07-22', enabled: true, content: BODY.judgment('离婚纠纷', '赵某', '钱某') }
            ],
            prompts: [
                { id: 'F002-P1', name: '交通事故赔偿项目清单', docType: '民事判决书（一审普通程序）', updatedAt: '2026-09-01', content: '请逐项列明赔偿项目：医疗费、误工费、护理费、交通费、住院伙食补助费、营养费、残疾赔偿金、精神损害抚慰金，并说明计算依据。' }
            ],
            elements: [
                { id: 'F002-E1', name: '事故责任认定', question: '交警部门出具的事故认定书如何划分责任？当事人是否有异议？', cause: '机动车交通事故责任纠纷', caseWords: ['民初', '民终'], updatedAt: '2026-09-05' },
                { id: 'F002-E2', name: '损失范围', question: '原告主张的各项损失是否有票据或鉴定意见支撑？', cause: '机动车交通事故责任纠纷', caseWords: ['民初', '民终'], updatedAt: '2026-09-05' },
                { id: 'F002-E3', name: '子女抚养意愿', question: '子女年满八周岁的，其本人愿意随哪一方生活？', cause: '离婚纠纷', caseWords: ['民初', '民终'], updatedAt: '2026-07-20' }
            ]
        },
        {
            id: 'F003', name: '张明远', dept: '民二庭', title: '一级法官',
            templates: [
                { id: 'F003-T1', name: '建设工程合同纠纷判决书', docType: '民事判决书（一审普通程序）', updatedAt: '2026-09-09', enabled: true, content: BODY.judgment('建设工程施工合同纠纷', '某建筑公司', '某地产公司') },
                { id: 'F003-T2', name: '财产保全裁定书模板', docType: '民事裁定书', updatedAt: '2026-08-15', enabled: true, content: BODY.ruling('买卖合同纠纷') },
                { id: 'F003-T3', name: '房屋租赁合同纠纷判决书', docType: '民事判决书（一审普通程序）', updatedAt: '2026-06-18', enabled: true, content: BODY.judgment('房屋租赁合同纠纷', '孙某', '周某') },
                { id: 'F003-T4', name: '股权转让纠纷判决书', docType: '民事判决书（一审普通程序）', updatedAt: '2026-05-30', enabled: true, content: BODY.judgment('股权转让纠纷', '吴某', '郑某') },
                { id: 'F003-T5', name: '交通事故简易判决模板', docType: '民事判决书（简易程序）', updatedAt: '2026-07-04', enabled: false, content: BODY.simpleJudgment('机动车交通事故责任纠纷', '冯某', '陈某') }
            ],
            prompts: [
                { id: 'F003-P1', name: '工程款结算争议审查', docType: '民事判决书（一审普通程序）', updatedAt: '2026-09-03', content: '重点审查：合同价款约定、工程量签证、竣工验收情况、已付款项、质保金约定。对鉴定意见应说明采信与否的理由。' },
                { id: 'F003-P2', name: '争议焦点归纳', docType: '通用', updatedAt: '2026-08-02', content: '请将双方诉辩意见归纳为 2-4 个争议焦点，每个焦点用一句话概括，作为"本院认为"部分的分段依据。' },
                { id: 'F003-P3', name: '法条引用规范化', docType: '通用', updatedAt: '2026-07-15', content: '引用法律条文请精确到条、款、项，使用《中华人民共和国民法典》全称，避免使用简称或俗称。' }
            ],
            elements: [
                { id: 'F003-E1', name: '工程量确认', question: '施工过程中形成的签证、变更单是否经双方确认？', cause: '建设工程施工合同纠纷', caseWords: ['民初', '民终'], updatedAt: '2026-09-08' },
                { id: 'F003-E2', name: '竣工验收', question: '工程是否已竣工验收？未验收即投入使用的，发包人主张质量异议是否成立？', cause: '建设工程施工合同纠纷', caseWords: ['民初', '民终'], updatedAt: '2026-09-08' },
                { id: 'F003-E3', name: '租金支付情况', question: '承租人欠付租金的期间与金额？出租人是否履行催告义务？', cause: '房屋租赁合同纠纷', caseWords: ['民初', '民终'], updatedAt: '2026-06-15' }
            ]
        },
        {
            id: 'F004', name: '陈静', dept: '民二庭', title: '三级法官',
            templates: [
                { id: 'F004-T1', name: '房屋租赁合同纠纷调解书', docType: '民事调解书', updatedAt: '2026-08-30', enabled: true, content: BODY.mediation('房屋租赁合同纠纷', '孙某', '周某') },
                { id: 'F004-T2', name: '劳动争议判决书（欠薪）', docType: '民事判决书（一审普通程序）', updatedAt: '2026-07-09', enabled: true, content: BODY.judgment('劳动争议', '蒋某', '某科技公司') }
            ],
            prompts: [
                { id: 'F004-P1', name: '劳动关系认定', docType: '民事判决书（一审普通程序）', updatedAt: '2026-07-08', content: '请围绕人格从属性、经济从属性、组织从属性三方面论证劳动关系是否成立，并结合考勤、工资发放、社保缴纳等证据说明。' }
            ],
            elements: [
                { id: 'F004-E1', name: '欠薪金额', question: '用人单位欠付工资的具体期间、金额及计算方式？', cause: '劳动争议', caseWords: ['民初', '民终'], updatedAt: '2026-07-05' },
                { id: 'F004-E2', name: '解除合法性', question: '用人单位解除劳动合同是否符合法定情形？是否履行通知工会程序？', cause: '劳动争议', caseWords: ['民初', '民终'], updatedAt: '2026-07-05' },
                { id: 'F004-E3', name: '租赁物瑕疵', question: '租赁房屋是否存在影响正常使用的瑕疵？出租人是否及时维修？', cause: '房屋租赁合同纠纷', caseWords: ['民初', '民终'], updatedAt: '2026-08-28' },
                { id: 'F004-E4', name: '押金退还', question: '合同终止后押金是否应予退还？是否存在可抵扣情形？', cause: '房屋租赁合同纠纷', caseWords: ['民初', '民终'], updatedAt: '2026-08-28' }
            ]
        },
        {
            id: 'F005', name: '刘志强', dept: '刑庭', title: '一级法官',
            templates: [
                { id: 'F005-T1', name: '交通肇事罪判决书', docType: '刑事判决书', updatedAt: '2026-09-07', enabled: true, content: BODY.criminal('交通肇事罪', '韩某') },
                { id: 'F005-T2', name: '盗窃罪判决书（认罪认罚）', docType: '刑事判决书', updatedAt: '2026-08-21', enabled: true, content: BODY.criminal('盗窃罪', '杨某') },
                { id: 'F005-T3', name: '故意伤害罪判决书', docType: '刑事判决书', updatedAt: '2026-06-25', enabled: true, content: BODY.criminal('故意伤害罪', '朱某') }
            ],
            prompts: [
                { id: 'F005-P1', name: '量刑情节说理', docType: '刑事判决书', updatedAt: '2026-08-20', content: '请逐项说明从重、从轻、减轻处罚情节：自首、坦白、认罪认罚、赔偿谅解、累犯等，并说明对量刑的影响幅度。' },
                { id: 'F005-P2', name: '证据采信说明', docType: '刑事判决书', updatedAt: '2026-07-12', content: '对控辩双方有争议的证据，应说明采信与否的理由；对非法证据排除申请，应明确回应。' }
            ],
            elements: [
                { id: 'F005-E1', name: '事故责任划分', question: '行为人在交通事故中承担何种责任？是否负主要以上责任？', cause: '交通肇事罪', caseWords: ['刑初', '刑终'], updatedAt: '2026-09-06' },
                { id: 'F005-E2', name: '危害后果', question: '事故造成的人员伤亡或财产损失情况？是否属"重大事故"？', cause: '交通肇事罪', caseWords: ['刑初', '刑终'], updatedAt: '2026-09-06' },
                { id: 'F005-E3', name: '盗窃数额', question: '涉案财物价值鉴定意见是多少？是否达到数额较大标准？', cause: '盗窃罪', caseWords: ['刑初', '刑终'], updatedAt: '2026-08-18' }
            ]
        },
        {
            id: 'F006', name: '赵雪', dept: '刑庭', title: '二级法官',
            templates: [
                { id: 'F006-T1', name: '诈骗罪判决书（电信网络）', docType: '刑事判决书', updatedAt: '2026-09-04', enabled: true, content: BODY.criminal('诈骗罪', '秦某') },
                { id: 'F006-T2', name: '盗窃罪简易判决模板', docType: '刑事判决书', updatedAt: '2026-07-28', enabled: true, content: BODY.criminal('盗窃罪', '许某') }
            ],
            prompts: [
                { id: 'F006-P1', name: '涉案财物处理', docType: '刑事判决书', updatedAt: '2026-08-11', content: '请在判决主文中一并处理涉案财物：责令退赔被害人损失、没收作案工具、追缴违法所得。' }
            ],
            elements: [
                { id: 'F006-E1', name: '非法占有目的', question: '行为人是否具有非法占有目的？请结合资金去向、履约能力说明。', cause: '诈骗罪', caseWords: ['刑初', '刑终'], updatedAt: '2026-09-02' },
                { id: 'F006-E2', name: '欺骗手段', question: '行为人采取了何种虚构事实或隐瞒真相的手段？', cause: '诈骗罪', caseWords: ['刑初', '刑终'], updatedAt: '2026-09-02' }
            ]
        },
        {
            id: 'F007', name: '孙浩', dept: '行政庭', title: '二级法官',
            templates: [
                { id: 'F007-T1', name: '行政处罚案件判决书', docType: '行政判决书', updatedAt: '2026-08-08', enabled: true, content: '行 政 判 决 书\n\n（2026）粤01行初XXXX号\n\n原告：某公司。\n被告：某市市场监督管理局。\n\n原告不服被告作出的行政处罚决定，向本院提起行政诉讼。本院依法组成合议庭，公开开庭审理了本案。\n\n本院认为，被告作出的被诉行政行为证据确凿，适用法律、法规正确，符合法定程序。\n\n依照《中华人民共和国行政诉讼法》第六十九条之规定，判决如下：\n\n驳回原告的诉讼请求。\n\n案件受理费50元，由原告负担。\n\n审判长　　[审判长姓名]\n二○二六年X月X日\n书记员　　[书记员姓名]' }
            ],
            prompts: [
                { id: 'F007-P1', name: '行政行为合法性审查', docType: '行政判决书', updatedAt: '2026-08-05', content: '请从职权依据、事实认定、适用法律、程序正当四个方面审查被诉行政行为的合法性，并逐一作出评价。' }
            ],
            elements: [
                { id: 'F007-E1', name: '职权依据', question: '被告作出被诉行政行为是否具有法定职权？', cause: '行政处罚', caseWords: ['行初', '行终'], updatedAt: '2026-08-01' },
                { id: 'F007-E2', name: '程序正当', question: '被告是否履行了告知、听取陈述申辩、听证等法定程序？', cause: '行政处罚', caseWords: ['行初', '行终'], updatedAt: '2026-08-01' }
            ]
        },
        {
            id: 'F008', name: '周雅琴', dept: '民一庭', title: '三级法官',
            templates: [
                { id: 'F008-T1', name: '离婚纠纷调解书', docType: '民事调解书', updatedAt: '2026-09-05', enabled: true, content: BODY.mediation('离婚纠纷', '吕某', '施某') },
                { id: 'F008-T2', name: '民间借贷简易判决模板', docType: '民事判决书（简易程序）', updatedAt: '2026-08-12', enabled: true, content: BODY.simpleJudgment('民间借贷纠纷', '张某', '李某') }
            ],
            prompts: [
                { id: 'F008-P1', name: '夫妻共同财产分割', docType: '民事判决书（一审普通程序）', updatedAt: '2026-09-01', content: '请先界定夫妻共同财产范围，再说明分割原则（照顾子女、女方和无过错方权益），逐项列明财产归属。' }
            ],
            elements: [
                { id: 'F008-E1', name: '感情是否破裂', question: '有哪些证据可以证明夫妻感情确已破裂？是否存在法定离婚情形？', cause: '离婚纠纷', caseWords: ['民初', '民终'], updatedAt: '2026-09-03' },
                { id: 'F008-E2', name: '共同财产范围', question: '需要分割的夫妻共同财产有哪些？是否存在婚前财产或个人财产混同？', cause: '离婚纠纷', caseWords: ['民初', '民终'], updatedAt: '2026-09-03' }
            ]
        }
    ];

    // ===== 对外接口 =====
    global.MockUserTemplates = {
        judges: MOCK_JUDGES,
        docTypeCauses: DOC_TYPE_CAUSES,
        officialDocTypeCoverage: OFFICIAL_DOCTYPE_COVERAGE,
        officialElementCauseCoverage: OFFICIAL_ELEMENT_CAUSE_COVERAGE,

        // 按关键字（姓名 / 工号）检索法官
        searchJudges: function (keyword, dept) {
            var kw = (keyword || '').trim();
            var list = MOCK_JUDGES.filter(function (j) {
                if (dept && dept !== 'all' && j.dept !== dept) return false;
                if (!kw) return false;
                return j.name.indexOf(kw) >= 0 || j.id.indexOf(kw) >= 0;
            });
            return list;
        },

        // 部门列表（去重）
        getDepartments: function () {
            var seen = {}, out = [];
            MOCK_JUDGES.forEach(function (j) {
                if (!seen[j.dept]) { seen[j.dept] = 1; out.push(j.dept); }
            });
            return out;
        },

        // 全院统计：建了模板的法官数 + 各类总数
        getOverview: function () {
            var judgesWithTpl = 0, tpl = 0, pmt = 0, elm = 0;
            MOCK_JUDGES.forEach(function (j) {
                if ((j.templates || []).length) judgesWithTpl++;
                tpl += (j.templates || []).length;
                pmt += (j.prompts || []).length;
                elm += (j.elements || []).length;
            });
            return {
                judgeCount: MOCK_JUDGES.length,
                judgesWithTemplate: judgesWithTpl,
                templateCount: tpl,
                promptCount: pmt,
                elementCount: elm
            };
        },

        // 模板 / 指令 按【文书类型】分布（二者均挂在文书类型下，本身不绑案由）
        getDocTypeDistribution: function () {
            var byType = {};
            function slot(k) {
                if (!byType[k]) byType[k] = { tpl: 0, pmt: 0, judges: {} };
                return byType[k];
            }
            MOCK_JUDGES.forEach(function (j) {
                (j.templates || []).forEach(function (t) {
                    var s = slot(t.docType || '未分类');
                    s.tpl++; s.judges[j.name] = 1;
                });
                (j.prompts || []).forEach(function (p) {
                    var s = slot(p.docType || '通用');
                    s.pmt++; s.judges[j.name] = 1;
                });
            });

            var keys = {};
            Object.keys(OFFICIAL_DOCTYPE_COVERAGE).forEach(function (k) { keys[k] = 1; });
            Object.keys(byType).forEach(function (k) { keys[k] = 1; });

            return Object.keys(keys).map(function (k) {
                var official = OFFICIAL_DOCTYPE_COVERAGE[k] || 0;
                var d = byType[k] || { tpl: 0, pmt: 0, judges: {} };
                return {
                    docType: k,
                    causes: DOC_TYPE_CAUSES[k] || [],
                    officialCount: official,
                    templateCount: d.tpl,
                    promptCount: d.pmt,
                    judgeNames: Object.keys(d.judges),
                    // "通用"指令不限文书类型，不存在"该类型缺官方模板"的说法，不参与缺口判定
                    isGeneral: k === '通用',
                    // 官方无标准模板、但法官已自建模板或指令 → 收编候选
                    isGap: k !== '通用' && official === 0 && (d.tpl + d.pmt) > 0
                };
            }).sort(function (a, b) {
                if (a.isGap !== b.isGap) return a.isGap ? -1 : 1;
                return (b.templateCount + b.promptCount) - (a.templateCount + a.promptCount);
            });
        },

        // 要件 按【案由】分布（要件本身按案由索引）
        getElementCauseDistribution: function () {
            var byCause = {};
            MOCK_JUDGES.forEach(function (j) {
                (j.elements || []).forEach(function (e) {
                    if (!e.cause) return;
                    if (!byCause[e.cause]) byCause[e.cause] = { count: 0, judges: {} };
                    byCause[e.cause].count++;
                    byCause[e.cause].judges[j.name] = 1;
                });
            });

            var keys = {};
            Object.keys(OFFICIAL_ELEMENT_CAUSE_COVERAGE).forEach(function (c) { keys[c] = 1; });
            Object.keys(byCause).forEach(function (c) { keys[c] = 1; });

            return Object.keys(keys).map(function (cause) {
                var official = OFFICIAL_ELEMENT_CAUSE_COVERAGE[cause] || 0;
                var d = byCause[cause] || { count: 0, judges: {} };
                return {
                    cause: cause,
                    officialCount: official,
                    elementCount: d.count,
                    judgeNames: Object.keys(d.judges),
                    // 官方无标准要件、但法官已自建 → 收编候选
                    isGap: official === 0 && d.count > 0
                };
            }).sort(function (a, b) {
                if (a.isGap !== b.isGap) return a.isGap ? -1 : 1;
                return b.elementCount - a.elementCount;
            });
        }
    };
})(window);
