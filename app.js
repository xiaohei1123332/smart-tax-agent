/* 智税通 · 界面层 */
(function () {
  var D = window.DATA, E = window.Engine, C = D.COMPANY;
  var app = document.getElementById('app');

  var R = E.compute();
  var POL = E.policies(R);
  var RISK = E.risk(R);
  var FORMS = E.forms(R);
  var CHECKS = E.checks(R);

  var view = 'company';
  var kgSel = null;
  var polFilter = 'all';
  var polQuery = '';
  var polSel = POL.filter(function (p) { return p.id === 'P03'; })[0];
  var parsed = true;
  var unread = D.NOTICES.length;
  var formTab = 'vat';
  var chat = [];

  /* ---------------- 工具 ---------------- */
  function money(n) {
    if (n === null || n === undefined) return '—';
    var neg = n < 0;
    var s = Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '-' : '') + s;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function pctv(n, d) { return (n / d * 100).toFixed(2) + '%'; }
  function daysTo(d) { return Math.ceil((new Date(d + 'T23:59:59').getTime() - Date.now()) / 86400000); }
  function daysText(d) {
    var n = daysTo(d);
    if (n > 1) return n + ' 天后';
    if (n === 1) return '明天';
    if (n === 0) return '今天截止';
    return '已逾期 ' + Math.abs(n) + ' 天';
  }
  function toast(msg) {
    var el = document.getElementById('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
    el.textContent = msg;
    el.className = 'show';
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.className = ''; }, 2200);
  }
  function badge(status) {
    if (status === 'enjoyed') return '<span class="chip ok">已享受</span>';
    if (status === 'available') return '<span class="chip info">可享受</span>';
    return '<span class="chip line" style="color:#8d9ab5">暂不满足</span>';
  }

  /* ---------------- 壳 ---------------- */
  function head(title, sub, extra) {
    return '<div class="page-head"><div><h1>' + title + '</h1><p>' + sub + '</p></div>' +
      (extra ? '<div class="btn-row">' + extra + '</div>' : '') + '</div>';
  }

  /* ---------------- 企业中心 ---------------- */
  function vCompany() {
    var applicable = POL.filter(function (p) { return p.status !== 'unmet'; });
    var saving = POL.reduce(function (s, p) { return s + (p.saving || 0); }, 0);
    var rows = [
      ['统一社会信用代码', C.creditCode],
      ['所属行业', C.industry],
      ['纳税人身份', C.vatType],
      ['规模认定', C.scaleTag + '（从业 ' + C.staff + ' 人 / 资产 ' + money(C.assets / 10000).replace('.00', '') + ' 万元）'],
      ['注册地', C.regPlace],
      ['纳税信用等级', C.creditRating + ' 级'],
      ['当前所属期', C.period + '（' + C.periodRange + '）'],
      ['登记税种', C.taxItems.join('、')]
    ];
    var html = head('企业中心', '企业画像决定政策适配与风险基线，此处为全部推理的起点',
      '<button class="btn primary" data-act="goto" data-view="declare">去计税申报</button>');

    html += '<div class="grid g4" style="margin-bottom:16px">' +
      kpi('年营业收入', money(C.yearRevenue), '上年度 · 万元口径 ' + money(C.yearRevenue / 10000).replace('.00', '')) +
      kpi('当期利润总额', money(C.profit), '较上期 +' + pctv(C.profit - 200000, 200000)) +
      kpi('当期营业收入', money(C.revenue), '不含税 · 环比 +' + pctv(C.revenue - C.lastRevenue, C.lastRevenue)) +
      kpi('可适用政策', applicable.length + ' 项', '其中已享受 ' + POL.filter(function (p) { return p.status === 'enjoyed'; }).length + ' 项')
      + '</div>';

    html += '<div class="grid g-2-1">';
    html += '<div class="card"><h3>企业画像</h3><p class="sub">由工商、税务登记与财务数据自动构建</p>' +
      '<dl class="kv">' + rows.map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join('') + '</dl></div>';

    html += '<div class="card"><h3>资质证照</h3><p class="sub">决定优惠资格的关键凭证</p><div class="rows">' +
      C.certs.map(function (c) {
        return '<div class="row"><div class="ico g">✓</div><div class="grow"><div class="t">' + esc(c.name) + '</div>' +
          '<div class="d">' + esc(c.no) + ' · 有效期至 ' + c.validTo + '</div></div></div>';
      }).join('') + '</div></div>';
    html += '</div>';

    html += '<div class="grid g3" style="margin-top:16px">';
    html += '<div class="card"><h3>财税指标</h3><p class="sub">与行业均值对照</p>' +
      indicator('增值税税负率', RISK.indicators.vatBurden, D.INDUSTRY.vatBurden, '%') +
      indicator('毛利率', RISK.indicators.margin, D.INDUSTRY.grossMargin, '%') +
      indicator('研发投入强度', C.rdExpense * 4 / C.yearRevenue, D.INDUSTRY.rdRatio, '%') +
      '</div>';

    html += '<div class="card"><h3>政策适配摘要</h3><p class="sub">58 项政策库实时匹配</p>' +
      '<div class="rows">' +
      sumRow('已享受', POL.filter(function (p) { return p.status === 'enjoyed'; }).length, 'ok') +
      sumRow('可享受', POL.filter(function (p) { return p.status === 'available'; }).length, 'info') +
      sumRow('暂不满足', POL.filter(function (p) { return p.status === 'unmet'; }).length, 'line') +
      '</div>' +
      '<div class="note" style="margin-top:14px">当前可量化减免合计 <b class="mono">' + money(saving) + '</b> 元' +
      '（含软件产品即征即退测算）</div>' +
      '<div class="btn-row" style="margin-top:12px"><button class="btn sm" data-act="goto" data-view="policy">查看全部政策</button></div>' +
      '</div>';

    html += '<div class="card"><h3>适用税种与申报频次</h3><p class="sub">自动生成的申报日历</p>' +
      '<table><thead><tr><th>税种</th><th>申报周期</th><th class="r">状态</th></tr></thead><tbody>' +
      [['增值税', '月报'], ['城市维护建设税', '月报'], ['教育费附加', '月报'], ['地方教育附加', '月报'],
       ['企业所得税', '季报预缴'], ['印花税', '按次/月报']].map(function (t) {
        return '<tr><td>' + t[0] + '</td><td class="dim">' + t[1] + '</td><td class="r"><span class="chip warn">待申报</span></td></tr>';
      }).join('') +
      '</tbody></table></div>';
    html += '</div>';
    return html;
  }

  function kpi(label, val, sub) {
    return '<div class="card"><div class="kpi-sub">' + label + '</div>' +
      '<div class="kpi mono">' + val + '</div><div class="kpi-sub">' + sub + '</div></div>';
  }
  function indicator(label, val, base, unit) {
    var w = Math.min(100, val / (base * 2) * 100);
    var hi = val > base;
    return '<div style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;font-size:12.5px">' +
      '<span class="muted">' + label + '</span><span class="mono">' + (val * 100).toFixed(2) + (unit || '%') +
      ' <span class="dim">/ 行业 ' + (base * 100).toFixed(2) + (unit || '%') + '</span></span></div>' +
      '<div class="bar ' + (hi ? 'a' : 't') + '" style="margin-top:5px"><i style="width:' + w + '%"></i></div></div>';
  }
  function sumRow(label, n, cls) {
    return '<div class="row"><div class="grow"><span class="chip ' + cls + '">' + n + ' 项</span></div>' +
      '<div class="dim">' + label + '</div></div>';
  }

  /* ---------------- 数据上传 ---------------- */
  var SOURCES = [
    { n: '财务系统（用友 NC）', d: '凭证、科目余额表 · 增量同步', s: 'ok' },
    { n: '发票系统（税控盘）', d: '全电发票全量归集 · T+1', s: 'ok' },
    { n: '银行流水（银企直连）', d: '基本户与一般户 · 每日对账', s: 'ok' },
    { n: '合同与凭证影像', d: 'PDF / 扫描件 · OCR 抽取', s: 'ok' }
  ];

  function vUpload() {
    var html = head('数据上传', '多源采集 → 清洗去重 → 标准化 → 勾稽校验，四步完成业务数据到税务数据的转换',
      '<button class="btn" data-act="parse">重新解析样例数据</button>');

    html += '<div class="grid g-2-1 top">';
    html += '<div class="card"><h3>数据源接入</h3><p class="sub">结构化与非结构化数据统一采集</p>' +
      '<div class="grid g2">' + SOURCES.map(function (s) {
        return '<div class="row" style="border:1px solid var(--line);border-radius:11px;padding:11px">' +
          '<div class="ico g">◉</div><div class="grow"><div class="t">' + esc(s.n) + '</div>' +
          '<div class="d">' + esc(s.d) + '</div></div></div>';
      }).join('') + '</div></div>';

    html += '<div class="card"><div class="drop" id="drop"><div class="big">拖拽文件到此处上传</div>' +
      '<div class="dim">支持 PDF / JPG / PNG 合同与扫描凭证，Excel / CSV 台账</div></div>' +
      '<input type="file" id="fileInput" hidden multiple accept=".pdf,.jpg,.jpeg,.png,.xlsx,.csv">' +
      '<div id="parseLog" style="margin-top:12px;font-size:12.5px;color:var(--ink2)">解析状态：<b>已完成（样例数据）</b></div>' +
      '</div>';
    html += '</div>';

    var dup = R.clean.dup.length;
    var bad = R.clean.rows.filter(function (x) { return x.type === 'in' && (x.status === 'nodeduct' || x.status === 'transfer'); }).length;
    var red = R.clean.rows.filter(function (x) { return x.status === 'red'; }).length;

    html += '<div class="grid g4" style="margin:16px 0">' +
      kpi('有效凭证', R.clean.rows.length + ' 张', '含销项 6 / 进项 ' + (R.clean.rows.length - 6)) +
      kpi('去重剔除', dup + ' 张', '发票代码+号码重复入账') +
      kpi('抵扣瑕疵', bad + ' 张', '普票 / 缺税号 / 福利支出') +
      kpi('红冲凭证', red + ' 张', '按负数计入销项') +
      '</div>';

    html += '<div class="card pad0"><div class="card-head"><h3>票据明细（清洗后）</h3>' +
      '<span class="chip info">口径：含税金额 → 不含税 + 税额</span></div>' +
      '<div class="card-body" style="padding:0"><table><thead><tr>' +
      '<th>类型</th><th>发票号码</th><th>项目</th><th class="r">税率</th><th class="r">含税金额</th>' +
      '<th class="r">不含税</th><th class="r">税额</th><th>处理结果</th></tr></thead><tbody>' +
      R.clean.rows.map(function (x) {
        var cls = x.type === 'out' ? 'chip info' : 'chip teal';
        var noteCls = x.status === 'ok' ? 'dim' : (x.status === 'nodeduct' || x.status === 'transfer') ? 'chip warn' : 'chip';
        return '<tr' + (x.status === 'nodeduct' || x.status === 'transfer' ? ' class="unmet"' : '') + '>' +
          '<td><span class="' + cls + '">' + (x.type === 'out' ? '销项' : '进项') + '</span></td>' +
          '<td class="mono dim" style="font-size:11.5px">' + x.no + '</td>' +
          '<td>' + esc(x.name) + '<div class="d dim" style="font-size:11.5px">' + esc(x.party) + '</div></td>' +
          '<td class="r mono">' + x.rate + '%</td>' +
          '<td class="r mono">' + money(x.gross) + '</td>' +
          '<td class="r mono">' + money(x.net) + '</td>' +
          '<td class="r mono">' + money(x.tax) + '</td>' +
          '<td><span class="' + noteCls + '">' + esc(x.note) + '</span></td></tr>';
      }).join('') +
      '</tbody></table></div></div>';

    html += '<div class="card" style="margin-top:16px"><h3>清洗流水</h3><p class="sub">每一步都可追溯到原始凭证</p>' +
      '<div class="rows">' +
      [['① 抽取', '从发票、合同、流水抽取金额、税率、对方主体、开票日期', '4 类数据源 · 已完成'],
       ['② 去重', '按"发票代码 + 号码"判重，重复项剔除并保留首次入账记录', '剔除 ' + dup + ' 张'],
       ['③ 校验', '购买方税号完整性、红冲配对、税率与业务类型一致性检查', '标记 ' + bad + ' 张瑕疵'],
       ['④ 标准化', '含税金额拆分为不含税金额与税额，科目按财税口径归集', '生成 ' + R.clean.rows.length + ' 条标准记录']
      ].map(function (s) {
        return '<div class="row"><div class="ico">' + s[0].slice(0, 1) + '</div><div class="grow">' +
          '<div class="t">' + s[0] + '</div><div class="d">' + s[1] + '</div></div>' +
          '<span class="chip">' + s[2] + '</span></div>';
      }).join('') + '</div></div>';
    return html;
  }

  /* ---------------- 计税申报 ---------------- */
  function vDeclare() {
    var st = E.state;
    var html = head('计税申报', '按税法规则自动计税，生成规范申报表，支持人工复核后一键提交',
      '<button class="btn" data-act="dl" data-form="all">下载全套申报表</button>' +
      (st.submitted
        ? '<button class="btn" disabled>已提交</button>'
        : '<button class="btn primary" data-act="submit">一键批量申报</button>'));

    html += '<div class="grid g4" style="margin-bottom:16px">' +
      taxCard('增值税', R.vat.payable, '销项 ' + money(R.vat.outTax) + ' − 进项 ' + money(R.vat.inTax) + ' + 转出 ' + money(R.vat.transferOut), 'primary') +
      taxCard('附加税费', R.sur.payable, '计税依据 ' + money(R.sur.base) + '，减征 ' + money(R.sur.relief), '') +
      taxCard('企业所得税', R.cit.actual, '应纳税所得额 ' + money(R.cit.taxable) + '，减免 ' + money(R.cit.relief), '') +
      taxCard('印花税', R.stamp.payable, '计税依据 ' + money(R.stamp.base) + '，减半 ' + money(R.stamp.relief), '') +
      '</div>';

    html += '<div class="grid g-2-1 top" style="margin-bottom:16px">';
    html += '<div class="card"><h3>本期应纳合计</h3><p class="sub">所属期 ' + C.period + '（' + C.periodRange + '）</p>' +
      '<div style="display:flex;align-items:flex-end;gap:18px;flex-wrap:wrap">' +
      '<div><div class="kpi mono" style="font-size:34px">' + money(R.total) + '</div>' +
      '<div class="kpi-sub">元 · 四税种合计</div></div>' +
      '<div style="border-left:1px solid var(--line);padding-left:18px">' +
      '<div class="kpi-sub">享受减免合计</div><div class="kpi sm mono" style="color:var(--teal)">' + money(R.reliefTotal) + '</div>' +
      '</div><div style="border-left:1px solid var(--line);padding-left:18px">' +
      '<div class="kpi-sub">综合税负率</div><div class="kpi sm mono">' + (R.total / C.revenue * 100).toFixed(2) + '%</div>' +
      '</div></div>';
    if (st.submitted) {
      html += '<div class="note" style="margin-top:16px">已提交，回执号 <b class="mono">' + st.receiptNo + '</b> · 提交时间 ' + st.submittedAt +
        ' · 状态：处理中，一般 2 小时内反馈受理结果</div>';
    } else {
      html += '<div class="note" style="margin-top:16px">提交前请核对下方勾稽校验结果。申报表数据支持下载归档，回执号自动生成。</div>';
    }
    html += '</div>';

    html += '<div class="card"><h3>勾稽校验</h3><p class="sub">跨表数据一致性检查，任一项不通过不得提交</p>' +
      '<div class="rows">' + CHECKS.map(function (c) {
        return '<div class="row"><div class="ico ' + (c.pass ? 'g' : 'r') + '">' + (c.pass ? '✓' : '!') + '</div>' +
          '<div class="grow"><div class="t">' + esc(c.name) + '</div><div class="d">' + esc(c.tip) + '</div></div>' +
          '<div class="mono dim" style="font-size:12px;text-align:right">' + money(c.a) + (c.unit === '元' ? ' 元' : '') + '</div></div>';
      }).join('') + '</div></div>';
    html += '</div>';

    /* 申报表 */
    html += '<div class="card pad0" style="margin-top:16px">';
    html += '<div class="card-head"><h3>申报表预览</h3><div class="btn-row">' +
      [['vat', '增值税及附加'], ['cit', '企业所得税'], ['stamp', '印花税']].map(function (t) {
        return '<button class="btn sm' + (formTab === t[0] ? ' primary' : '') + '" data-act="tab" data-tab="' + t[0] + '">' + t[1] + '</button>';
      }).join('') +
      '<button class="btn sm" data-act="dl" data-form="' + formTab + '">下载本表</button></div></div>';

    var f = FORMS[formTab];
    html += '<div class="card-body" style="padding:0"><div style="padding:16px 18px 6px">' +
      '<div style="font-size:15px;font-weight:600">' + f.title + '</div>' +
      '<div class="dim" style="font-size:12px">纳税人：' + C.name + ' · 纳税人识别号：' + C.creditCode + ' · 税款所属期：' + f.period + '</div>' +
      '</div><table><thead><tr><th style="width:90px">行次</th><th>项目</th><th class="r">本期金额（元）</th></tr></thead><tbody>' +
      f.rows.map(function (r) {
        var v = r[2] === null ? (r[1].indexOf('税率') >= 0 ? (formTab === 'cit' ? '25%' : '0.03%') : '—') : money(r[2]);
        return '<tr><td class="mono dim">' + r[0] + '</td><td>' + r[1] + '</td><td class="r mono">' + v + '</td></tr>';
      }).join('') +
      '</tbody></table>' +
      '<div style="padding:14px 18px"><div class="note">' + faceNote() + '</div></div></div></div>';
    return html;
  }

  function faceNote() {
    if (formTab === 'vat') return '<b>计税口径：</b>一般纳税人按销项税额减进项税额计算，进项税额须为已认证的扣税凭证；' +
      '用于集体福利的已认证进项须作转出。附加税费以实际应缴增值税为计税依据，小型微利企业按"六税两费"政策减半征收。';
    if (formTab === 'cit') return '<b>计税口径：</b>预缴按累计利润总额扣除纳税调整减少额（研发费用加计扣除）后的应纳税所得额计算；' +
      '小型微利企业减按25%计入应纳税所得额、按20%税率征收，实际税负5%。本演示按当期口径简化，实务以累计数填报 A 类预缴表。';
    return '<b>计税口径：</b>印花税按合同列明金额（不含增值税）乘以万分之三计算；' +
      '小型微利企业可享受"六税两费"减半。同一应税凭证多方签订的，各方均须各自全额计税。';
  }

  function taxCard(name, val, sub, cls) {
    return '<div class="card"><div class="kpi-sub">' + name + '</div>' +
      '<div class="kpi mono" style="font-size:22px">' + money(val) + '</div>' +
      '<div class="kpi-sub" style="line-height:1.5">' + sub + '</div></div>';
  }

  /* ---------------- 政策中心 ---------------- */
  function vPolicy() {
    var cnt = { enjoyed: 0, available: 0, unmet: 0 };
    POL.forEach(function (p) { cnt[p.status]++; });
    var html = head('政策中心', '58 项税收政策 · 按企业画像自动适配，区分已享受、可享受与暂不满足',
      '<button class="btn" data-act="goto" data-view="risk">查看风险看板</button>');

    html += '<div class="grid g4" style="margin-bottom:16px">' +
      kpi('政策库总量', POL.length + ' 项', '覆盖 ' + uniqueTax().length + ' 个税种') +
      kpi('已享受', cnt.enjoyed + ' 项', '已进入本期计税') +
      kpi('可享受', cnt.available + ' 项', '条件满足，待申请') +
      kpi('暂不满足', cnt.unmet + ' 项', '缺口即优化方向') +
      '</div>';

    html += '<div class="grid g-2-1 top">';
    html += '<div class="card pad0"><div class="card-head"><h3>政策适配分析</h3>' +
      '<div class="btn-row">' +
      ['all', 'enjoyed', 'available', 'unmet'].map(function (k) {
        var m = { all: '全部', enjoyed: '已享受', available: '可享受', unmet: '暂不满足' };
        return '<button class="btn sm' + (polFilter === k ? ' primary' : '') + '" data-act="filter" data-k="' + k + '">' + m[k] + '</button>';
      }).join('') +
      '</div></div>' +
      '<div style="padding:12px 14px;border-bottom:1px solid var(--line)"><input type="text" id="polSearch" placeholder="搜索政策名称、税种或文号…" value="' + esc(polQuery) + '"></div>' +
      '<div style="max-height:520px;overflow:auto"><table><thead><tr><th>政策</th><th>税种</th><th>优惠方式</th><th class="r">测算减免</th><th>适配</th></tr></thead><tbody id="polBody">' +
      polRows() + '</tbody></table></div></div>';

    html += '<div class="card" id="polDetail">' + polDetail(polSel) + '</div>';
    html += '</div>';

    html += '<div class="card" style="margin-top:16px"><h3>税收知识图谱</h3>' +
      '<p class="sub">实体：税种 / 政策 / 表单 / 指标 / 风险点 / 企业事实 · 关系：适用、映射、触发、依赖 · 点击节点查看两跳溯源</p>' +
      '<div class="kg-wrap">' + kgSVG() + '</div>' +
      '<div id="kgDetail" style="margin-top:14px">' + kgDetail() + '</div></div>';
    return html;
  }

  function uniqueTax() {
    var s = {};
    POL.forEach(function (p) { s[p.taxType] = 1; });
    return Object.keys(s);
  }

  function polRows() {
    var list = POL.filter(function (p) {
      if (polFilter !== 'all' && p.status !== polFilter) return false;
      if (polQuery) {
        var q = polQuery.toLowerCase();
        return (p.name + p.taxType + p.doc).toLowerCase().indexOf(q) >= 0;
      }
      return true;
    });
    if (!list.length) return '<tr><td colspan="5"><div class="empty">没有匹配的政策</div></td></tr>';
    return list.map(function (p) {
      return '<tr data-act="pol" data-id="' + p.id + '" style="cursor:pointer"' +
        (polSel && polSel.id === p.id ? ' class="sel"' : '') + '>' +
        '<td><div style="max-width:260px">' + esc(p.name) + '</div>' +
        '<div class="dim" style="font-size:11.5px">' + esc(p.doc) + (p.verified ? '' : ' <span class="chip warn" style="padding:0 6px">文号待核</span>') + '</div></td>' +
        '<td class="dim">' + p.taxType + '</td>' +
        '<td><span class="chip">' + p.mode + '</span></td>' +
        '<td class="r mono">' + (p.saving ? money(p.saving) : '—') + '</td>' +
        '<td>' + badge(p.status) + '</td></tr>';
    }).join('');
  }

  function polDetail(p) {
    if (!p) return '<h3>政策详情</h3><div class="empty">从左侧列表选择一项政策</div>';
    var st = { enjoyed: '<span class="chip ok">已享受</span>', available: '<span class="chip info">可享受</span>', unmet: '<span class="chip line" style="color:#8d9ab5">暂不满足</span>' }[p.status];
    return '<h3 style="font-size:15px;line-height:1.5">' + esc(p.name) + ' ' + st + '</h3>' +
      '<dl class="kv" style="margin-top:14px">' +
      '<dt>政策依据</dt><dd>' + esc(p.doc) + (p.verified ? '' : ' <span class="chip warn">文号待核</span>') + '</dd>' +
      '<dt>涉及税种</dt><dd>' + p.taxType + '</dd>' +
      '<dt>优惠方式</dt><dd>' + p.mode + '（' + p.cat + '）</dd>' +
      '<dt>执行期限</dt><dd>' + p.validTo + '</dd>' +
      '<dt>适配结论</dt><dd>' + esc(p.reason) + '</dd>' +
      (p.saving ? '<dt>测算减免</dt><dd class="mono" style="color:var(--teal);font-weight:600">' + money(p.saving) + ' 元</dd>' : '') +
      '</dl>' +
      (p.status === 'available'
        ? '<div class="note" style="margin-top:14px"><b>留存备查资料：</b>享受该政策须留存' + esc(evidenceFor(p.id)) +
        '。优惠采取"自行判别、申报享受、相关资料留存备查"方式，资料缺失在税务检查中可能被追回。</div>'
        : '') +
      '<div class="btn-row" style="margin-top:14px"><button class="btn sm" data-act="kgJump" data-id="' + (kgNodeOf(p.id) || '') + '">在图谱中定位</button></div>';
  }

  function evidenceFor(id) {
    var m = {
      P03: '软件产品登记证书、软件产品检测报告、单独核算的进销项台账',
      P16: '从业人数、资产总额、应纳税所得额年度申报资料',
      P17: '研发项目立项决议、研发人员名单、工时分配表、研发费用辅助账',
      P36: '小型微利企业身份判定资料、申报表减免栏次填报记录',
      P37: '合同台账、印花税申报表',
      P06: '纳税信用等级证明、留抵税额计算表'
    };
    return m[id] || '政策要求的备案表、合同、发票与计算过程资料';
  }

  /* ---------------- 知识图谱 ---------------- */
  var LAYER_Y = { fact: 52, policy: 152, tax: 252, form: 345, metric: 442, risk: 535 };
  var LAYER_ORDER = ['fact', 'policy', 'tax', 'form', 'metric', 'risk'];

  function kgPos() {
    var groups = {}, pos = {};
    D.KG_NODES.forEach(function (n) { (groups[n.type] = groups[n.type] || []).push(n); });
    Object.keys(groups).forEach(function (t) {
      var arr = groups[t], n = arr.length, y = LAYER_Y[t] || 300;
      arr.forEach(function (nd, i) { pos[nd.id] = { x: 1000 * (i + 1) / (n + 1), y: y }; });
    });
    return pos;
  }
  var KG_POS = kgPos();

  function kgSVG() {
    var nb = function (id) { return D.KG_NODES.filter(function (n) { return n.id === id; })[0]; };
    var adjacent = {};
    if (kgSel) {
      D.KG_EDGES.forEach(function (e) {
        if (e.f === kgSel || e.t === kgSel) { adjacent[e.f] = 1; adjacent[e.t] = 1; }
      });
    }
    var s = '<svg viewBox="0 0 1000 585" preserveAspectRatio="xMidYMid meet">';
    /* edges */
    D.KG_EDGES.forEach(function (e, i) {
      var a = KG_POS[e.f], b = KG_POS[e.t];
      if (!a || !b) return;
      var cls = 'kg-edge';
      if (kgSel) cls += (e.f === kgSel || e.t === kgSel) ? ' hi' : ' dim';
      s += '<line class="' + cls + '" x1="' + a.x + '" y1="' + (a.y + 17) + '" x2="' + b.x + '" y2="' + (b.y - 17) + '"/>';
      if (kgSel && (e.f === kgSel || e.t === kgSel)) {
        s += '<text x="' + ((a.x + b.x) / 2) + '" y="' + ((a.y + b.y) / 2 - 4) + '" text-anchor="middle" font-size="9.5" fill="#1b5cff">' + e.r + '</text>';
      }
    });
    /* nodes */
    D.KG_NODES.forEach(function (n) {
      var p = KG_POS[n.id];
      if (!p) return;
      var cls = 'kg-node';
      if (kgSel) cls += (n.id === kgSel) ? ' on' : (adjacent[n.id] ? '' : ' dim');
      var fill = { tax: '#1b5cff', policy: '#00a396', form: '#c8871a', metric: '#5b6b8c', risk: '#d94a4a', fact: '#8d9ab5' }[n.type];
      s += '<g class="' + cls + '" data-act="kg" data-node="' + n.id + '" style="cursor:pointer">' +
        '<rect x="' + (p.x - 66) + '" y="' + (p.y - 17) + '" width="132" height="34" rx="8"/>' +
        '<rect x="' + (p.x - 66) + '" y="' + (p.y - 17) + '" width="4" height="34" rx="2" fill="' + fill + '"/>' +
        '<text x="' + p.x + '" y="' + p.y + '">' + n.label + '</text>' +
        '<title>' + n.label + '（' + n.type + '）</title></g>';
    });
    s += '</svg>';
    return s;
  }

  function kgDetail() {
    if (!kgSel) {
      var types = [
        ['税种', 'tax', '增值税、企业所得税、附加税费、印花税'],
        ['政策', 'policy', '优惠资格与适用条件'],
        ['表单', 'form', '税种到申报表的映射'],
        ['指标', 'metric', '取数来源与计算关系'],
        ['风险点', 'risk', '指标触发预警的路径'],
        ['企业事实', 'fact', '画像到政策的前置条件']
      ];
      return '<div class="grid g3">' + types.map(function (t) {
        var n = D.KG_NODES.filter(function (x) { return x.type === t[1]; }).length;
        return '<div class="row"><div class="ico">' + t[0].slice(0, 1) + '</div><div class="grow">' +
          '<div class="t">' + t[0] + ' <span class="dim">' + n + ' 个</span></div><div class="d">' + t[2] + '</div></div></div>';
      }).join('') + '</div>' +
        '<div class="note" style="margin-top:12px">共 ' + D.KG_NODES.length + ' 个实体、' + D.KG_EDGES.length +
        ' 条关系。点击任一节点，高亮其两跳以内邻居，并给出推理路径。</div>';
    }
    var n = D.KG_NODES.filter(function (x) { return x.id === kgSel; })[0];
    if (!n) return '';
    var out = D.KG_EDGES.filter(function (e) { return e.f === kgSel; });
    var inc = D.KG_EDGES.filter(function (e) { return e.t === kgSel; });
    var nm = function (id) { var k = D.KG_NODES.filter(function (x) { return x.id === id; })[0]; return k ? k.label : id; };

    var html = '<div class="grid g-2-1 top"><div>' +
      '<h3>' + n.label + ' <span class="chip info">' + n.type + '</span></h3>';
    if (n.ref) {
      var p = POL.filter(function (x) { return x.id === n.ref; })[0];
      if (p) html += '<div class="note" style="margin-top:10px">' + p.name + '<br><span class="dim">' + p.doc + '</span></div>';
    }
    html += '<div class="rows" style="margin-top:10px">';
    if (inc.length) html += '<div class="t" style="font-size:12.5px;color:var(--ink3);margin:6px 0">被指向（来源）</div>' +
      inc.map(function (e) {
        return '<div class="row"><div class="ico t">←</div><div class="grow"><div class="t">' + nm(e.f) + '</div>' +
          '<div class="d">关系：' + e.r + '</div></div></div>';
      }).join('');
    if (out.length) html += '<div class="t" style="font-size:12.5px;color:var(--ink3);margin:6px 0">指向（去向）</div>' +
      out.map(function (e) {
        return '<div class="row"><div class="ico">→</div><div class="grow"><div class="t">' + nm(e.t) + '</div>' +
          '<div class="d">关系：' + e.r + '</div></div></div>';
      }).join('');
    if (!inc.length && !out.length) html += '<div class="empty">该节点暂无关联</div>';
    html += '</div></div><div>';
    html += '<div class="note"><b>两跳路径示例</b><br>' + twoHop(kgSel) + '</div>' +
      '<div class="note" style="margin-top:10px">推理机制：从企业事实出发，沿"满足前置条件 → 作用于 → 映射表单"路径，' +
      '可推导出企业应适用哪些税种、填报哪张表；从指标沿"计算得出 → 触发预警"路径，可定位风险来源。</div>' +
      '<div class="btn-row" style="margin-top:12px"><button class="btn sm" data-act="kg" data-node="">清除选择</button></div>' +
      '</div></div>';
    return html;
  }

  function twoHop(id) {
    var nm = function (k) { var n = D.KG_NODES.filter(function (x) { return x.id === k; })[0]; return n ? n.label : k; };
    var first = D.KG_EDGES.filter(function (e) { return e.f === id; });
    if (first.length) {
      var mid = first[0].t;
      var second = D.KG_EDGES.filter(function (e) { return e.f === mid; });
      if (second.length) return nm(id) + ' →(' + first[0].r + ')→ ' + nm(mid) + ' →(' + second[0].r + ')→ ' + nm(second[0].t);
      return nm(id) + ' →(' + first[0].r + ')→ ' + nm(mid);
    }
    var inc = D.KG_EDGES.filter(function (e) { return e.t === id; });
    if (inc.length) return nm(inc[0].f) + ' →(' + inc[0].r + ')→ ' + nm(id);
    return '无';
  }
  function kgNodeOf(policyId) {
    var n = D.KG_NODES.filter(function (x) { return x.ref === policyId; })[0];
    return n ? n.id : '';
  }

  /* ---------------- 风险看板 ---------------- */
  function vRisk() {
    var i = RISK.indicators;
    var html = head('风险看板', '五维特征加权评分 · 模型系数公开可复核 · 每条预警给出整改建议',
      '<button class="btn" data-act="goto" data-view="policy">匹配优惠对冲</button>');

    html += '<div class="grid g-1-2">';
    html += '<div class="card" style="display:flex;flex-direction:column;align-items:center;justify-content:center">' +
      ring(RISK.score) +
      '<div style="margin-top:10px;font-size:15px;font-weight:600">' + RISK.level + '风险</div>' +
      '<div class="dim" style="font-size:12px">模型输出概率 ' + (RISK.prob * 100).toFixed(1) + '%</div>' +
      '<div class="note" style="margin-top:16px;width:100%">评分不构成税务结论，仅用于风险排序：分数越高，越应优先自查。</div></div>';

    html += '<div class="card"><h3>风险特征</h3><p class="sub">归一化后进入模型的五个维度</p>' +
      featBar('增值税税负率偏离度', i.deviation * 100, RISK.x.x1 * 100) +
      featBar('进项发票异常占比', i.abnormalRate * 100, RISK.x.x2 * 100) +
      featBar('收入成本变动背离度', i.divergence * 100, RISK.x.x3 * 100) +
      featBar('纳税信用等级风险值', RISK.x.x4 * 100, RISK.x.x4 * 100) +
      featBar('毛利率偏离行业', i.marginGap * 100, RISK.x.x5 * 100) +
      '<hr>' +
      '<div class="grid g3"><div><div class="kpi-sub">税负率</div><div class="kpi sm mono">' + (i.vatBurden * 100).toFixed(2) + '%</div></div>' +
      '<div><div class="kpi-sub">进项异常</div><div class="kpi sm mono">' + i.abnormalCount + '/' + i.abnormalTotal + '</div></div>' +
      '<div><div class="kpi-sub">毛利率</div><div class="kpi sm mono">' + (i.margin * 100).toFixed(1) + '%</div></div></div>' +
      '</div></div>';

    html += '<div class="card" style="margin-top:16px"><h3>风险项与整改建议</h3><p class="sub">按等级排序，点击展开说明</p>' +
      '<div class="rows">' + RISK.items.map(function (it) {
        var cls = it.lv === 'high' ? 'r' : it.lv === 'mid' ? 'a' : 'g';
        return '<div class="row"><div class="ico ' + cls + '">' + (it.lv === 'high' ? '!' : it.lv === 'mid' ? '△' : '✓') + '</div>' +
          '<div class="grow"><div class="t">' + esc(it.name) + ' <span class="chip ' + (it.lv === 'high' ? 'bad' : it.lv === 'mid' ? 'warn' : 'ok') + '">' + it.value + '</span></div>' +
          '<div class="d">' + esc(it.detail) + '</div>' +
          '<div class="d" style="color:var(--brand-d)">建议：' + esc(it.advice) + '</div></div></div>';
      }).join('') + '</div></div>';

    html += '<div class="card" style="margin-top:16px"><h3>模型说明</h3>' +
      '<p class="sub">逻辑回归：P = σ(β₀ + Σβᵢxᵢ)，输出概率后线性映射为 0—100 分</p>' +
      '<table><thead><tr><th>特征</th><th>变量</th><th class="r">系数 βᵢ</th><th class="r">归一化取值</th></tr></thead><tbody>' +
      '<tr><td>截距</td><td class="mono">β₀</td><td class="r mono">' + RISK.model.b0.toFixed(2) + '</td><td class="r dim">—</td></tr>' +
      RISK.model.w.map(function (w) {
        return '<tr><td>' + w.name + '</td><td class="mono">' + w.key + '</td>' +
          '<td class="r mono">' + w.beta.toFixed(2) + '</td>' +
          '<td class="r mono">' + RISK.x[w.key].toFixed(3) + '</td></tr>';
      }).join('') +
      '<tr><td><b>合计线性组合 z</b></td><td class="mono">z</td><td class="r mono" colspan="2"><b>' + zValue().toFixed(3) + '</b></td></tr>' +
      '</tbody></table>' +
      '<div class="note" style="margin-top:14px">系数由历史涉税检查样本离线训练得到（教学演示版本使用固定系数模拟），' +
      '前端只做推理不做训练。校验方式：把上表数值代入公式，应得到与上方一致的概率。</div></div>';
    return html;
  }

  function zValue() {
    var z = RISK.model.b0;
    RISK.model.w.forEach(function (w) { z += w.beta * RISK.x[w.key]; });
    return z;
  }

  function ring(score) {
    var r = 54, c = 2 * Math.PI * r;
    var off = c * (1 - score / 100);
    var col = score >= 80 ? '#d94a4a' : score >= 60 ? '#c8871a' : '#1f9d55';
    return '<svg width="150" height="150" viewBox="0 0 150 150">' +
      '<circle cx="75" cy="75" r="' + r + '" fill="none" stroke="#eef1f7" stroke-width="13"/>' +
      '<circle cx="75" cy="75" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="13" stroke-linecap="round" ' +
      'stroke-dasharray="' + c + '" stroke-dashoffset="' + off + '" transform="rotate(-90 75 75)"/>' +
      '<text x="75" y="72" text-anchor="middle" font-size="34" font-weight="700" fill="#16203a">' + score + '</text>' +
      '<text x="75" y="94" text-anchor="middle" font-size="11" fill="#8d9ab5">风险分 / 100</text></svg>';
  }

  function featBar(name, raw, norm) {
    return '<div style="margin-bottom:11px"><div style="display:flex;justify-content:space-between;font-size:12.5px">' +
      '<span class="muted">' + name + '</span><span class="mono dim">' + raw.toFixed(1) + ' → ' + norm.toFixed(0) + '</span></div>' +
      '<div class="bar a" style="margin-top:5px"><i style="width:' + Math.min(100, norm) + '%"></i></div></div>';
  }

  /* ---------------- 智能问答 ---------------- */
  function vQA() {
    var html = head('智能问答', '基于政策库与知识图谱的检索问答，答案附带溯源依据');
    html += '<div class="grid g-2-1 top">';
    html += '<div class="card"><div class="chat" id="chat">' + chatHTML() + '</div>' +
      '<div class="ask-row"><input type="text" id="askInput" placeholder="例如：软件产品能即征即退吗？">' +
      '<button class="btn primary" data-act="askBtn">提问</button></div>' +
      '<div class="sugg">' + ['我的增值税税负率正常吗', '研发费用加计扣除怎么用', '附加税费能减半吗', '申报表之间怎么核对', '风险评分怎么算']
        .map(function (q) { return '<button data-act="ask" data-q="' + q + '">' + q + '</button>'; }).join('') + '</div></div>';

    html += '<div class="card"><h3>问答能力边界</h3><p class="sub">说清楚它能做什么、不能做什么</p>' +
      '<div class="rows">' +
      [['能', '政策条款检索与解释、税额测算、优惠资格判断、勾稽关系核对、流程时点查询'],
       ['依据', '58 项政策库 + 26 节点知识图谱 + 本期计算结果，答案带出处'],
       ['不能', '不做税筹方案设计与税务裁定；涉及争议事项须以主管税务机关口径为准'],
       ['回退', '问题超出知识库时明确说明"知识库未覆盖"，不臆造条款或文号']
      ].map(function (r) {
        return '<div class="row"><div class="ico ' + (r[0] === '不能' ? 'r' : r[0] === '回退' ? 'a' : 'g') + '">' + r[0].slice(0, 1) + '</div>' +
          '<div class="grow"><div class="t">' + r[0] + '</div><div class="d">' + r[1] + '</div></div></div>';
      }).join('') + '</div>' +
      '<hr><div class="kpi-sub">知识库覆盖</div><div class="mono" style="font-size:20px">' + POL.length + ' 项政策 · ' + D.KG_NODES.length + ' 节点 · ' + D.QA.length + ' 组问答</div>' +
      '</div></div>';
    return html;
  }

  function tpl(s) {
    return s
      .replace(/\{\{riskScore\}\}/g, String(RISK.score))
      .replace(/\{\{vatBurdenPct\}\}/g, (RISK.indicators.vatBurden * 100).toFixed(2) + '%')
      .replace(/\{\{industryBurdenPct\}\}/g, (D.INDUSTRY.vatBurden * 100).toFixed(2) + '%')
      .replace(/\{\{devPp\}\}/g, (RISK.indicators.deviation * D.INDUSTRY.vatBurden * 100).toFixed(2))
      .replace(/\{\{abnormalPct\}\}/g, (RISK.indicators.abnormalRate * 100).toFixed(1))
      .replace(/\{\{abnormalCount\}\}/g, String(RISK.indicators.abnormalCount))
      .replace(/\{\{abnormalTotal\}\}/g, String(RISK.indicators.abnormalTotal));
  }

  function chatHTML() {
    if (!chat.length) {
      return '<div class="msg"><div class="avatar">税</div><div class="bubble">我是智税通。财税问题可以直接问，' +
        '答案会标注依据出自哪条政策或图谱的哪条链路。<span class="src">知识库：' + POL.length + ' 项政策 · ' + D.KG_NODES.length + ' 节点图谱 · 本期计算数据</span></div></div>';
    }
    return chat.map(function (m) {
      return '<div class="msg ' + (m.role === 'me' ? 'me' : '') + '">' +
        '<div class="avatar">' + (m.role === 'me' ? '我' : '税') + '</div>' +
        '<div class="bubble">' + m.text + (m.src ? '<div class="src">依据：' + m.src + '</div>' : '') + '</div></div>';
    }).join('');
  }

  function ask(q) {
    q = (q || '').trim();
    if (!q) return;
    chat.push({ role: 'me', text: esc(q) });
    var best = null, bestScore = 0;
    D.QA.forEach(function (item) {
      var s = 0;
      item.k.forEach(function (k) { if (q.indexOf(k) >= 0) s += k.length; });
      if (s > bestScore) { bestScore = s; best = item; }
    });
    if (best && bestScore > 0) {
      chat.push({ role: 'ai', text: tpl(best.a).replace(/\n/g, '<br>'), src: esc(best.src) });
    } else {
      chat.push({
        role: 'ai',
        text: '知识库未覆盖这个问题，我不猜。可以换个问法，或者在"政策中心"按税种检索具体条款。',
        src: '检索范围：政策库 ' + POL.length + ' 项 · 图谱 ' + D.KG_NODES.length + ' 节点'
      });
    }
    render();
    var box = document.getElementById('chat');
    if (box) box.scrollIntoView({ block: 'nearest' });
  }

  /* ---------------- 消息提醒 ---------------- */
  function vNotice() {
    var d = daysTo('2026-11-16');
    var html = head('消息提醒', '政策变动、申报期限与涉税风险事项的站内推送',
      '<button class="btn" data-act="readAll">全部标为已读</button>');

    html += '<div class="grid g-2-1 top" style="margin-bottom:16px">';
    html += '<div class="card"><h3>下一申报期限</h3><p class="sub">2026 年 11 月征期</p>' +
      '<div style="display:flex;align-items:flex-end;gap:16px;flex-wrap:wrap">' +
      '<div><div class="kpi mono" style="font-size:32px">' + (d > 0 ? d : 0) + ' 天</div>' +
      '<div class="kpi-sub">距 2026-11-16 截止</div></div>' +
      '<div class="chip ' + (d < 7 ? 'bad' : 'warn') + '">' + daysText('2026-11-16') + '</div></div>' +
      '<div class="note" style="margin-top:16px">11 月 15 日为周日，申报期限顺延至 11 月 16 日（周一）。' +
      '逾期按日加收万分之五滞纳金，并影响纳税信用评级。</div></div>';

    html += '<div class="card"><h3>提醒设置</h3><p class="sub">按类型订阅</p><div class="rows">' +
      [['政策变动', '已开启'], ['申报期限', '已开启'], ['涉税风险', '已开启'], ['优惠到期', '已开启'], ['资料补正', '已开启']]
      .map(function (r) {
        return '<div class="row"><div class="ico g">✓</div><div class="grow"><div class="t">' + r[0] + '</div></div>' +
          '<span class="chip ok">' + r[1] + '</span></div>';
      }).join('') + '</div>' +
      '<div class="note" style="margin-top:12px">提醒只在站内展示，不外发短信或邮件，避免涉税信息外泄。</div></div>';
    html += '</div>';

    html += '<div class="card"><h3>消息列表</h3><p class="sub">共 ' + D.NOTICES.length + ' 条</p><div class="rows">' +
      D.NOTICES.map(function (n) {
        var cls = n.level === 'high' ? 'r' : n.level === 'mid' ? 'a' : '';
        return '<div class="row"><div class="ico ' + cls + '">' + (n.level === 'high' ? '!' : n.level === 'mid' ? '•' : 'i') + '</div>' +
          '<div class="grow"><div class="t">' + esc(n.title) + ' <span class="chip">' + n.tag + '</span></div>' +
          '<div class="d">' + esc(n.body) + '</div>' +
          '<div class="d dim">' + n.date + '</div></div>' +
          '<button class="btn sm" data-act="goto" data-view="' + n.action + '">去处理</button></div>';
      }).join('') + '</div></div>';
    return html;
  }

  /* ---------------- 渲染 ---------------- */
  function render() {
    var html = '';
    try {
      if (view === 'company') html = vCompany();
      else if (view === 'upload') html = vUpload();
      else if (view === 'declare') html = vDeclare();
      else if (view === 'policy') html = vPolicy();
      else if (view === 'risk') html = vRisk();
      else if (view === 'qa') html = vQA();
      else if (view === 'notice') html = vNotice();
      else html = vCompany();
    } catch (err) {
      html = '<div class="card"><h3>页面渲染出错</h3><p class="sub">' + esc(err.message) + '</p></div>';
    }
    app.innerHTML = html;

    document.querySelectorAll('#nav a').forEach(function (a) {
      a.className = (a.getAttribute('data-view') === view) ? 'on' : '';
    });
    var dot = document.getElementById('noticeDot');
    if (dot) dot.hidden = unread === 0;

    if (view === 'qa') {
      var inp = document.getElementById('askInput');
      if (inp) {
        inp.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') ask(inp.value);
        });
      }
    }
    if (view === 'policy') {
      var ps = document.getElementById('polSearch');
      if (ps) {
        ps.addEventListener('input', function () {
          polQuery = ps.value;
          var body = document.getElementById('polBody');
          if (body) body.innerHTML = polRows();
        });
      }
      var drop = document.getElementById('drop');
    }
    if (view === 'upload') {
      var drop = document.getElementById('drop');
      var fi = document.getElementById('fileInput');
      if (drop && fi) {
        drop.addEventListener('click', function () { fi.click(); });
        drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('hot'); });
        drop.addEventListener('dragleave', function () { drop.classList.remove('hot'); });
        drop.addEventListener('drop', function (e) { e.preventDefault(); drop.classList.remove('hot'); doParse(); });
        fi.addEventListener('change', function () { if (fi.files && fi.files.length) doParse(); });
      }
    }
  }

  function doParse() {
    parsed = true;
    var log = document.getElementById('parseLog');
    if (!log) return;
    var steps = ['正在读取文件…', 'OCR 识别与字段抽取…', '去重与税号校验…', '含税金额拆分…', '勾稽比对…'];
    var i = 0;
    log.innerHTML = '<span class="chip info">解析中</span> ' + steps[0];
    var t = setInterval(function () {
      i++;
      if (i < steps.length) {
        log.innerHTML = '<span class="chip info">解析中</span> ' + steps[i];
      } else {
        clearInterval(t);
        log.innerHTML = '解析状态：<b>已完成</b> · 剔除重复 ' + R.clean.dup.length +
          ' 张 · 标记瑕疵 ' + RISK.indicators.abnormalCount + ' 张 · 生成标准记录 ' + R.clean.rows.length + ' 条';
        toast('数据解析完成');
        render();
      }
    }, 320);
  }

  /* ---------------- 下载 ---------------- */
  function download(name, text) {
    var blob = new Blob(['\ufeff' + text], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 400);
  }

  function formCSV(key) {
    var f = FORMS[key];
    var lines = ['"' + f.title + '"', '纳税人,' + C.name, '纳税人识别号,' + C.creditCode, '税款所属期,' + f.period, '', '行次,项目,金额(元)'];
    f.rows.forEach(function (r) {
      lines.push([r[0], '"' + r[1] + '"', r[2] === null ? '' : r[2].toFixed(2)].join(','));
    });
    lines.push('');
    lines.push('备注,本表由智慧财税管理智能体自动生成，供申报前核对使用');
    return lines.join('\r\n');
  }

  /* ---------------- 事件 ---------------- */
  document.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!el) return;
    var act = el.getAttribute('data-act');

    if (act === 'goto') { location.hash = '#/' + el.getAttribute('data-view'); }
    else if (act === 'parse') { doParse(); }
    else if (act === 'submit') {
      if (E.state.submitted) return;
      E.submit();
      toast('申报已提交，回执号 ' + E.state.receiptNo);
      render();
    }
    else if (act === 'dl') {
      var k = el.getAttribute('data-form');
      if (k === 'all') {
        ['vat', 'cit', 'stamp'].forEach(function (x, i) {
          setTimeout(function () { download('申报表_' + x + '_' + C.period + '.csv', formCSV(x)); }, i * 260);
        });
        toast('正在下载 3 张申报表');
      } else {
        download('申报表_' + k + '_' + C.period + '.csv', formCSV(k));
        toast('已下载申报表');
      }
    }
    else if (act === 'tab') { formTab = el.getAttribute('data-tab'); render(); }
    else if (act === 'filter') { polFilter = el.getAttribute('data-k'); render(); }
    else if (act === 'pol') {
      var id = el.getAttribute('data-id');
      polSel = POL.filter(function (p) { return p.id === id; })[0];
      render();
    }
    else if (act === 'kg') { kgSel = el.getAttribute('data-node'); render(); }
    else if (act === 'kgJump') {
      var nid = el.getAttribute('data-id');
      if (nid) { kgSel = nid; render(); toast('已在图谱中定位'); }
      else toast('该政策暂未进入图谱');
    }
    else if (act === 'ask') { ask(el.getAttribute('data-q')); }
    else if (act === 'askBtn') {
      var inp = document.getElementById('askInput');
      if (inp) ask(inp.value);
    }
    else if (act === 'readAll') { unread = 0; toast('已全部标为已读'); render(); }
  });

  /* ---------------- 启动 ---------------- */
  function route() {
    var h = (location.hash || '').replace('#/', '');
    if (!h) h = 'company';
    if (h === 'notice') unread = 0;
    view = h;
    render();
  }
  window.addEventListener('hashchange', route);

  document.getElementById('periodPill').textContent = '所属期 ' + C.period;
  document.getElementById('userPill').textContent = C.name;

  route();
})();
