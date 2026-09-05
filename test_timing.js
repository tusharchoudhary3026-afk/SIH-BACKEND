import sharp from 'sharp';
import { runLocalForensics } from './backend/forensics/ensemble.js';

async function main() {
  const testBuffer = await sharp({
    create: {
      width: 1536,
      height: 1536,
      channels: 3,
      background: { r: 120, g: 140, b: 200 }
    }
  }).jpeg({ quality: 85 }).toBuffer();
  
  console.log('Running forensics...');
  await runLocalForensics(testBuffer, 'image/jpeg');
  console.log('Done.');
}
main();
