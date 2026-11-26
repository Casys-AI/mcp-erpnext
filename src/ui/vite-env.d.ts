/// <reference types="vite/client" />

declare module "*.svg?url" {
  const src: string;
  export default src;
}

declare const __ERP_DECLARED_HOST__: boolean;
