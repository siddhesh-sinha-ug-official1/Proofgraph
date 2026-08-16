/// <reference types="vite/client" />

declare module "*?raw" {
  const src: string;
  export default src;
}

declare module "*?worker" {
  const WorkerFactory: new () => Worker;
  export default WorkerFactory;
}

/** vite define: absolute path of acceptance/fixtures/moatpkg (dev machine local). */
declare const __MOAT_ABS_DIR__: string | undefined;
