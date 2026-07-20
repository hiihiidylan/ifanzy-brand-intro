const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { PDFDocument } = require('pdf-lib');

const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const htmlFile = 'iFanzy_Brand_Intro_Mobile_4x3.html';
const outputDir = path.join(__dirname, 'output', 'pdf');
const preview = {
  viewportWidth: 1155,
  viewportHeight: 819,
  slideWidth: 1092,
  slideHeight: 819,
  pdfWidth: 1600,
  pdfHeight: 1200,
  deviceScaleFactor: 2,
};

async function generatePDF(language, outputName) {
  console.log(`Generating ${outputName}...`);

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({
      width: preview.viewportWidth,
      height: preview.viewportHeight,
      deviceScaleFactor: preview.deviceScaleFactor,
    });

    const htmlPath = path.join(__dirname, htmlFile);
    await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });

    await page.evaluate((lang) => {
      document.body.style.width = 'calc(100% - 15px)';
      document.body.setAttribute('data-lang', lang);

      const languageSwitcher = document.querySelector('.lang-switcher');
      if (languageSwitcher) languageSwitcher.style.display = 'none';
    }, language);

    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    await new Promise((resolve) => setTimeout(resolve, 500));

    const slideCount = await page.evaluate(() => document.querySelectorAll('.slide').length);
    console.log(`Found ${slideCount} slides`);

    const screenshots = [];
    for (let index = 0; index < slideCount; index += 1) {
      await page.evaluate((slideIndex) => {
        const slides = document.querySelectorAll('.slide');
        slides.forEach((slide) => {
          slide.style.scrollSnapAlign = 'none';
        });
        window.scrollTo({
          top: slides[slideIndex].offsetTop,
          left: 0,
          behavior: 'instant',
        });
      }, index);

      await new Promise((resolve) => setTimeout(resolve, 250));

      const frame = await page.evaluate((slideIndex) => {
        const rect = document.querySelectorAll('.slide')[slideIndex].getBoundingClientRect();
        return {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          scrollX: window.scrollX,
          scrollY: window.scrollY,
        };
      }, index);

      const frameMatchesPreview =
        Math.abs(frame.top) < 0.5 &&
        Math.abs(frame.width - preview.slideWidth) < 0.5 &&
        Math.abs(frame.height - preview.slideHeight) < 0.5 &&
        Math.abs(frame.viewportWidth - preview.viewportWidth) < 0.5 &&
        Math.abs(frame.viewportHeight - preview.viewportHeight) < 0.5;

      if (!frameMatchesPreview) {
        throw new Error(`Slide ${index + 1} does not match the 4:3 preview: ${JSON.stringify(frame)}`);
      }

      screenshots.push(await page.screenshot({
        type: 'png',
        clip: {
          x: frame.scrollX + frame.left,
          y: frame.scrollY + frame.top,
          width: frame.width,
          height: frame.height,
        },
      }));
      console.log(`Captured slide ${index + 1}/${slideCount}`);
    }

    const pdf = await PDFDocument.create();
    for (const screenshot of screenshots) {
      const image = await pdf.embedPng(screenshot);
      const pdfPage = pdf.addPage([preview.pdfWidth, preview.pdfHeight]);
      pdfPage.drawImage(image, {
        x: 0,
        y: 0,
        width: preview.pdfWidth,
        height: preview.pdfHeight,
      });
    }

    fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, outputName);
    fs.writeFileSync(outputPath, await pdf.save());
    console.log(`PDF generated: ${outputPath}`);
  } finally {
    await browser.close();
  }
}

(async () => {
  try {
    await generatePDF('zh', 'ifanzy_brand_intro_4x3_tc.pdf');
    await generatePDF('en', 'ifanzy_brand_intro_4x3_en.pdf');
    console.log('All 4:3 PDFs generated successfully.');
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
})();
