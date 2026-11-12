# WAR BIT の調べもの（BattleBit Remastered・Battlefield）

段階ごとに調べて足していく。各行の終わりに出典。数値が出典どうしで食い違うときは両方を書く。→ のあとは WAR BIT での決めごと。

## 1. 人数とマップの広さ（2026-11-13 02:15 調べ）

### BattleBit Remastered
- 1試合最大254人。64人（32対32）・128人（64対64）・254人（127対127）のサーバー。Rush は254人では無い。
  出典: en.wikipedia.org/wiki/BattleBit_Remastered
- 公式Wikiの説明では 127対127・64対64・32対32、サーバー一覧にはほかに 8対8 なども出る。Conquest＝「全部の乗り物・大きいマップ・旗の奪い合い」、Infantry Conquest＝「輸送車だけ・大きいマップ」、Domination＝「乗り物なし・小さいマップ」。
  出典: battlebit.wiki.gg/wiki/How_to_play_guide_for_BattleBit
- 発売前の告知では 8v8・16v16・32v32・64v64・127v127。マップの形が人数に合わせて変わる。建物・高層ビル・地下壕まで「ほぼ全部」壊せる。
  出典: 80.lv（BattleBit Remastered low poly FPS is out in June）
- 一番大きいマップは 127対127 用。64対64 と 32対32 は専用のマップか、大きいマップの一部を切り取って使う。マップは19（Azagor, Basra, Construction, District, Dusty Dew, Eduardovo, Frugis, Isle, Lonovo, Multu Islands, Namak, Oil Dunes, River, Salhan, Sandy Sunset, Tensa Town, Valley, Wakistan, Wine Paradise）。
  出典: ggrecon.com/guides/battlebit-remastered-maps
- 大型アップデートの開発日誌: 新マップ Peaks は「2×2km の地形のうち、Conquest で遊べるのは 1×2km」。Construction は 500×500m から 1000×1000m に広げて Conquest 127v127 の形を作った。Valley は「拠点の間を 500m 以上移動しなければならなかった」ので半分に縮めた。Sandy Sunset は 40% 縮めた。Wakistan は中央に C、両チームに脇の拠点が2つずつ（A・C・E は固定、B・D は試合ごとに入れ替え）、32v32 用の区画を持つ。境界は全部壊せる壁。
  出典: joinbattlebit.com/operation-overhaul-dev-blog-4/
- 開発者インタビュー（初期）では「マップは 64〜256km²」。上の開発日誌の実寸（0.25〜2km²）と大きく違うので、地形全体か初期の構想の数字とみる。
  出典: 80.lv/articles/battlebit-interview-with-the-developers
→ 遊べる範囲: 小（16対16）約 500m 四方、中（32対32）約 800m 四方、大（64対64）約 1200m 四方。いまの「リバーベンド」（全体 1400m、範囲 500・800・1200m）はこのとおり。拠点の間は 150〜300m（500m を超えると遠すぎる、という BattleBit の反省に合わせる）。

### Battlefield
- 境界は2つ（地上用と、それより広い航空機用）。人数で大きさが変わる。外に出ると「3〜15秒」（作品による）の秒読み、戻らないと死亡し蘇生できない。Hardline は10秒。白黒＋ノイズの画面。
  出典: battlefield.fandom.com/wiki/Boundary
- BF2042 のマップの面積（128人）: Kaleidoscope 0.21km²、Discarded 0.64、Orbital 0.78、Manifest 0.92、Hourglass 1.2、Breakaway 5.9。旧世代機は64人で縮めた版。Golmud Railway の Conquest Large は旗7つ。
  出典: ofzenandcomputing.com（BF4 vs BF2042 Map Scale）※記事の測り方の出典は示されていない
- BF6 の Golmud Railway: 「数km²」、Conquest の拠点は7つ（工事現場・村・VIP 施設・列車・橋の工事・倉庫・農場）。拠点どうしは見通せないように置く。本陣の近くに1つずつ。
  出典: ea.com（Railway to Golmud developer map guide）
- 設計の目安（評論）: 出現から戦闘まで 15〜20 秒。40 秒を超えると人数に関係なく空っぽに感じる。
  出典: geekvibesnation.com（Battlefield player count vs map density）
