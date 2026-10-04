const SHORT_LABELS: Record<string, string> = {
  "application/pdf": "PDF",
  "text/plain": "TXT",
  "text/csv": "CSV",
  "application/json": "JSON",
  "text/html": "HTML",
  "text/markdown": "MD",
  "application/xml": "XML",
  "text/xml": "XML",
  "image/png": "PNG",
  "image/jpeg": "JPEG",
  "application/zip": "ZIP",
  "text/x-python": "PY",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
};

/** 把 content_type 转成一个简短好读的"类型"标签，没有对应映射就退回扩展名或原始 MIME。 */
export function fileTypeLabel(contentType: string, filename?: string, t: (s: string) => string = (s) => s): string {
  if (SHORT_LABELS[contentType]) return SHORT_LABELS[contentType];
  if (filename) {
    const ext = filename.split(".").pop();
    if (ext && ext !== filename) return ext.toUpperCase();
  }
  if (contentType === "application/octet-stream" || !contentType) return t("Binary file");
  return contentType;
}
