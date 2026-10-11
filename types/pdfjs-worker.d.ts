declare module "pdfjs-dist/legacy/build/pdf.worker.mjs" {
  export const WorkerMessageHandler: NonNullable<typeof globalThis.pdfjsWorker>["WorkerMessageHandler"];
}
