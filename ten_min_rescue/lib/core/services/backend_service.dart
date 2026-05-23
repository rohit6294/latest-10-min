import 'dart:convert';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:http/http.dart' as http;

class BackendService {
  static const String _baseUrl = String.fromEnvironment(
    'BACKEND_URL',
    defaultValue: 'https://min-rescue-backend.onrender.com',
  );

  Future<void> notifyWhatsappRequestEvent({
    required String requestId,
    required String eventType,
  }) async {
    final user = FirebaseAuth.instance.currentUser;
    final idToken = await user?.getIdToken();
    if (idToken == null || idToken.isEmpty) {
      throw Exception('Missing auth token for backend request.');
    }

    final res = await http.post(
      Uri.parse('$_baseUrl/whatsapp/request-event'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $idToken',
      },
      body: jsonEncode({'requestId': requestId, 'eventType': eventType}),
    );

    if (res.statusCode >= 200 && res.statusCode < 300) return;

    String message = 'Backend error ${res.statusCode}';
    try {
      final data = jsonDecode(res.body) as Map<String, dynamic>;
      message = (data['error'] as String?) ?? message;
    } catch (_) {
      if (res.body.isNotEmpty) message = res.body;
    }
    throw Exception(message);
  }
}
