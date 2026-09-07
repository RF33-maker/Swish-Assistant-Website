import { createRoot } from "react-dom/client";
import html2canvas from "html2canvas";
import { PlayerPerformanceCardV1 } from "@/components/social/PlayerPerformanceCardV1";
import type { PlayerPerformanceV1Data } from "@/types/socialCards";

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1350;
const REEL_CARD_HEIGHT = 1920;
const ASSET_TIMEOUT_MS = 12_000;

type TimedResult<T> =
  | { completed: true; value: T }
  | { completed: false };

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<TimedResult<T>> {
  return Promise.race([
    promise.then((value) => ({ completed: true as const, value })),
    new Promise<{ completed: false }>((resolve) =>
      window.setTimeout(() => resolve({ completed: false }), timeoutMs),
    ),
  ]);
}

async function waitForImage(image: HTMLImageElement): Promise<boolean> {
  if (!image.complete) {
    const loadResult = await withTimeout(
      new Promise<"loaded" | "missing">((resolve) => {
        image.addEventListener("load", () => resolve("loaded"), { once: true });
        image.addEventListener("error", () => resolve("missing"), { once: true });
      }),
      ASSET_TIMEOUT_MS,
    );
    if (!loadResult.completed) return false;
    if (loadResult.value === "missing") {
      image.style.display = "none";
      return true;
    }
  }

  if (image.naturalWidth <= 0) {
    image.style.display = "none";
    return true;
  }

  const decodeResult = await withTimeout(
    image.decode().then(() => true).catch(() => false),
    ASSET_TIMEOUT_MS,
  );
  return decodeResult.completed && decodeResult.value;
}

async function waitForCardAssets(element: HTMLElement): Promise<boolean> {
  if ("fonts" in document) {
    const fontsResult = await withTimeout(document.fonts.ready, ASSET_TIMEOUT_MS);
    if (!fontsResult.completed) return false;
  }

  const images = Array.from(element.querySelectorAll("img"));
  const imageResults = await Promise.all(images.map(waitForImage));
  if (imageResults.some((ready) => !ready)) return false;

  // Let the browser commit font metrics and decoded image dimensions before capture.
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
  return true;
}

export async function renderSocialCardToBlob(
  data: PlayerPerformanceV1Data,
  template: string,
): Promise<Blob | null> {
  const height = template === "photo-overlay-reel" ? REEL_CARD_HEIGHT : CARD_HEIGHT;
  const hiddenContainer = document.createElement("div");
  hiddenContainer.setAttribute("aria-hidden", "true");
  hiddenContainer.style.cssText = [
    "position: fixed",
    "left: -12000px",
    "top: 0",
    `width: ${CARD_WIDTH}px`,
    `height: ${height}px`,
    "overflow: hidden",
    "pointer-events: none",
    "z-index: -9999",
    "contain: layout paint style",
  ].join(";");
  document.body.appendChild(hiddenContainer);

  const root = createRoot(hiddenContainer);

  try {
    root.render(<PlayerPerformanceCardV1 data={data} template={template} />);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const assetsReady = await waitForCardAssets(hiddenContainer);
    if (!assetsReady) {
      throw new Error("Card assets did not finish loading before export.");
    }

    const card = hiddenContainer.firstElementChild as HTMLElement | null;
    if (!card) return null;

    const canvas = await html2canvas(card, {
      scale: 1,
      useCORS: true,
      allowTaint: false,
      backgroundColor: "#090a0c",
      width: CARD_WIDTH,
      height,
      windowWidth: CARD_WIDTH,
      windowHeight: height,
      scrollX: 0,
      scrollY: 0,
      logging: false,
    });

    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/png");
    });
  } finally {
    root.unmount();
    hiddenContainer.remove();
  }
}