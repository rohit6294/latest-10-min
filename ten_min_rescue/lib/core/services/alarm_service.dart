import 'dart:async';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/services.dart';

/// Loud, looping siren + sustained vibration for the incoming-request screen.
///
/// The full-screen notification only plays its sound once when it fires — by
/// the time the driver actually looks at the screen they've often missed it.
/// This service keeps the alarm going (audio loop + periodic haptic) until the
/// driver responds or the request times out.
///
/// We synthesize the siren waveform in-memory rather than shipping an asset so
/// the APK stays small and the alarm can never go missing from a bad asset
/// path. ~6 KB, two-tone (1 kHz / 700 Hz) at 8-bit 8 kHz mono — plenty loud
/// through a phone speaker and trivially small to loop.
class AlarmService {
  AlarmService._();

  static final AudioPlayer _player = AudioPlayer();
  static Timer? _hapticTimer;
  static bool _running = false;
  static Uint8List? _cachedWav;

  static Future<void> start() async {
    if (_running) return;
    _running = true;

    _cachedWav ??= _buildSirenWav();

    try {
      await _player.setReleaseMode(ReleaseMode.loop);
      await _player.setVolume(1.0);
      // wav so we don't rely on any system codec being available.
      await _player.play(BytesSource(_cachedWav!, mimeType: 'audio/wav'));
    } catch (_) {
      // Audio failure is non-fatal — the haptic + the OS notification still
      // grab attention. Don't let it prevent the screen from showing.
    }

    // HapticFeedback.vibrate() on Android maps to a ~500ms vibration. Firing
    // every 700ms gives a near-continuous buzz with a brief gap so the user
    // can tell it apart from background app vibrations.
    _hapticTimer?.cancel();
    unawaited(HapticFeedback.vibrate());
    _hapticTimer = Timer.periodic(const Duration(milliseconds: 700), (_) {
      unawaited(HapticFeedback.vibrate());
    });
  }

  static Future<void> stop() async {
    if (!_running) return;
    _running = false;
    _hapticTimer?.cancel();
    _hapticTimer = null;
    try {
      await _player.stop();
    } catch (_) {
      // No-op — already stopped or never started.
    }
  }

  /// Build a small WAV buffer for a two-tone siren loop. 8-bit unsigned PCM,
  /// 8 kHz mono. Total ~6 KB so it fits trivially in memory and loops without
  /// the audio backend re-decoding anything heavy.
  static Uint8List _buildSirenWav() {
    const sampleRate = 8000;
    const bitsPerSample = 8;
    const channels = 1;

    // One full siren cycle: 350 ms at 1000 Hz, 50 ms gap, 350 ms at 700 Hz,
    // 50 ms gap. ~800 ms total, then we let the player loop the whole clip.
    final segments = <_Tone>[
      const _Tone(freq: 1000, durationMs: 350, amplitude: 0.85),
      const _Tone(freq: 0, durationMs: 50, amplitude: 0),
      const _Tone(freq: 700, durationMs: 350, amplitude: 0.85),
      const _Tone(freq: 0, durationMs: 50, amplitude: 0),
    ];

    final pcm = BytesBuilder();
    for (final seg in segments) {
      final n = (sampleRate * seg.durationMs / 1000).round();
      for (var i = 0; i < n; i++) {
        if (seg.freq == 0 || seg.amplitude == 0) {
          pcm.addByte(128); // unsigned-8 silence
          continue;
        }
        // Sine wave centred on 128 (mid of unsigned 8-bit range), with a 5 ms
        // fade-in/out per segment to avoid clicks at boundaries.
        final t = i / sampleRate;
        final s = math.sin(2 * math.pi * seg.freq * t);
        final fadeMs = math.min(5, seg.durationMs ~/ 4);
        final fadeSamples = (sampleRate * fadeMs / 1000).round();
        var env = 1.0;
        if (i < fadeSamples) {
          env = i / fadeSamples;
        } else if (i > n - fadeSamples) {
          env = (n - i) / fadeSamples;
        }
        final v = (s * seg.amplitude * env * 127).round();
        pcm.addByte((128 + v).clamp(0, 255));
      }
    }

    final pcmBytes = pcm.toBytes();
    final dataLen = pcmBytes.length;
    final byteRate = sampleRate * channels * bitsPerSample ~/ 8;
    final blockAlign = channels * bitsPerSample ~/ 8;
    final fileLen = 36 + dataLen;

    final header = BytesBuilder();
    void writeStr(String s) => header.add(s.codeUnits);
    void writeU32(int v) {
      header.addByte(v & 0xff);
      header.addByte((v >> 8) & 0xff);
      header.addByte((v >> 16) & 0xff);
      header.addByte((v >> 24) & 0xff);
    }

    void writeU16(int v) {
      header.addByte(v & 0xff);
      header.addByte((v >> 8) & 0xff);
    }

    writeStr('RIFF');
    writeU32(fileLen);
    writeStr('WAVE');
    writeStr('fmt ');
    writeU32(16);
    writeU16(1); // PCM
    writeU16(channels);
    writeU32(sampleRate);
    writeU32(byteRate);
    writeU16(blockAlign);
    writeU16(bitsPerSample);
    writeStr('data');
    writeU32(dataLen);

    final out = BytesBuilder();
    out.add(header.toBytes());
    out.add(pcmBytes);
    return out.toBytes();
  }
}

class _Tone {
  final int freq;
  final int durationMs;
  final double amplitude;
  const _Tone({
    required this.freq,
    required this.durationMs,
    required this.amplitude,
  });
}
