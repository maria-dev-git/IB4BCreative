import { Component } from '@theme/component';
import '@theme/product-form';
import { convertMoneyToMinorUnits, formatMoney } from '@theme/money-formatting';
import { getScrollContainer, getScrollTop } from '@theme/scroll-container';

/** Hat product selection, native product navigation, and in-page variant controls. */
class HatProductBuilder extends Component {
  /** @type {AbortController | undefined} */
  #globoListeners;
  #scrollStorageKey = 'hat-builder-scroll-position';
  #updatingGlobo = false;
  /** @type {Element | undefined} */
  #touchedSwatch;
  #globoObserver = new MutationObserver(() => {
    this.#prepareGloboThumbnails();
    this.#enforceGloboChoice();
    this.#updateGloboTotals();
  });

  connectedCallback() {
    super.connectedCallback();
    this.#initialize();
    this.#globoListeners?.abort();
    this.#globoListeners = new AbortController();
    // Globo also emits non-bubbling change events; capture reaches those inputs.
    this.addEventListener('change', this.#onGloboChange, { capture: true, signal: this.#globoListeners.signal });
    this.addEventListener('click', this.#onProductChoice, { signal: this.#globoListeners.signal });
    this.addEventListener('pointerover', this.#prefetchProductChoice, { signal: this.#globoListeners.signal });
    this.addEventListener('focusin', this.#prefetchProductChoice, { signal: this.#globoListeners.signal });
    this.addEventListener('pointerdown', this.#onThumbnailTouch, { signal: this.#globoListeners.signal });
    this.addEventListener('focusin', this.#onThumbnailFocus, { signal: this.#globoListeners.signal });
    this.addEventListener('focusout', this.#clearThumbnailTouch, { signal: this.#globoListeners.signal });
    document.addEventListener('pointerup', this.#clearThumbnailTouch, { signal: this.#globoListeners.signal });
    document.addEventListener('pointercancel', this.#clearThumbnailTouch, { signal: this.#globoListeners.signal });
    window.addEventListener('resize', this.#clearThumbnailTouch, { signal: this.#globoListeners.signal });
    this.#globoObserver.observe(this, { childList: true, characterData: true, attributes: true, attributeFilter: ['style'], subtree: true });
    this.#prepareGloboThumbnails();
    this.#enforceGloboChoice();
    this.#updateGloboTotals();
  }

  updatedCallback() {
    super.updatedCallback();
    this.#initialize();
    this.#prepareGloboThumbnails();
    this.#enforceGloboChoice();
    this.#updateGloboTotals();
  }

  disconnectedCallback() {
    this.#globoListeners?.abort();
    this.#globoObserver.disconnect();
    this.#clearThumbnailTouch();
    super.disconnectedCallback();
  }

  // Tooltip copy currently supplies the input's accessible name. Keep that name
  // when hiding the visual popup, including for asynchronously inserted options.
  #prepareGloboThumbnails() {
    for (const swatch of this.querySelectorAll('.gpo-app .image-swatches')) {
      const input = swatch.querySelector('input[data-type="image-swatches"]');
      const title = swatch.querySelector('.gpo-tooltip__title');
      if (input && !input.hasAttribute('aria-label') && title?.textContent.trim()) {
        input.setAttribute('aria-label', title.textContent.trim().replace(/\s+/g, ' '));
      }
    }
  }

  /** @param {PointerEvent} event - Touch or pen contact on a Globo thumbnail. */
  #onThumbnailTouch = (event) => {
    if (event.pointerType === 'mouse') return;
    const target = event.composedPath()[0];
    if (!(target instanceof Element) || !target.closest('.gpo-swatch__inner')) return;
    const swatch = target.closest('.gpo-app .image-swatches');
    if (!swatch) return;
    this.#clearThumbnailTouch();
    this.#touchedSwatch = swatch;
    this.#fitThumbnail(swatch);
    swatch.classList.add('hat-builder__swatch-touch');
  };

  /** @param {FocusEvent} event - Keyboard focus entering a swatch. */
  #onThumbnailFocus = (event) => {
    const target = event.composedPath()[0];
    if (!(target instanceof HTMLInputElement)) return;
    const swatch = target.closest('.gpo-app .image-swatches');
    if (!swatch || this.#touchedSwatch === swatch) return;
    this.#clearThumbnailTouch();
    this.#touchedSwatch = swatch;
    this.#fitThumbnail(swatch);
  };

  /** Keep an edge swatch's enlarged image inside the available screen space.
   * @param {Element} swatch - Globo image-option wrapper.
   */
  #fitThumbnail(swatch) {
    const inner = swatch.querySelector('.gpo-swatch__inner');
    if (!(inner instanceof HTMLElement) || !(swatch instanceof HTMLElement)) return;
    const rect = inner.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const viewport = window.visualViewport;
    const left = (viewport?.offsetLeft || 0) + 12;
    const top = (viewport?.offsetTop || 0) + 12;
    const width = (viewport?.width || document.documentElement.clientWidth) - 24;
    const height = (viewport?.height || window.innerHeight) - 24;
    const requested = Number.parseFloat(getComputedStyle(this).getPropertyValue('--hat-globo-active-scale')) || 1;
    const scale = Math.min(requested, width / rect.width, height / rect.height);
    const scaledLeft = rect.left + (rect.width - rect.width * scale) / 2;
    const scaledTop = rect.top + (rect.height - rect.height * scale) / 2;
    const x = Math.max(left, Math.min(scaledLeft, left + width - rect.width * scale)) - scaledLeft;
    const y = Math.max(top, Math.min(scaledTop, top + height - rect.height * scale)) - scaledTop;
    swatch.style.setProperty('--hat-globo-preview-scale', String(scale));
    swatch.style.setProperty('--hat-globo-preview-x', `${x}px`);
    swatch.style.setProperty('--hat-globo-preview-y', `${y}px`);
  }

  #clearThumbnailTouch = () => {
    this.#touchedSwatch?.classList.remove('hat-builder__swatch-touch');
    if (this.#touchedSwatch instanceof HTMLElement) {
      for (const property of ['--hat-globo-preview-scale', '--hat-globo-preview-x', '--hat-globo-preview-y']) {
        this.#touchedSwatch.style.removeProperty(property);
      }
    }
    this.#touchedSwatch = undefined;
  };

  /** @param {Event} event - A Globo image-option selection or deselection. */
  #onGloboChange = (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.checked ||
      !input.matches('.gpo-app input[type="radio"][data-type="image-swatches"]')) return;
    this.#enforceGloboChoice(input);
  };

  // Read Globo's calculated surcharge without changing its pricing inputs or
  // generated money node. Globo remains responsible for checkout add-on prices.
  #updateGloboTotals() {
    const currency = this.dataset.currency;
    const format = this.dataset.moneyFormat;
    const template = this.dataset.totalPriceMessage;
    if (!currency || !format || !template) return;
    const money = (amount) => {
      const output = document.createElement('template');
      output.innerHTML = formatMoney(amount, format, currency);
      return output.content.textContent || '';
    };
    for (const panel of this.querySelectorAll('[data-hat-panel]')) {
      const variant = panel.querySelector('[data-variants] option:checked');
      const base = convertMoneyToMinorUnits(variant?.dataset.price || '', currency);
      for (const source of panel.querySelectorAll('.gpo-app .gpo-total-text')) {
        const addon = convertMoneyToMinorUnits(source.querySelector('.money')?.textContent || '', currency);
        let total = source.parentElement?.querySelector('[data-hat-total-price]');
        if (base === null || addon === null) {
          source.removeAttribute('data-hat-price-source');
          if (total) total.hidden = true;
          continue;
        }
        if (!total) {
          total = document.createElement('p');
          total.setAttribute('data-hat-total-price', '');
          total.className = 'hat-builder__total-price';
          total.setAttribute('aria-live', 'polite');
          total.setAttribute('aria-atomic', 'true');
          source.after(total);
        }
        source.setAttribute('data-hat-price-source', '');
        total.hidden = source.style.display === 'none';
        const message = template.replace('[total]', money(base + addon)).replace('[base]', money(base)).replace('[addon]', money(addon));
        if (total.textContent !== message) total.textContent = message;
      }
    }
  }

  /** Keep one image option per product, including after Globo inserts new groups.
   * @param {HTMLInputElement} [preferred] - Most recently selected option.
   */
  #enforceGloboChoice(preferred) {
    if (this.#updatingGlobo) return;
    this.#updatingGlobo = true;
    try {
      for (const panel of this.querySelectorAll('[data-hat-panel]')) {
        const checked = /** @type {HTMLInputElement[]} */ ([...panel.querySelectorAll('.gpo-app input[type="radio"][data-type="image-swatches"]:checked')]);
        const keep = preferred && panel.contains(preferred) ? preferred : checked[0];
        for (const input of checked) {
          if (input === keep) continue;
          input.checked = false;
          input.removeAttribute('checked');
          // Match Globo's own deselection path, including its click-toggle state.
          input.setAttribute('previous-value', 'false');
          // Globo's target change handlers refresh hidden properties, add-ons,
          // validation, and prices. Do not modify those generated fields directly.
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    } finally {
      this.#updatingGlobo = false;
    }
  }

  #initialize() {
    for (const panel of this.querySelectorAll('[data-hat-panel]')) {
      const options = panel.querySelector('[data-options]');
      // Panel Count always precedes Color, even when Shopify stores them in reverse order.
      const fields = [...(options?.querySelectorAll('[data-option-field]') || [])];
      const rank = (field) => {
        const name = field.dataset.optionName?.toLowerCase().replace(/[^a-z]/g, '');
        return ['panel', 'panels', 'panelcount'].includes(name) ? 0 : name === 'color' || name === 'colour' ? 1 : 2;
      };
      fields.sort((a, b) => rank(a) - rank(b));
      for (const field of fields) options.append(field);
      const variants = this.#variants(panel);
      const source = panel.querySelector('[data-variants]');
      const selected = variants.find((variant) => variant.id === source?.value) || variants[0];
      if (!selected) continue;
      const resolved = options ? this.#populate(panel, selected.values) : selected;
      if (options) options.hidden = variants.length === 1 && selected.label === 'Default Title';
      if (source instanceof HTMLSelectElement) {
        source.hidden = true;
        source.disabled = true;
      }
      this.#apply(panel, resolved || selected, false);
    }
  }

  #variants(panel) {
    return [...panel.querySelectorAll('[data-variants] option')].map((option) => ({
      id: option.value,
      label: option.textContent,
      values: JSON.parse(option.dataset.values),
      available: option.dataset.available === 'true',
      image: option.dataset.image,
      price: option.dataset.price,
      min: option.dataset.min || '1',
      increment: option.dataset.increment || '1',
      max: option.dataset.max,
    }));
  }

  #populate(panel, desired) {
    let candidates = this.#variants(panel);
    for (const field of panel.querySelectorAll('[data-option-field]')) {
      const index = Number(field.dataset.optionIndex);
      // Only offer purchasable combinations, narrowing Color after Panel Count.
      const available = candidates.filter((variant) => variant.available);
      const values = [...new Set(available.map((variant) => variant.values[index]))];
      const selected = values.includes(desired[index]) ? desired[index] :
        available[0]?.values[index];
      for (const input of field.querySelectorAll('input[type="radio"]')) {
        const visible = values.includes(input.value);
        input.disabled = !visible;
        input.checked = visible && input.value === selected;
        const choice = input.closest('[data-option-choice]');
        if (choice) choice.hidden = !visible;
        // Color thumbnails come from the current panel-count combination.
        const representative = available.find((variant) => variant.values[index] === input.value);
        const image = choice?.querySelector('img');
        const galleryImage = representative && [...panel.querySelectorAll('[data-image]')]
          .find((item) => item.dataset.image === representative.image)?.querySelector('img');
        if (image && galleryImage) {
          const url = new URL(galleryImage.src);
          url.searchParams.set('width', '240');
          image.removeAttribute('srcset');
          image.src = url.href;
        }
      }
      candidates = candidates.filter((variant) => variant.values[index] === selected);
    }
    return candidates.find((variant) => variant.available) || candidates[0];
  }

  /** @param {MouseEvent} event - A product card activation. */
  #onProductChoice = (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.composedPath()[0];
    if (!(target instanceof Element)) return;
    const choice = target.closest('[data-product-choice]');
    if (!(choice instanceof HTMLAnchorElement)) return;
    const activePanel = this.querySelector('[data-hat-panel]:not([hidden])');
    if (activePanel?.dataset.hatPanel === choice.dataset.productChoice) {
      event.preventDefault();
      return;
    }
    const scrollContainer = getScrollContainer();
    try {
      sessionStorage.setItem(this.#scrollStorageKey, JSON.stringify({
        path: new URL(choice.href).pathname,
        x: scrollContainer.scrollLeft,
        y: getScrollTop(),
      }));
    } catch {
      // Keep the product link working if session storage is unavailable.
    }
  };

  #prefetchProductChoice = (event) => {
    const target = event.composedPath()[0];
    if (!(target instanceof Element)) return;
    const choice = target.closest('[data-product-choice]');
    if (!(choice instanceof HTMLAnchorElement) || choice.dataset.productChoice === this.querySelector('[data-hat-panel]:not([hidden])')?.dataset.hatPanel) return;
    const existing = [...document.head.querySelectorAll('link[rel="prefetch"][as="document"]')]
      .find((link) => link.href === choice.href);
    if (existing) return;
    const prefetch = document.createElement('link');
    prefetch.rel = 'prefetch';
    prefetch.as = 'document';
    prefetch.href = choice.href;
    document.head.append(prefetch);
  };

  /** @param {Event} event - A Panel Count or Color change. */
  chooseOption(event) {
    // Declarative events proxy target to the on:change container; the composed
    // path retains the actual input that initiated the change.
    const target = event.composedPath()[0];
    if (!(target instanceof HTMLInputElement) || target.type !== 'radio') return;
    const panel = target.closest('[data-hat-panel]');
    if (!panel) return;
    const desired = [];
    for (const input of panel.querySelectorAll('[data-options] input:checked')) desired[Number(input.dataset.optionIndex)] = input.value;
    const selected = this.#populate(panel, desired);
    if (selected) this.#apply(panel, selected, true);
  }

  #apply(panel, variant, announce) {
    const form = panel.querySelector('product-form-component');
    // App blocks can add their own inputs before the buy button. Update only
    // the theme form's canonical fields, then notify delegated app listeners.
    const input = form?.querySelector('input[ref="variantId"]');
    const quantity = form?.querySelector('input[name="quantity"]');
    const source = panel.querySelector('[data-variants]');
    const price = panel.querySelector('[data-price]');
    const button = panel.querySelector('button[name="add"]');
    const previousVariantId = input?.value;
    if (input instanceof HTMLInputElement) {
      input.value = variant.id;
      input.setAttribute('value', variant.id);
      input.disabled = false;
    }
    if (quantity instanceof HTMLInputElement) quantity.value = variant.min;
    if (form instanceof HTMLElement) form.dataset.quantityDefault = variant.min;
    if (source instanceof HTMLSelectElement) {
      source.value = variant.id;
      for (const option of source.options) {
        option.selected = option.value === variant.id;
        option.toggleAttribute('selected', option.selected);
      }
    }
    if (price) price.textContent = variant.price;
    if (button instanceof HTMLButtonElement) {
      button.disabled = !variant.available;
      const label = [...button.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
      if (label) label.textContent = variant.available ? this.dataset.add : this.dataset.sold;
    }
    this.#showImage(panel, variant.image);
    const cartButton = panel.querySelector('add-to-cart-component');
    const image = panel.querySelector('[data-image]:not([hidden]) img');
    if (cartButton instanceof HTMLElement) cartButton.dataset.productVariantMedia = image?.getAttribute('src') || '';
    if (announce) {
      const status = this.querySelector('[data-selection-status]');
      if (status) status.textContent = `${panel.dataset.title}, ${variant.values.join(', ')}, ${variant.price}, ${variant.available ? this.dataset.add : this.dataset.sold}`;
      const url = new URL(window.location.href);
      url.searchParams.set('view', 'find-your-hat');
      url.searchParams.set('variant', variant.id);
      window.history.replaceState({}, '', url);
    }
    if (input instanceof HTMLInputElement && previousVariantId !== variant.id) {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    this.#updateGloboTotals();
  }

  /** @param {MouseEvent} event - A gallery thumbnail activation. */
  chooseImage(event) {
    const target = event.composedPath()[0];
    if (!(target instanceof Element)) return;
    const button = target.closest('[data-image-choice]');
    const panel = button?.closest('[data-hat-panel]');
    if (panel) this.#showImage(panel, button.dataset.imageChoice);
  }

  #showImage(panel, imageId) {
    for (const image of panel.querySelectorAll('[data-image]')) image.hidden = image.dataset.image !== imageId;
    for (const button of panel.querySelectorAll('[data-image-choice]')) button.setAttribute('aria-pressed', String(button.dataset.imageChoice === imageId));
  }
}

if (!customElements.get('hat-product-builder')) customElements.define('hat-product-builder', HatProductBuilder);
