import Foundation
import AVFoundation

guard CommandLine.arguments.count > 1 else {
    fputs("Usage: bark-record <output_wav_path>\n", stderr)
    exit(1)
}

let outputPath = CommandLine.arguments[1]
let outputURL = URL(fileURLWithPath: outputPath)

// Ensure parent directory exists
let parentDir = outputURL.deletingLastPathComponent()
try? FileManager.default.createDirectory(at: parentDir, withIntermediateDirectories: true)

// Audio settings for 16kHz mono linear PCM (standard for speech recognition)
let settings: [String: Any] = [
    AVFormatIDKey: Int(kAudioFormatLinearPCM),
    AVSampleRateKey: 16000.0,
    AVNumberOfChannelsKey: 1,
    AVLinearPCMBitDepthKey: 16,
    AVLinearPCMIsFloatKey: false,
    AVLinearPCMIsBigEndianKey: false
]

guard let recorder = try? AVAudioRecorder(url: outputURL, settings: settings) else {
    fputs("Failed to initialize AVAudioRecorder\n", stderr)
    exit(1)
}

if !recorder.record() {
    fputs("Failed to start recording\n", stderr)
    exit(1)
}

fputs("RECORDING\n", stdout)
fflush(stdout)

// Wait for newline or EOF on standard input to stop recording cleanly
_ = readLine()
recorder.stop()
exit(0)
