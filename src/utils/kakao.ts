// Kakao JavaScript key: a public key by design (it ships in every page that uses the
// SDK). Requests are only accepted from the web domains registered for the app in
// Kakao Developers (앱 > 플랫폼 > Web), so it can't be used from other sites.
const KAKAO_JS_KEY = "804a76627e9bb501d9bd51a4fd444284";
const SDK_URL = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js";

interface KakaoSdk {
  isInitialized(): boolean;
  init(key: string): void;
  Share: {
    uploadImage(opts: { file: File[] }): Promise<{ infos: { original: { url: string } } }>;
    sendDefault(opts: Record<string, unknown>): void;
  };
}

declare global {
  interface Window {
    Kakao?: KakaoSdk;
  }
}

let loading: Promise<KakaoSdk> | null = null;

/** Loads the Kakao SDK on first use, so it costs nothing until someone shares. */
function loadKakao(): Promise<KakaoSdk> {
  if (loading) return loading;
  loading = new Promise<KakaoSdk>((resolve, reject) => {
    const ready = () => {
      const k = window.Kakao;
      if (!k) return reject(new Error("sdk"));
      if (!k.isInitialized()) k.init(KAKAO_JS_KEY);
      resolve(k);
    };
    if (window.Kakao) return ready();
    const s = document.createElement("script");
    s.src = SDK_URL;
    s.async = true;
    s.onload = ready;
    s.onerror = () => reject(new Error("sdk"));
    document.head.appendChild(s);
  }).catch((err) => {
    loading = null; // allow a retry, e.g. after coming back online
    throw err;
  });
  return loading;
}

/**
 * Sends a feed-style card to KakaoTalk. The card image is uploaded to Kakao's own
 * image server (nothing of ours is hosted), and the "open" button goes to the app.
 */
export async function sendKakaoCard(opts: {
  title: string;
  description: string;
  image: Blob;
}): Promise<void> {
  const kakao = await loadKakao();
  const file = new File([opts.image], "trip.jpg", { type: "image/jpeg" });
  const uploaded = await kakao.Share.uploadImage({ file: [file] });
  const imageUrl = uploaded.infos.original.url;
  const link = { mobileWebUrl: location.origin, webUrl: location.origin };
  kakao.Share.sendDefault({
    objectType: "feed",
    content: { title: opts.title, description: opts.description, imageUrl, link },
    buttons: [{ title: "앱 열어보기", link }],
  });
}
