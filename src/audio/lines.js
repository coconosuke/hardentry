// 声の台詞（英語の音声＋日本語の字幕）。who: 話す人の種類（swat=隊員・自分、sus=容疑者、civ=市民、toc=本部）
// 音声は tools/voices.py がこの表から作る（同じ順番の v と ja が対応）。
export const LINES = {
  // ---- 隊員（自分の呼びかけを含む）
  swat_police: { who: 'swat', v: ['Police! Show me your hands!', 'Police! Hands up! Now!', 'Police! Nobody move!'], ja: ['警察だ！手を見せろ！', '警察だ！手を上げろ！今すぐ！', '警察だ！動くな！'] },
  swat_hands: { who: 'swat', v: ['Hands! Let me see your hands!', 'Hands up! Do it now!', 'Show me your hands!'], ja: ['手だ！手を見せろ！', '手を上げろ！早く！', '手を見せろ！'] },
  swat_drop: { who: 'swat', v: ['Drop the weapon!', 'Drop it! Drop it now!', 'Put the gun down!'], ja: ['武器を捨てろ！', '捨てろ！今すぐ捨てろ！', '銃を下ろせ！'] },
  swat_ground: { who: 'swat', v: ['Get on the ground!', 'Down on the ground! Now!', 'Get down! On your knees!'], ja: ['床に伏せろ！', '伏せろ！今すぐ！', '伏せろ！ひざをつけ！'] },
  swat_civ: { who: 'swat', v: ['Police! Get down, stay down!', "Get on the ground! We're here to help!", 'Hands where I can see them!'], ja: ['警察だ！伏せて、動かないで！', '伏せて！助けに来た！', '手を見えるところに！'] },
  swat_copy: { who: 'swat', v: ['Copy.', 'On it.', 'Moving.', 'Roger that.'], ja: ['了解。', '任せろ。', '移動する。', '了解した。'] },
  swat_breaching: { who: 'swat', v: ['Breaching now!', 'Breach, breach, breach!', 'Go, go, go!'], ja: ['突入する！', '突入、突入！', '行け、行け、行け！'] },
  swat_clear: { who: 'swat', v: ['Clear!', 'Room clear!', 'Clear left!', 'Clear right!'], ja: ['クリア！', '部屋はクリア！', '左クリア！', '右クリア！'] },
  swat_locked: { who: 'swat', v: ["Door's locked.", "It's locked."], ja: ['扉に鍵がかかっている。', '鍵がかかってる。'] },
  swat_flash: { who: 'swat', v: ['Flashbang out!', 'Flash out!'], ja: ['閃光弾、投げる！', '閃光、行くぞ！'] },
  swat_stinger: { who: 'swat', v: ['Stinger out!'], ja: ['スティンガー、投げる！'] },
  swat_gas: { who: 'swat', v: ['Gas out!', 'C.S. out!'], ja: ['ガス、投げる！', 'CS、行くぞ！'] },
  swat_reload: { who: 'swat', v: ['Reloading!', 'Changing mags!'], ja: ['リロード！', '弾倉交換！'] },
  swat_cuffsus: { who: 'swat', v: ['Suspect in cuffs.', 'Suspect secured.'], ja: ['容疑者を拘束。', '容疑者を確保。'] },
  swat_cuffciv: { who: 'swat', v: ['Civilian in cuffs.', 'Civilian secured.'], ja: ['市民を拘束。', '市民を保護。'] },
  swat_susdown: { who: 'swat', v: ['Suspect down.', 'Target down.'], ja: ['容疑者、倒れた。', '敵、倒れた。'] },
  swat_mandown: { who: 'swat', v: ['Officer down!', "We've got a man down!"], ja: ['隊員が倒れた！', '一人やられた！'] },
  swat_mirror_sus: { who: 'swat', v: ['Armed suspect behind the door.', "I've got a suspect inside."], ja: ['扉の向こうに武装した容疑者。', '中に容疑者がいる。'] },
  swat_mirror_civ: { who: 'swat', v: ['Civilian inside.', 'I see a civilian.'], ja: ['中に市民がいる。', '市民が見える。'] },
  swat_mirror_clear: { who: 'swat', v: ['Looks clear.', "Can't see anyone."], ja: ['誰もいないようだ。', '人は見えない。'] },
  swat_contact: { who: 'swat', v: ['Contact!', 'Contact front!', 'Shots fired!'], ja: ['敵だ！', '前方に敵！', '撃ってきた！'] },
  swat_trap: { who: 'swat', v: ["Trap on the door!", "It's rigged!"], ja: ['扉に罠がある！', '仕掛けられてる！'] },
  // ---- 容疑者
  sus_refuse: { who: 'sus', v: ['Get the hell out of here!', 'Screw you, pigs!', "I'm not going back!"], ja: ['出ていけ！', 'ふざけるな、警察め！', '刑務所には戻らねえ！'] },
  sus_give: { who: 'sus', v: ["Okay, okay! Don't shoot!", "I give up! I give up!", "Alright! I'm unarmed!"], ja: ['わかった、わかった！撃つな！', '降参だ！降参する！', 'わかった！何も持ってない！'] },
  sus_fake: { who: 'sus', v: ['Okay... okay...', "Don't shoot... "], ja: ['わかったよ……', '撃つなよ……'] },
  sus_exec: { who: 'sus', v: ["Back off or she dies!", "One more step and I kill them!"], ja: ['下がれ、さもないと殺すぞ！', 'もう一歩でも近づいたら殺す！'] },
  sus_taunt: { who: 'sus', v: ['Come and get me!', "They're here! Get ready!"], ja: ['来いよ！', '来たぞ！構えろ！'] },
  // ---- 市民
  civ_ok: { who: 'civ', v: ["Okay! Please don't shoot!", "I'm down, I'm down!", 'Please help me!'], ja: ['わかりました！撃たないで！', '伏せました、伏せました！', 'お願い、助けて！'] },
  civ_refuse: { who: 'civ', v: ["I didn't do anything!", 'Leave me alone!', 'Why are you doing this?'], ja: ['何もしてない！', 'ほっといて！', 'なんでこんなことするの！'] },
  civ_scream: { who: 'civ', v: ['Help! Somebody help!', 'Oh my god!'], ja: ['助けて！誰か！', 'なんてこと！'] },
  // ---- 本部（TOC）
  toc_start: { who: 'toc', v: ['TOC to all units. You are cleared to enter. Watch your fire.', 'All units, TOC. Proceed. Remember the rules of engagement.'], ja: ['本部より全隊へ。突入を許可する。撃つ相手に気をつけろ。', '全隊、こちら本部。進め。交戦規定を忘れるな。'] },
  toc_copy: { who: 'toc', v: ['Command copies.', 'Copy that.'], ja: ['本部、了解。', '了解した。'] },
  toc_soft: { who: 'toc', v: ['All primary objectives complete. Return to the van when ready.', 'Good work. Primary objectives complete.'], ja: ['主目的はすべて達成。準備ができたら撤収せよ。', 'よくやった。主目的を達成。'] },
  toc_bomb: { who: 'toc', v: ['The bomb is safe. Good work.', 'Bomb is safe.'], ja: ['爆弾の解除を確認。よくやった。', '爆弾は安全だ。'] },
  toc_hostage: { who: 'toc', v: ["Hostage is down. Move faster!"], ja: ['人質がやられた。急げ！'] },
  toc_fail: { who: 'toc', v: ['Mission failed. All units, fall back.'], ja: ['作戦失敗。全隊、後退せよ。'] },
};
// 話す人（声の種類）: 自分 p、隊員 o0..o3、容疑者 s0..s2、市民 c0..c2、本部 toc
export const SPEAKERS = {
  p: { who: 'swat', name: 'リード' }, o0: { who: 'swat' }, o1: { who: 'swat' }, o2: { who: 'swat' }, o3: { who: 'swat' },
  s0: { who: 'sus' }, s1: { who: 'sus' }, s2: { who: 'sus' }, c0: { who: 'civ' }, c1: { who: 'civ' }, c2: { who: 'civ' }, toc: { who: 'toc' },
};
