// Preset drone. Satuan SI: kg, N, m, s.
// maxThrust = total gaya dorong 4 motor pada baterai penuh.
// drag: koefisien hambatan kuadratik per sumbu badan (N per (m/s)^2).
// propSpeed: kecepatan aliran masuk saat dorongan baling-baling habis (~ pitch speed).
// rateGain: seberapa cepat pengendali laju (PID) mengejar laju target (1/s).
// maxAngAccel: batas percepatan sudut (rad/s^2) -> otoritas motor.
// motorTau: konstanta waktu respons motor (s).
// crashSpeed: kecepatan tumbukan (m/s) yang membuat drone jatuh.

export const DRONES = {
  freestyle5: {
    name: '5" Freestyle',
    desc: 'Serba bisa, kuat, TWR ±7. Pilihan standar untuk freestyle.',
    mass: 0.65, maxThrust: 44, motorTau: 0.030, propSpeed: 50,
    drag: { x: 0.016, y: 0.032, z: 0.012 }, linDrag: 0.04,
    rateGain: 42, maxAngAccel: 250,
    rates: { rc: 1.0, sr: 0.70, expo: 0.0, yawRc: 1.0, yawSr: 0.60 },
    camTilt: 30, size: 0.22, propD: 0.127, ducted: false, radius: 0.12,
    crashSpeed: 11, cells: 6, color: 0xff5a1f,
  },
  race5: {
    name: '5" Race',
    desc: 'Ringan dan bertenaga (TWR ±10), respons paling tajam untuk balap.',
    mass: 0.52, maxThrust: 52, motorTau: 0.020, propSpeed: 66,
    drag: { x: 0.013, y: 0.028, z: 0.009 }, linDrag: 0.03,
    rateGain: 52, maxAngAccel: 320,
    rates: { rc: 1.0, sr: 0.68, expo: 0.1, yawRc: 1.0, yawSr: 0.55 },
    camTilt: 40, size: 0.21, propD: 0.127, ducted: false, radius: 0.11,
    crashSpeed: 10, cells: 6, color: 0x1fb6ff,
  },
  cinewhoop3: {
    name: '3" Cinewhoop',
    desc: 'Berduct, berat, lembut. Cocok untuk terbang dekat dan sinematik.',
    mass: 0.28, maxThrust: 10.5, motorTau: 0.050, propSpeed: 26,
    drag: { x: 0.022, y: 0.045, z: 0.020 }, linDrag: 0.05,
    rateGain: 25, maxAngAccel: 120,
    rates: { rc: 0.85, sr: 0.50, expo: 0.2, yawRc: 0.8, yawSr: 0.40 },
    camTilt: 15, size: 0.14, propD: 0.076, ducted: true, radius: 0.08,
    crashSpeed: 9, cells: 4, color: 0x9b5cff,
  },
  whoop65: {
    name: 'Tiny Whoop 65 mm',
    desc: 'Sangat kecil dan tahan banting, untuk terbang di dalam ruangan.',
    mass: 0.024, maxThrust: 0.78, motorTau: 0.060, propSpeed: 15,
    drag: { x: 0.0055, y: 0.009, z: 0.0050 }, linDrag: 0.004,
    rateGain: 22, maxAngAccel: 100,
    rates: { rc: 0.9, sr: 0.55, expo: 0.2, yawRc: 0.9, yawSr: 0.45 },
    camTilt: 10, size: 0.065, propD: 0.031, ducted: true, radius: 0.04,
    crashSpeed: 99, cells: 1, color: 0x20d38a,
  },
  toothpick3: {
    name: '3" Toothpick',
    desc: 'Sangat ringan, gesit, cepat namun mudah melayang terbawa momentum.',
    mass: 0.09, maxThrust: 4.6, motorTau: 0.035, propSpeed: 36,
    drag: { x: 0.0045, y: 0.009, z: 0.0040 }, linDrag: 0.01,
    rateGain: 36, maxAngAccel: 220,
    rates: { rc: 1.0, sr: 0.65, expo: 0.1, yawRc: 1.0, yawSr: 0.55 },
    camTilt: 25, size: 0.12, propD: 0.076, ducted: false, radius: 0.07,
    crashSpeed: 14, cells: 3, color: 0xffd21f,
  },
  longrange7: {
    name: '7" Long Range',
    desc: 'Efisien dan stabil, inersia besar. Untuk jelajah jauh.',
    mass: 1.0, maxThrust: 36, motorTau: 0.060, propSpeed: 52,
    drag: { x: 0.022, y: 0.050, z: 0.018 }, linDrag: 0.06,
    rateGain: 22, maxAngAccel: 100,
    rates: { rc: 0.85, sr: 0.50, expo: 0.2, yawRc: 0.8, yawSr: 0.40 },
    camTilt: 20, size: 0.32, propD: 0.178, ducted: false, radius: 0.17,
    crashSpeed: 9, cells: 6, color: 0x3c8dff,
  },
  xclass: {
    name: 'X-Class (Mega)',
    desc: 'Drone balap raksasa 4,5 kg. Lamban berbelok, sangat cepat di lurus.',
    mass: 4.5, maxThrust: 185, motorTau: 0.090, propSpeed: 60,
    drag: { x: 0.075, y: 0.17, z: 0.060 }, linDrag: 0.2,
    rateGain: 12, maxAngAccel: 45,
    rates: { rc: 0.8, sr: 0.45, expo: 0.2, yawRc: 0.7, yawSr: 0.35 },
    camTilt: 30, size: 0.9, propD: 0.33, ducted: false, radius: 0.5,
    crashSpeed: 8, cells: 12, color: 0xff2d55,
  },
};

export const DRONE_ORDER = ['freestyle5', 'race5', 'cinewhoop3', 'whoop65', 'toothpick3', 'longrange7', 'xclass'];
