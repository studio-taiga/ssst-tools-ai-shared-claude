"use client";

export async function extractTextFromPdf(file: File): Promise<{
  text: string;
  pageCount: number;
}> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) });
  const pdf = await loadingTask.promise;

  const pageTexts: string[] = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const strings: string[] = [];
    for (const item of content.items) {
      if ("str" in item && typeof item.str === "string") {
        strings.push(item.str);
        if ("hasEOL" in item && item.hasEOL) {
          strings.push("\n");
        } else {
          strings.push(" ");
        }
      }
    }
    const pageBody = strings.join("").replace(/[ \t]+\n/g, "\n").trim();
    if (pageBody) {
      pageTexts.push(`--- Page ${pageNum} ---\n${pageBody}`);
    }
  }

  const fullText = pageTexts.join("\n\n").trim();
  if (!fullText) {
    throw new Error(
      `「${file.name}」からテキストを抽出できませんでした（スキャン画像のみの PDF の可能性があります）。`
    );
  }

  return {
    text: fullText,
    pageCount: pdf.numPages,
  };
}
