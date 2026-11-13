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

## 6. 投げ物（実在の型。2026-11-13 02:50 調べ）
- M67 破片手榴弾: 重さ 397g、信管 M213 の遅れ 4〜5 秒、致死半径 5m、負傷半径 15m、投げられる距離 35m。
  出典: inetres.com（US hand grenades）、US Army FM 3-23.30（Grenades and Pyrotechnic Signals）
- M84 閃光音響弾: 信管の遅れ 1.0〜2.3 秒、1.5m で 170〜180dB、光は 1.5m 以内で 600万〜800万カンデラ（本文は 450万）。重さ 370g。目のくらみ・耳鳴り・平衡感覚の乱れ（一時的）。
  出典: en.wikipedia.org/wiki/M84_stun_grenade、inetres.com
- M18 発煙弾（色つき）: 平均 60 秒（50〜90 秒）。AN-M8 HC 白煙: 105〜150 秒。
  出典: inetres.com
- ABC-M7A3 CS: 煙は 15〜35 秒、投げられる距離 40m。AN-M14 焼夷弾: 12.7mm の鋼板を焼き抜く、25m。
  出典: inetres.com
→ 破片（M67: 4.5 秒・致死 5m・負傷 15m で減る・35m まで投げる）、閃光（M84: 1.5 秒）、発煙（M18: 60 秒。遊びやすさで 40 秒）、衝撃（当たると爆発する手榴弾。BattleBit の Impact Grenade に当たる独自の型）を兵科の持ち物にする。

## 7. 出撃の場所（2026-11-13 02:55 調べ）
- BattleBit: 分隊長が出撃ビーコン（ラリーポイント）を置くと、分隊は本陣ではなく近くから出撃できる。分隊のポイントが要る（200。攻略記事では 400〜500 という例も）。使われないことが多く、127v127 では「置かれるのを見ない」という声。本陣（メインの出撃地点）もある。
  出典: gamesradar.com（BattleBit players all want their squad leader to start putting that dang rally point down）、slythergames.com、gameplay.tips（How to set up FOBs/spawnpoints）、steamcommunity.com（BattleBit 掲示板 2023-07）
- 大型アップデートの方針: 争っている拠点では味方の上に無料で出られる（出待ちは防ぐ）。拠点の外の分隊員の上に出るのはポイントがかかる。
  出典: joinbattlebit.com/operation-overhaul-dev-blog-2/
→ 展開の画面で選べる所: 本陣・自軍の拠点（奪われかけていない所）・分隊長（撃ち合いの最中でない）・ラリーポイント。分隊員の上は M2 では入れず、ラリーポイントを分隊長がポイントなしで置ける（1つ・置き直し30秒。スマホの少人数でも使われるように）。

## 8. ボット（2026-11-13 03:20 調べ）
- BattleBit にボットはない（人だけの対戦）。Battlefield 2042 の AI 兵士は、Conquest と Breakthrough で足りない人数を埋める（128人のうち120人なら8体）。人を優先し、人が抜けると一時的に AI が入る。拠点を取る・乗り物を呼ぶ・乗り物と戦う。敵の撃ってくる方へ攻める・回り込む・手榴弾を投げる・倒れた分隊の仲間を起こす。専門家の技能やウイングスーツは使えない。
  出典: mp1st.com（Battlefield 2042 Bots Cannot Use Traits & Specialties, Cap Set for How Many Are in Each Match）
→ WAR BIT のボットも BF2042 の AI 兵士と同じ役目（足りない人数を埋める）。M2: 分隊ごとに拠点を目標にして外を歩き、拠点の中に散って守る。見えた敵を撃つ（遠いほど丁寧に狙う。交戦距離の外では4割だけ止まって撃ち、ほかは進む）。次: 倒れた仲間を起こす・手榴弾・回り込み・建物の中。

