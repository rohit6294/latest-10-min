import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';

class RoleSelectionScreen extends StatelessWidget {
  const RoleSelectionScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.navy,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              const SizedBox(height: 40),
              // Logo
              Container(
                width: 72,
                height: 72,
                decoration: BoxDecoration(
                  color: AppColors.emergency,
                  borderRadius: BorderRadius.circular(18),
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.emergency.withValues(alpha: 0.4),
                      blurRadius: 20,
                    ),
                  ],
                ),
                child: const Icon(Icons.emergency, color: Colors.white, size: 40),
              ),
              const SizedBox(height: 20),
              const Text(
                'Suraksha Kavach',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 28,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Who are you?',
                style: TextStyle(color: Colors.white54, fontSize: 16),
              ),
              const SizedBox(height: 60),

              // Driver Card
              _RoleCard(
                icon: Icons.drive_eta_rounded,
                title: 'Ambulance Driver',
                subtitle: 'Receive and respond to emergency requests',
                color: AppColors.accentBlue,
                onTap: () => context.go('/auth/login/driver'),
              ),
              const SizedBox(height: 16),

              // Hospital Card
              _RoleCard(
                icon: Icons.local_hospital_rounded,
                title: 'Hospital',
                subtitle: 'Receive incoming patients and track ambulances',
                color: AppColors.emergency,
                onTap: () => context.go('/auth/login/hospital'),
              ),

              const Spacer(),
              const Text(
                'Emergency Ambulance Coordination Platform',
                style: TextStyle(color: Colors.white24, fontSize: 12),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _RoleCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final Color color;
  final VoidCallback onTap;

  const _RoleCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.07),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
        ),
        child: Row(
          children: [
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(icon, color: color, size: 28),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 17,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    subtitle,
                    style:
                        const TextStyle(color: Colors.white54, fontSize: 13),
                  ),
                ],
              ),
            ),
            const Icon(Icons.arrow_forward_ios,
                color: Colors.white30, size: 16),
          ],
        ),
      ),
    );
  }
}
