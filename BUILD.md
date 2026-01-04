 빌드 방법:
  set TAURI_SIGNING_PRIVATE_KEY_PASSWORD=<비밀번호>
  pnpm tauri build

  빌드 후 src-tauri/target/release/bundle/nsis/ 폴더에 .sig 파일이 생성되면, 그 내용을
  latest.json의 signature 필드에 넣고 Wasabi에 업로드하면 업데이트가 작동합니다.