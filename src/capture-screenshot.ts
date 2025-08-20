import puppeteer from 'puppeteer';
import {performance} from 'perf_hooks';
import {htmlTemplate} from './html-template';
import {CaptureScreenShotOptions} from './types/CaptureScreenshotOptions';
import {logError} from './log-error';

const timeDelta = (start, end) => {
  return ((end - start) / 1000).toPrecision(3);
};

function getAllAttributes(element: HTMLElement) {
  let attrs = {};
  Object.values(element.attributes).forEach((attribute: Attr) => {
    attrs[attribute.name] = attribute.value;
  });
  return attrs;
}

function assignAttributes(element: HTMLElement, values: {}) {
  for (let key in values) {
    element.setAttribute(key, values[key]);
  }
}

function removeAllAttributes(element: HTMLElement): void {
  Object.values(element.attributes).forEach((attribute: Attr) => {
    element.removeAttribute(attribute.name);
  });
}

export async function captureScreenshots(options: CaptureScreenShotOptions) {
  const browserT0 = performance.now();
  const {
    modelViewerUrl,
    width,
    height,
    outputPath,
    debug,
    quality,
    timeout,
    devicePixelRatio,
    formatExtension,
    modelViewerArgs,
  } = options;
  const screenshotTimeoutInSec = timeout / 1000;

  const headless = !debug;
  const args = [
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-setuid-sandbox',
    '--no-zygote',
  ];

  if (headless) {
    args.push('--single-process');
  } else {
    args.push('--start-maximized');
  }

  const browser = await puppeteer.launch({
    args,
    defaultViewport: {
      width,
      height,
      deviceScaleFactor: devicePixelRatio,
    },
    headless,
  });

  const page = await browser.newPage();

  page.on('error', (error) => {
    console.log(`🚨  Page Error: ${error}`);
  });

  page.on('console', async (message) => {
    const args = await Promise.all(
      message.args().map((arg) => arg.jsonValue()),
    );

    if (args.length) {
      console.log(`➡️`, ...args);
    }
  });

  const browserT1 = performance.now();

  console.log(`🚀  Launched browser (${timeDelta(browserT0, browserT1)}s)`);

  const contentT0 = performance.now();

  const data = htmlTemplate({...options, modelViewerUrl});
  await page.setContent(data, {
    waitUntil: ['domcontentloaded', 'networkidle0'],
  });

  const contentT1 = performance.now();

  console.log(
    `🗺  Loading template to DOMContentLoaded (${timeDelta(
      contentT0,
      contentT1,
    )}s)`,
  );

  const renderT0 = performance.now();

  const evaluateError = await page.evaluate(async (maxTimeInSec) => {
    const modelBecomesReady = new Promise<void>((resolve, reject) => {
      let timeout;
      if (maxTimeInSec > 0) {
        timeout = setTimeout(() => {
          reject(
            new Error(
              `Stop capturing screenshot after ${maxTimeInSec} seconds`,
            ),
          );
        }, maxTimeInSec * 1000);
      }

      const modelViewer = document.getElementById('snapshot-viewer');
      modelViewer.addEventListener(
        'poster-dismissed',
        () => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                if (maxTimeInSec > 0) {
                  clearTimeout(timeout);
                }
                resolve();
              });
            });
          });
        },
        {once: true},
      );
    });

    try {
      await modelBecomesReady;
      return null;
    } catch (error) {
      return error.message;
    }
  }, screenshotTimeoutInSec);

  const renderT1 = performance.now();
  console.log(
    `🖌  Rendering screenshots of model (${timeDelta(renderT0, renderT1)}s)`,
  );

  if (evaluateError) {
    logError(`Evaluate error: ${evaluateError}`);
    await browser.close();
    return;
  }

  const modelViewer = document.getElementById('snapshot-viewer');
  const origAttrs = getAllAttributes(modelViewer);

  const captureOptions = {
    quality: quality * 100.0,
    type: formatExtension as 'jpeg' | 'png' | 'webp',
    path: outputPath as `${string}.jpeg` | `${string}.png` | `${string}.webp`,
    omitBackground: true,
  };

  if (formatExtension === 'png') {
    delete captureOptions.quality;
  }

  let index: number = 0;
  for (const mvArgs of modelViewerArgs || [{}]) {
    const screenshotT0 = performance.now();

    removeAllAttributes(modelViewer);
    assignAttributes(modelViewer, origAttrs);
    assignAttributes(modelViewer, mvArgs);

    if (mvArgs.length > 1) {
      let serialOutputPath : string = `${index}_${outputPath}`
      captureOptions.path = serialOutputPath as `${string}.jpeg` | `${string}.png` | `${string}.webp`
    }

    await page.screenshot(captureOptions);

    const screenshotT1 = performance.now();

    console.log(
      `🖼  Captured screenshot (${timeDelta(screenshotT0, screenshotT1)}s)`,
    );
    index += 1;
  }

  await browser.close();
}