→ 境界の外は 10 秒（白黒＋ノイズ）で死亡。本陣から最初の拠点まで歩いて 30 秒以内、出現できる拠点から戦闘まで 15〜20 秒になるよう、拠点と出現の場所を置く。

## 2. コンクエスト（旗の奪い合い）
- 旗を半分より多く持つ側が、相手のチケットを減らし続ける（遅れている旗の数で決まる一定の速さ）。チケットは「死んだとき」ではなく「出現したとき」に1減る。蘇生されれば戻る（BF2 から）。
  出典: battlefield.fandom.com/wiki/Conquest
- 旗の範囲に立ち続けると奪える。味方が多いほど速く、敵がいると遅くなり、同数なら止まる。敵の旗はまず中立に戻してから奪う（時間がかかる）。範囲の広さはマップごとに大きく違う。BF5 では旗竿に近いほど速い。両チームの本陣は奪えない。
  出典: battlefield.fandom.com/wiki/Conquest、gamepressure.com（Battlefield 4: Conquest and Conquest Large）
- チケット: BF4 は Conquest 300・Conquest Large 800（サーバーで変えられる）。BF6 の Conquest は64人で1200。
  出典: gamepressure.com（BF4 Conquest）、battlefield.fandom.com/wiki/Conquest
→ 小 300・中 500・大 800 チケット。出現で1減り、蘇生で戻る。旗を過半数持つと相手が毎秒（差の旗数×0.3）減る。旗の範囲は半径 18〜26m、奪うのは1人で 20 秒（中立に戻すのに 10 秒＋奪うのに 10 秒）、人数で速く（最大4人分）。

## 3. 分隊と兵科
- 分隊は最大8人（クランのパーティは12人）。127人のチームで最大15分隊。
  出典: ggrecon.com/guides/battlebit-remastered-team-squad-party-size
- 兵科は6つ: 分隊長（拠点の指示、出現ビーコン。分隊の持ち主だけが選べる）、突撃、衛生（すばやい回復と蘇生）、援護（制圧射撃と弾薬箱）、工兵（爆薬で建物と乗り物を壊す）、偵察（見張り・偵察・一撃離脱）。
  出典: en.wikipedia.org/wiki/BattleBit_Remastered
- 兵科の中身（攻略記事）: 分隊長 AR・DMR・拳銃、包帯と手榴弾が1つ多い、双眼鏡（SOFLAM）かドローン。突撃 AR・拳銃、小さい弾薬箱、ライオットシールド、ハンマー、グラップリングフック。援護 軽機関銃・拳銃、大きい弾薬箱（約1000発、手榴弾・地雷・C4 を5つまで補給）、大きい防壁（Hesco）を建てられる。衛生 AR・SMG・PDW・カービン・拳銃、医療キット（味方を回復できる唯一の物。無限）、包帯16個多い、包帯を2倍速く巻く。工兵 AR・SMG・PDW・カービン・DMR・拳銃、修理工具・RPG（HEAT と破片）・対車両手榴弾。偵察 狙撃銃・DMR・拳銃、ドローン、ヘルメットなし、800m より遠いと胴体1発（近いと頭が要る）。
  出典: earlygame.com（BattleBit Remastered: Classes Explained）
- 開発中の調整（大型アップデートの日誌）: 体力 突撃・衛生・工兵 100、援護 125、偵察 90。走り続けると数秒後に速くなる。伏せの向き替えに上限。乗り越えは「上に登る」形。交戦距離の目安 SMG・PDW 0〜35m、カービン・AR 35〜70m、バトルライフル 70〜100m、DMR・狙撃 100〜300m 以上。分隊のポイントは個人の「フィールドポイント」に変わる予定。争っている拠点では味方の上に無料で出現できる。
  出典: joinbattlebit.com/operation-overhaul-dev-blog-2/
- 分隊のポイント: 分隊長が指示した拠点を中立化・占領すると入る（記事の中で 1000 と 200 が食い違う）、指示した拠点で敵を倒すと 50。ラリーポイントは 200 で置ける。土のうなどの防御物も建てられる。
  出典: slythergames.com（How to get squad points）、battlebit.wiki.gg/wiki/How_to_play_guide_for_BattleBit
