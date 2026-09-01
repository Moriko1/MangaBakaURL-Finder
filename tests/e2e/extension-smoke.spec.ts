import { chromium, expect, test, type BrowserContext, type Page, type Worker } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SERIES_URL = "https://mangabaka.org/manga/377/ONE-PIECE";
const MANGABAKA_SEARCH_URL = "https://mangabaka.org/search?q=one-piece";
const SERIES_API_URL = "https://api.mangabaka.org/v2/series/377?schema=full";
const MANGADEX_CHAPTER_ID = "22270669-7c5d-43b2-bb73-1369e9fec119";
const MANGADEX_CHAPTER_URL = `https://mangadex.org/chapter/${MANGADEX_CHAPTER_ID}`;
const MANGADEX_CHAPTER_API_URL = `https://api.mangadex.org/chapter/${MANGADEX_CHAPTER_ID}?includes[]=manga`;
const SERIES_API_PAYLOAD = {
  status: 200,
  data: {
    id: 377,
    state: "active",
    merged_with: null,
    canonical_url: SERIES_URL,
    type: "manga",
    authors: ["Eiichirou Oda"],
    last_updated_at: "2026-08-30T17:53:41.916Z",
    titles: [
      {
        language: "en",
        traits: ["official"],
        title: "ONE PIECE",
        note: null,
        is_primary: true,
      },
    ],
  },
};

const SERIES_FIXTURE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <script>
      window.__mbMarkerAtFirstPageScript = document.documentElement.getAttribute("data-mb-extension");
    </script>
    <title>ONE PIECE - MangaBaka</title>
  </head>
  <body>
    <main><h1 lang="en">One Piece</h1></main>
    <div id="ratings" data-browser-extension-injection="ratings"></div>
  </body>
</html>`;

const READ_LINK_SERIES_FIXTURE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>ONE PIECE - MangaBaka</title>
  </head>
  <body>
    <main><h1 lang="en">ONE PIECE</h1></main>
    <button type="button" class="cover-control" aria-label="Edit library entry">
      <svg><use href="#i-pencil"></use></svg>
    </button>
    <script>
      document.querySelector('.cover-control').addEventListener('click', () => {
        const sheet = document.createElement('div');
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('data-dialog-content', '');
        sheet.setAttribute('data-slot', 'sheet-content');
        sheet.setAttribute('data-state', 'open');
        sheet.innerHTML = [
          '<form method="POST" action="/my/library/377?no_redirect=true">',
          '<label data-slot="label">Read link</label>',
          '<input id="form-field-read_link" name="read_link" data-fs-control data-slot="input">',
          '<button type="submit" data-slot="button">Update series</button>',
          '</form>',
        ].join('');
        sheet.querySelector('form').addEventListener('submit', (event) => {
          event.preventDefault();
          document.documentElement.dataset.savedReadLink = sheet.querySelector('[name="read_link"]').value;
          sheet.remove();
        });
        document.body.append(sheet);
      });
    </script>
  </body>
</html>`;

function collectRuntimeErrors(context: BrowserContext, errors: string[]): void {
  const observedPages = new WeakSet<Page>();
  const observedWorkers = new WeakSet<Worker>();
  const watchPage = (page: Page): void => {
    if (observedPages.has(page)) return;
    observedPages.add(page);
    page.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warning") {
        errors.push(`page console ${message.type()}: ${message.text()}`);
      }
    });
    page.on("pageerror", (error) => errors.push(`page error: ${error.message}`));
  };
  const watchWorker = (worker: Worker): void => {
    if (observedWorkers.has(worker)) return;
    observedWorkers.add(worker);
    worker.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warning") {
        errors.push(`worker console ${message.type()}: ${message.text()}`);
      }
    });
  };

  context.pages().forEach(watchPage);
  context.serviceWorkers().forEach(watchWorker);
  context.on("page", watchPage);
  context.on("serviceworker", watchWorker);
}

