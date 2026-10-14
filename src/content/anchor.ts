import type { Rect } from "../shared/messages";

// Ekrandaki bir alanı altındaki elemana bağlıyor. Sayfa ya da okuyucunun içindeki
// kutu kaysa veya resim boyut değiştirse de katman onunla beraber gidiyor.
export class Anchor {
  private readonly target: Element;
  private readonly base: DOMRect;

  constructor(private readonly rect: Rect) {
    const hit = document.elementFromPoint(rect.x + rect.w / 2, rect.y + rect.h / 2);
    this.target = hit ?? document.documentElement;
    this.base = this.target.getBoundingClientRect();
  }

  place(): Rect | null {
    if (!this.target.isConnected) return null;
    const now = this.target.getBoundingClientRect();
    if (now.width === 0 || now.height === 0) return null;

    const sx = this.base.width ? now.width / this.base.width : 1;
    const sy = this.base.height ? now.height / this.base.height : 1;
    return {
      x: now.left + (this.rect.x - this.base.left) * sx,
      y: now.top + (this.rect.y - this.base.top) * sy,
      w: this.rect.w * sx,
      h: this.rect.h * sy,
    };
  }
}
