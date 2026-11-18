/**
 * Voice capabilities for threads:
 * 1. Voice Dictation (Speech-to-Text): Speak naturally to dictate text straight into the prompt.
 * 2. Voice Read Aloud (Text-to-Speech / TTS): Listen to agent responses with natural audio output.
 */

import { useEffect, useRef, useState, useCallback } from "react";

// Web Speech API interface declarations for TypeScript
interface IWindowSpeech extends Window {
  SpeechRecognition?: any;
  webkitSpeechRecognition?: any;
}

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === "undefined") return false;
  const win = window as unknown as IWindowSpeech;
  return Boolean(win.SpeechRecognition || win.webkitSpeechRecognition);
}

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/**
 * Strips code blocks, thoughts, and dense markdown symbols from text
 * so that Text-to-Speech reads out clean, natural, intelligible prose.
 */
export function cleanMarkdownForTTS(text: string): string {
  if (!text) return "";
  let cleaned = text;

  // Remove <think>...</think> blocks
  cleaned = cleaned.replace(/<think(?:ing)?>[\s\S]*?(?:<\/think(?:ing)?>|$)/gi, "");

  // Remove code blocks
  cleaned = cleaned.replace(/```[\s\S]*?```/g, " [code snippet] ");

  // Remove inline code
  cleaned = cleaned.replace(/`([^`]+)`/g, "$1");

  // Remove markdown images
  cleaned = cleaned.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");

  // Convert markdown links [title](url) -> title
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

  // Remove markdown headers, bullets, blockquotes
  cleaned = cleaned.replace(/^[#>*+-]\s+/gm, "");

  // Remove bold/italics markers
  cleaned = cleaned.replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, "$1");

  // Remove markdown horizontal rules
  cleaned = cleaned.replace(/^-{3,}$/gm, "");

  // Normalize excessive spaces and linebreaks
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  return cleaned;
}

export interface UseVoiceDictationOptions {
  onTranscript?: (transcript: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
}

export function useVoiceDictation({ onTranscript, onError }: UseVoiceDictationOptions = {}) {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const isSupported = isSpeechRecognitionSupported();

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        /* already stopped */
      }
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  const startListening = useCallback(() => {
    setError(null);
    if (!isSupported) {
      const msg = "Speech recognition is not supported in this browser.";
      setError(msg);
      onErrorRef.current?.(msg);
      return;
    }

    try {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }

      const win = window as unknown as IWindowSpeech;
      const SpeechRecognitionClass = win.SpeechRecognition || win.webkitSpeechRecognition;
      const recognition = new SpeechRecognitionClass();

      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = typeof navigator !== "undefined" ? navigator.language || "en-US" : "en-US";

      recognition.onstart = () => {
        setIsListening(true);
        setError(null);
      };

      recognition.onresult = (event: any) => {
        let interimTranscript = "";
        let finalTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcriptChunk = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcriptChunk;
          } else {
            interimTranscript += transcriptChunk;
          }
        }

        const text = finalTranscript || interimTranscript;
        if (text) {
          onTranscriptRef.current?.(text, Boolean(finalTranscript));
        }
      };

      recognition.onerror = (event: any) => {
        // "no-speech" or "aborted" are routine non-fatal events
        if (event.error === "no-speech" || event.error === "aborted") {
          return;
        }
        let msg = "Voice recognition error occurred.";
        if (event.error === "not-allowed") {
          msg = "Microphone access was denied. Please allow microphone permissions.";
        } else if (event.error === "network") {
          msg = "Network error during speech recognition.";
        }
        setError(msg);
        onErrorRef.current?.(msg);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not start voice recognition.";
      setError(msg);
      onErrorRef.current?.(msg);
      setIsListening(false);
    }
  }, [isSupported]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          /* ignore */
        }
        recognitionRef.current = null;
      }
    };
  }, []);

  return {
    isSupported,
    isListening,
    error,
    startListening,
    stopListening,
    toggleListening,
  };
}

export function useTextToSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const isSupported = isSpeechSynthesisSupported();

  const stop = useCallback(() => {
    if (isSupported && typeof window !== "undefined") {
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* ignore */
      }
    }
    setIsSpeaking(false);
    setSpeakingId(null);
  }, [isSupported]);

  const speak = useCallback(
    (id: string, text: string) => {
      if (!isSupported || typeof window === "undefined") return;

      stop();
      const cleaned = cleanMarkdownForTTS(text);
      if (!cleaned) return;

      const utterance = new SpeechSynthesisUtterance(cleaned);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      // Choose natural English voice if available
      try {
        const voices = window.speechSynthesis.getVoices();
        const preferredVoice = voices.find(
          (v) => v.lang.startsWith("en") && (v.name.includes("Natural") || v.name.includes("Samantha") || v.name.includes("Google") || v.name.includes("Daniel"))
        ) || voices.find((v) => v.lang.startsWith("en"));
        if (preferredVoice) utterance.voice = preferredVoice;
      } catch {
        /* voices optional */
      }

      utterance.onstart = () => {
        setIsSpeaking(true);
        setSpeakingId(id);
      };

      utterance.onend = () => {
        setIsSpeaking(false);
        setSpeakingId(null);
      };

      utterance.onerror = () => {
        setIsSpeaking(false);
        setSpeakingId(null);
      };

      window.speechSynthesis.speak(utterance);
    },
    [isSupported, stop]
  );

  const toggleSpeak = useCallback(
    (id: string, text: string) => {
      if (isSpeaking && speakingId === id) {
        stop();
      } else {
        speak(id, text);
      }
    },
    [isSpeaking, speakingId, speak, stop]
  );

  useEffect(() => {
    return () => {
      if (isSupported && typeof window !== "undefined") {
        try {
          window.speechSynthesis.cancel();
        } catch {
          /* ignore */
        }
      }
    };
  }, [isSupported]);

  return {
    isSupported,
    isSpeaking,
    speakingId,
    speak,
    stop,
    toggleSpeak,
  };
}
