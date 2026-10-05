import { MangaBakaBridgeError, MangaBakaBridgeErrorCode } from "../domain/active-page";
import { parseMangaBakaSeriesUrl } from "./url";

export type SetReadLinkResult =
  | { ok: true; url: string }
  | { ok: false; error: MangaBakaBridgeError };

export interface SetReadLinkOptions {
  sleep?: (milliseconds: number) => Promise<void>;
}

const READ_LINK_INPUT_SELECTOR = [
  "input[name='read_link']",
  "textarea[name='read_link']",
  "input[name*='read_link' i]",
  "textarea[name*='read_link' i]",
  "input[id*='read_link' i]",
  "textarea[id*='read_link' i]",
].join(", ");

const SERIES_EDITOR_CANDIDATE_SELECTOR = "button, [role='button'], [data-slot='sheet-trigger']";
const SHEET_TRIGGER_SELECTOR = "[data-slot='sheet-trigger']";
const PENCIL_ICON_SELECTOR = [
  "use[href$='#i-pencil']",
  "use[href*='#i-pencil']",
  "[data-icon='pencil']",
  ".i-pencil",
].join(", ");
const EDITOR_OPEN_ATTEMPTS = 24;
const EDITOR_OPEN_INTERVAL_MS = 125;
const MAX_EDITOR_CANDIDATES = 2;
const SUBMISSION_CONFIRM_ATTEMPTS = 32;
const SUBMISSION_CONFIRM_INTERVAL_MS = 125;
const ADD_TO_LIBRARY_LABELS = new Set([
  "add series to my library", "add to my library", "add series to your library", "add to library",
]);
const SAVE_LABELS = new Set(["update series", "save", "save changes"]);

function failure(code: MangaBakaBridgeErrorCode, message: string): SetReadLinkResult {
  return { ok: false, error: { code, message } };
}

export function normalizeReadLinkUrl(value: string): string | null {
  if (typeof value !== "string" || value.length > 2_048) {
    return null;
  }

  try {
    const url = new URL(value.trim());
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      !url.hostname ||
      url.username ||
      url.password
    ) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

function normalizeFieldText(value: string): string {
  return value.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, " ").trim();
}

function getElementText(element: Element | null): string {
  return normalizeFieldText(element?.textContent ?? "");
}

function isHtmlElement(element: Element | null): element is HTMLElement {
  const constructor = element?.ownerDocument.defaultView?.HTMLElement;
  return Boolean(constructor && element instanceof constructor);
}

function isReadLinkControl(element: Element | null): element is HTMLInputElement | HTMLTextAreaElement {
  return Boolean(element && (element.tagName === "INPUT" || element.tagName === "TEXTAREA"));
}

function isFormElement(element: Element | null): element is HTMLFormElement {
  return element?.tagName === "FORM";
}

function isSubmitElement(element: Element | null): element is HTMLButtonElement | HTMLInputElement {
  return Boolean(element && (element.tagName === "BUTTON" || element.tagName === "INPUT"));
}

function isEnabled(element: HTMLElement): boolean {
  return !element.matches(":disabled, [aria-disabled='true']");
}

function isWritableReadLinkControl(element: HTMLInputElement | HTMLTextAreaElement): boolean {
  return isVisible(element) && isEnabled(element) && !element.readOnly && element.type !== "hidden";
}

function isVisible(element: Element | null): element is HTMLElement {
  if (!isHtmlElement(element)) {
    return false;
  }

  const view = element.ownerDocument.defaultView;
  let current: HTMLElement | null = element;
  while (current) {
    if (
      current.hidden
      || current.getAttribute("aria-hidden") === "true"
      || current.hasAttribute("inert")
    ) {
      return false;
    }

    const style = view?.getComputedStyle(current);
    if (
      style?.display === "none"
      || style?.visibility === "hidden"
      || style?.visibility === "collapse"
    ) {
      return false;
    }
    current = current.parentElement;
  }

  return element.isConnected;
}

function findReadLinkInput(documentNode: Document): HTMLInputElement | HTMLTextAreaElement | null {
  const direct = Array.from(
    documentNode.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(READ_LINK_INPUT_SELECTOR),
  ).find(isWritableReadLinkControl);
  if (direct) {
    return direct;
  }

  const labels = Array.from(documentNode.querySelectorAll("label")).filter(
    (label) => isVisible(label) && getElementText(label) === "read link",
  );
  for (const label of labels) {
    if (label.htmlFor) {
      const labeled = documentNode.getElementById(label.htmlFor);
      if (isReadLinkControl(labeled) && isWritableReadLinkControl(labeled)) {
        return labeled;
      }
    }

    const nested = label.querySelector<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
    if (nested && isWritableReadLinkControl(nested)) {
      return nested;
    }
  }

  return null;
}

