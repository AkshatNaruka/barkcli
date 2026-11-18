/**
 * Voice capabilities for threads:
 * 1. Voice Dictation (Speech-to-Text): Speak naturally to dictate text straight into the prompt.
 *    Supports both Web Speech API and native macOS on-device transcription via MediaRecorder.
 * 2. Voice Read Aloud (Text-to-Speech / TTS): Kept silent by default to keep the Mac completely silent.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import * as api from "./api";
import { isDesktop } from "./desktop";

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

export function isAudioRecordingSupported(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  return Boolean(
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function" &&
    typeof MediaRecorder !== "undefined"
  );
}

export function isVoiceDictationSupported(): boolean {
  return isDesktop() || isSpeechRecognitionSupported() || isAudioRecordingSupported();
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
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backendSupported, setBackendSupported] = useState<boolean>(true);

  const activeModeRef = useRef<"backend" | "webspeech" | "mediarecorder" | null>(null);
  const recognitionRef = useRef<any>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const hasWebSpeech = isSpeechRecognitionSupported();
  const hasMediaRecorder = isAudioRecordingSupported();
  const isSupported = backendSupported || isDesktop() || hasWebSpeech || hasMediaRecorder;

  useEffect(() => {
    let active = true;
    if (typeof api.getVoiceStatus === "function") {
      api.getVoiceStatus()
        .then((status) => {
          if (active && status) {
            setBackendSupported(status.supported);
          }
        })
        .catch(() => {
          if (active && isDesktop()) setBackendSupported(true);
        });
    }
    return () => {
      active = false;
    };
  }, []);

  const cancelListening = useCallback(async () => {
    const mode = activeModeRef.current;
    activeModeRef.current = null;
    setIsListening(false);
    setIsTranscribing(false);

    if (mode === "backend") {
      if (typeof api.cancelVoiceRecording === "function") {
        await api.cancelVoiceRecording();
      }
    } else if (mode === "webspeech") {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          /* ignore */
        }
        recognitionRef.current = null;
      }
    } else if (mode === "mediarecorder") {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          /* ignore */
        }
      }
      if (mediaStreamRef.current) {
        try {
          mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        } catch {
          /* ignore */
        }
        mediaStreamRef.current = null;
      }
    }
  }, []);

  const stopListening = useCallback(async () => {
    const mode = activeModeRef.current;
    activeModeRef.current = null;
    setIsListening(false);

    if (mode === "backend") {
      setIsTranscribing(true);
      try {
        if (typeof api.stopVoiceRecording === "function") {
          const result = await api.stopVoiceRecording();
          if (result && result.text && result.text.trim()) {
            onTranscriptRef.current?.(result.text.trim(), true);
          }
        }
      } catch (err: any) {
        const msg = err?.message || "Voice recording failed.";
        setError(msg);
        onErrorRef.current?.(msg);
      } finally {
        setIsTranscribing(false);
      }
      return;
    }

    if (mode === "webspeech") {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          /* ignore */
        }
        recognitionRef.current = null;
      }
      return;
    }

    if (mode === "mediarecorder") {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          /* ignore */
        }
      }
      if (mediaStreamRef.current) {
        try {
          mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        } catch {
          /* ignore */
        }
        mediaStreamRef.current = null;
      }
    }
  }, []);

  const startListening = useCallback(async () => {
    setError(null);

    // Attempt 1: Backend native on-device speech dictation (ideal for macOS desktop app & local server)
    if ((backendSupported || isDesktop()) && typeof api.startVoiceRecording === "function") {
      try {
        await api.startVoiceRecording();
        activeModeRef.current = "backend";
        setIsListening(true);
        setError(null);
        return;
      } catch (err: any) {
        console.warn("Backend voice recording start failed, trying browser fallbacks", err);
      }
    }

    // Attempt 2: Web Speech API (in Chromium / Edge)
    if (hasWebSpeech) {
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
          activeModeRef.current = "webspeech";
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
          if (event.error === "no-speech" || event.error === "aborted") {
            return;
          }
          let msg = "Voice recognition error occurred.";
          if (event.error === "not-allowed") {
            msg = "Microphone access was denied. Please allow microphone permissions in macOS System Settings.";
          }
          setError(msg);
          onErrorRef.current?.(msg);
          setIsListening(false);
          activeModeRef.current = null;
        };

        recognition.onend = () => {
          setIsListening(false);
          activeModeRef.current = null;
        };

        recognitionRef.current = recognition;
        recognition.start();
        return;
      } catch {
        // Fall back to MediaRecorder
      }
    }

    // Attempt 3: MediaRecorder with on-device native speech transcription
    if (hasMediaRecorder) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            channelCount: 1,
          },
        });

        mediaStreamRef.current = stream;
        audioChunksRef.current = [];

        let mimeType = "audio/webm";
        if (typeof MediaRecorder.isTypeSupported === "function") {
          if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
            mimeType = "audio/webm;codecs=opus";
          } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
            mimeType = "audio/mp4";
          } else if (MediaRecorder.isTypeSupported("audio/ogg")) {
            mimeType = "audio/ogg";
          }
        }

        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        recorder.onstop = async () => {
          setIsListening(false);
          activeModeRef.current = null;
          if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach((track) => track.stop());
            mediaStreamRef.current = null;
          }

          const chunks = audioChunksRef.current;
          audioChunksRef.current = [];

          if (chunks.length === 0) return;

          const recordedBlob = new Blob(chunks, { type: recorder.mimeType || mimeType });
          if (recordedBlob.size < 100) return;

          setIsTranscribing(true);
          try {
            if (typeof api.transcribeVoiceAudio === "function") {
              const result = await api.transcribeVoiceAudio(recordedBlob);
              if (result && result.text && result.text.trim()) {
                onTranscriptRef.current?.(result.text.trim(), true);
              }
            }
          } catch (err: any) {
            const msg = err?.message || "Could not transcribe audio. Tip: You can also press Fn Fn on macOS to dictate.";
            setError(msg);
            onErrorRef.current?.(msg);
          } finally {
            setIsTranscribing(false);
          }
        };

        recorder.onerror = () => {
          setIsListening(false);
          activeModeRef.current = null;
          const msg = "Audio recording error occurred.";
          setError(msg);
          onErrorRef.current?.(msg);
        };

        recorder.start(250);
        activeModeRef.current = "mediarecorder";
        setIsListening(true);
        setError(null);
        return;
      } catch (err: any) {
        setIsListening(false);
        activeModeRef.current = null;
        let msg = "Could not access microphone.";
        if (err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError") {
          msg = "Microphone access was denied. Please allow microphone access in macOS System Settings -> Privacy & Security -> Microphone.";
        }
        setError(msg);
        onErrorRef.current?.(msg);
        return;
      }
    }

    const msg = "Microphone input is not supported in this environment.";
    setError(msg);
    onErrorRef.current?.(msg);
  }, [backendSupported, hasMediaRecorder, hasWebSpeech]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      void stopListening();
    } else {
      void startListening();
    }
  }, [isListening, startListening, stopListening]);

  useEffect(() => {
    if (!isListening) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        void cancelListening();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isListening, cancelListening]);

  useEffect(() => {
    return () => {
      void cancelListening();
    };
  }, [cancelListening]);

  return {
    isSupported,
    isListening,
    isTranscribing,
    error,
    startListening,
    stopListening,
    cancelListening,
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
      // Kept silent by default per user request to keep Mac silent
      if (!isSupported || typeof window === "undefined") return;

      stop();
      const cleaned = cleanMarkdownForTTS(text);
      if (!cleaned) return;

      const utterance = new SpeechSynthesisUtterance(cleaned);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

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
