// 図鑑と遊び方。中身はゲームのデータ（id付き）から作るので、仕様とずれない。
import { onTap } from './input.js';
import { Scroller, esc } from './widgets.js';
import { WEAPONS, CAT_NAME } from '../engine/data/weapons.js';
import { GEAR, LONG, VEST, PLATE, HELMET, HEADWEAR, ALWAYS_NAME } from '../engine/data/equipment.js';
import { SUSPECTS, CIVILIANS } from '../engine/data/npc.js';
import { MISSIONS, MISSION_LIST, DIFFS } from '../engine/data/missions.js';
import { MODE_INFO, PVP_MODES } from '../engine/modes/index.js';
import { MAPS, MAP_LIST } from '../engine/maps/index.js';
import { weaponCard } from './loadout.js';

const TABS = [['play', '遊び方'], ['ctrl', '操作'], ['roe', '交戦規定'], ['missions', '作戦'], ['pvp', '対戦'], ['maps', 'マップ'], ['guns', '銃'], ['gear', '装備'], ['people', '人物']];

export class Book {
  constructor(app, el, tab, onTab) {
    this.app = app; this.el = el; this.tab = tab; this.onTab = onTab; this.sub = null;
    this.render();
  }
  render() {
    const tabs = this.el.querySelector('.book-tabs');
    tabs.innerHTML = TABS.map(([k, n]) => `<button class="tab${k === this.tab ? ' on' : ''}" data-tab="${k}">${n}</button>`).join('');
    tabs.querySelectorAll('[data-tab]').forEach(b => onTap(b, () => { this.tab = b.dataset.tab; this.sub = null; this.onTab(this.tab); this.app.audio.ui('tap'); this.render(); }));
    const body = this.el.querySelector('.book-body');
    body.innerHTML = this[this.tab]();
    body.scrollTop = 0;
    body.querySelectorAll('[data-sub]').forEach(b => onTap(b, () => { this.sub = b.dataset.sub; this.app.audio.ui('tap'); this.render(); }));
  }
  play() {
    return `<h3>どんなゲーム？</h3><p>SWATの一員として建物に突入し、立てこもった容疑者を逮捕し、市民を救出する。撃つのは最後の手段。終わると点数（S〜F）がつく。</p>
      <h3>基本の流れ</h3><ol><li>扉の前で止まり、<b>ミラー</b>（調べるを長押し）で向こうをのぞく。罠や人が分かる。</li><li>隊員に<b>命令</b>する（命令ボタンを長押し→「突入」→開け方→投げ物）。ひとりなら自分で開ける。</li><li>人を見たら<b>警告</b>ボタンで呼びかける。従えば手を上げてひざまずく。</li><li>従った人は<b>調べる</b>で拘束する。倒れた人・拘束した人は<b>調べる</b>でTOC（本部）へ報告する。</li><li>落ちた武器や証拠も<b>調べる</b>で回収する。</li><li>主目的がそろったら一時停止から「本部へ戻る」。</li></ol>
      <h3>体と傷</h3><p>撃たれると出血することがある（体力が少しずつ減り、足が遅くなる）。装備の包帯がなくても、調べるを長押しして自分の止血ができる（50%まで回復）。腕を撃たれると反動が大きくなり、脚を撃たれると遅くなる。</p>
      <h3>みんなで</h3><p>作戦は2〜4人、対戦は最大4対4。空いた枠はAIが入る。部屋のコード（5文字）か招待リンクで入る。</p>`;
  }
  ctrl() {
    const rows = [
      ['移動', '左側のどこでも指を置いて動かす（固定にもできる）。対戦は上に倒しきるとダッシュ。'],
      ['見回す', '右側をドラッグ。射撃ボタンを押したままずらしても見回せる。'],
      ['射撃', '大きい丸。左にも出せる。'], ['構える（ADS）', '照準の丸。押すたび切替／押している間（設定）。'],
      ['リロード', 'タップで通常（弾倉を残す）、長押しで速いリロード（弾倉を捨てる）。'],
      ['しゃがむ', 'タップでしゃがむ、長押しで伏せる。'], ['リーン', '左右の矢印。壁から体を出さずにのぞく。'],
      ['警告', 'メガホン。容疑者と市民に投降を呼びかける。'],
      ['調べる', '手の形。その時できること（開ける・拘束・報告・拾う・解除）。長押しで扉の操作の円形メニュー（ミラー・蹴る・ウェッジ・C2…）。'],
      ['命令', '旗の形。タップで見ている物への既定の命令、長押しで円形メニュー。人の形のボタンで「全員・赤・青」を切り替える。'],
      ['投げ物・装備', 'タップで持ち替え、射撃で投げる。長押しで種類を選ぶ。'],
      ['武器', '下の真ん中の2つ。タップで持ち替え。'], ['小さいボタン', '射撃モード・ライト・暗視装置・ローレディ（速く歩けるが撃てない）。'],
      ['地図', '左上の地図ボタン。目的と見つけた人の位置。'],
    ];
    return `<h3>スマホの操作</h3><dl class="kv wide">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl><p class="note">設定の「HUD → 配置を編集」で、すべてのボタンの位置・大きさ・濃さを変えられる。</p>`;
  }
  roe() {
    return `<h3>交戦規定（ROE）</h3><p>実弾を撃ってよいのは、<b>差し迫った命の危険</b>があるときだけ。</p>
      <ul><li>相手が銃をこちらへ向けた・撃った・抜こうとした（直前2秒）</li><li>武器を持ったまま、2回以上警告しても従わない</li></ul>
      <h3>減点になること</h3><dl class="kv"><dt>不当な殺傷</dt><dd>−15（投降した人・拘束した人・丸腰の人を撃って死なせた）</dd><dt>不当な実力行使</dt><dd>−5（警告せずに非致死の道具を使った、など）</dd><dt>市民の負傷</dt><dd>−5</dd><dt>市民の死亡</dt><dd>−25</dd><dt>味方への発砲</dt><dd>−5</dd></dl>
      <h3>点数（100点）</h3><dl class="kv"><dt>容疑者の制圧</dt><dd>25（逮捕100%・無力化して拘束70%・正当な射殺40%）</dd><dt>市民の救出</dt><dd>25</dd><dt>TOCへの報告</dt><dd>10</dd><dt>証拠の回収</dt><dd>10</dd><dt>作戦の目標</dt><dd>10</dd><dt>隊員の安全</dt><dd>10</dd><dt>交戦規定</dt><dd>10</dd></dl>
      <p>評価: S 95以上（違反なし・死者なし）、A 85、B 70、C 55、D 40、それ未満と失敗はF。</p>
      <h3>非致死の道具</h3><p>ビーンバッグ・ペッパーボール・テーザー・ペッパースプレー・閃光・スティンガー・CSガスは、従わない相手（警告して従わない）か武器を持つ相手に使えば正当。士気を下げて投降させやすくする。</p>`;
  }
  missions() {
    return MISSION_LIST.map(id => { const M = MISSIONS[id]; return `<h3>${esc(M.name)} <small>${esc(M.en)}</small></h3><p>${esc(M.desc)}</p><p class="note">容疑者 ${M.sus[0]}〜${M.sus[1]}人 · 市民 ${M.civ[0]}〜${M.civ[1]}人${M.hostages ? ` · 人質 ${M.hostages[0]}〜${M.hostages[1]}人` : ''}${M.bombs ? ` · 爆弾 ${M.bombs[0]}〜${M.bombs[1]}個（${Math.floor(M.time / 60)}分）` : ''}</p>`; }).join('') +
      `<h3>難易度</h3><dl class="kv">${Object.values(DIFFS).map(d => `<dt>${d.name}</dt><dd>${esc(d.desc)}</dd>`).join('')}</dl>`;
  }
  pvp() {
    return PVP_MODES.map(id => `<h3>${esc(MODE_INFO[id].name)} <small>${esc(MODE_INFO[id].en)}</small></h3><p>${esc(MODE_INFO[id].desc)}</p>`).join('') +
      `<h3>対戦の体と防具</h3><p>頭は1発で倒れる。胴は100%、手足は75%。距離で弱くなる。防具は軽（体力100・速い）・中（110）・重（125・遅い）。包帯で40回復・止血。</p>
      <h3>爆弾（攻守）の流れ</h3><ol><li>準備45秒: 立てこもり犯は壁の補強（調べるを長押し）・扉にバリケード・罠。SWATはドローンで偵察（射撃で敵に印）。</li><li>行動3分: SWATは解除装置を爆弾の場所に置く（7秒）。置いた後45秒で解除が終わればSWATの勝ち。</li><li>立てこもり犯は置かれた解除装置を外す（7秒）か、置かれる前に全員倒すか、時間切れで勝ち。</li><li>倒れても仲間に起こしてもらえる（ダウン）。</li></ol>`;
  }
  maps() {
    return MAP_LIST.map(id => { const m = MAPS[id]; return `<h3>${esc(m.name)} <small>${esc(m.en)}</small></h3><p>${esc(m.desc)}</p><p class="note">${{ day: '昼', dusk: '夕方', night: '夜', dawn: '明け方' }[m.time] || ''} · ${m.levels.length}階 · 突入口: ${(m.spawn.swat || []).map(s => s.name).join('、')}</p>`; }).join('');
  }
  guns() {
    const ids = Object.keys(WEAPONS);
    const cur = this.sub && WEAPONS[this.sub] ? this.sub : ids[0];
    const groups = {};
    for (const id of ids) { const W = WEAPONS[id]; const k = (W.side === 'sus' ? '容疑者側の' : '') + CAT_NAME[W.cat]; (groups[k] = groups[k] || []).push(id); }
    return `<div class="book-split"><div class="list">${Object.entries(groups).map(([g, list]) => `<h4>${g}</h4>${list.map(id => `<button class="opt${id === cur ? ' on' : ''}" data-sub="${id}"><b>${esc(WEAPONS[id].name)}</b></button>`).join('')}`).join('')}</div><div class="detail">${weaponCard({ id: cur }, 'pve')}<p class="note">対戦での威力: ${WEAPONS[cur].pvp ? WEAPONS[cur].pvp.dmg + (WEAPONS[cur].pvp.pellets ? '×' + WEAPONS[cur].pvp.pellets : '') : '-'}</p></div></div>`;
  }
  gear() {
    const sec = (t, o, f) => `<h3>${t}</h3><dl class="kv wide">${Object.entries(o).filter(([k]) => k !== 'none').map(([k, v]) => `<dt>${esc(v.name)}</dt><dd>${esc(f ? f(v) : (v.desc || ''))}</dd>`).join('')}</dl>`;
    return sec('投げ物・小さな装備', GEAR) + sec('長い戦術装備', LONG) +
      sec('防弾ベスト', VEST, (v) => '守る所: ' + v.cover.map(c => ({ chest: '胸', back: '背中', belly: '腹', side: '脇' })[c]).join('・')) +
      sec('板の材質', PLATE, (v) => `防護${v.prot}${v.hits ? `・${v.hits}発で割れる` : '・割れない'}${v.accel ? `・加速−${Math.round(v.accel * 100)}%` : ''}`) +
      sec('ヘルメット', HELMET, (v) => `耐久${v.dur}・跳弾${Math.round(v.rico * 100)}%`) + sec('頭の装備', HEADWEAR, () => '') +
      `<h3>いつも持っている物</h3><p>${Object.values(ALWAYS_NAME).join('、')}</p>`;
  }
  people() {
    return '<h3>容疑者</h3>' + Object.values(SUSPECTS).filter(s => !s.training).map(s => `<h4>${esc(s.name)}</h4><p>${esc(s.desc)}</p><p class="note">投降しやすさ ${Math.round((1 - (s.morale[0] + s.morale[1]) / 2) * 100)} · 攻撃的 ${Math.round(s.aggr * 100)} · 防弾ベスト ${Math.round(s.armor * 100)}% · 隠し武器 ${Math.round(s.hidden * 100)}%</p>`).join('') +
      '<h3>市民</h3>' + Object.values(CIVILIANS).map(c => `<h4>${esc(c.name)}</h4><p>${esc(c.desc)}</p>`).join('');
  }
}