## 9. 道具（ガジェット）と投げ物（2026-11-13 03:35 調べ。M3 で使う）
- 道具は「主」と「副」の2つの枠。主: 修理工具（乗り物を直す）・小さい弾薬箱（主・副の弾と包帯。空の弾倉だけ）・対人地雷（踏む・撃つと爆発。味方も）・クレイモア（ワイヤーで指向性の爆発）・C4（貼って遠隔で爆発。装甲車に効く）・自爆C4・M320 発煙弾ランチャー・双眼鏡・高性能双眼鏡・SOFLAM（距離計つき）。副: 医療キット（自分か味方を回復）・大きい弾薬箱（味方に補給・道具も補充。なくした弾倉は戻さない）・RPG-7 破片（歩兵向け。軽い乗り物にも効く・戦車には効かない）・RPG-7 HEAT（装甲向け。軽い乗り物と建物）・RPG-7 タンデム（戦車向け）・つるはし（小さい穴・近接）・大ハンマー（壁と遮蔽物を壊す）・ドローン（見張り。C4 を付けられる）・グラップリングフック・MDX 201（スコープの反射のおとり）・ライオットシールド（弾を止めるが視界が狭く伏せられない）。
  出典: gameranx.com（BattleBit Remastered how gadgets work）
- 兵科と道具（解放の段位）: 包帯・対人地雷・C4・クレイモアは全兵科。SOFLAM は分隊長。つるはし・大ハンマー・グラップリングフックは分隊長・突撃・偵察。ドローンは分隊長・偵察。ライオットシールドは突撃。小さい弾薬箱は突撃・援護。医療キットは衛生。修理工具・RPG・対車両地雷は工兵。大きい弾薬箱は援護。双眼鏡・MDX 201 は偵察。M320 発煙は突撃・衛生。
  出典: pcgamesn.com（Best BattleBit gadgets）
- 発煙弾: 投げてから数秒で煙が出る。中では 2m ほどしか見えず、外からは向こうが見えない（縁は薄い）。弾は止めない。熱線の照準器では人だけ白く見える。分隊長 3 個、ほかは 2 個。投げ物はほかに 照明弾・閃光弾・破片手榴弾・衝撃手榴弾。
  出典: battlebit.wiki.gg/wiki/Smoke_Grenade
→ M3: 兵科ごとに 主の銃・道具2つ・投げ物（破片 M67・衝撃・発煙 M18・閃光 M84）を持つ。最初に入れる道具: 医療キット（衛生）・弾薬箱（突撃 小・援護 大）・RPG（工兵。歩兵と建物に）・双眼鏡で敵に印（偵察・分隊長）・C4（全員）。地雷・ドローン・フック・ハンマー・盾は後で。

## 10. メニューと表記・画面の雰囲気（2026-11-13 03:20 調べ）
- タイトルの入り方: 「Quick match」（ランダムなサーバー）・「Casual quickmatch」・「Hardcore quickmatch」・「Server browser」・Steam の友だちに参加。ほかに「Shooting range」（銃と基本の操作の練習）。クイックマッチは人数で選ぶ（「127 vs. 127 players」「64 vs. 64 players」「32 vs. 32 players」）。標準のモードは Conquest・Infantry Conquest・Domination・Frontline。
  出典: steamah.com/battlebit-remastered-basic-guide-for-beginners/、battlebit.wiki.gg/wiki/How_to_play_guide_for_BattleBit
- 出撃の画面（A〜G）: A「Squad list」（分隊を見る・入る・作る。8人、クランは16人）、B「Loadout」（銃・道具・部品）、C「Customize」（見た目）、D「Class list」（左から Squad leader・Assault・Medic・Engineer・Support・Sniper）、E「Deploy」（出撃）、F マップの帯（サーバー名・モード・マップの形）、G「Map」（動かす・拡大）。分隊に入らないと Assault だけ、入るとすべての兵科。拠点か仲間を選んで Deploy。
  出典: steamah.com/battlebit-remastered-basic-guide-for-beginners/
