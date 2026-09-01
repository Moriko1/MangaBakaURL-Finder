import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";

import { normalizeReadLinkUrl, setMangaBakaReadLink } from "../src/mangabaka/read-link";

describe("setMangaBakaReadLink", () => {
  it("updates the specifically identified field and submits its form", async () => {
    const dom = new JSDOM(`
      <form>
        <label for="read-link">Read Link</label>
        <input id="read-link" name="read_link" />
        <button type="submit">Update series</button>
      </form>
    `, { url: "https://mangabaka.org/manga/377/ONE-PIECE" });
    const form = dom.window.document.querySelector("form")!;
    const requestSubmit = vi.fn();
    Object.defineProperty(form, "requestSubmit", { value: requestSubmit });

    const result = await setMangaBakaReadLink(
      dom.window.document,
      "https://mangadex.org/title/abc",
      { sleep: async () => undefined },
    );

    expect(result).toEqual({ ok: true, url: "https://mangadex.org/title/abc" });
    expect((dom.window.document.querySelector("input") as HTMLInputElement).value)
      .toBe("https://mangadex.org/title/abc");
    expect(requestSubmit).toHaveBeenCalledOnce();
  });

  it("determines not-in-library only from the user-triggered DOM action", async () => {
    const dom = new JSDOM(`<button>Add series to my library</button>`, {
      url: "https://mangabaka.org/manga/377/ONE-PIECE",
    });
    await expect(setMangaBakaReadLink(dom.window.document, "https://mangadex.org/title/abc"))
      .resolves.toMatchObject({ ok: false, error: { code: "not_in_library" } });
  });

  it("opens MangaBaka's current cover control and confirms the sheet submission", async () => {
    const dom = new JSDOM(`
      <button type="button" class="cover-control" aria-label="Edit library entry">
        <svg><use href="#i-pencil"></use></svg>
      </button>
    `, { url: "https://mangabaka.org/manga/377/ONE-PIECE" });
    const trigger = dom.window.document.querySelector<HTMLButtonElement>(".cover-control")!;
    const triggerClick = vi.fn();
    const requestSubmit = vi.fn();
    const inputEvent = vi.fn();
    const changeEvent = vi.fn();

    trigger.addEventListener("click", () => {
      triggerClick();
      const sheet = dom.window.document.createElement("div");
      sheet.setAttribute("role", "dialog");
      sheet.setAttribute("data-slot", "sheet-content");
      sheet.setAttribute("data-state", "open");
      sheet.innerHTML = `
        <form action="/my/library/377?no_redirect=true">
          <label data-slot="label">Read link</label>
          <input id="form-field-read_link" name="read_link" data-slot="input" data-fs-control />
          <button type="submit" data-slot="button">Update series</button>
        </form>
      `;
      dom.window.document.body.append(sheet);
      const input = sheet.querySelector<HTMLInputElement>("input")!;
      input.addEventListener("input", inputEvent);
      input.addEventListener("change", changeEvent);
      const form = sheet.querySelector<HTMLFormElement>("form")!;
      Object.defineProperty(form, "requestSubmit", {
        value: (submitter?: HTMLElement) => {
          requestSubmit(submitter);
          sheet.remove();
        },
      });
    });

    const result = await setMangaBakaReadLink(
      dom.window.document,
      "https://mangadex.org/title/abc",
      { sleep: async () => undefined },
    );

    expect(result).toEqual({ ok: true, url: "https://mangadex.org/title/abc" });
    expect(triggerClick).toHaveBeenCalledOnce();
    expect(inputEvent).toHaveBeenCalledOnce();
    expect(changeEvent).toHaveBeenCalledOnce();
    expect(requestSubmit).toHaveBeenCalledOnce();
    expect((requestSubmit.mock.calls[0]?.[0] as HTMLElement | undefined)?.textContent).toContain("Update series");
  });

  it("ignores MangaBaka Meta dialog decoys and opens the scoped pencil sheet trigger", async () => {
    const dom = new JSDOM(`
      <section>
        <div class="w-full">
          <h4>My library</h4>
          <button id="library-editor" data-dialog-trigger data-slot="sheet-trigger" aria-haspopup="dialog">
            <svg><use href="#i-pencil"></use></svg>
          </button>
        </div>
        <div>
          <h4>Meta</h4>
          <button id="volume" aria-haspopup="dialog">Vol. 110</button>
          <button id="chapter" aria-haspopup="dialog">Ch. 1125</button>
          <button id="anime" aria-haspopup="dialog">Anime</button>
        </div>
      </section>
    `, { url: "https://mangabaka.org/manga/377/ONE-PIECE" });
    const documentNode = dom.window.document;
    const decoyClick = vi.fn();
    for (const id of ["volume", "chapter", "anime"]) {
      documentNode.getElementById(id)!.addEventListener("click", decoyClick);
    }
    const triggerClick = vi.fn();
    const requestSubmit = vi.fn();
    documentNode.getElementById("library-editor")!.addEventListener("click", () => {
      triggerClick();
      const sheet = documentNode.createElement("div");
      sheet.setAttribute("role", "dialog");
      sheet.setAttribute("data-slot", "sheet-content");
      sheet.setAttribute("data-state", "open");
      sheet.innerHTML = `
        <form>
          <input id="form-field-read_link" name="read_link" data-slot="input" />
          <button type="submit" data-slot="button">Update series</button>
        </form>
      `;
      documentNode.body.append(sheet);
      const form = sheet.querySelector<HTMLFormElement>("form")!;
      Object.defineProperty(form, "requestSubmit", {
        value: () => {
          requestSubmit();
          sheet.setAttribute("data-state", "closed");
        },
      });
    });

    await expect(setMangaBakaReadLink(
      documentNode,
      "https://atsu.moe/manga/one-piece",
      { sleep: async () => undefined },
    )).resolves.toEqual({ ok: true, url: "https://atsu.moe/manga/one-piece" });

    expect(triggerClick).toHaveBeenCalledOnce();
    expect(requestSubmit).toHaveBeenCalledOnce();
    expect(decoyClick).not.toHaveBeenCalled();
  });

  it("does not select an editor control hidden by an ancestor", async () => {
    const dom = new JSDOM(`
      <div hidden>
        <button id="hidden-editor" class="cover-control" aria-label="Edit library entry"></button>
      </div>
      <div>
        <h4>My library</h4>
        <button id="visible-editor" data-slot="sheet-trigger">
          <svg><use href="#i-pencil"></use></svg>
        </button>
      </div>
    `, { url: "https://mangabaka.org/manga/377/ONE-PIECE" });
    const documentNode = dom.window.document;
    const hiddenClick = vi.fn();
    const visibleClick = vi.fn();
    documentNode.getElementById("hidden-editor")!.addEventListener("click", hiddenClick);
    documentNode.getElementById("visible-editor")!.addEventListener("click", () => {
      visibleClick();
      documentNode.body.insertAdjacentHTML("beforeend", `
        <form><input name="read_link" /><button type="submit">Update series</button></form>
      `);
      const form = documentNode.querySelector<HTMLFormElement>("form")!;
      Object.defineProperty(form, "requestSubmit", { value: vi.fn() });
    });

    await expect(setMangaBakaReadLink(
      documentNode,
      "https://mangadex.org/title/abc",
      { sleep: async () => undefined },
    )).resolves.toMatchObject({ ok: true });
    expect(hiddenClick).not.toHaveBeenCalled();
    expect(visibleClick).toHaveBeenCalledOnce();
  });

  it("caps editor candidates and shares one bounded wait budget between them", async () => {
    const dom = new JSDOM(`
      <button id="first" class="cover-control" aria-label="Edit library entry"></button>
      <button id="second" class="cover-control" aria-label="Edit library entry"></button>
      <button id="third" class="cover-control" aria-label="Edit library entry"></button>
    `, { url: "https://mangabaka.org/manga/377/ONE-PIECE" });
    const clicks = [vi.fn(), vi.fn(), vi.fn()];
    for (const [index, id] of ["first", "second", "third"].entries()) {
      dom.window.document.getElementById(id)!.addEventListener("click", clicks[index]);
    }
    const sleep = vi.fn(async () => undefined);

    await expect(setMangaBakaReadLink(
      dom.window.document,
      "https://mangadex.org/title/abc",
      { sleep },
    )).resolves.toMatchObject({ ok: false, error: { code: "field_unavailable" } });

    expect(clicks[0]).toHaveBeenCalledOnce();
    expect(clicks[1]).toHaveBeenCalledOnce();
    expect(clicks[2]).not.toHaveBeenCalled();
    expect(sleep).toHaveBeenCalledTimes(24);
  });

  it("reports submission_failed when the current editor remains open", async () => {
    const dom = new JSDOM(`
      <div role="dialog" data-slot="sheet-content" data-state="open">
        <form>
          <input name="read_link" />
          <button type="submit">Update series</button>
        </form>
      </div>
    `, { url: "https://mangabaka.org/manga/377/ONE-PIECE" });
    const form = dom.window.document.querySelector<HTMLFormElement>("form")!;
    Object.defineProperty(form, "requestSubmit", { value: vi.fn() });

    await expect(setMangaBakaReadLink(
      dom.window.document,
      "https://mangadex.org/title/abc",
      { sleep: async () => undefined },
    )).resolves.toMatchObject({ ok: false, error: { code: "submission_failed" } });
  });

  it("fails before DOM mutation for invalid links and unsupported pages", async () => {
    expect(normalizeReadLinkUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeReadLinkUrl("https://user:secret@example.com/path")).toBeNull();

    const dom = new JSDOM(`<input name="read_link" value="unchanged" />`, {
      url: "https://mangabaka.org/search",
    });
    await expect(setMangaBakaReadLink(dom.window.document, "https://mangadex.org/title/abc"))
      .resolves.toMatchObject({ ok: false, error: { code: "unsupported_page" } });
    expect((dom.window.document.querySelector("input") as HTMLInputElement).value).toBe("unchanged");
  });

  it.each([
    {
      html: "<main><p>My library</p></main>",
      code: "editor_unavailable",
    },
    {
      html: "<section>My library <button aria-haspopup='dialog'>Edit library entry</button></section>",
      code: "field_unavailable",
    },
    {
      html: "<label>Read Link <input name='read_link' /></label>",
      code: "submit_unavailable",
    },
  ])("returns stable $code when a Read Link control is unavailable", async ({ html, code }) => {
    const dom = new JSDOM(html, { url: "https://mangabaka.org/manga/377/ONE-PIECE" });
    await expect(setMangaBakaReadLink(
      dom.window.document,
      "https://mangadex.org/title/abc",
      { sleep: async () => undefined },
    )).resolves.toMatchObject({ ok: false, error: { code } });
  });
});
