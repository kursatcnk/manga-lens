// Parses the model's answer as it streams in: one JSON object per line.
// Models sometimes wrap it in ```json fences or a [ ... ] array, so be lenient.
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
    // two objects glued on one line
    s = s.replace(/}\s*{/g, "}\n{");
    for (const part of s.split("\n")) {
      try {
        this.onItem(JSON.parse(part));
      } catch {
        // half a line or junk, skip
      }
    }
  }
}
