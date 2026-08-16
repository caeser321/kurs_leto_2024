/**
 * Поле для подписи стилусом.
 *
 * Работает на Pointer Events, поэтому одинаково понимает перо (стилус),
 * палец и мышь. Для стилуса используются два важных свойства:
 *   - event.pressure — сила нажатия, задаёт толщину линии;
 *   - getCoalescedEvents() — промежуточные точки, накопленные браузером
 *     между кадрами; без них быстрый росчерк пером выглядит угловатым.
 *
 * Точки хранятся в нормализованных координатах (0..1), поэтому подпись
 * не портится при повороте планшета и может быть отрисована в любом разрешении.
 */

const BASE_WIDTH_UNITS = 600; // условная ширина, к которой привязана толщина пера
const INK_COLOR = '#0b1220';

export class SignaturePad {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{onChange?: (pad: SignaturePad) => void, onPenDetected?: () => void}} options
   */
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.options = options;

    /** @type {Array<Array<{x: number, y: number, p: number}>>} завершённые штрихи */
    this.strokes = [];
    /** @type {Array<{x: number, y: number, p: number}>|null} штрих, который рисуется сейчас */
    this.currentStroke = null;
    this.activePointerId = null;

    /**
     * Если планшет хоть раз прислал события пера, дальше игнорируем касания
     * пальцем: это защита от случайных касаний ладонью во время подписи.
     */
    this.penDetected = false;

    this.lastPoint = null;
    this.smoothedPressure = 0.5;
    this.frameRequested = false;

    /**
     * Завершённые штрихи хранятся отрисованными в отдельном буфере.
     * Благодаря этому на каждое движение пера перерисовывается только
     * текущий штрих, а не вся подпись целиком.
     */
    this.cache = document.createElement('canvas');

    this.#attachEvents();
    this.resize();
  }

  #attachEvents() {
    const { canvas } = this;

    canvas.addEventListener('pointerdown', (event) => this.#onPointerDown(event));
    canvas.addEventListener('pointermove', (event) => this.#onPointerMove(event));
    canvas.addEventListener('pointerup', (event) => this.#finishStroke(event));
    canvas.addEventListener('pointercancel', (event) => this.#finishStroke(event));
    // Если браузер сам отобрал захват указателя, штрих тоже нужно закрыть.
    canvas.addEventListener('lostpointercapture', (event) => this.#finishStroke(event));

    // Браузер не должен прокручивать страницу и показывать меню,
    // пока клиент ведёт линию по экрану.
    canvas.addEventListener('touchstart', (event) => event.preventDefault(), { passive: false });
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(canvas);
    } else {
      window.addEventListener('resize', () => this.resize());
    }
  }

  /** Касания пальцем игнорируются, если планшет умеет присылать события пера. */
  #shouldIgnore(event) {
    return event.pointerType === 'touch' && this.penDetected;
  }

  #onPointerDown(event) {
    if (event.pointerType === 'pen' && !this.penDetected) {
      this.penDetected = true;
      this.options.onPenDetected?.();
    }
    if (this.activePointerId !== null || this.#shouldIgnore(event)) return;

    event.preventDefault();
    this.activePointerId = event.pointerId;
    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch {
      // указатель мог быть отпущен до того, как мы запросили захват
    }

    this.lastPoint = null;
    this.smoothedPressure = this.#rawPressure(event) || 0.55;
    this.currentStroke = [this.#toPoint(event)];
    this.#scheduleRender();
  }

  #onPointerMove(event) {
    if (event.pointerId !== this.activePointerId || !this.currentStroke) return;
    event.preventDefault();

    const coalesced =
      typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [];
    const samples = coalesced.length > 0 ? coalesced : [event];

    for (const sample of samples) {
      this.currentStroke.push(this.#toPoint(sample));
    }
    this.#scheduleRender();
  }

  #finishStroke(event) {
    if (event.pointerId !== this.activePointerId) return;

    const stroke = this.currentStroke;
    this.currentStroke = null;
    this.activePointerId = null;
    this.lastPoint = null;

    try {
      this.canvas.releasePointerCapture(event.pointerId);
    } catch {
      // захват мог быть снят браузером раньше
    }

    if (stroke && stroke.length > 0) {
      this.strokes.push(stroke);
      // Готовый штрих переносится в буфер завершённых.
      this.#drawStroke(this.cache.getContext('2d'), stroke, this.cache.width, this.cache.height);
    }

    this.#scheduleRender();
    this.options.onChange?.(this);
  }

  #rawPressure(event) {
    // Мышь и часть тачскринов всегда сообщают 0 или 0.5 — на них нажим не считаем.
    if (event.pointerType === 'pen' && event.pressure > 0) return event.pressure;
    return 0;
  }

  /**
   * Переводит событие в нормализованную точку.
   * Для пера берём нажим, для пальца и мыши — скорость: чем быстрее
   * движение, тем тоньше линия. Так росчерк выглядит живым и без стилуса.
   */
  #toPoint(event) {
    const rect = this.canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;

    const pressure = this.#rawPressure(event);
    let target;

    if (pressure > 0) {
      target = pressure;
    } else if (this.lastPoint) {
      const dx = (x - this.lastPoint.x) * rect.width;
      const dy = (y - this.lastPoint.y) * rect.height;
      const speed = Math.hypot(dx, dy);
      target = Math.max(0.15, Math.min(0.85, 0.85 - speed / 45));
    } else {
      target = 0.55;
    }

    // Сглаживание, чтобы толщина не «прыгала» между соседними точками.
    this.smoothedPressure = this.smoothedPressure * 0.7 + target * 0.3;
    const point = { x, y, p: Number(this.smoothedPressure.toFixed(3)) };
    this.lastPoint = point;
    return point;
  }

  /** Толщина пера в пикселях для точки с нажимом p. */
  #widthFor(p, scale) {
    return (1.1 + 3.2 * p) * scale;
  }

  /** Подгоняет размер буферов под CSS-размер поля и плотность экрана. */
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const ratio = Math.min(window.devicePixelRatio || 1, 3);
    const width = Math.round(rect.width * ratio);
    const height = Math.round(rect.height * ratio);

    if (this.canvas.width === width && this.canvas.height === height) return;

    this.canvas.width = width;
    this.canvas.height = height;
    this.cache.width = width;
    this.cache.height = height;

    this.#redrawCache();
    this.#render();
  }

  /** Заново собирает буфер завершённых штрихов (после resize, undo, clear). */
  #redrawCache() {
    const ctx = this.cache.getContext('2d');
    ctx.clearRect(0, 0, this.cache.width, this.cache.height);
    for (const stroke of this.strokes) {
      this.#drawStroke(ctx, stroke, this.cache.width, this.cache.height);
    }
  }

  #scheduleRender() {
    if (this.frameRequested) return;
    this.frameRequested = true;
    requestAnimationFrame(() => {
      this.frameRequested = false;
      this.#render();
    });
  }

  #render() {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (this.cache.width > 0 && this.cache.height > 0) {
      ctx.drawImage(this.cache, 0, 0);
    }
    if (this.currentStroke) {
      this.#drawStroke(ctx, this.currentStroke, canvas.width, canvas.height);
    }
  }

  /**
   * Рисует штрих квадратичными кривыми: точки становятся опорными,
   * а концы отрезков — серединами между ними. Линия получается гладкой
   * даже там, где точек мало (например, при вводе мышью).
   */
  #drawStroke(ctx, stroke, width, height, options = {}) {
    if (!ctx || stroke.length === 0 || width === 0 || height === 0) return;

    const scale = width / BASE_WIDTH_UNITS;
    const color = options.color || INK_COLOR;
    const points = stroke.map((point) => ({
      x: point.x * width,
      y: point.y * height,
      p: point.p,
    }));

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.fillStyle = color;

    if (points.length === 1) {
      const [point] = points;
      ctx.beginPath();
      ctx.arc(point.x, point.y, this.#widthFor(point.p, scale) / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    let start = points[0];
    for (let i = 1; i < points.length; i += 1) {
      const control = points[i];
      const isLast = i === points.length - 1;
      const end = isLast
        ? control
        : { x: (control.x + points[i + 1].x) / 2, y: (control.y + points[i + 1].y) / 2 };

      ctx.beginPath();
      ctx.lineWidth = this.#widthFor((points[i - 1].p + control.p) / 2, scale);
      ctx.moveTo(start.x, start.y);
      ctx.quadraticCurveTo(control.x, control.y, end.x, end.y);
      ctx.stroke();

      start = end;
    }

    ctx.restore();
  }

  isEmpty() {
    return this.strokes.length === 0 && !this.currentStroke;
  }

  clear() {
    this.strokes = [];
    this.currentStroke = null;
    this.lastPoint = null;
    this.#redrawCache();
    this.#render();
    this.options.onChange?.(this);
  }

  undo() {
    if (this.strokes.length === 0) return;
    this.strokes.pop();
    this.#redrawCache();
    this.#render();
    this.options.onChange?.(this);
  }

  /** Прямоугольник, реально занятый подписью, в нормализованных координатах. */
  #bounds() {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const stroke of this.strokes) {
      for (const point of stroke) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      }
    }

    if (minX > maxX || minY > maxY) return null;
    return { minX, minY, maxX, maxY };
  }

  /**
   * Отдаёт подпись как PNG с прозрачным фоном: кадр обрезан по краям росчерка
   * и отрисован в повышенном разрешении, чтобы в PDF линия была чёткой.
   * @returns {string|null} data URL или null, если подпись пуста
   */
  toDataURL({ scale = 3, padding = 0.03 } = {}) {
    const bounds = this.#bounds();
    if (!bounds) return null;

    const rect = this.canvas.getBoundingClientRect();
    const sourceWidth = rect.width || this.canvas.width;
    const sourceHeight = rect.height || this.canvas.height;

    // Отступ задан в долях ширины; по вертикали пересчитываем,
    // чтобы поля вокруг подписи выглядели одинаковыми.
    const padX = padding;
    const padY = (padding * sourceWidth) / sourceHeight;

    const minX = Math.max(0, bounds.minX - padX);
    const minY = Math.max(0, bounds.minY - padY);
    const maxX = Math.min(1, bounds.maxX + padX);
    const maxY = Math.min(1, bounds.maxY + padY);

    const cropWidth = Math.max(maxX - minX, 0.02);
    const cropHeight = Math.max(maxY - minY, 0.02);

    const output = document.createElement('canvas');
    output.width = Math.max(1, Math.round(sourceWidth * cropWidth * scale));
    output.height = Math.max(1, Math.round(sourceHeight * cropHeight * scale));

    const ctx = output.getContext('2d');
    // Координаты точек нормализованы по всему полю, поэтому рисуем в полном
    // размере и сдвигаем систему координат так, чтобы в кадр попала подпись.
    const fullWidth = sourceWidth * scale;
    const fullHeight = sourceHeight * scale;
    ctx.translate(-minX * fullWidth, -minY * fullHeight);

    for (const stroke of this.strokes) {
      this.#drawStroke(ctx, stroke, fullWidth, fullHeight);
    }

    return output.toDataURL('image/png');
  }
}
