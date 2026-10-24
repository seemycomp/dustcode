# Dustcode

Dustcode는 **VS Code** 전용 오픈 소스 AI 코딩 에이전트입니다. 이 포크는 확장과 내장 백엔드만 유지하며 독립 CLI, JetBrains 플러그인 또는 클라우드 제품을 배포하지 않습니다.

## 설치

1. 저장소 루트에서 `bun run build:vscode`를 실행하거나, 이 저장소 GitHub Actions의 성공한 **VS Code** 실행에서 플랫폼에 맞는 아티팩트를 다운로드합니다.
2. 필요하면 압축을 푼 뒤 VS Code에서 **Extensions: Install from VSIX...**를 실행하여 `dustcode-<target>.vsix`를 선택합니다.
3. Dustcode를 열고 모델 제공자를 별도로 설정합니다.

확장 ID는 `dustcode.dustcode`이며 설정은 `dustcode.*`, 프로젝트 상태는 `.dustcode/`를 사용합니다. Kilo Code의 인증 정보나 세션을 가져오지 않습니다. 자동 배포나 확인된 Dustcode Marketplace 페이지는 구성되어 있지 않습니다.

설정과 개발의 기준 문서는 [루트 README](../README.md)입니다. VSIX 빌드와 CI 아티팩트는 [RELEASING.md](../RELEASING.md)를 참조하세요.

## 출처와 라이선스

Dustcode는 [Kilo Code](https://github.com/Kilo-Org/kilocode)의 포크이며, 백엔드는 [OpenCode](https://github.com/anomalyco/opencode)에서 유래합니다.

MIT. 저작자 표시와 라이선스 고지를 유지하는 한, 상업적 사용을 포함해 이 코드를 사용, 수정, 배포할 수 있습니다. [License](../LICENSE)를 참조하세요. 타사 구성 요소의 저작권과 라이선스 고지도 유지해야 합니다.