- 兵科は地図の下に6つのアイコンで並ぶ。Loadout は左下。兵科を選ばなければ Assault で出る。装備は別の画面で開く。
  出典: wepc.com（How to change classes in BattleBit Remastered）、primagames.com（How to change loadouts in BattleBit Remastered）
- 画面の作り: 「ピクセルアートのようなブロックの見た目」。メニューはホバーで横に広がる。HUD は隅に寄せ、アイコンとキーで画面をすっきりさせる。弾は数字ではなく弾倉の絵。いわゆるミニマップはない（M で全体の地図）。出撃の画面の印は色分け（仲間・自分の分隊・敵）。命中は照準の近くにアイコンと点数。
  出典: besthub.dev（BattleBit Remastered: an in-depth analysis of its large-scale multiplayer FPS design）、ggrecon.com/guides/battlebit-remastered-minimap
- 色: HUD の色はすべて設定で変えられる。命中の印は 頭・防具・体・出現直後の守り で色が違う。設定の項目は「Friendly」「Squad Friendly」「Squad Captain」「Enemy」「Ally Objective」「Enemy Objective」「Neutral Objective」「Headshot / Armor / Kill Hit Marker」。拠点の色は見る人から見た味方・敵・中立。
  出典: gamenguides.com（BattleBit Remastered beginner's quick guide）、steamah.com（BattleBit Remastered Battlefield 1 UI color scheme）
- 陣営: アメリカ軍とロシア軍。見た目は「Roblox のよう」と言われるローポリ。
  出典: en.wikipedia.org/wiki/BattleBit_Remastered
- Battlefield 4 の出撃の画面: 地図の上で拠点か仲間を1回押して出撃のボタン（2回押しで即出撃）。分隊の欄に仲間の生死と兵科。チケットと旗の持ち主も出る。
  出典: lparchive.org/Battlefield-4/Update 01
→ WAR BIT: 表記は英語の大文字（BattleBit と同じ）に、小さく日本語を添える。タイトルは独自のブロック文字の「WAR BIT」。入り口は「PLAY（対戦）」「SHOOTING RANGE（射撃場）」「SETTINGS（設定）」。PLAY はモードごとに人数（「16 vs 16」など）を押すとすぐ始まる（クイックマッチ。足りない人数はボット）。出撃の画面は 地図（全画面）・上の帯（マップ名・モード・人数）・左に分隊の欄・下に兵科6つ・左下に LOADOUT・右下に DEPLOY。拠点と印の色は見る人から見て 味方 青・分隊 緑・敵 赤・中立 白。いまの M2 の旗は陣営で色が決まっていたので直す。陣営は実在の国にせず、青・赤の2軍のまま。

## 11. モード（2026-11-13 03:25 調べ）
- BattleBit のモード: Conquest（全部の乗り物・大きいマップ・拠点の奪い合い）、Infantry Conquest（輸送車だけ・大きいマップ）、Rush（区画ごとに攻めと守り）、Domination（乗り物なし・小さいマップ・拠点の奪い合い）、Frontline（区画の綱引き）、Team Deathmatch（一覧にあるが説明なし）、ほか遊びのモード。大型アップデート 3.0 では Conquest と Domination 以外を外す。
  出典: battlebit.wiki.gg/wiki/Game_Modes
- 大型アップデートの開発日誌: 公式サーバーは Conquest と Domination だけ。Rush・Invasion・Frontline は調整のため一時的に外す。Conquest と Domination の 64v64 をやめ、公式は 127v127、32v32 はコミュニティのサーバー向け。
  出典: joinbattlebit.com/operation-overhaul-dev-blog-3/
- Domination（BattleBit）: 16v16 か 32v32 が向く。乗り物なし・縮めたマップ。拠点を持って守ると点が入り、先に決まった点に届くか、時間切れで多い方が勝ち。
  出典: thegamer.com（Every game mode in BattleBit Remastered, ranked）
