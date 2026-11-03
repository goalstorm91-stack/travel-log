/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public address of the deployed app, e.g. https://example.vercel.app (no trailing slash). */
  readonly VITE_APP_URL?: string;
  /** Kakao Developers JavaScript key; empty disables Kakao card sharing. */
  readonly VITE_KAKAO_JS_KEY?: string;
}
