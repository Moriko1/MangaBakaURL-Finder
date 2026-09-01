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
  ).find(isVisible);
  if (direct) {
    return direct;
  }

  const labels = Array.from(documentNode.querySelectorAll("label")).filter(
    (label) => isVisible(label) && getElementText(label) === "read link",
  );
  for (const label of labels) {
    if (label.htmlFor) {
      const labeled = documentNode.getElementById(label.htmlFor);
      if (isReadLinkControl(labeled) && isVisible(labeled)) {
        return labeled;
      }
    }

    const nested = label.querySelector<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
    if (nested && isVisible(nested)) {
      return nested;
    }
  }

  return null;
}

function findAddToLibraryButton(documentNode: Document): HTMLElement | null {
  return Array.from(documentNode.querySelectorAll("button, a, [role='button']"))
    .filter(isVisible)
    .find((element) => {
      const labels = [
        element.textContent ?? "",
        element.getAttribute("aria-label") ?? "",
        element.getAttribute("title") ?? "",
      ].map(normalizeFieldText);
      return labels.includes("add series to my library") || labels.includes("add to my library");
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
    labels.includes("add to my library")
    || labels.includes("add series to my library")
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
): Promise<boolean> {
  const libraryScopes = findMyLibraryScopes(documentNode);
  const candidates = Array.from(documentNode.querySelectorAll<HTMLElement>(SERIES_EDITOR_CANDIDATE_SELECTOR))
    .filter(isVisible)
    .map((element, order) => ({ element, order, score: scoreEditorTrigger(element, libraryScopes) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.order - right.order)
    .slice(0, MAX_EDITOR_CANDIDATES);

  let openedCandidate = false;
  const attemptsPerCandidate = Math.max(1, Math.floor(EDITOR_OPEN_ATTEMPTS / Math.max(1, candidates.length)));
  for (const { element } of candidates) {
    openedCandidate = true;
    element.focus();
    element.click();
    for (let attempt = 0; attempt < attemptsPerCandidate; attempt += 1) {
      await sleep(EDITOR_OPEN_INTERVAL_MS);
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
  input: HTMLInputElement | HTMLTextAreaElement,
  editorContainer: HTMLElement | null,
  sleep: (milliseconds: number) => Promise<void>,
): Promise<boolean> {
  if (!editorContainer) {
    await sleep(250);
    return true;
  }

  for (let attempt = 0; attempt < SUBMISSION_CONFIRM_ATTEMPTS; attempt += 1) {
    await sleep(SUBMISSION_CONFIRM_INTERVAL_MS);
    if (
      !input.isConnected
      || !editorContainer.isConnected
      || editorContainer.getAttribute("data-state") === "closed"
      || !isVisible(editorContainer)
    ) {
      return true;
    }
    if (hasVisibleSubmissionError(editorContainer)) {
      return false;
    }
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

function findSubmitControl(input: HTMLInputElement | HTMLTextAreaElement): HTMLElement | null {
  const container =
    input.closest("form, [role='dialog'], [data-slot='sheet-content'], [data-slot='drawer-content']") ??
    input.ownerDocument.body;
  return Array.from(container.querySelectorAll<HTMLElement>("button, input[type='submit'], [data-slot='button']"))
    .filter(isVisible)
    .find((element) => {
      if (isSubmitElement(element) && element.type === "submit") {
        return true;
      }
      const text = getElementText(element);
      return text === "update series" || text === "save";
    }) ?? null;
}

export async function setMangaBakaReadLink(
  documentNode: Document,
  value: string,
  options: SetReadLinkOptions = {},
): Promise<SetReadLinkResult> {
  if (!parseMangaBakaSeriesUrl(documentNode.location.href)) {
    return failure("unsupported_page", "Read Link can only be changed on a MangaBaka series page.");
  }

  const readLinkUrl = normalizeReadLinkUrl(value);
  if (!readLinkUrl) {
    return failure("invalid_read_link", "Read Link must be an absolute HTTP or HTTPS URL.");
  }

  const sleep = options.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => {
    documentNode.defaultView?.setTimeout(resolve, milliseconds);
  }));

  let input = findReadLinkInput(documentNode);
  if (!input) {
    if (findAddToLibraryButton(documentNode)) {
      return failure("not_in_library", "Add this series to your MangaBaka library before saving a Read Link.");
    }

    if (!(await openSeriesEditor(documentNode, sleep))) {
      return failure("editor_unavailable", "Could not open the MangaBaka library editor.");
    }
    input = findReadLinkInput(documentNode);
  }

  if (!input) {
    return failure("field_unavailable", "Could not find the MangaBaka Read Link field.");
  }

  setControlledInputValue(input, readLinkUrl);
  if (input.value !== readLinkUrl) {
    return failure("submission_failed", "MangaBaka did not accept the Read Link value.");
  }

  const submitControl = findSubmitControl(input);
  const form = input.form ?? input.closest("form");
  const editorContainer = findEditorContainer(input);
  try {
    if (isFormElement(form) && typeof form.requestSubmit === "function") {
      if (isSubmitElement(submitControl)) {
        form.requestSubmit(submitControl);
      } else {
        form.requestSubmit();
      }
    } else if (submitControl) {
      submitControl.click();
    } else {
      return failure("submit_unavailable", "Could not find a control for saving the MangaBaka Read Link.");
    }
  } catch {
    return failure("submission_failed", "MangaBaka rejected the Read Link update.");
  }

  if (!(await confirmSubmission(input, editorContainer, sleep))) {
    return failure("submission_failed", "MangaBaka did not confirm the Read Link update.");
  }
  return { ok: true, url: readLinkUrl };
}
