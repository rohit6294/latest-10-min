import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import '../../../core/services/firestore_service.dart';
import '../../../core/models/rescue_request_model.dart';
import '../../../core/constants/app_colors.dart';

class TrackAmbulanceScreen extends StatefulWidget {
  final String requestId;
  const TrackAmbulanceScreen({super.key, required this.requestId});

  @override
  State<TrackAmbulanceScreen> createState() => _TrackAmbulanceScreenState();
}

class _TrackAmbulanceScreenState extends State<TrackAmbulanceScreen> {
  final _firestoreService = FirestoreService();
  final _mapController = MapController();

  LatLng? _ambulanceLocation;
  String? _assignedDriverId;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Track Ambulance'),
        backgroundColor: AppColors.navy,
        leading: const SizedBox.shrink(),
        actions: [
          TextButton.icon(
            onPressed: () =>
                context.go('/hospital/checklist/${widget.requestId}'),
            icon: const Icon(Icons.checklist, color: Colors.white70, size: 18),
            label: const Text(
              'Checklist',
              style: TextStyle(color: Colors.white70, fontSize: 13),
            ),
          ),
        ],
      ),
      body: StreamBuilder<RescueRequestModel>(
        stream: _firestoreService.watchRequest(widget.requestId),
        builder: (context, reqSnap) {
          if (!reqSnap.hasData) {
            return const Center(
              child: CircularProgressIndicator(color: AppColors.emergency),
            );
          }
          final request = reqSnap.data!;
          _assignedDriverId = request.assignedDriverId;

          // Auto-navigate on completion
          if (request.status == RequestStatus.completed) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (mounted) context.go('/hospital/received/${widget.requestId}');
            });
          }

          final patientLatLng = LatLng(
            request.patientLocation.latitude,
            request.patientLocation.longitude,
          );

          return StreamBuilder<Map<String, dynamic>?>(
            stream: _assignedDriverId != null
                ? _firestoreService.watchDriverLocation(_assignedDriverId!)
                : const Stream.empty(),
            builder: (context, locSnap) {
              if (locSnap.hasData && locSnap.data != null) {
                final loc = locSnap.data!;
                final geoPoint = loc['location'];
                if (geoPoint != null) {
                  final newLoc = LatLng(geoPoint.latitude, geoPoint.longitude);
                  if (_ambulanceLocation != newLoc) {
                    _ambulanceLocation = newLoc;
                    WidgetsBinding.instance.addPostFrameCallback((_) {
                      if (mounted) {
                        _mapController.move(newLoc, _mapController.camera.zoom);
                      }
                    });
                  }
                }
              }

              final center =
                  _ambulanceLocation ?? const LatLng(22.5726, 88.3639);

              return Column(
                children: [
                  Expanded(
                    child: FlutterMap(
                      mapController: _mapController,
                      options: MapOptions(
                        initialCenter: center,
                        initialZoom: 14,
                      ),
                      children: [
                        TileLayer(
                          urlTemplate:
                              'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                          userAgentPackageName: 'com.tenminrescue.ten_min_res',
                        ),
                        MarkerLayer(
                          markers: [
                            // Ambulance marker
                            if (_ambulanceLocation != null)
                              Marker(
                                point: _ambulanceLocation!,
                                width: 52,
                                height: 52,
                                child: const Icon(
                                  Icons.drive_eta_rounded,
                                  color: Colors.blue,
                                  size: 46,
                                ),
                              ),
                            // Patient location marker
                            Marker(
                              point: patientLatLng,
                              width: 48,
                              height: 48,
                              child: const Icon(
                                Icons.person_pin_circle,
                                color: AppColors.emergency,
                                size: 44,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.all(20),
                    color: Colors.white,
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        // Status badge
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 8,
                          ),
                          decoration: BoxDecoration(
                            color: AppColors.onlineGreen.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Container(
                                width: 8,
                                height: 8,
                                decoration: const BoxDecoration(
                                  color: AppColors.onlineGreen,
                                  shape: BoxShape.circle,
                                ),
                              ),
                              const SizedBox(width: 8),
                              const Text(
                                'Ambulance En Route',
                                style: TextStyle(
                                  color: AppColors.onlineGreen,
                                  fontWeight: FontWeight.bold,
                                  fontSize: 13,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 12),
                        Row(
                          children: [
                            const Icon(
                              Icons.person_outline,
                              color: AppColors.textSecondary,
                              size: 16,
                            ),
                            const SizedBox(width: 6),
                            Text(
                              'Patient: ${request.patientName}',
                              style: const TextStyle(
                                color: AppColors.navy,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Row(
                          children: [
                            const Icon(
                              Icons.emergency,
                              color: AppColors.emergency,
                              size: 16,
                            ),
                            const SizedBox(width: 6),
                            Text(
                              'Emergency: ${request.emergencyType}',
                              style: const TextStyle(
                                color: AppColors.textSecondary,
                                fontSize: 13,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),
                        SizedBox(
                          width: double.infinity,
                          child: ElevatedButton(
                            onPressed: () => context.go(
                              '/hospital/checklist/${widget.requestId}',
                            ),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppColors.navy,
                              padding: const EdgeInsets.symmetric(vertical: 14),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                            ),
                            child: const Text(
                              'Prepare for Patient (Checklist)',
                              style: TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              );
            },
          );
        },
      ),
    );
  }
}
