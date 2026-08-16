# Voice Command Smart Improvements Design

## 1. Overview
The goal is to improve the "Voice Command" (SIMOSDA) feature by making it smarter and more robust. Currently, the AI sometimes fails to parse commands due to malformed JSON, and its capabilities are limited to basic navigation and theme changes.

We will implement **Event-Driven Frontend Forms** to allow the AI to perform complex actions like filling out forms for user review, and we will fortify the JSON parsing logic to prevent crashes.

## 2. Architecture & Data Flow

### A. Robust AI Parsing (`apiService.ts`)
- The `askAIVoice` function will be updated to handle malformed JSON more gracefully.
- We will use regex to aggressively extract JSON blocks even if the LLM includes conversational filler text.
- Fallback mechanisms will be put in place: if parsing fails completely, the AI will gracefully fallback to a speech-only response notifying the user.

### B. Event-Driven Actions (`VoiceControl.tsx`)
- The AI will return standardized JSON payloads:
  ```json
  {
    "action": "FILL_FORM",
    "target": "vehicle_form",
    "payload": { "nama": "Avanza", "plat": "B 1234 CD" },
    "speech": "Saya telah menyiapkan form untuk Avanza, silakan periksa."
  }
  ```
- `VoiceControl.tsx` will dispatch these as CustomEvents, e.g., `window.dispatchEvent(new CustomEvent('ai-action', { detail: answer }))`.

### C. Page-Level Listeners
- Pages with complex forms will listen to the `ai-action` event.
- If the event target matches the page's form, it will automatically open the modal and populate the state with the provided payload, allowing the user to review the data before submitting.

## 3. Error Handling
- If the AI fails to parse the intent, it will gracefully ask the user to clarify instead of triggering a generic error state.
- If the frontend fails to execute an AI command, a toast notification will clearly explain why.

## 4. Scope and Integration
- This design limits the initial implementation to the parsing fix, the event dispatching mechanism in VoiceControl, and integrating a listener into at least one primary page (e.g., `PemeliharaanKendaraan.tsx`) as a proof-of-concept for the new smart capabilities.
