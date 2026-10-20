/* 智税通 · 计算引擎
 * 职责：票据清洗 → 计税 → 勾稽校验 → 政策匹配 → 风险评分 → 申报表生成
 * 全部为纯函数式前端计算，不依赖后端。
 */
window.Engine = (function () {
  var D = window.DATA;
  var C = D.COMPANY;
  var F = C.flags;

  function r2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
  function pct(n, d) { return d ? n / d : 0; }

  /* ============ 1. 票据清洗 ============ */
  function cleanInvoices() {
    var seen = {}, rows = [], dup = [];
    D.INVOICES.forEach(function (v) {
      if (seen[v.no]) { dup.push(v); return; }
      seen[v.no] = 1;
      var rt = v.rate / 100;
      var net = r2(v.gross / (1 + rt));
      var tax = r2(v.gross - net);
      var row = {
        no: v.no, type: v.type, name: v.name, kind: v.kind, rate: v.rate,
        gross: v.gross, net: net, tax: tax, date: v.date, party: v.party,
        flags: v.flags || [], status: 'ok', note: ''
      };
      if (v.type === 'out') {
        if (v.kind === '红') { row.status = 'red'; row.note = '红字发票，按负数计入销项'; }
        else if (v.kind === '普') { row.note = '未开专票，仍须计入销项'; }
        else { row.note = '正常销项'; }
      } else {
        if (v.kind === '普') { row.status = 'nodeduct'; row.note = '普通发票，税额不可抵扣，全额计入成本'; }
        else if (row.flags.indexOf('noTaxNo') >= 0) { row.status = 'nodeduct'; row.note = '缺失购买方税号，暂不得抵扣，须退回换开'; }
        else if (row.flags.indexOf('nonDed') >= 0) { row.status = 'transfer'; row.note = '用于集体福利，已认证但须作进项税额转出'; }
        else { row.note = '可抵扣'; }
      }
      rows.push(row);
    });
    return { rows: rows, dup: dup };
  }

  /* ============ 2. 增值税 ============ */
  function calcVAT(clean) {
    var outNet = 0, outTax = 0, inNet = 0, inTax = 0, transfer = 0;
    clean.rows.forEach(function (x) {
      if (x.type === 'out') { outNet += x.net; outTax += x.tax; }
      else if (x.status === 'ok') { inNet += x.net; inTax += x.tax; }
      else if (x.status === 'transfer') { transfer += x.tax; }
    });
    var payable = r2(outTax - inTax + transfer);
    return {
      outNet: r2(outNet), outTax: r2(outTax),
      inNet: r2(inNet), inTax: r2(inTax),
      transferOut: r2(transfer), payable: payable,
      creditCarry: 0
    };
  }

  /* ============ 3. 附加税费 ============ */
  function calcSurcharge(vat) {
    var base = vat.payable + vat.creditCarry;
    var city = r2(base * 0.07), edu = r2(base * 0.03), local = r2(base * 0.02);
    var total = r2(city + edu + local);
    var relieved = F.smallLowProfit ? r2(total * 0.5) : 0;
    return {
      base: r2(base), city: city, edu: edu, local: local, total: total,
      relief: relieved, payable: r2(total - relieved)
    };
  }

  /* ============ 4. 企业所得税 ============ */
  function calcCIT() {
    var profit = C.profit;
    var rdExtra = r2(C.rdExpense * 1.0);          // 研发费用加计扣除 100%
    var taxable = r2(profit - rdExtra);
    if (taxable < 0) taxable = 0;
    var legal = r2(taxable * 0.25);                // 法定 25%
    var actual, relief, rateNote;
    if (F.smallLowProfit) {
      actual = r2(taxable * 0.25 * 0.20);          // 减按25%计入 × 20%
      relief = r2(legal - actual);
      rateNote = '小型微利：减按25%计入应纳税所得额，按20%税率，实际税负5%';
    } else if (F.hightech) {
      actual = r2(taxable * 0.15); relief = r2(legal - actual);
      rateNote = '高新技术企业：15%优惠税率';
    } else {
      actual = legal; relief = 0; rateNote = '法定税率25%';
    }
    return {
      profit: profit, rdExtra: rdExtra, taxable: taxable,
      legal: legal, actual: actual, relief: relief, rateNote: rateNote
    };
  }

  /* ============ 5. 印花税 ============ */
  function calcStamp() {
    var base = 1356000.00;                        // 买卖合同 + 采购合同金额
    var tax = r2(base * 0.0003);
    var relief = F.smallLowProfit ? r2(tax * 0.5) : 0;
    return { base: base, rate: 0.0003, tax: tax, relief: relief, payable: r2(tax - relief) };
  }

  /* ============ 6. 汇总结算 ============ */
  function compute() {
    var clean = cleanInvoices();
    var vat = calcVAT(clean);
    var sur = calcSurcharge(vat);
    var cit = calcCIT();
    var stamp = calcStamp();
    var total = r2(vat.payable + sur.payable + cit.actual + stamp.payable);
    return {
      clean: clean, vat: vat, sur: sur, cit: cit, stamp: stamp, total: total,
      reliefTotal: r2(sur.relief + cit.relief + stamp.relief)
    };
  }

  /* ============ 7. 勾稽校验 ============ */
  function checks(R) {
    var list = [];
    function add(name, a, b, unit, pass, tip) {
      list.push({ name: name, a: a, b: b, unit: unit || '元', pass: pass, tip: tip });
    }
    add('销项税额 = 开票含税额 − 不含税额', R.vat.outTax, r2(R.clean.rows.filter(function (x) { return x.type === 'out'; }).reduce(function (s, x) { return s + (x.gross - x.net); }, 0)), '元', true, '逐票验算通过');
    add('增值税销售额 = 利润表营业收入', R.vat.outNet, C.revenue, '元', Math.abs(R.vat.outNet - C.revenue) < 0.05, '口径一致，无需纳税调整');
    add('附加税费计税依据 = 实际应缴增值税', R.sur.base, R.vat.payable, '元', Math.abs(R.sur.base - R.vat.payable) < 0.05, '差额部分将触发税务端比对异常');
    add('应纳合计 = 各税种应纳之和', R.total, r2(R.vat.payable + R.sur.payable + R.cit.actual + R.stamp.payable), '元', true, '总分校验通过');
    add('进项税额转出 ≤ 已认证进项', R.vat.transferOut, R.vat.inTax + R.vat.transferOut, '元', R.vat.transferOut <= R.vat.inTax + R.vat.transferOut, '集体福利用途已足额转出');
    add('企业所得税应纳税所得额 ≥ 0', R.cit.taxable, 0, '元', R.cit.taxable >= 0, R.cit.taxable > 0 ? '加计扣除后仍为正，正常计税' : '亏损，本期不预缴');
    return list;
  }

  /* ============ 8. 政策匹配 ============ */
  var NEED_LABEL = {
    generalVAT: '增值税一般纳税人', smallVAT: '增值税小规模纳税人', smallLowProfit: '小型微利企业',
    softwareCert: '软件产品登记证书', hightech: '高新技术企业资格', techSME: '科技型中小企业入库编号',
    manufacturing: '制造业企业', export: '出口业务', disabledStaff: '安置残疾人就业',
    hasFixedAssets: '当年新增设备器具', employeePresent: '在职员工', charity: '公益性捐赠',
    westArea: '西部大开发适用区域', hainan: '海南自由贸易港', rd: '研发费用实际发生',
    creditAB: '纳税信用A级或B级', creditA: '纳税信用A级', financeInst: '金融机构主体资格',
    logistics: '物流企业资质', individual: '自然人纳税人', newEnergyCar: '新能源汽车购置',
    agriculture: '农产品生产加工', autoDealer: '二手车经销资质', lifeService: '生活性服务业',
    resourceUtil: '资源综合利用认定', investFund: '创业投资企业备案', keySoftware: '国家规划布局内重点软件企业',
    newSoftware: '新办软件企业（获利年度起）', icDesign: '集成电路设计企业', listCompany: '上市公司',
    hardship: '纳税确有困难核定', adIndustry: '广告业纳税人', greenClean: '排放低于标准30%以上'
  };

  function checkNeed(token) {
    switch (token) {
      case 'generalVAT': return F.generalVAT;
      case 'smallVAT': return F.smallVAT;
      case 'smallLowProfit': return F.smallLowProfit;
      case 'softwareCert': return F.softwareCert;
      case 'hightech': return F.hightech;
      case 'techSME': return F.techSME;
      case 'manufacturing': return F.manufacturing;
      case 'export': return F.export;
      case 'disabledStaff': return F.disabledStaff;
      case 'hasFixedAssets': return F.hasFixedAssets;
      case 'employeePresent': return F.employeePresent;
      case 'charity': return F.charity;
      case 'westArea': return F.westArea;
      case 'hainan': return F.hainan;
      case 'rd': return F.rd;
      case 'creditAB': return C.creditRating === 'A' || C.creditRating === 'B';
      case 'creditA': return C.creditRating === 'A';
      default: return false;
    }
  }

  var ENJOYED = { P16: 1, P17: 1, P36: 1, P37: 1 };

  function policies(R) {
    return D.POLICY.map(function (p) {
      var tokens = p.need.split('&');
      var missing = null, ok = true;
      tokens.forEach(function (t) {
        if (!checkNeed(t)) { ok = false; if (!missing) missing = t; }
      });
      var status, reason;
      if (p.validTo === '已到期') { status = 'unmet'; reason = '政策已到期或本期末不再执行'; }
      else if (!ok) { status = 'unmet'; reason = '未满足前置条件：' + (NEED_LABEL[missing] || missing); }
      else if (ENJOYED[p.id]) { status = 'enjoyed'; reason = '本期已完成享受'; }
      else { status = 'available'; reason = '条件满足，尚未申请'; }
      var saving = null;
      if (p.id === 'P03') saving = 100000.00;
      else if (p.id === 'P16') saving = R.cit.relief;
      else if (p.id === 'P17') saving = r2(R.cit.rdExtra * 0.05);
      else if (p.id === 'P36') saving = R.sur.relief;
      else if (p.id === 'P37') saving = R.stamp.relief;
      return {
        id: p.id, name: p.name, taxType: p.taxType, doc: p.doc, validTo: p.validTo,
        mode: p.mode, cat: p.cat, verified: p.verified,
        status: status, reason: reason,
        saving: (status === 'unmet' ? null : saving)
      };
    });
  }

  /* ============ 9. 风险模型 ============ */
  var MODEL = {
    b0: -2.9,
    w: [
      { key: 'x1', name: '增值税税负率偏离度', beta: 1.90 },
      { key: 'x2', name: '进项发票异常占比', beta: 1.50 },
      { key: 'x3', name: '收入成本变动背离度', beta: 1.10 },
      { key: 'x4', name: '纳税信用等级风险值', beta: 0.90 },
      { key: 'x5', name: '毛利率偏离行业', beta: 0.50 }
    ]
  };

  function clamp(x) { return Math.max(0, Math.min(1, x)); }

  function risk(R) {
    var ind = D.INDUSTRY;
    var burden = pct(R.vat.payable, R.vat.outNet);
    var dev = Math.abs(burden - ind.vatBurden) / ind.vatBurden;
    var badRows = R.clean.rows.filter(function (x) {
      return x.type === 'in' && (x.status === 'nodeduct' || x.status === 'transfer');
    });
    var totalIn = R.clean.rows.filter(function (x) { return x.type === 'in'; }).length;
    var abnormalRate = pct(badRows.length, totalIn);
    var revG = pct(C.revenue - C.lastRevenue, C.lastRevenue);
    var costG = pct(C.cost - C.lastCost, C.lastCost);
    var divergence = Math.abs(revG - costG);
    var margin = pct(C.revenue - C.cost, C.revenue);
    var marginGap = Math.abs(margin - ind.grossMargin) / ind.grossMargin;
    var creditMap = { A: 0, B: 0.35, C: 0.7, D: 1 };

    var x = {
      x1: clamp(dev / 1.2),
      x2: clamp(abnormalRate * 2),
      x3: clamp(divergence * 3),
      x4: creditMap[C.creditRating] === undefined ? 0.5 : creditMap[C.creditRating],
      x5: clamp(marginGap)
    };
    var z = MODEL.b0;
    MODEL.w.forEach(function (w) { z += w.beta * x[w.key]; });
    var prob = 1 / (1 + Math.exp(-z));
    var score = Math.round(prob * 100);
    var level = score < 35 ? '低' : score < 60 ? '中' : score < 80 ? '中高' : '高';

    var items = [
      {
        name: '增值税税负率偏离行业均值',
        lv: dev > 0.5 ? 'high' : dev > 0.2 ? 'mid' : 'low',
        value: (burden * 100).toFixed(2) + '%（行业 ' + (ind.vatBurden * 100).toFixed(2) + '%）',
        detail: '偏离 ' + (dev * 100).toFixed(1) + '%。软件企业税负偏高的常见成因是进项抵扣不足，或未申请软件产品即征即退。',
        advice: '核对软件产品是否单独核算并办理登记备案；若符合条件申请即征即退，测算可退 100,000.00 元，退后税负率约 4.3%。'
      },
      {
        name: '进项发票抵扣瑕疵',
        lv: badRows.length >= 3 ? 'high' : badRows.length ? 'mid' : 'low',
        value: badRows.length + ' 张 / 有效凭证 ' + totalIn + ' 张（' + (abnormalRate * 100).toFixed(1) + '%）',
        detail: badRows.map(function (b) { return '「' + b.name + '」' + b.note; }).join('；'),
        advice: '普通发票与缺税号票据退回重开专票；福利支出已作进项转出，勿重复抵扣。'
      },
      {
        name: '收入与成本变动背离',
        lv: divergence > 0.1 ? 'mid' : 'low',
        value: '收入 +' + (revG * 100).toFixed(1) + '% / 成本 +' + (costG * 100).toFixed(1) + '%',
        detail: '收入增速明显高于成本增速，毛利率由上年同期上升，可能引起税务端毛利率异常关注。',
        advice: '准备项目验收单、工时记录与收入确认依据备查，确保收入确认时点与完工进度匹配。'
      },
      {
        name: '毛利率高于行业均值',
        lv: marginGap > 0.3 ? 'mid' : 'low',
        value: (margin * 100).toFixed(1) + '%（行业 ' + (ind.grossMargin * 100).toFixed(1) + '%）',
        detail: '软件企业毛利率天然偏高，属可解释区间，但需与研发投入强度匹配。',
        advice: '在年度汇算时准备毛利构成说明，配合研发费用占比数据形成合理解释链。'
      },
      {
        name: '纳税信用等级影响退税便利',
        lv: C.creditRating === 'A' ? 'low' : C.creditRating === 'B' ? 'low' : 'mid',
        value: C.creditRating + ' 级',
        detail: 'B级可申请留抵退税，但A级在办理时限与资料简化上更优。',
        advice: '保持按期申报、连续无欠税，年度评价可提升至A级。'
      },
      {
        name: '优惠留存备查资料不齐',
        lv: 'mid',
        value: '研发项目工时分配表缺 2 个项目',
        detail: '研发费用加计扣除采取"自行判别、申报享受、相关资料留存备查"方式，资料缺失在检查时可能导致优惠被追回。',
        advice: '补全研发项目立项决议、人员名单、工时分配表与费用分配说明，按项目建立辅助账。'
      }
    ];

    return {
      score: score, level: level, prob: prob,
      x: x, model: MODEL,
      indicators: {
        vatBurden: burden, vatBurdenBase: ind.vatBurden, deviation: dev,
        abnormalCount: badRows.length, abnormalTotal: totalIn, abnormalRate: abnormalRate,
        revG: revG, costG: costG, divergence: divergence,
        margin: margin, marginBase: ind.grossMargin, marginGap: marginGap,
        credit: C.creditRating
      },
      items: items
    };
  }

  /* ============ 10. 申报表生成 ============ */
  function forms(R) {
    return {
      vat: {
        title: '增值税及附加税费申报表（一般纳税人适用）',
        period: C.period,
        rows: [
          ['1', '按适用税率计税销售额', R.vat.outNet],
          ['11', '销项税额', R.vat.outTax],
          ['12', '进项税额', R.vat.inTax],
          ['14', '进项税额转出', R.vat.transferOut],
          ['19', '应纳税额', R.vat.payable],
          ['20', '期末留抵税额', R.vat.creditCarry],
          ['附1', '城市维护建设税（7%）', R.sur.city],
          ['附2', '教育费附加（3%）', R.sur.edu],
          ['附3', '地方教育附加（2%）', R.sur.local],
          ['附4', '附加税费小计', R.sur.total],
          ['附5', '"六税两费"减半征收额', -R.sur.relief],
          ['附6', '附加税费应缴', R.sur.payable]
        ]
      },
      cit: {
        title: '企业所得税月（季）度预缴纳税申报表（A类）',
        period: C.period,
        rows: [
          ['1', '营业收入', C.revenue],
          ['2', '营业成本', C.cost],
          ['3', '利润总额', R.cit.profit],
          ['5', '纳税调整减少额（研发费用加计扣除）', R.cit.rdExtra],
          ['8', '应纳税所得额', R.cit.taxable],
          ['9', '法定税率', null],
          ['10', '应纳所得税额（法定）', R.cit.legal],
          ['11', '减免所得税额', R.cit.relief],
          ['12', '本期实际应纳所得税额', R.cit.actual]
        ]
      },
      stamp: {
        title: '财产和行为税纳税申报表（印花税）',
        period: C.period,
        rows: [
          ['1', '买卖合同计税依据', R.stamp.base],
          ['2', '适用税率（万分之三）', null],
          ['3', '应纳税额', R.stamp.tax],
          ['4', '小型微利企业减征额', -R.stamp.relief],
          ['5', '本期应纳印花税', R.stamp.payable]
        ]
      }
    };
  }

  /* ============ 11. 申报状态 ============ */
  var state = {
    submitted: false,
    submittedAt: '',
    receiptNo: '',
    batch: 'BATCH-2026-10-' + Math.floor(Math.random() * 900 + 100)
  };

  function submit() {
    state.submitted = true;
    var t = new Date();
    function p(n) { return n < 10 ? '0' + n : '' + n; }
    state.submittedAt = t.getFullYear() + '-' + p(t.getMonth() + 1) + '-' + p(t.getDate()) + ' ' + p(t.getHours()) + ':' + p(t.getMinutes());
    state.receiptNo = 'SL' + t.getFullYear() + p(t.getMonth() + 1) + p(t.getDate()) + String(Math.floor(Math.random() * 9000 + 1000));
    return state;
  }

  return {
    compute: compute,
    checks: checks,
    policies: policies,
    risk: risk,
    forms: forms,
    state: state,
    submit: submit,
    r2: r2
  };
})();
