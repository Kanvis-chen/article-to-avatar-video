export class JsonLineDecoder {
  #buffer = "";

  push(chunk: string): unknown[] {
    this.#buffer += chunk;
    const lines = this.#buffer.split(/\r?\n/);
    this.#buffer = lines.pop() ?? "";
    return lines.filter((line) => line.trim()).map((line) => JSON.parse(line));
  }

  finish(): unknown[] {
    const remaining = this.#buffer.trim();
    this.#buffer = "";
    return remaining ? [JSON.parse(remaining)] : [];
  }
}