function findAddToLibraryButton(documentNode: Document): HTMLElement | null {
  return Array.from(documentNode.querySelectorAll<HTMLElement>("button, a, [role='button']"))
    .find((element) => {
      const labels = [
        element.textContent ?? "",
        element.getAttribute("aria-label") ?? "",
        element.getAttribute("title") ?? "",
      ].map(normalizeFieldText);
      return labels.some((label) => ADD_TO_LIBRARY_LABELS.has(label)) && isVisible(element);
    }) ?? null;
}

function getEditorTriggerLabels(element: HTMLElement): string[] {
  return [
    element.textContent ?? "",
    element.getAttribute("aria-label") ?? "",
    element.getAttribute("title") ?? "",
  ].map(normalizeFieldText).filter(Boolean);
}

function findMyLibraryScopes(documentNode: Document): HTMLElement[] {
  const headings = Array.from(
    documentNode.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6, [role='heading']"),
  ).filter((element) => isVisible(element) && getElementText(element) === "my library");
  const scopes: HTMLElement[] = [];

  for (const heading of headings) {
    let candidate = heading.parentElement;
    for (let depth = 0; candidate && candidate !== documentNode.body && depth < 4; depth += 1) {
      if (candidate.querySelector(SERIES_EDITOR_CANDIDATE_SELECTOR)) {
        scopes.push(candidate);
        break;
      }
      if (candidate.hasAttribute("data-browser-extension-injection")) {
        break;
      }
      candidate = candidate.parentElement;
    }
  }

  return scopes;
}

function scoreEditorTrigger(element: HTMLElement, libraryScopes: readonly HTMLElement[]): number {
  const labels = getEditorTriggerLabels(element);
  const identity = labels.join(" ");
  const isInLibraryScope = libraryScopes.some((scope) => scope.contains(element));
  const isSheetTrigger = element.matches(SHEET_TRIGGER_SELECTOR);
  const hasPencilIcon = Boolean(element.querySelector(PENCIL_ICON_SELECTOR));
  const isCoverControl = element.matches("button.cover-control, .cover-control[role='button']");
  const isExactEditorControl = labels.includes("edit library entry");

  if (
    labels.some((label) => ADD_TO_LIBRARY_LABELS.has(label))
    || identity.includes("report")
    || identity.includes("remove")
    || identity.includes("delete")
  ) {
    return -1;
  }

  if (isExactEditorControl) return 1_000;
  if (isCoverControl && hasPencilIcon) return 900;
  if (isSheetTrigger && hasPencilIcon && isInLibraryScope) return 850;
  if (isSheetTrigger && hasPencilIcon) return 800;
  if (isSheetTrigger && isInLibraryScope) return 700;
  if (isInLibraryScope && identity.includes("edit") && identity.includes("library")) return 600;
  return -1;
}

async function openSeriesEditor(
  documentNode: Document,
  sleep: (milliseconds: number) => Promise<void>,
  isCurrentSeries: () => boolean,
): Promise<boolean> {
  const libraryScopes = findMyLibraryScopes(documentNode);
  const candidates = Array.from(documentNode.querySelectorAll<HTMLElement>(SERIES_EDITOR_CANDIDATE_SELECTOR))
    .map((element, order) => ({ element, order, score: scoreEditorTrigger(element, libraryScopes) }))
    .filter(({ element, score }) => score > 0 && isVisible(element) && isEnabled(element))
    .sort((left, right) => right.score - left.score || left.order - right.order)
    .slice(0, MAX_EDITOR_CANDIDATES);

  let openedCandidate = false;
  const attemptsPerCandidate = Math.max(1, Math.floor(EDITOR_OPEN_ATTEMPTS / Math.max(1, candidates.length)));
  for (const { element } of candidates) {
    if (!isCurrentSeries()) return false;
    if (!isVisible(element) || !isEnabled(element)) continue;
    openedCandidate = true;
    element.focus();
    element.click();
    if (isCurrentSeries() && findReadLinkInput(documentNode)) return true;
    for (let attempt = 0; attempt < attemptsPerCandidate; attempt += 1) {
      await sleep(EDITOR_OPEN_INTERVAL_MS);
      if (!isCurrentSeries()) return false;
      if (findReadLinkInput(documentNode)) {
        return true;
      }
    }
  }
  return openedCandidate;
}

function findEditorContainer(input: HTMLInputElement | HTMLTextAreaElement): HTMLElement | null {
  const container = input.closest<HTMLElement>(
    "[data-slot='sheet-content'], [data-slot='drawer-content'], [role='dialog']",
  );
  return container && isVisible(container) ? container : null;
}

function hasVisibleSubmissionError(container: HTMLElement): boolean {
  return Array.from(container.querySelectorAll<HTMLElement>(
    "[role='alert'], [data-fs-error], [data-slot='field-error'], [aria-live='assertive']",
  )).some((element) => isVisible(element) && getElementText(element).length > 0);
}

