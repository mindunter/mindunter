// Kannada voices per model. svara-tts-turbo = Kenpath Labs (sv_ IDs); bulbul:* = Sarvam
// (speaker IDs are case-sensitive, lowercase).
window.VOICES = {
  'svara-tts-turbo': {
    female: ['sv_eh86y5gc', 'sv_dvy2cmc2', 'sv_efmdpsgt', 'sv_g5d3gkdp'],
    male: ['sv_msznkuah', 'sv_73979mpu', 'sv_bxe798mf', 'sv_c7yf7tun'],
  },
  'bulbul:v3': {
    female: ['kavya', 'ritu', 'priya', 'neha', 'pooja', 'simran', 'ishita', 'shreya', 'roopa', 'tanya', 'shruti', 'suhani', 'kavitha', 'rupali'],
    male: ['rahul', 'shubh', 'aditya', 'rohan', 'amit', 'dev', 'ratan', 'varun', 'manan', 'sumit', 'kabir', 'aayan', 'ashutosh', 'advait', 'anand', 'tarun', 'sunny', 'mani', 'gokul', 'vijay', 'mohit', 'rehan', 'soham'],
  },
  'bulbul:v4-flash': {
    female: ['chaitra_kn_conversation', 'chaitra_kn_narration', 'suchitra_kn_narration'],
    male: ['chetan_kn_conversation'],
  },
  'bulbul:v2': {
    female: ['anushka', 'manisha', 'vidya', 'arya'],
    male: ['abhilash', 'karun', 'hitesh'],
  },
};
// Display names for voices whose IDs are not readable.
window.VOICE_NAMES = {
  sv_eh86y5gc: 'Spoorthi (best quality)',
  sv_dvy2cmc2: 'Bhoomika · young',
  sv_efmdpsgt: 'Meghana · middle-aged',
  sv_g5d3gkdp: 'Ranjini · young',
  sv_msznkuah: 'Girish · young',
  sv_73979mpu: 'Manju · middle-aged',
  sv_bxe798mf: 'Prajwal · young',
  sv_c7yf7tun: 'Sudeep · young',
};
window.VOICE_DEFAULTS = {
  'svara-tts-turbo': { female: 'sv_eh86y5gc', male: 'sv_msznkuah' },
  'bulbul:v3': { female: 'kavya', male: 'rahul' },
  'bulbul:v4-flash': { female: 'chaitra_kn_conversation', male: 'chetan_kn_conversation' },
  'bulbul:v2': { female: 'anushka', male: 'abhilash' },
};
