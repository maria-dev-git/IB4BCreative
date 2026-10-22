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
      if (!(options instanceof HTMLElement)) continue;
      // Panel Count always precedes Color, even when Shopify stores them in reverse order.
      const fields = [...options.querySelectorAll('[data-option-field]')];
      const rank = (field) => {
        const name = field.dataset.optionName?.trim().toLowerCase();
        return name === 'panel count' ? 0 : name === 'color' || name === 'colour' ? 1 : 2;
      };
      fields.sort((a, b) => rank(a) - rank(b));
      for (const field of fields) options.append(field);
      const variants = this.#variants(panel);
      const source = panel.querySelector('[data-variants]');
      const selected = variants.find((variant) => variant.id === source?.value) || variants[0];
      if (!selected) continue;
      this.#populate(panel, selected.values);
      options.hidden = variants.length === 1 && selected.label === 'Default Title';
      if (source instanceof HTMLSelectElement) {
        source.hidden = true;
        source.disabled = true;
      }
      this.#apply(panel, selected, false);
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
    for (const select of panel.querySelectorAll('[data-options] select')) {
      const index = Number(select.dataset.optionIndex);
      const values = [...new Set(candidates.map((variant) => variant.values[index]))];
      const selected = values.includes(desired[index]) ? desired[index] :
        (candidates.find((variant) => variant.available) || candidates[0])?.values[index];
      select.replaceChildren(...values.map((value) => {
        const option = new Option(value, value);
        option.selected = value === selected;
        return option;
      }));
      candidates = candidates.filter((variant) => variant.values[index] === selected);
    }
    return candidates.find((variant) => variant.available) || candidates[0];
  }

  /** @param {MouseEvent} event - A product card activation. */
  chooseProduct(event) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!(event.target instanceof Element)) return;
    const choice = event.target.closest('[data-product-choice]');
    if (!choice) return;
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
    if (!(event.target instanceof HTMLSelectElement)) return;
    const panel = event.target.closest('[data-hat-panel]');
    if (!panel) return;
    const desired = [];
    for (const select of panel.querySelectorAll('[data-options] select')) desired[Number(select.dataset.optionIndex)] = select.value;
    const selected = this.#populate(panel, desired);
    if (selected) this.#apply(panel, selected, true);
  }

  #apply(panel, variant, announce) {
    const input = panel.querySelector('input[name="id"]');
    const quantity = panel.querySelector('input[name="quantity"]');
    const form = panel.querySelector('product-form-component');
    const source = panel.querySelector('[data-variants]');
    const price = panel.querySelector('[data-price]');
    const button = panel.querySelector('button[name="add"]');
    if (input instanceof HTMLInputElement) {
      input.value = variant.id;
      input.disabled = false;
    }
    if (quantity instanceof HTMLInputElement) quantity.value = variant.min;
    if (form instanceof HTMLElement) form.dataset.quantityDefault = variant.min;
    if (source instanceof HTMLSelectElement) source.value = variant.id;
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
  }

  /** @param {MouseEvent} event - A gallery thumbnail activation. */
  chooseImage(event) {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest('[data-image-choice]');
    const panel = button?.closest('[data-hat-panel]');
    if (panel) this.#showImage(panel, button.dataset.imageChoice);
  }

  #showImage(panel, imageId) {
    for (const image of panel.querySelectorAll('[data-image]')) image.hidden = image.dataset.image !== imageId;
    for (const button of panel.querySelectorAll('[data-image-choice]')) button.setAttribute('aria-pressed', String(button.dataset.imageChoice === imageId));
  }
}

if (!customElements.get('hat-product-builder')) customElements.define('hat-product-builder', HatProductBuilder);
