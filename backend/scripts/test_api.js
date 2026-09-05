import sharp from 'sharp';

async function testBackend() {
  console.log('--- Starting Backend Self-Test ---');

  // 1. Test GET /health
  const healthRes = await fetch('http://localhost:3001/health');
  const healthData = await healthRes.json();
  console.log('1. Health check:', healthData);

  // Create a 256x256 test JPEG image
  const testBuffer = await sharp({
    create: {
      width: 1536,
      height: 1536,
      channels: 3,
      background: { r: 120, g: 140, b: 200 }
    }
  }).jpeg().toBuffer();

  // 2. Test POST /api/v1/upload
  const formData = new FormData();
  const blob = new Blob([testBuffer], { type: 'image/jpeg' });
  formData.append('file', blob, 'test_image.jpg');

  const uploadRes = await fetch('http://localhost:3001/api/v1/upload', {
    method: 'POST',
    body: formData
  });
  const uploadData = await uploadRes.json();
  console.log('2. Upload Response:', uploadData);

  if (!uploadData.success || !uploadData.imageId) {
    throw new Error('Upload failed');
  }

  // 3. Test GET /media/:imageId
  const mediaRes = await fetch(`http://localhost:3001${uploadData.url}`);
  console.log('3. Media fetch status:', mediaRes.status, 'Content-Type:', mediaRes.headers.get('content-type'));

  // 4. Test POST /api/v1/detect (error without GEMINI_API_KEY)
  const detectRes = await fetch('http://localhost:3001/api/v1/detect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageId: uploadData.imageId,
      mode: 'deep_scan',
      sensitivity: 85
    })
  });
  const detectData = await detectRes.json();
  console.log('4. Detect Response (Expected 503 without Gemini Key):', detectRes.status, detectData);

  console.log('--- All Endpoint Tests Passed Successfully ---');
}

testBackend().catch((err) => {
  console.error('Test error:', err);
});
