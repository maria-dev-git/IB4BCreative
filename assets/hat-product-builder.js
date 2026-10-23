import { Component } from '@theme/component';
import '@theme/product-form';

/** Collection product and variant selection with no section fetches or page replacement. */
class HatProductBuilder extends Component {
  connectedCallback() {
    super.connectedCallback();
    this.#initialize();
  }

  updatedCallback() {
    super.updatedCallback();
    this.#initialize();
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
  chooseProduct(event) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.composedPath()[0];
    if (!(target instanceof Element)) return;
    const choice = target.closest('[data-product-choice]');
    if (!choice) return;
    // With app blocks, only the page product is rendered. Other choices follow
    // their native links so apps initialize with the new product's Liquid context.
    const panel = [...this.querySelectorAll('[data-hat-panel]')].find((item) => item.dataset.hatPanel === choice.dataset.productChoice);
    if (!panel) return;
    event.preventDefault();
    for (const item of this.querySelectorAll('[data-hat-panel]')) item.hidden = item !== panel;
    for (const item of this.querySelectorAll('[data-product-choice]')) {
      if (item === choice) item.setAttribute('aria-current', 'true');
      else item.removeAttribute('aria-current');
    }
    const source = panel.querySelector('[data-variants]');
    const selected = this.#variants(panel).find((variant) => variant.id === source?.value);
    if (selected) this.#apply(panel, selected, true);
  }

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
      const productUrl = form?.dataset.productUrl;
      if (productUrl) url.pathname = new URL(productUrl, window.location.origin).pathname;
      url.searchParams.set('view', 'find-your-hat');
      url.searchParams.set('variant', variant.id);
      window.history.replaceState({}, '', url);
    }
    if (input instanceof HTMLInputElement && previousVariantId !== variant.id) {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
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
