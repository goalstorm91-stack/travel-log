# 여행 기록 (Travel Journal)

사진, 글, 지출까지 담는 나만의 여행 일지. 기록은 **내 기기(브라우저)에만** 저장되고, 서버는 없어요.
React 19 + Vite + TypeScript + Tailwind v4, 저장소는 Dexie(IndexedDB), 설치형 웹앱(PWA)이에요.

```bash
npm install
npm run dev       # 개발 서버 (http://localhost:5173)
npm run build     # 타입 검사 + 배포용 빌드
npm run lint      # oxlint
```

## 배포 설정 (한 곳에서 관리)

배포마다 달라지는 값은 모두 [`.env`](.env) 한 파일에 있어요. 비밀 값이 아니라 공개되어도 되는 값들이에요.

| 변수 | 의미 |
| --- | --- |
| `VITE_APP_URL` | 앱이 열리는 주소 (`https://`부터, 끝에 `/` 없이). 링크 미리보기 이미지와 공유 메시지 속 링크에 쓰여요. |
| `VITE_KAKAO_JS_KEY` | 카카오 개발자 사이트의 **JavaScript 키**. 비워 두면 "카카오톡으로 카드 보내기" 버튼이 숨겨져요. |

Vercel 대시보드의 *Settings → Environment Variables* 에 같은 이름으로 넣으면 `.env`보다 우선해요.

### 앱 주소(도메인)를 바꿨을 때

1. `.env`의 `VITE_APP_URL`을 새 주소로 바꾸고 커밋·push 해요.
2. [카카오 개발자 사이트](https://developers.kakao.com) → 내 애플리케이션 →
   - **플랫폼 키 → JavaScript 키 → JavaScript SDK 도메인**에 새 주소를 추가해요. (카드 보내기가 동작하는 데 꼭 필요해요)
   - **앱 → 제품 링크 관리 → 웹 도메인**에도 새 주소를 추가해요. (카드의 "앱 열어보기" 버튼이 이동할 주소)
3. 이전 주소는 지워도 돼요. 홈 화면에 추가해 둔 앱은 새 주소로 다시 추가해야 하고,
   기록은 주소별로 따로 저장되니 **바꾸기 전에 설정 → 전체 백업하기**로 백업한 뒤, 새 주소에서 복원하세요.

## 구조 메모

- `src/db.ts` — IndexedDB 테이블 (trips, days, photos, expenses, thumbs)
- `src/utils/backup.ts` — 백업(.zip, 사진은 파일로) / 복원, `backupStatus.ts` — 마지막 백업 기록
- `src/utils/thumbs.ts` — 사진 썸네일(처음 작게 보일 때 만들어 저장, 백업에는 미포함)
- 화면은 `src/pages`, 홈만 첫 번들에 들어 있고 나머지는 필요할 때 불러와요(`src/App.tsx`).
- 지도는 MapLibre + OpenFreeMap, 도시 데이터는 SimpleMaps World Cities(CC BY 4.0). 자세한 고지는 앱 안의 *이용 안내 · 고지*.