- Domination（Battlefield）: 拠点はふつう3つで近い。Conquest よりずっと速く奪える。半分より多く持つと相手のチケットが減る。奪った拠点には出現できない（ランダムか分隊の仲間の近く）。乗り物なし。BF4 は20人。
  出典: battlefield.fandom.com/wiki/Domination、gamepressure.com（Battlefield 4: Domination）、mp1st.com（All Battlefield 4 game modes detailed）
- Team Deathmatch（Battlefield）: 倒した数が決まった数に先に届いたチームの勝ち。既定は 100（BF4）、サーバーで 50〜500 以上。BF4 は20人、BF3 の Close Quarters は 8対8。囲まれた場所で、外は範囲外。出現は両チーム反対側、敵が近いと反対側へ移る。乗り物なし。
  出典: battlefield.fandom.com/wiki/Team_Deathmatch、gamepressure.com（Battlefield 4: Team DM and Squad DM）
- Conquest と Conquest Large（Battlefield）: 規則は同じで、Large は拠点・乗り物・範囲が多い。BF4 のチケットは 300 と 800。
  出典: battlefield.fandom.com/wiki/Conquest、gamepressure.com（Battlefield 4: Conquest and Conquest Large）
→ WAR BIT のモード（BattleBit に合わせる。足りない人数はボット）:
  - CONQUEST: 16 vs 16（小。拠点が少なく狭い・300）、32 vs 32（中・500）、64 vs 64（大。拠点がいちばん多く広い・800）。乗り物が入ったら INFANTRY CONQUEST を足す。
  - DOMINATION: 乗り物なし。町のまわりの狭い範囲（約 300m 四方）に拠点3つ。16 vs 16 と 32 vs 32。奪うのは Conquest の倍の速さ。持っている拠点の数だけ点が入り、先に 200 点か、15 分で多い方の勝ち。拠点には出現できず、自陣の端から出る。
  - TEAM DEATHMATCH: 乗り物なし。町の中の狭い範囲（約 220m 四方）。8 vs 8 と 16 vs 16。倒した数が先に 50（8 vs 8）・100（16 vs 16）か、10 分で多い方の勝ち。自陣の端から出て、敵が近い出現場所は避ける。
  - Rush・Frontline は BattleBit でも外されているので入れない。

## 12. 射撃場（2026-11-13 09:40 調べ）
- BattleBit の「Shooting range」: タイトルから入る、銃と基本の操作の練習（チュートリアル）。すべての銃を、いろいろな距離で試せる。
  出典: battlebit.wiki.gg/wiki/How_to_play_guide_for_BattleBit、wepc.com（BattleBit Remastered how to improve aim）
- 遠い撃ち合い: 100m からは距離計（Rangefinder）が役に立つ。照準器のゼロイン（例: 1000m の的に合わせて弾の落ちを打ち消す）。距離の線は照準器ごとに違う。
  出典: steamah.com（BattleBit Remastered extreme range shooting guide）
- 大型アップデートの方針: 公式は Conquest と Domination だけ（11 の続き）。リリースの時期は調べた範囲では確かめられなかった（ベータテストは 2025 年 11 月）。
  出典: joinbattlebit.com/operation-overhaul-dev-blog-3/、gamingonlinux.com（BattleBit Remastered is surprisingly alive, Operation Overhaul test arrives in November）
→ WAR BIT の射撃場: 独自の谷の射場に 10m〜1000m の人形13体（敵の服・防具つき。部位とダメージは対戦と同じ）、距離の札、当てた所の部位・ダメージ・距離を上の帯に出す（距離計の代わり）。弾は減らず、兵科と銃は出撃の画面でいつでも変えられる。横に乗り越え・屋内・高所の練習場。ゼロインと距離計の部品は銃の部品を足すとき（M3 以降）。