async function confirmSubmission(
  container: HTMLElement,
  sleep: (milliseconds: number) => Promise<void>,
  isCurrentSeries: () => boolean,
): Promise<boolean> {
  for (let attempt = 0; attempt <= SUBMISSION_CONFIRM_ATTEMPTS; attempt += 1) {
    if (!isCurrentSeries()) return false;
    if (
      !container.isConnected
      || container.getAttribute("data-state") === "closed"
      || !isVisible(container)
    ) {
      return true;
    }
    if (hasVisibleSubmissionError(container)) {
      return false;
    }
    if (attempt < SUBMISSION_CONFIRM_ATTEMPTS) await sleep(SUBMISSION_CONFIRM_INTERVAL_MS);
  }

  return false;
}

function setControlledInputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const view = input.ownerDocument.defaultView;
  const prototype = input.tagName === "TEXTAREA"
    ? view?.HTMLTextAreaElement.prototype
    : view?.HTMLInputElement.prototype;
  const descriptor = prototype ? Object.getOwnPropertyDescriptor(prototype, "value") : undefined;
  const EventConstructor = view?.Event ?? Event;
  input.focus();
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new EventConstructor("input", { bubbles: true }));
  input.dispatchEvent(new EventConstructor("change", { bubbles: true }));
}

function findSubmitControl(input: HTMLInputElement | HTMLTextAreaElement, allowDisabled = false): HTMLElement | null {
  const form = input.form;
  const container = form ?? findEditorContainer(input);
  if (!container) return null;
  const controls = form
    ? Array.from(form.elements).filter(isHtmlElement)
    : Array.from(container.querySelectorAll<HTMLElement>("button, input[type='submit'], [role='button']"));
  return controls
    .filter(isVisible)
    .filter((element) => allowDisabled || isEnabled(element))
    .find((element) => {
      if (isSubmitElement(element) && element.type === "reset") return false;
      if (isSubmitElement(element) && element.form !== form) return false;
      if (!element.matches("button, input[type='submit'], [role='button']")) return false;
      const labels = getEditorTriggerLabels(element);
      if (element.tagName === "INPUT") labels.push(normalizeFieldText((element as HTMLInputElement).value));
      return labels.some((label) => SAVE_LABELS.has(label));
    }) ?? null;
}

export async function setMangaBakaReadLink(
  documentNode: Document,
  value: string,
  options: SetReadLinkOptions = {},
): Promise<SetReadLinkResult> {
  const series = parseMangaBakaSeriesUrl(documentNode.location.href);
  if (!series) {
    return failure("unsupported_page", "Read Link can only be changed on a MangaBaka series page.");
  }

  const readLinkUrl = normalizeReadLinkUrl(value);
  if (!readLinkUrl) {
    return failure("invalid_read_link", "Read Link must be an absolute HTTP or HTTPS URL.");
  }

  const sleep = options.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => {
    documentNode.defaultView?.setTimeout(resolve, milliseconds);
  }));
  const isCurrentSeries = () => parseMangaBakaSeriesUrl(documentNode.location.href)?.seriesId === series.seriesId;

  let input = findReadLinkInput(documentNode);
  if (!input) {
    if (findAddToLibraryButton(documentNode)) {
      return failure("not_in_library", "Add this series to your MangaBaka library before saving a Read Link.");
    }

    const opened = await openSeriesEditor(documentNode, sleep, isCurrentSeries);
    if (!isCurrentSeries()) {
      return failure("series_mismatch", "The MangaBaka series changed before the Read Link could be saved.");
    }
    if (!opened) {
      return failure("editor_unavailable", "Could not open the MangaBaka library editor.");
    }
    input = findReadLinkInput(documentNode);
  }

  if (!input) {
    return failure("field_unavailable", "Could not find the MangaBaka Read Link field.");
  }

  const form = input.form;
  const editorContainer = findEditorContainer(input) ?? form;
  if (!findSubmitControl(input, true) || !editorContainer) {
    return failure("submit_unavailable", "Could not find a control for saving the MangaBaka Read Link.");
  }

  setControlledInputValue(input, readLinkUrl);
  // Let the site's reactive form apply validation and enable its save action.
  await Promise.resolve();
  if (!isCurrentSeries()) {
    return failure("series_mismatch", "The MangaBaka series changed before the Read Link could be saved.");
  }
  if (input.value !== readLinkUrl) {
    return failure("submission_failed", "MangaBaka did not accept the Read Link value.");
  }

  const submitControl = findSubmitControl(input);
  if (!isWritableReadLinkControl(input) || !submitControl) {
    return failure("submit_unavailable", "The MangaBaka editor changed before the Read Link could be saved.");
  }
  try {
    if (isFormElement(form) && typeof form.requestSubmit === "function"
      && isSubmitElement(submitControl) && submitControl.type === "submit") {
      form.requestSubmit(submitControl);
    } else {
      submitControl.click();
    }
  } catch {
    return failure("submission_failed", "MangaBaka rejected the Read Link update.");
  }

  if (!(await confirmSubmission(editorContainer, sleep, isCurrentSeries))) {
    return failure("submission_failed", "MangaBaka did not confirm the Read Link update.");
  }
  return { ok: true, url: readLinkUrl };
}
