import puppeteer from 'puppeteer';
import {performance} from 'perf_hooks';
import {htmlTemplate} from './html-template';
import {CaptureScreenShotOptions} from './types/CaptureScreenshotOptions';
import {logError} from './log-error';

const timeDelta = (start, end) => {
  return ((end - start) / 1000).toPrecision(3);
};


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
    '--enable-unsafe-swiftshader',
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

  const captureOptions = {
    quality: quality * 100.0,
    type: formatExtension as 'jpeg' | 'png' | 'webp',
    path: outputPath as `${string}.jpeg` | `${string}.png` | `${string}.webp`,
    omitBackground: true,
  };

  if (formatExtension === 'png') {
    delete captureOptions.quality;
  }

  // for every set of modelViewer args render and screenshot
  let index: number = 0;
  for (const mvArgs of modelViewerArgs || [{}]) {
    // the initial page load is done with model viewer attribute set 0
    // for all subsequent screenshots update the attributes
    if (index > 0) {
      const updateArgsT0 = performance.now();

      await page.evaluate(async (oldArgs: {}, newArgs: {}) => {
        const modelViewer = document.getElementById('snapshot-viewer');
        // unset the old attributes
        // CLI specified attributes are not allowed to overlap
        // the required ones set up in the generated html.
        // this is validated in html-template.ts.
        // this means the following pair of operations is safe.
        for (let key in oldArgs) {
          // out with the old
          modelViewer.removeAttribute(key);
        }
        // apply the new ones
        for (let key in newArgs) {
          // in with the new
          modelViewer.setAttribute(key, newArgs[key]);
        }
      }, modelViewerArgs[index - 1], mvArgs);

      const updateArgsT1 = performance.now();

      console.log(
        `🖌  update viewer args (${timeDelta(updateArgsT0, updateArgsT1)}s)`,
      );
    }

    // when there will be multiple screenshots apply a serial
    // naming convention to the output path
    if (modelViewerArgs.length > 1) {
      let index_str = String(index).padStart(2,'0')
      // there has to be a cleaner way to do this.
      let serialOutputPath = outputPath.replace(/\.png$/, `_${index_str}.png`);
      serialOutputPath = serialOutputPath.replace(/\.jpeg$/, `_${index_str}.jpeg`);
      serialOutputPath = serialOutputPath.replace(/\.webp$/, `_${index_str}.webp`);
      captureOptions.path = serialOutputPath as `${string}.jpeg` | `${string}.png` | `${string}.webp`
    }

    const screenshotT0 = performance.now();

    await page.screenshot(captureOptions);

    const screenshotT1 = performance.now();

    console.log(
      `🖼  Captured ${captureOptions.path} (${timeDelta(screenshotT0, screenshotT1)}s)`,
    );

    index += 1;
  }

  await browser.close();
}
