/**
 * Vehicle condition diagrams from the approved Diamond demo
 * contract (`CONTRACT_HTML` TOPVIEW / SIDEVIEW / ENDVIEW). Static artwork; damage
 * marking is an overlay (`DamageOverlay`) in the same viewBox.
 */
export function TopView() {
  return (
    <svg viewBox="0 0 340 170" preserveAspectRatio="xMidYMid meet" fill="none" stroke="#111" strokeWidth="2.2" strokeLinejoin="round" aria-hidden="true">
      <rect x="66" y="6" width="36" height="18" rx="5" />
      <rect x="226" y="6" width="36" height="18" rx="5" />
      <rect x="66" y="146" width="36" height="18" rx="5" />
      <rect x="226" y="146" width="36" height="18" rx="5" />
      <path d="M74 20 L250 20 C272 20 288 26 296 40 C306 56 310 72 310 85 C310 98 306 114 296 130 C288 144 272 150 250 150 L74 150 C56 150 44 144 38 132 C30 114 26 98 26 85 C26 72 30 56 38 38 C44 26 56 20 74 20 Z" strokeWidth="2.8" />
      <path d="M122 44 L232 44 C244 44 250 52 252 64 C254 74 254 96 252 106 C250 118 244 126 232 126 L122 126 C110 126 104 118 102 106 C100 96 100 74 102 64 C104 52 110 44 122 44 Z" />
      <path d="M148 58 L210 58 C218 58 222 64 223 72 C224 80 224 90 223 98 C222 106 218 112 210 112 L148 112 C140 112 136 106 135 98 C134 90 134 80 135 72 C136 64 140 58 148 58 Z" strokeWidth="1.7" />
      <path d="M160 20 V44 M200 20 V44 M160 150 V126 M200 150 V126" strokeWidth="1.7" />
      <path d="M112 20 L114 11 Q115 8 119 8 L124 8 Q127 9 126 13 L124 20 Z" strokeWidth="1.7" />
      <path d="M112 150 L114 159 Q115 162 119 162 L124 162 Q127 161 126 157 L124 150 Z" strokeWidth="1.7" />
      <path d="M66 28 C58 52 58 118 66 142" strokeWidth="1.6" />
      <path d="M272 28 C280 52 280 118 272 142" strokeWidth="1.6" />
      <path d="M34 58 C28 68 28 102 34 112" strokeWidth="1.6" />
      <path d="M302 58 C308 68 308 102 302 112" strokeWidth="1.6" />
      <path d="M42 30 L62 26 L64 38 L44 42 Z" strokeWidth="1.6" />
      <path d="M42 140 L62 144 L64 132 L44 128 Z" strokeWidth="1.6" />
      <path d="M296 30 L280 26 L278 38 L294 42 Z" strokeWidth="1.6" />
      <path d="M296 140 L280 144 L278 132 L294 128 Z" strokeWidth="1.6" />
    </svg>
  );
}

export function SideView() {
  return (
    <svg viewBox="0 0 210 84" preserveAspectRatio="xMidYMid meet" fill="none" stroke="#111" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 66 L10 52 C10 45 14 41 22 39 L56 34 L76 17 C80 13 86 11 94 11 L136 11 C144 11 150 13 155 18 L172 36 L192 41 C200 43 202 47 202 53 L202 66 Z" strokeWidth="2.4" />
      <path d="M62 34 L79 20 C82 17 86 16 92 16 L104 16 L104 34 Z" strokeWidth="1.5" />
      <path d="M110 16 L134 16 C141 16 145 18 149 22 L159 34 L110 34 Z" strokeWidth="1.5" />
      <path d="M107 34 V58 M150 36 V60" strokeWidth="1.5" />
      <rect x="86" y="42" width="11" height="3.4" rx="1.6" strokeWidth="1.4" />
      <rect x="126" y="42" width="11" height="3.4" rx="1.6" strokeWidth="1.4" />
      <circle cx="52" cy="66" r="13" />
      <circle cx="52" cy="66" r="6" strokeWidth="1.5" />
      <circle cx="162" cy="66" r="13" />
      <circle cx="162" cy="66" r="6" strokeWidth="1.5" />
      <path d="M4 79 H206" strokeWidth="1.2" />
    </svg>
  );
}

export function EndView() {
  return (
    <svg viewBox="0 0 130 84" preserveAspectRatio="xMidYMid meet" fill="none" stroke="#111" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 66 L16 44 C16 36 20 30 27 27 L34 15 C36 12 40 10 46 10 L84 10 C90 10 94 12 96 15 L103 27 C110 30 114 36 114 44 L114 66 Z" strokeWidth="2.4" />
      <path d="M33 27 L39 16 C40 14 42 13 46 13 L84 13 C88 13 90 14 91 16 L97 27 Z" strokeWidth="1.5" />
      <rect x="20" y="44" width="18" height="9" rx="3" strokeWidth="1.5" />
      <rect x="92" y="44" width="18" height="9" rx="3" strokeWidth="1.5" />
      <rect x="45" y="46" width="40" height="8" rx="2" strokeWidth="1.5" />
      <path d="M16 59 H114" strokeWidth="1.4" />
      <path d="M22 66 V73 M108 66 V73" strokeWidth="1.6" />
    </svg>
  );
}
