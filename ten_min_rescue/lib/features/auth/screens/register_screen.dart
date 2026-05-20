import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../core/services/auth_service.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/models/ambulance_type.dart';
import '../../../shared/widgets/loading_overlay.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _authService = AuthService();
  bool _loading = false;
  bool _obscurePass = true;
  String? _error;

  final _nameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  final _vehicleCtrl = TextEditingController();
  final _licenseCtrl = TextEditingController();

  AmbulanceType _selectedType = AmbulanceType.C;

  Future<void> _register() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await _authService.registerDriver(
        email: _emailCtrl.text.trim(),
        password: _passCtrl.text,
        name: _nameCtrl.text.trim(),
        phone: _phoneCtrl.text.trim(),
        vehicleNumber: _vehicleCtrl.text.trim(),
        licenseNumber: _licenseCtrl.text.trim(),
        ambulanceType: _selectedType,
      );
      if (!mounted) return;
      context.go('/driver/upload-docs');
    } catch (e) {
      final msg = e.toString();
      setState(() => _error = msg.contains('email-already-in-use')
          ? 'Email already registered. Please login.'
          : 'Registration failed. Please try again.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  void dispose() {
    for (final c in [
      _nameCtrl,
      _emailCtrl,
      _phoneCtrl,
      _passCtrl,
      _vehicleCtrl,
      _licenseCtrl,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return LoadingOverlay(
      isLoading: _loading,
      child: Scaffold(
        backgroundColor: AppColors.lightBg,
        appBar: AppBar(
          title: const Text('Driver Registration'),
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            onPressed: () => context.go('/auth/login'),
          ),
        ),
        body: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 8),
                Text(
                  'Join Suraksha Kavach as a driver',
                  style: GoogleFonts.poppins(
                    color: AppColors.textSecondary,
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: 24),

                _sectionTitle('Personal Information'),
                const SizedBox(height: 12),
                _field(_nameCtrl, 'Full Name', Icons.person_outline),
                const SizedBox(height: 12),
                _field(_emailCtrl, 'Email', Icons.email_outlined,
                    type: TextInputType.emailAddress),
                const SizedBox(height: 12),
                _field(_phoneCtrl, 'Phone Number', Icons.phone_outlined,
                    type: TextInputType.phone),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _passCtrl,
                  obscureText: _obscurePass,
                  decoration: InputDecoration(
                    labelText: 'Password',
                    prefixIcon: const Icon(Icons.lock_outline),
                    suffixIcon: IconButton(
                      icon: Icon(_obscurePass
                          ? Icons.visibility_off
                          : Icons.visibility),
                      onPressed: () =>
                          setState(() => _obscurePass = !_obscurePass),
                    ),
                  ),
                  validator: (v) =>
                      v == null || v.length < 6 ? 'Minimum 6 characters' : null,
                ),
                const SizedBox(height: 24),

                _sectionTitle('Vehicle Details'),
                const SizedBox(height: 12),
                _field(_vehicleCtrl, 'Vehicle Number (e.g. WB01AB1234)',
                    Icons.directions_car_outlined),
                const SizedBox(height: 12),
                _field(_licenseCtrl, 'Driving License Number',
                    Icons.badge_outlined),

                const SizedBox(height: 24),
                _sectionTitle('Ambulance Type'),
                Text(
                  'Select the type of ambulance you operate',
                  style: GoogleFonts.poppins(
                    color: AppColors.textSecondary,
                    fontSize: 12,
                  ),
                ),
                const SizedBox(height: 12),

                _ambulanceTypeCard(
                  AmbulanceType.A,
                  Icons.medical_services_rounded,
                  AppColors.brandRed,
                ),
                const SizedBox(height: 10),
                _ambulanceTypeCard(
                  AmbulanceType.B,
                  Icons.local_hospital_rounded,
                  AppColors.warningAmber,
                ),
                const SizedBox(height: 10),
                _ambulanceTypeCard(
                  AmbulanceType.C,
                  Icons.airport_shuttle_rounded,
                  AppColors.onlineGreen,
                ),

                if (_error != null) ...[
                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppColors.brandRed.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(
                          color: AppColors.brandRed.withValues(alpha: 0.3)),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.error_outline,
                            color: AppColors.brandRed, size: 18),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            _error!,
                            style: GoogleFonts.poppins(
                              color: AppColors.brandRed,
                              fontSize: 13,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: 28),

                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _loading ? null : _register,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.brandRed,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                    child: Text(
                      'Create Account',
                      style: GoogleFonts.poppins(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Center(
                  child: TextButton(
                    onPressed: () => context.go('/auth/login'),
                    child: Text(
                      'Already have an account? Login',
                      style: GoogleFonts.poppins(
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _sectionTitle(String text) => Text(
        text,
        style: GoogleFonts.poppins(
          color: AppColors.navy,
          fontSize: 16,
          fontWeight: FontWeight.w700,
        ),
      );

  Widget _ambulanceTypeCard(
      AmbulanceType type, IconData icon, Color accentColor) {
    final selected = _selectedType == type;
    return GestureDetector(
      onTap: () => setState(() => _selectedType = type),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: selected
              ? accentColor.withValues(alpha: 0.08)
              : Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: selected ? accentColor : const Color(0xFFE2E8F0),
            width: selected ? 2 : 1,
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: accentColor.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, color: accentColor, size: 26),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(
                        'Type ${type.value}',
                        style: GoogleFonts.poppins(
                          color: AppColors.navy,
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(width: 6),
                      Text(
                        '— ${type.shortLabel}',
                        style: GoogleFonts.poppins(
                          color: accentColor,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    type.description,
                    style: GoogleFonts.poppins(
                      color: AppColors.textSecondary,
                      fontSize: 11.5,
                      height: 1.4,
                    ),
                  ),
                ],
              ),
            ),
            Icon(
              selected
                  ? Icons.radio_button_checked
                  : Icons.radio_button_unchecked,
              color: selected ? accentColor : AppColors.textLight,
              size: 22,
            ),
          ],
        ),
      ),
    );
  }

  Widget _field(
    TextEditingController ctrl,
    String label,
    IconData icon, {
    TextInputType type = TextInputType.text,
  }) {
    return TextFormField(
      controller: ctrl,
      keyboardType: type,
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: Icon(icon),
      ),
      validator: (v) => v == null || v.trim().isEmpty ? 'Required' : null,
    );
  }
}
