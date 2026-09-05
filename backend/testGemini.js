import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const apiKey = process.env.GEMINI_API_KEY;
const modelName = process.env.GEMINI_MODEL;

async function testModel() {
  if (!apiKey) {
    console.error('No API key found in .env');
    process.exit(1);
  }

  console.log(`Testing Gemini model: ${modelName}`);
  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: 'Say hi',
      config: {
        maxOutputTokens: 10,
      }
    });
    console.log('Success! Response from model:');
    console.log(response.text);
  } catch (err) {
    console.error('Error occurred while calling model:');
    console.error(err);
    process.exit(1);
  }
}

testModel();
