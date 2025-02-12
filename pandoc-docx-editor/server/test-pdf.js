const puppeteer = require("puppeteer");
const fs = require("fs");

(async () => {
    const testHtml = `<html><body><h1>Hello, PDF!</h1></body></html>`;
    const browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const page = await browser.newPage();
    await page.setContent(testHtml, { waitUntil: "domcontentloaded" });

    const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });

    await browser.close();

    fs.writeFileSync("test.pdf", pdfBuffer);
    console.log("✅ PDF saved as test.pdf");
})();
