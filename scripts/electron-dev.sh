#!/bin/bash
# Launch a dev copy of Electron with its own bundle id so YOINK shows up as "YOINK"
# (and is distinguishable from other Electron apps on the machine).
set -e
cd "$(dirname "$0")/.."
SRC=node_modules/electron/dist/Electron.app
APP=.dev/YOINK.app
VER=$(node -p "require('./node_modules/electron/package.json').version")
if [ ! -f "$APP/Contents/MacOS/Electron" ] || [ "$(cat .dev/version 2>/dev/null)" != "$VER" ]; then
  rm -rf .dev && mkdir -p .dev
  cp -R "$SRC" "$APP"
  PL="$APP/Contents/Info.plist"
  /usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier com.yoink.app" "$PL"
  /usr/libexec/PlistBuddy -c "Set :CFBundleName YOINK" "$PL"
  cp build/icon.icns "$APP/Contents/Resources/electron.icns"
  /usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName YOINK" "$PL" 2>/dev/null || /usr/libexec/PlistBuddy -c "Add :CFBundleDisplayName string YOINK" "$PL"
  codesign --force --deep -s - "$APP" >/dev/null 2>&1 || true
  echo "$VER" > .dev/version
fi
exec "$APP/Contents/MacOS/Electron" .
