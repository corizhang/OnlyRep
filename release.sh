#!/usr/bin/env bash
# 推送 + 发版一条龙（代理/网络就绪后执行）：
#   bash release.sh            # 推送 main + v0.2.0 标签
#   GH_TOKEN=xxx bash release.sh --release   # 额外创建 GitHub Release 并上传产物
set -e
cd "$(dirname "$0")"

git push -u origin main
git push origin v0.2.0
echo "✅ 代码与标签已推送"

if [ "$1" = "--release" ]; then
  if [ -z "$GH_TOKEN" ]; then
    echo "❌ 需要 GH_TOKEN（GitHub Personal Access Token，repo 权限）"
    exit 1
  fi
  REPO="corizhang/OnlyRep"
  echo "创建 Release v0.2.0..."
  RESP=$(curl -s -X POST "https://api.github.com/repos/$REPO/releases" \
    -H "Authorization: Bearer $GH_TOKEN" \
    -H "Accept: application/vnd.github+json" \
    -d "$(python -c "import json;print(json.dumps({'tag_name':'v0.2.0','name':'RankBoard v0.2.0','body':open('RELEASE-NOTES-v0.2.0.md',encoding='utf-8').read()}))")")
  UPLOAD=$(echo "$RESP" | python -c "import json,sys;d=json.load(sys.stdin);print(d.get('upload_url','').split('{')[0])")
  if [ -z "$UPLOAD" ]; then echo "❌ Release 创建失败：$RESP"; exit 1; fi

  upload() {
    local file="$1" name="$2"
    echo "上传 $name ..."
    curl -s -X POST "$UPLOAD?name=$name" \
      -H "Authorization: Bearer $GH_TOKEN" \
      -H "Content-Type: application/octet-stream" \
      --data-binary @"$file" -o /dev/null -w "%{http_code}\n"
  }
  upload "src-tauri/target/release/bundle/nsis/RankBoard_0.2.0_x64-setup.exe" "RankBoard_0.2.0_x64-setup.exe"
  upload "src-tauri/target/release/bundle/msi/RankBoard_0.2.0_x64_en-US.msi" "RankBoard_0.2.0_x64_en-US.msi"
  upload "src-tauri/target/release/rankboard.exe" "rankboard.exe"
  upload "dist/index.html" "RankBoard-单文件网页版.html"
  echo "✅ Release v0.2.0 发布完成：https://github.com/$REPO/releases/tag/v0.2.0"
fi
