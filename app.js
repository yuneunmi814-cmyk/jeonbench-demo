/* 우리가게 에너지벤치 — 앱 로직 (가스 + 전기) */
'use strict';
const $ = s => document.querySelector(s);
const won = n => '₩' + Math.round(n).toLocaleString('ko-KR');
const man = n => (n / 10000).toFixed(0) + '만';
let current = null;

function go(step) {
  ['s1', 's2', 's3'].forEach((id, i) => $('#' + id).classList.toggle('on', i === step - 1));
  document.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('act', i === step - 1));
  window.scrollTo(0, 0);
}

// ───────── 1. 고지서 인식 ─────────
function loadSample(id) {
  const s = SAMPLES.find(x => x.id === id);
  showScanning(() => { current = { ...s }; renderBill(current); });
}
function showScanning(done) {
  $('#scanState').classList.add('show');
  let p = 0;
  const iv = setInterval(() => {
    p += 12 + Math.random() * 10;
    $('#scanBar').style.width = Math.min(p, 100) + '%';
    if (p >= 100) { clearInterval(iv); setTimeout(() => { $('#scanState').classList.remove('show'); done(); }, 250); }
  }, 90);
}
function renderBill(b) {
  $('#billCard').classList.add('show');
  const isGas = b.energy === 'gas';
  const rows = isGas
    ? [['상호 / 업종', `${b.상호} · ${b.업종}`],
       ['에너지원', '도시가스'],
       ['소재지 · 면적', `${b.지역} · ${b.면적}㎡`],
       ['계약 용도', b.용도],
       ['월 사용량', `${b.사용량_MJ.toLocaleString()} MJ`]]
    : [['상호 / 업종', `${b.상호} · ${b.업종}`],
       ['에너지원', '전기'],
       ['소재지 · 면적', `${b.지역} · ${b.면적}㎡`],
       ['계약종별', b.계약종],
       ['계약전력', `${b.계약전력} kW`],
       ['월 사용량', `${b.사용량.toLocaleString()} kWh`]];
  $('#billBody').innerHTML = rows.map(r => `<div class="brow"><span>${r[0]}</span><b>${r[1]}</b></div>`).join('')
    + `<div class="brow hl"><span>이번 달 청구액</span><b>${won(b.청구액)}</b></div>`;
  $('#toBench').classList.add('show');
}

// ───────── 2. 동종 벤치마크 ─────────
function analyze(b) {
  const peer = PEER[b.peer];
  const billMan = b.청구액 / 10000;
  const below = peer.filter(v => v < billMan).length;
  const pctBelow = below / peer.length;
  const topPct = Math.max(1, Math.round((1 - pctBelow) * 100));
  const median = peer[Math.floor(peer.length / 2)];
  const overMonth = billMan - median;
  return { topPct, median, overMonth, overYear: overMonth * 12,
    pos: Math.min(97, Math.max(3, Math.round(pctBelow * 100))) };
}
function renderBench() {
  const a = analyze(current);
  const isGas = current.energy === 'gas';
  const kind = isGas ? '가스요금' : '전기요금';
  const over = a.overMonth > 0;
  $('#benchTop').textContent = over ? `상위 ${a.topPct}%` : `하위 ${100 - a.topPct}%`;
  $('#benchTop').className = 'huge ' + (over ? 'red' : 'green');
  $('#benchSub').textContent = over ? `동종 대비 ${kind} 많이 내는 편` : `동종 대비 ${kind} 잘 내고 있어요`;
  $('#marker').style.left = a.pos + '%';
  $('#benchMsg').className = 'msg ' + (over ? 'warn' : 'ok');
  $('#benchMsg').innerHTML = over
    ? `동종(${current.업종}) 중앙값보다<br><b>월 ${man(a.overMonth * 10000)} · 연 ${man(a.overYear * 10000)}원</b> 더 냅니다`
    : `동종 중앙값보다 적게 내는 <b>알뜰 매장</b>입니다`;
  $('#benchNote').textContent = `※ 같은 동네·같은 업종 ${PEER[current.peer].length}개 점포 분포 기준 (${isGas ? '한국가스공사 용도별 요금' : '한전 지역×업종'} 데이터)`;
}