test("loads the Google package, installs its early page bridge, and opens its popup", async () => {
  const extensionPath = resolve("webstore-package-google");
  const userDataDir = await mkdtemp(join(tmpdir(), "mangabaka-extension-"));
  let context: BrowserContext | undefined;
  const runtimeErrors: string[] = [];

  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
      channel: "chromium",
      headless: true,
    });
    collectRuntimeErrors(context, runtimeErrors);

    let [serviceWorker] = context.serviceWorkers();
    serviceWorker ??= await context.waitForEvent("serviceworker");
    const extensionId = new URL(serviceWorker.url()).host;

    await context.route(SERIES_URL, async (route) => {
      await route.fulfill({
        body: SERIES_FIXTURE,
        contentType: "text/html",
        status: 200,
      });
    });
    await context.route(MANGABAKA_SEARCH_URL, async (route) => {
      await route.fulfill({
        body: "<!doctype html><html><body><main><h1>Search</h1></main></body></html>",
        contentType: "text/html",
        status: 200,
      });
    });
    await serviceWorker.evaluate(async () => {
      await chrome.storage.local.set({
        "extension:settings": {
          enabledProviders: {
            atsu: false,
            mangadex: false,
            comixto: false,
            mangafire: false,
            weebcentral: false,
          },
          providerLabelMode: "titles",
          mangaBakaLinkType: "current",
          providerLinkType: "current",
          optionsPanelTab: "providers",
          mangaBakaButtonTarget: "root",
          mangaBakaProfileName: "",
        },
      });
    });
    const seriesPage = await context.newPage();
    await seriesPage.goto(MANGABAKA_SEARCH_URL);
    await expect.poll(() => serviceWorker.evaluate(async () => {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return typeof activeTab?.id === "number" ? chrome.action.getTitle({ tabId: activeTab.id }) : null;
    })).toBe("MangaBaka URL Finder");
    await seriesPage.goto(SERIES_URL);
    await expect(seriesPage.locator('html[data-mb-extension="1"]')).toHaveCount(1);
    await expect(seriesPage.locator("main h1[lang]")).toHaveText("One Piece");
    await expect.poll(() => seriesPage.evaluate(() => (
      window as Window & { __mbMarkerAtFirstPageScript?: string | null }
    ).__mbMarkerAtFirstPageScript)).toBe("1");

    const popup = await context.newPage();
    await popup.addInitScript(({ apiPayload, apiUrl }) => {
      const originalFetch = globalThis.fetch.bind(globalThis);
      (globalThis as typeof globalThis & { __seriesApiRequests?: number }).__seriesApiRequests = 0;
      globalThis.fetch = (async function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
        if (this !== globalThis) {
          throw new TypeError("Illegal invocation");
        }
        const requestUrl = typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
        if (requestUrl === apiUrl) {
          const testWindow = globalThis as typeof globalThis & { __seriesApiRequests?: number };
          testWindow.__seriesApiRequests = (testWindow.__seriesApiRequests ?? 0) + 1;
          return new Response(JSON.stringify(apiPayload), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return originalFetch(input, init);
      }) as typeof fetch;
    }, { apiPayload: SERIES_API_PAYLOAD, apiUrl: SERIES_API_URL });
    await seriesPage.bringToFront();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);

    await expect(popup).toHaveTitle("MangaBaka URL Finder");
    await expect(popup.locator("main.popup-shell")).toBeVisible();
    await expect.poll(() => popup.evaluate(() => (
      globalThis as typeof globalThis & { __seriesApiRequests?: number }
    ).__seriesApiRequests ?? 0)).toBe(1);
    await expect(popup.locator("#series-title")).toHaveText("ONE PIECE");
    await expect(popup.locator("#series-subtitle")).toHaveText("by Eiichirou Oda");
    await expect(popup.locator("#status")).toHaveText("No providers enabled");

    await popup.setViewportSize({ width: 470, height: 720 });
    const popupDimensions = await popup.evaluate(() => ({
      bodyMinWidth: getComputedStyle(document.body).minWidth,
      bodyWidth: document.body.getBoundingClientRect().width,
      htmlWidth: document.documentElement.getBoundingClientRect().width,
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));
    expect(popupDimensions).toEqual({
      bodyMinWidth: "470px",
      bodyWidth: 470,
      htmlWidth: 470,
      scrollWidth: 470,
      viewportWidth: 470,
    });
    await popup.locator("#options-button").click();
    await expect(popup.locator("#options-panel")).toBeVisible();
    await expect(popup.locator("#option-mangadex")).toBeVisible();
    await popup.locator("#options-tab-extension").click();
    await expect(popup.getByText("Search-Link Type", { exact: true })).toBeVisible();
    await expect(popup.getByText("Provider-Link Type", { exact: true })).toBeVisible();
    await expect(popup.locator("#option-search-link-type")).toHaveValue("current");
    await expect(popup.locator("#option-provider-link-type")).toHaveValue("new");
    await expect(popup.locator("#option-ehentai, #option-exhentai")).toHaveCount(0);
    expect(runtimeErrors).toEqual([]);
  } finally {
    await context?.close();
    await rm(userDataDir, { force: true, recursive: true });
  }
});

