import Foundation
import Speech

guard CommandLine.arguments.count > 1 else {
    fputs("Usage: bark-transcribe <audio_file_path>\n", stderr)
    exit(1)
}

let filePath = CommandLine.arguments[1]
let fileURL = URL(fileURLWithPath: filePath)

guard FileManager.default.fileExists(atPath: filePath) else {
    fputs("File does not exist: \(filePath)\n", stderr)
    exit(1)
}

let localeStr = ProcessInfo.processInfo.environment["BARK_SPEECH_LOCALE"] ?? "en-US"
let locale = Locale(identifier: localeStr)
guard let recognizer = SFSpeechRecognizer(locale: locale) else {
    fputs("SFSpeechRecognizer not available for locale \(localeStr)\n", stderr)
    exit(1)
}

let request = SFSpeechURLRecognitionRequest(url: fileURL)
request.shouldReportPartialResults = false

var done = false
var transcript = ""

recognizer.recognitionTask(with: request) { result, error in
    if let result = result {
        if result.isFinal {
            transcript = result.bestTranscription.formattedString
            done = true
        }
    }
    if let error = error {
        fputs("Recognition error: \(error.localizedDescription)\n", stderr)
        done = true
    }
}

let timeout = Date().addingTimeInterval(20)
while !done && Date() < timeout {
    RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.05))
}

if !transcript.isEmpty {
    print(transcript)
    exit(0)
} else {
    exit(1)
}
