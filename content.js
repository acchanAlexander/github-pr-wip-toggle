(function () {
  'use strict';

  const WIP_REGEX = /^\s*\[WIP\]\s*/i;

  function isPrPage() {
    return /^\/[^/]+\/[^/]+\/pull\/\d+/.test(location.pathname);
  }

  function findEditButton() {
    // クラシック UI (Rails レンダリング) のタイトル編集ボタン
    let btn = document.querySelector('.js-issue-title-edit-button');
    if (btn) return btn;

    // aria-label / title に "Edit title" を含むボタンを探すヒューリスティック
    for (const el of document.querySelectorAll('button, a[role="button"]')) {
      const label = (el.getAttribute('aria-label') || el.title || '').toLowerCase();
      if (label.includes('edit title')) return el;
    }

    // 鉛筆アイコン (pencil) を持つボタンを探すヒューリスティック（新UI対策）
    const header = document.querySelector('.gh-header-title')?.parentElement
      || document.querySelector('[data-testid="issue-title"]')?.closest('div');
    if (header) {
      const svgBtn = header.querySelector('svg[class*="pencil" i]')?.closest('button');
      if (svgBtn) return svgBtn;
    }

    return null;
  }

  function nativeSetValue(el, value) {
    const proto = el.tagName === 'TEXTAREA'
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, value);
    // React などのフレームワークが変更を検知できるようにイベントを発火
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function waitFor(fn, timeout = 4000, interval = 100) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const timer = setInterval(() => {
        const result = fn();
        if (result) {
          clearInterval(timer);
          resolve(result);
        } else if (Date.now() - start > timeout) {
          clearInterval(timer);
          reject(new Error('timeout: title edit field not found'));
        }
      }, interval);
    });
  }

  function findTitleField() {
    // クラシック UI: タイトル編集用の input#issue_title
    let field = document.querySelector('#issue_title');
    if (field && field.offsetParent !== null) return field;

    // 新UI対策: ヘッダー付近に表示されている入力フィールドを探す
    for (const el of document.querySelectorAll('textarea, input[type="text"]')) {
      if (el.offsetParent !== null && el.value && el.closest('[class*="header" i]')) {
        return el;
      }
    }
    return null;
  }

  function findSaveButton(field) {
    const container = field.closest('form') || field.closest('div');
    const scope = container ? container.querySelectorAll('button') : document.querySelectorAll('button');
    return Array.from(scope).find(
      (b) => /^save$/i.test(b.textContent.trim()) && !b.disabled && b.offsetParent !== null
    ) || null;
  }

  async function toggleWip() {
    try {
      let field = findTitleField();

      if (!field) {
        const editBtn = findEditButton();
        if (!editBtn) {
          alert('タイトル編集ボタンが見つかりませんでした。GitHub の UI が変更された可能性があります。');
          return;
        }
        editBtn.click();
        field = await waitFor(findTitleField);
      }

      const current = field.value;
      const newValue = WIP_REGEX.test(current)
        ? current.replace(WIP_REGEX, '')
        : `[WIP] ${current}`;

      nativeSetValue(field, newValue);

      const saveBtn = findSaveButton(field);
      if (saveBtn) {
        saveBtn.click();
      } else {
        // Save ボタンが見つからない場合は Enter キー送信にフォールバック
        field.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true })
        );
      }
    } catch (e) {
      console.error('[WIP Toggle]', e);
      alert('タイトルの編集フォームが見つかりませんでした。ページを再読み込みして再度お試しください。');
    }
  }

  function injectButton() {
    if (document.getElementById('wip-toggle-button')) return;

    const header = document.querySelector('.gh-header-actions')
      || document.querySelector('.gh-header-title')?.parentElement;
    if (!header) return;

    const btn = document.createElement('button');
    btn.id = 'wip-toggle-button';
    btn.type = 'button';
    btn.className = 'btn btn-sm wip-toggle-btn';
    btn.textContent = '[WIP] 切替';
    btn.addEventListener('click', toggleWip);
    header.appendChild(btn);
  }

  function init() {
    if (isPrPage()) injectButton();
  }

  init();

  // GitHub は Turbo (PJAX 的な SPA ナビゲーション) を使っているため、
  // ページ遷移時にも再度ボタンを注入する
  document.addEventListener('turbo:load', init);
  document.addEventListener('pjax:end', init);

  const observer = new MutationObserver(() => init());
  observer.observe(document.body, { childList: true, subtree: true });
})();
