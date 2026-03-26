const fs = require('fs');
const path = require('path');

const SOURCE_DIR = '/Users/litao.2025/Downloads/nianfoji-v20260309-v1/public/assets/audio';
const TARGET_DIR = path.join(__dirname, '../src/assets/audio');

console.log('开始复制音频文件...');

// 创建目标目录
if (!fs.existsSync(TARGET_DIR)) {
  fs.mkdirSync(TARGET_DIR, { recursive: true });
  console.log(`✓ 创建目录: ${TARGET_DIR}`);
}

// 复制音频文件
try {
  const files = fs.readdirSync(SOURCE_DIR);
  let copiedCount = 0;

  files.forEach(file => {
    if (file.endsWith('.mp3') || file.endsWith('.m4a') || file.endsWith('.wav')) {
      const sourcePath = path.join(SOURCE_DIR, file);
      const targetPath = path.join(TARGET_DIR, file);
      fs.copyFileSync(sourcePath, targetPath);
      copiedCount++;
      console.log(`✓ 复制: ${file}`);
    }
  });

  console.log(`\n✅ 成功复制 ${copiedCount} 个音频文件到 ${TARGET_DIR}`);
} catch (error) {
  console.error('❌ 复制失败:', error.message);
  console.error('请确保源目录存在:', SOURCE_DIR);
  process.exit(1);
}