/* 우리가게 전기벤치 — 앱 로직 */
'use strict';
const $ = s => document.querySelector(s);
const won = n => '₩' + Math.round(n).toLocaleString('ko-KR');
const man = n => (n / 10000).toFixed(0) + '만';

let current = null; // 현재 분석 고지서

// ───────── 화면 전환 ─────────
function go(step) {
  ['s1', 's2', 's3'].forEach((id, i) => {
    $('#' + id).classList.toggle('on', i === step - 1);
  });
  document.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('act', i === step - 1));
  window.scrollTo(0, 0);
}

// ───────── 1단계: 고지서 인식 ─────────
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
  $('#billBody').innerHTML = `
    <div class="brow"><span>상호 / 업종</span><b>${b.상호} · ${b.업종}</b></div>
    <div class="brow"><span>소재지 · 면적</span><b>${b.지역} · ${b.면적}㎡</b></div>
    <div class="brow"><span>계약종별</span><b>${b.계약종}</b></div>
    <div class="brow"><span>계약전력</span><b>${b.계약전력} kW</b></div>
    <div class="brow"><span>월 사용량</span><b>${b.사용량.toLocaleString()} kWh</b></div>
    <div class="brow hl"><span>이번 달 청구액</span><b>${won(b.청구액)}</b></div>`;
  $('#toBench').classList.add('show');
}

// ───────── 2단계: 동종업계 벤치마크 ─────────
function analyze(b) {
  const peer = PEER[b.업종];
  const scale = 50 / b.면적;
  const bill50 = (b.청구액 / 10000) * scale;       // 만원, 50㎡ 환산
  const below = peer.filter(v => v < bill50).length;
  const pctBelow = below / peer.length;
  const topPct = Math.max(1, Math.round((1 - pctBelow) * 100));
  const median = peer[Math.floor(peer.length / 2)];
  const overMonth = (bill50 - median) / scale;     // 실제 점포 월 초과(만원)
  return {
    topPct, median, overMonth, overYear: overMonth * 12,
    pos: Math.min(97, Math.max(3, Math.round(pctBelow * 100)))
  };
}

function renderBench() {
  const a = analyze(current);
  const over = a.overMonth > 0;
  $('#benchTop').textContent = over ? `상위 ${a.topPct}%` : `하위 ${100 - a.topPct}%`;
  $('#benchTop').className = 'huge ' + (over ? 'red' : 'green');
  $('#benchSub').textContent = over ? '동종 대비 전기요금 많이 내는 편' : '동종 대비 잘 내고 있어요';
  $('#marker').style.left = a.pos + '%';
  $('#benchMsg').className = 'msg ' + (over ? 'warn' : 'ok');
  $('#benchMsg').innerHTML = over
    ? `동종(${current.업종}) 중앙값보다<br><b>월 ${man(a.overMonth * 10000)} · 연 ${man(a.overYear * 10000)}원</b> 더 냅니다`
    : `동종 중앙값보다 적게 내는 <b>알뜰 매장</b>입니다`;
  $('#benchNote').textContent = `※ 같은 동네·같은 업종 ${PEER[current.업종].length}개 점포 분포 기준 (한전 지역×업종 데이터)`;
}

// ───────── 3단계: AI 절감 처방 ─────────
function prescribe(b) {
  const rx = []; let saveY = 0;
  const t = TARIFF[b.계약종] || TARIFF["일반용(갑)Ⅱ"];
  const adequate = Math.ceil(b.추정최대수요);
  if (b.계약전력 > b.추정최대수요 * 1.25 && t.기본료_kW > 0) {
    const save = (b.계약전력 - adequate) * t.기본료_kW * 12;
    saveY += save;
    rx.push({ n: '①', t: `계약전력 ${b.계약전력} → ${adequate}kW로 하향`, d: `최대수요(${b.추정최대수요}kW) 대비 과다 — 기본료 낭비`, save });
  }
  if (b.계약종.startsWith('일반용(갑)')) {
    const opt = TARIFF['선택형Ⅱ'], diff = t.전력량_kWh - opt.전력량_kWh;
    if (diff > 0) {
      const save = Math.round(diff * b.사용량 * 12);
      saveY += save;
      rx.push({ n: '②', t: `계약종 ${b.계약종} → 선택형Ⅱ 전환`, d: `시간대별 사용패턴상 선택형이 유리(단가 ${diff}원/kWh↓)`, save });
    }
  }
  return { rx, saveY: Math.round(saveY) };
}

function renderRx() {
  const r = prescribe(current);
  const box = $('#rxList');
  if (r.rx.length === 0) {
    box.innerHTML = `<div class="rx ok-rx"><b>이미 최적에 가깝게 쓰고 계세요 👍</b><br>계약종·계약전력 모두 적정 범위입니다.</div>`;
    $('#saveBig').textContent = '₩0';
    $('#saveLabel').textContent = '추가 절감 여지 적음 (적정 매장)';
    $('#applyBtn').style.display = 'none';
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
}

// ───────── 업로드(선택): 실제 OCR or 데모 ─────────
function onUpload(file) {
  const key = localStorage.getItem('gemini_key');
  if (!key) {
    alert('데모 모드: 업로드 고지서는 샘플(카페)로 인식합니다.\n실제 Vision OCR을 쓰려면 설정에서 Gemini API 키를 넣어주세요.');
    loadSample('cafe');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    showScanning(async () => {
      try {
        const b64 = reader.result.split(',')[1];
        const parsed = await geminiOCR(b64, file.type, key);
        current = { ...SAMPLES[0], ...parsed };
        renderBill(current);
      } catch (e) {
        alert('OCR 실패 — 데모 샘플로 대체합니다.\n' + e.message);
        current = { ...SAMPLES[0] }; renderBill(current);
      }
    });
  };
  reader.readAsDataURL(file);
}

async function geminiOCR(b64, mime, key) {
  const prompt = `전기요금 고지서 이미지에서 다음을 JSON으로만 추출:
{"상호":"","업종":"카페·커피전문점|한식음식점|제과·제빵|편의점 중 추정","면적":50,"지역":"","계약종":"일반용(갑)Ⅱ 등","계약전력":숫자kW,"사용량":숫자kWh,"청구액":숫자원,"추정최대수요":숫자kW}
모르면 합리적 추정값. 코드블록 없이 JSON만.`;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: b64 } }] }] })
  });
  const j = await res.json();
  let txt = j.candidates[0].content.parts[0].text.replace(/```json|```/g, '').trim();
  return JSON.parse(txt);
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
  $('#applyBtn').onclick = () => alert('한전 사이버지점(cyber.kepco.co.kr) 요금제 변경 신청 페이지로 이동합니다.\n(데모)');
  $('#keyBtn').onclick = () => {
    const k = prompt('Gemini API 키 입력(실제 OCR용, 브라우저에만 저장):', localStorage.getItem('gemini_key') || '');
    if (k !== null) { localStorage.setItem('gemini_key', k.trim()); alert('저장됨'); }
  };
});
