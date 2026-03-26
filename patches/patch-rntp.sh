#!/bin/bash
# Patch react-native-track-player for China build environment
RNTP="node_modules/react-native-track-player/android/build.gradle"

if [ ! -f "$RNTP" ]; then
  echo "RNTP not found, skipping patch"
  exit 0
fi

# Replace maven repos with Aliyun mirrors
sed -i '' "s|mavenCentral()|maven { url 'https://maven.aliyun.com/repository/central' }|g" "$RNTP"
sed -i '' "s|google()|maven { url 'https://maven.aliyun.com/repository/google' }|g" "$RNTP"

# Add JitPack after the RN local maven block (for kotlinaudio)
grep -q "jitpack" "$RNTP" || sed -i '' "/url '\.\.\/node_modules\/react-native\/android'/a\\
\\    maven { url 'https://jitpack.io' }
" "$RNTP"

echo "✅ RNTP China mirror patch applied"
