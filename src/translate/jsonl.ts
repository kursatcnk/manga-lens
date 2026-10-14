// Modelin cevabını gelirken okuyor: her satırda bir JSON nesnesi.
// Modeller bazen ```json içine ya da [ ... ] dizisine sarıyor, o yüzden esnek.
export class JsonLines {
  private buf = "";

  constructor(private readonly onItem: (item: unknown) => void) {}

  push(chunk: string) {
    this.buf += chunk;
    let i;
    while ((i = this.buf.indexOf("\n")) >= 0) {
      this.line(this.buf.slice(0, i));
      this.buf = this.buf.slice(i + 1);
    }
  }

  end() {
    this.line(this.buf);
    this.buf = "";
  }

  private line(raw: string) {
    let s = raw.trim().replace(/^[[,]\s*/, "").replace(/[,\]]\s*$/, "");
    if (!s.startsWith("{")) return;
    // aynı satıra yapışmış iki nesne
    s = s.replace(/}\s*{/g, "}\n{");
    for (const part of s.split("\n")) {
      try {
        this.onItem(JSON.parse(part));
      } catch {
        // yarım satır ya da çöp, geç
      }
    }
  }
}
