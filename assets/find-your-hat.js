import { Component } from '@theme/component';

/** @extends {Component<{track: HTMLElement, status: HTMLElement, filters: HTMLSelectElement[]}>} */
class FindYourHat extends Component {
  requiredRefs = ['track', 'status'];
  #controller;
  #ready = false;
  #media;
  #interactionController;
  #drag;
  #suppressClick = false;

  #bindDragging() {
    this.#interactionController?.abort();
    this.#endDrag();
    this.#interactionController = new AbortController();
    const { signal } = this.#interactionController;
    this.addEventListener('pointerdown', this.#startDrag, { capture: true, signal });
    document.addEventListener('pointermove', this.#moveDrag, { capture: true, signal });
    document.addEventListener('pointerup', this.#endDrag, { signal });
    document.addEventListener('pointercancel', this.#endDrag, { signal });
    window.addEventListener('blur', this.#endDrag, { signal });
    this.addEventListener('dragstart', this.#preventImageDrag, { capture: true, signal });
    this.addEventListener('click', this.#handleDragClick, { capture: true, signal });
  }

  /** @param {PointerEvent} event */
  #startDrag = (event) => {
    this.#suppressClick = false;
    if (event.pointerType !== 'mouse' || event.button !== 0 || !(event.target instanceof Element)) return;
    if (!this.refs.track.contains(event.target) || event.target.closest('button, input, select, textarea')) return;
    const track = this.refs.track;
    this.#drag = { track, pointerId: event.pointerId, x: event.clientX, scroll: track.scrollLeft, moved: false };
  };

  /** @param {PointerEvent} event */
  #moveDrag = (event) => {
    const drag = this.#drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!(event.buttons & 1)) { this.#endDrag(); return; }
    const delta = event.clientX - drag.x;
    if (!drag.moved && Math.abs(delta) < 6) return;
    if (!drag.moved) {
      drag.moved = true;
      drag.track.classList.add('hat-finder__track--dragging');
      drag.track.setPointerCapture(event.pointerId);
    }
    this.#suppressClick = true;
    event.preventDefault();
    event.stopImmediatePropagation();
    drag.track.scrollLeft = drag.scroll - delta;
  };

  #endDrag = () => {
    const drag = this.#drag;
    if (!drag) return;
    this.#drag = undefined;
    if (drag.track.hasPointerCapture(drag.pointerId)) drag.track.releasePointerCapture(drag.pointerId);
    drag.track.classList.remove('hat-finder__track--dragging');
  };

  /** @param {DragEvent} event */
  #preventImageDrag = (event) => {
    if (event.target instanceof Node && this.refs.track.contains(event.target)) event.preventDefault();
  };

  /** @param {MouseEvent} event */
  #handleDragClick = (event) => {
    if (!this.#suppressClick || event.detail === 0) return;
    this.#suppressClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  #syncOrder = () => {
    const layout = this.querySelector('.hat-finder');
    const search = layout?.querySelector('.hat-finder__search');
    const results = layout?.querySelector('.hat-finder__results');
    if (!layout || !search || !results) return;
    layout.prepend(this.#media.matches && layout.classList.contains('hat-finder--reverse') ? results : search);
  };

  connectedCallback() {
    super.connectedCallback();
    this.#bindDragging();
    this.#controller = new AbortController();
    this.#media = matchMedia('(max-width: 749px)');
    this.#media.addEventListener('change', this.#syncOrder);
    this.#syncOrder();
    this.#load();
  }

  updatedCallback() {
    super.updatedCallback();
    this.#bindDragging();
    this.#controller?.abort();
    this.#controller = new AbortController();
    this.#syncOrder();
    this.#load();
  }

  disconnectedCallback() {
    this.#controller?.abort();
    this.#media?.removeEventListener('change', this.#syncOrder);
    this.#interactionController?.abort();
    this.#endDrag();
    super.disconnectedCallback();
  }

  async #load() {
    const controller = this.#controller;
    this.#ready = false;
    this.#setDisabled(true);
    let next = this.dataset.next;
    try {
      while (next) {
        const url = new URL(next, window.location.origin);
        url.searchParams.set('section_id', this.dataset.sectionId);
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error('Product preload failed');
        const document = new DOMParser().parseFromString(await response.text(), 'text/html');
        const component = [...document.querySelectorAll('find-your-hat')].find(el => el.dataset.sectionId === this.dataset.sectionId);
        if (!component) throw new Error('Missing product results');
        for (const item of component.querySelectorAll('[data-hat-item]')) this.refs.track.append(item);
        next = component.dataset.next;
        this.dataset.next = next || '';
      }
      if (controller.signal.aborted) return;
      this.#ready = true;
      this.#setDisabled(false);
      this.filter();
    } catch (error) {
      if (controller.signal.aborted) return;
      this.refs.status.textContent = this.dataset.error;
    }
  }

  #setDisabled(disabled) {
    for (const select of this.querySelectorAll('select')) select.disabled = disabled;
  }

  /** Match every selected value against its corresponding metafield string. @param {Event} [event] */
  filter(event) {
    if (!this.#ready) return;
    this.#endDrag();
    const filters = [...this.querySelectorAll('select[data-filter]')];
    let count = 0;
    for (const item of this.refs.track.querySelectorAll('[data-hat-item]')) {
      const match = filters.every(select => {
        if (!select.value) return true;
        const value = (item.dataset[select.dataset.filter] || '').toLocaleLowerCase();
        const selected = select.value.toLocaleLowerCase();
        if (select.dataset.filter === 'season' && value.includes('all season')) return true;
        return value.includes(selected);
      });
      item.hidden = !match;
      if (match) count++;
    }
    this.refs.status.textContent = count ? this.dataset.count.replace('[count]', String(count)) : this.dataset.empty;
    this.refs.track.scrollTo({ left: 0, behavior: 'instant' });
  }

}

if (!customElements.get('find-your-hat')) customElements.define('find-your-hat', FindYourHat);
