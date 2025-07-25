/**
 * Pollinations.AI and Gemini API POST request logic
 */

import 'dotenv/config';
import { AnalysisApiResponse } from '../types/index.js';
import { parseAnalysisResponse } from '../utils/index.js';
import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

export async function postToPollinationsApi(
  baseUrl: string,
  systemPrompt: string,
  userPrompt: string
): Promise<AnalysisApiResponse> {
  const payload = {
    model: "openai-fast",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    temperature: 0.5,
    stream: false,
    private: false,
    response_format: { type: "json_object" }
  };

  const response = await fetch(`${baseUrl}/openai`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`POST request failed with status ${response.status}`);
  }

  const responseJson = await response.json();
  console.log("Pollinations.ai response received:", responseJson);

  // Extract content from OpenAI-compatible response
  const content = responseJson?.choices?.[0]?.message?.content ?? "";
  return parseAnalysisResponse(content);
}

export async function callGeminiApi(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string
): Promise<AnalysisApiResponse> {
  const ai = new GoogleGenAI({ apiKey });

  const groundingTool = {
    googleSearch: {},
  };

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      { role: "system", parts: [{ text: systemPrompt }] },
      { role: "user", parts: [{ text: userPrompt }] }
    ],
    config: {
      tools: [groundingTool],
      thinkingConfig: {
        thinkingBudget: 0, // Disables thinking
      },
      temperature: 0.5
    }
  });

  console.log("Gemini response received:", response);

  // The SDK returns response.text
  const content = response.text ?? "";
  return parseAnalysisResponse(content);
}