// ───────── 3. AI 절감 처방 ─────────
function prescribe(b) {
  return b.energy === 'gas' ? prescribeGas(b) : prescribeElec(b);
}
function prescribeGas(b) {
  const rx = []; let saveY = 0;
  if (b.용도 === '업무난방용') {                 // 용도 오계약(음식점=영업용이 맞음)
    const save = (GAS_TARIFF['업무난방용'] - GAS_TARIFF['영업용']) * b.사용량_MJ * 12;
    saveY += save;
    rx.push({ n: '①', t: `계약 용도 업무난방용 → 영업용 전환`, d: `음식점은 '영업용'이 정상 — 단가 ${(GAS_TARIFF['업무난방용'] - GAS_TARIFF['영업용']).toFixed(2)}원/MJ 절감`, save });
  }
  if (b.효율 > 1.25) {                            // 노후 화구·단열 비효율
    const save = Math.round((b.효율 - 1) * b.사용량_MJ * GAS_TARIFF['영업용'] * 12 * 0.5);
    saveY += save;
    rx.push({ n: rx.length ? '②' : '①', t: `노후 버너·단열 효율 개선`, d: `동종 대비 사용량 과다 — 고효율 버너 교체 시 추정 절감`, save });
  }
  return { rx, saveY: Math.round(saveY), apply: '도시가스사에 용도 변경 신청', note: '한국가스공사·지역 도시가스사 요금표 기반 추정' };
}
function prescribeElec(b) {
  const rx = []; let saveY = 0;
  const t = ELEC_TARIFF[b.계약종] || ELEC_TARIFF['일반용(갑)Ⅱ'];
  const adequate = Math.ceil(b.추정최대수요);
  if (b.계약전력 > b.추정최대수요 * 1.25) {
    const save = (b.계약전력 - adequate) * t.기본료_kW * 12;
    saveY += save;
    rx.push({ n: '①', t: `계약전력 ${b.계약전력} → ${adequate}kW로 하향`, d: `최대수요(${b.추정최대수요}kW) 대비 과다 — 기본료 낭비`, save });
  }
  if (b.계약종.startsWith('일반용(갑)')) {
    const opt = ELEC_TARIFF['선택형Ⅱ'], diff = t.전력량_kWh - opt.전력량_kWh;
    if (diff > 0) {
      const save = Math.round(diff * b.사용량 * 12);
      saveY += save;
      rx.push({ n: '②', t: `계약종 ${b.계약종} → 선택형Ⅱ 전환`, d: `시간대 사용패턴상 선택형 유리(단가 ${diff}원/kWh↓)`, save });
    }
  }
  return { rx, saveY: Math.round(saveY), apply: '한전에 요금제 변경 신청', note: '한전 요금표 기반 추정' };
}
function renderRx() {
  const r = prescribe(current);
  const box = $('#rxList');
  if (r.rx.length === 0) {
    box.innerHTML = `<div class="rx ok-rx"><b>이미 최적에 가깝게 쓰고 계세요 👍</b><br>용도·사용량 모두 동종 평균 이하입니다.</div>`;
    $('#saveBig').textContent = '₩0';
    $('#saveLabel').textContent = '추가 절감 여지 적음 (적정 매장)';
    $('#applyBtn').style.display = 'none';
    $('#rxNote').textContent = '※ ' + r.note;
    return;
  }
  box.innerHTML = r.rx.map(x => `
    <div class="rx">
      <div class="rxh"><span class="rxn">${x.n}</span><b>${x.t}</b></div>
      <div class="rxd">${x.d}</div>
      <div class="rxsave">예상 절감 <b>${won(x.save)}/년</b></div>
    </div>`).join('');
  $('#saveBig').textContent = won(r.saveY);
  $('#saveLabel').textContent = '계약 변경 시 연간 절감 예상액';
  $('#applyBtn').style.display = 'block';
  $('#applyBtn').textContent = r.apply + ' →';
  $('#rxNote').textContent = '※ ' + r.note + '. 실제 변경 가부는 공급사 확인 필요.';
}

// ───────── 업로드(선택) ─────────
function onUpload(file) {
  alert('데모 모드: 업로드 고지서는 샘플로 인식합니다.\n실제 Vision OCR은 설정에서 API 키 연동 시 작동합니다.');
  loadSample('hansik');
}

// ───────── 초기화 ─────────
window.addEventListener('DOMContentLoaded', () => {
  SAMPLES.forEach(s => {
    const b = document.createElement('button');
    b.className = 'sample'; b.textContent = s.label;
    b.onclick = () => loadSample(s.id);
    $('#samples').appendChild(b);
  });
  $('#toBench').onclick = () => { renderBench(); go(2); };
  $('#toRx').onclick = () => { renderRx(); go(3); };
  $('#back2').onclick = () => go(1);
  $('#back3').onclick = () => go(2);
  $('#fileIn').onchange = e => { if (e.target.files[0]) onUpload(e.target.files[0]); };
  $('#applyBtn').onclick = () => alert('해당 공급사(한국가스공사·도시가스사 / 한전) 요금·용도 변경 신청 페이지로 이동합니다. (데모)');
  $('#keyBtn').onclick = () => alert('우리가게 에너지벤치 — 한국가스공사 공공데이터 기반 데모');
});