- 回復（2.0）: 包帯は全員が持ち、自分を1つで40回復。味方には止血と蘇生だけ。味方の回復は衛生の医療キットだけ。倒れた人は時間制限つきのダウンになり、引きずって安全な所へ運べる。包帯が1つ以上あれば蘇生できる。衛生は包帯が多く蘇生が速い（攻略記事では衛生20個、ほかは2〜3個）。
  出典: mp1st.com（Update 2.0.0 patch notes）、en.wikipedia.org/wiki/BattleBit_Remastered、gameranx.com（How to heal guide）
→ 分隊は最大8人、兵科は6つのまま。体力は全員100（援護 125・偵察 90 は後で試す）。ダウン 30 秒・包帯で蘇生・自分に包帯で+40・医療キットだけが味方を回復。分隊長は指示した拠点で分隊のポイントがたまり、200 でラリーポイント。

## 4. 見た目
- ローポリ＝「とても少ない多角形で、角ばった・ブロックのような見た目」。「Tunic より Minecraft」で、絵の好みより技術の理由（人数と遠くまでの描画）。壊れた物は「単色の立方体が飛び散る」だけで、本物らしさの不気味さを避ける。
  出典: medium.com（Battlebit utilizes Low-Poly to beat Battlefield at their own game）
- Unity。地形は GAIA、物は Blender、テクスチャは paint.net。大きいローポリのマップの雰囲気に Deep Sky Haze（大気のもや）。木と建物は全部壊せる。壁は20個の破片を1つのメッシュにまとめ、破片ごとの骨に物理をつける（描画の呼び出し1回）。薬莢は描かずに瞬間移動させて CPU を節約。1サーバー128人・乗り物40台で安定。
  出典: 80.lv/articles/battlebit-interview-with-the-developers
- 評: ローポリと簡単なテクスチャ（PS2 時代のよう、ロブロックスに似る）を、影と環境効果が今風に見せている。
  出典: ggrecon.com（Why BattleBit is the Battlefield game you've always wanted）
→ 地形は三角形ごとの平らな色（草の色を少しずつ揺らす）、建物は箱、木は角ばった円錐と箱。光は空の光＋太陽＋遠いほど青白いもや（距離のもや）。壊れた物は単色の小さい立方体が飛ぶ。兵士は角ばった低ポリで、BattleBit と同じく現実に近い頭身（7頭身前後）・太めの手足と装備でシルエットを読みやすく。形と色は独自。

## 5. 動きと撃ち合い（2026-11-13 02:35 調べ）
- Battlefield V の速さ（m/s）: 走る 6.035・しゃがんで走る 5.04・歩く 3.4・しゃがみ 2.1・伏せ 0.85。ADS で歩く 1.7・しゃがみ 1.55・伏せ 0.425。体力は最後に傷を受けてから 10 秒で、毎秒 20 ずつ（助けなしで 30 まで）戻る。
  出典: sym.gg/legacy/pages/bfv/bfv_generalinfo.html
- 走る速さ: BF3・BF4・BF2042 は 6.5 m/s（BF2042 の移動のダッシュは 7.25、BF3/BF4 の走る技能は 7.15）。BF Hardline 6.75。乗り越えの高さ 2.4m（BFV・2042）。
  出典: mp1st.com（Battlefield 2042 Movement & Sprint Speed Comparison）
- BattleBit の数値の意味: 減衰は連射の速い銃ほど強い。DMR はほとんど減らず、狙撃はむしろ増える。拳銃はどの主武器より急に減る。頭の倍率 SMG と拳銃 1.2（重い拳銃を除く）・狙撃 1.9・ほか 1.5。走る速さ＝銃が移動を遅くする度合い。例: Desert Eagle 72・L96 65・Rem700 65・M200 70・SSG 69 60・Glock 18 19・USP 30。
  出典: battlebit.wiki.gg/wiki/Stats
- 弾の速さ・落ち方の数値は BattleBit Wiki に無い（読み込み画面の値）。
→ 速さは BFV に近く、BattleBit のように「まっすぐ走り続けると少し速くなる」（WAR_SPEED: 歩き 3.3・しゃがみ 2.0・伏せ 0.8・走る 5.9 → 3 秒で 6.6・ADS ×0.52）。弾は実際の初速で重力で落ちる（1500m・4 秒まで）。ダメージは BattleBit の値がある銃はその値、ほかは口径から（src/war/guns.js）。手足 0.75 は独自。