test("uses the MangaDex parent series title on a chapter page", async () => {
  const extensionPath = resolve("webstore-package-google");
  const userDataDir = await mkdtemp(join(tmpdir(), "mangabaka-extension-mangadex-"));
  let context: BrowserContext | undefined;
  const runtimeErrors: string[] = [];

  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
      channel: "chromium",
      headless: true,
    });
    collectRuntimeErrors(context, runtimeErrors);

    let [serviceWorker] = context.serviceWorkers();
    serviceWorker ??= await context.waitForEvent("serviceworker");
    const extensionId = new URL(serviceWorker.url()).host;

    await serviceWorker.evaluate(async () => {
      await chrome.storage.local.set({
        "extension:settings": {
          enabledProviders: {
            atsu: false,
            mangadex: true,
            comixto: false,
            mangafire: false,
            weebcentral: false,
          },
          providerLabelMode: "titles",
          mangaBakaLinkType: "current",
          searchLinkType: "new",
          providerLinkType: "new",
          optionsPanelTab: "providers",
          mangaBakaButtonTarget: "root",
          mangaBakaProfileName: "",
        },
      });
    });
    await context.route(MANGADEX_CHAPTER_URL, async (route) => {
      await route.fulfill({
        body: "<!doctype html><html><head><title>Vohu - MangaDex</title></head><body><main><h1>Vohu</h1></main></body></html>",
        contentType: "text/html",
        status: 200,
      });
    });
    await context.route("https://mangadex.org/", async (route) => {
      await route.fulfill({
        body: "<!doctype html><html><body><main><h1>MangaDex</h1></main></body></html>",
        contentType: "text/html",
        status: 200,
      });
    });

    const chapterPage = await context.newPage();
    await chapterPage.goto(MANGADEX_CHAPTER_URL);
    const popup = await context.newPage();
    await popup.addInitScript(({ apiUrl }) => {
      const originalFetch = globalThis.fetch.bind(globalThis);
      (globalThis as typeof globalThis & { __mangaDexChapterRequests?: number }).__mangaDexChapterRequests = 0;
      globalThis.fetch = (async function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
        if (this !== globalThis) {
          throw new TypeError("Illegal invocation");
        }
        const requestUrl = typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
        if (requestUrl === apiUrl) {
          const testWindow = globalThis as typeof globalThis & { __mangaDexChapterRequests?: number };
          testWindow.__mangaDexChapterRequests = (testWindow.__mangaDexChapterRequests ?? 0) + 1;
          return new Response(JSON.stringify({
            data: {
              relationships: [{
                id: "a1c7c817-4e59-43b7-9365-09675a149a6f",
                type: "manga",
                attributes: {
                  title: { "ja-ro": "One Piece" },
                  altTitles: [{ en: "ONE PIECE" }, { ja: "ワンピース" }],
                },
              }],
            },
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return originalFetch(input, init);
      }) as typeof fetch;
    }, { apiUrl: MANGADEX_CHAPTER_API_URL });

    await chapterPage.bringToFront();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);

    await expect.poll(() => popup.evaluate(() => (
      globalThis as typeof globalThis & { __mangaDexChapterRequests?: number }
    ).__mangaDexChapterRequests ?? 0)).toBe(1);
    await expect(popup.locator("#series-title")).toHaveText("One Piece");
    await expect(popup.locator("#series-subtitle")).toHaveText("Chapter Page");
    await expect(popup.locator("#status")).toHaveText("Ready to search MangaBaka from MangaDex");
    await expect(popup.getByRole("button", { name: /Search MangaBaka for One Piece/ })).toBeEnabled();
    const mangaDexHomepage = popup.getByRole("link", { name: "Open MangaDex homepage in a new tab" });
    await expect(mangaDexHomepage).toHaveAttribute("href", "https://mangadex.org/");
    await expect(mangaDexHomepage).toHaveAttribute("target", "_blank");

    await popup.locator("#options-button").click();
    await popup.locator("#option-provider-label-mode").selectOption("icons");
    await expect(popup.getByRole("link", { name: "Open MangaDex homepage in a new tab" })).toBeVisible();
    await popup.locator("#option-provider-label-mode").selectOption("stacked");
    await expect(popup.getByRole("link", { name: "Open MangaDex homepage in a new tab" })).toBeVisible();
    await popup.locator("#options-tab-extension").click();
    await popup.locator("#option-provider-link-type").selectOption("current");
    await expect(popup.locator("#option-search-link-type")).toHaveValue("new");
    const currentTabHomepage = popup.getByRole("link", { name: "Open MangaDex homepage in the current tab" });
    await expect(currentTabHomepage).toHaveAttribute("target", "_self");
    await currentTabHomepage.click();
    await expect(chapterPage).toHaveURL("https://mangadex.org/");
    expect(runtimeErrors).toEqual([]);
  } finally {
    await context?.close();
    await rm(userDataDir, { force: true, recursive: true });
  }
});

