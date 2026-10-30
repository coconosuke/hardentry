// みんなで遊ぶ（通信）の入口。App に混ぜ込む。※通信の本体は src/net/*（次の段階で実装）
import { normCode, codeFromHash } from '../net/code.js';

export function netMixin(App) {
  const P = App.prototype;
  P.normCode = function (v) { return normCode(v); };
  P.inClaude = function () { return !!(globalThis.claude && typeof globalThis.claude.use === 'function'); };
  P.netNote = function () {
    return this.inClaude()
      ? 'Claudeの中では、このページを共有されてログインしている人どうしで遊べます（リンクを知っているだけの人は入れません）。届く場合は公開の中継サーバーも使います（送るのは名前・装備・動きだけ）。'
      : '通信は公開の中継サーバーを通り、つながればお互いの端末どうしで直接やりとりします。送るのは名前・装備・動きだけです。';
  };
  P.connText = function () { return ''; };
  P.netBoot = function () { const c = codeFromHash(); if (c) this.screens.open('multi', 'pve'); };
  P.hostRoom = function () { this.screens.flash('みんなで遊ぶ機能は準備中です'); };
  P.joinRoom = function () { this.screens.flash('みんなで遊ぶ機能は準備中です'); };
  P.leaveRoom = function () { this.net = null; };
  P.shareRoom = function () {};
  P.hostStart = function () {};
  P.netAgain = function () {};
}