test("copies and saves a provider result through MangaBaka's current library editor", async () => {
  const extensionPath = resolve("webstore-package-google");
  const userDataDir = await mkdtemp(join(tmpdir(), "mangabaka-extension-read-link-"));
  let context: BrowserContext | undefined;
  const runtimeErrors: string[] = [];

  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
      channel: "chromium",
      headless: true,
    });
    collectRuntimeErrors(context, runtimeErrors);

    let [serviceWorker] = context.serviceWorkers();
    serviceWorker ??= await context.waitForEvent("serviceworker");
    const extensionId = new URL(serviceWorker.url()).host;

    await context.route(SERIES_URL, async (route) => {
      await route.fulfill({ body: READ_LINK_SERIES_FIXTURE, contentType: "text/html", status: 200 });
    });
    await serviceWorker.evaluate(async () => {
      await chrome.storage.local.set({
        "extension:settings": {
          enabledProviders: {
            atsu: true,
            mangadex: false,
            comixto: false,
            mangafire: false,
            weebcentral: false,
          },
          providerLabelMode: "titles",
          mangaBakaLinkType: "current",
          searchLinkType: "new",
          providerLinkType: "new",
          optionsPanelTab: "providers",
          mangaBakaButtonTarget: "root",
          mangaBakaProfileName: "",
        },
      });
    });

    const seriesPage = await context.newPage();
    await seriesPage.goto(SERIES_URL);
    await expect(seriesPage.locator('html[data-mb-extension="1"]')).toHaveCount(1);

    const popup = await context.newPage();
    await popup.addInitScript(({ apiPayload, apiUrl }) => {
      (globalThis as typeof globalThis & { __clipboardShouldFail?: boolean }).__clipboardShouldFail = true;
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            if ((globalThis as typeof globalThis & { __clipboardShouldFail?: boolean }).__clipboardShouldFail) {
              throw new Error("Synthetic clipboard denial");
            }
            (globalThis as typeof globalThis & { __copiedProviderLink?: string }).__copiedProviderLink = value;
          },
        },
      });
      const originalFetch = globalThis.fetch.bind(globalThis);
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const requestUrl = typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
        if (requestUrl === apiUrl) {
          return new Response(JSON.stringify(apiPayload), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (requestUrl.startsWith("https://atsu.moe/collections/manga/documents/search?")) {
          return new Response(JSON.stringify({
            hits: [{ document: { id: "one-piece", title: "ONE PIECE", otherNames: [], hidden: false } }],
          }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
        if (requestUrl === "https://atsu.moe/api/manga/page?id=one-piece") {
          return new Response(JSON.stringify({
            mangaPage: { chapters: [{ id: "chapter-1", title: null, number: 1 }] },
          }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
        return originalFetch(input, init);
      }) as typeof fetch;
    }, { apiPayload: SERIES_API_PAYLOAD, apiUrl: SERIES_API_URL });

    await seriesPage.bringToFront();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    const copyButton = popup.getByRole("button", { name: "Copy Atsumaru link" });
    await expect(copyButton).toBeEnabled();
    await copyButton.click();
    await expect(popup.locator("#status")).toHaveText("Unable to copy Atsumaru link");
    await expect(popup.getByRole("button", { name: "Save Atsumaru as MangaBaka Read Link" })).toHaveCount(0);
    await popup.evaluate(() => {
      (globalThis as typeof globalThis & { __clipboardShouldFail?: boolean }).__clipboardShouldFail = false;
    });
    await copyButton.click();
    await expect.poll(() => popup.evaluate(() => (
      globalThis as typeof globalThis & { __copiedProviderLink?: string }
    ).__copiedProviderLink)).toBe("https://atsu.moe/manga/one-piece");

    const saveButton = popup.getByRole("button", { name: "Save Atsumaru as MangaBaka Read Link" });
    await expect(saveButton).toBeEnabled();
    await saveButton.click();
    await expect.poll(() => seriesPage.getAttribute("html", "data-saved-read-link"))
      .toBe("https://atsu.moe/manga/one-piece");
    await expect(seriesPage.locator("[data-slot='sheet-content'][data-state='open']")).toHaveCount(0);
    await expect(popup.locator("#status")).toHaveText("Atsumaru saved as MangaBaka Read Link");
    expect(runtimeErrors).toEqual([]);
  } finally {
    await context?.close();
    await rm(userDataDir, { force: true, recursive: true });
  }
});
