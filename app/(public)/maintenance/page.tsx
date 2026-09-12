import styles from "./maintenance.module.css";

export default function MaintenancePage() {
  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <div aria-hidden className={styles.artWrap}>
          <svg
            className={styles.art}
            fill="none"
            viewBox="0 0 760 420"
            xmlns="http://www.w3.org/2000/svg"
          >
            <ellipse cx="372" cy="390" fill="#D4DBE7" rx="220" ry="20" />
            <ellipse cx="380" cy="165" fill="#DFE4EE" rx="275" ry="140" />

            <rect
              fill="#6F70BA"
              height="186"
              rx="26"
              width="400"
              x="170"
              y="62"
            />
            <rect
              fill="#F4F7FF"
              height="164"
              rx="18"
              width="370"
              x="185"
              y="74"
            />
            <rect fill="#504FA4" height="24" rx="12" width="370" x="185" y="74" />
            <circle cx="205" cy="86" fill="#95A0DB" r="4.5" />
            <circle cx="220" cy="86" fill="#95A0DB" r="4.5" />
            <circle cx="235" cy="86" fill="#95A0DB" r="4.5" />

            <path
              d="M332 141H350V123H368V141H386V159H368V177H350V159H332V141Z"
              fill="#B9CAE0"
            />
            <path
              d="M404 155H416V143H428V155H440V167H428V179H416V167H404V155Z"
              fill="#C8D6EA"
            />

            <path d="M258 57L306 57L296 28L268 28L258 57Z" fill="#FDB642" />
            <rect fill="#FDB642" height="14" rx="6" width="54" x="255" y="54" />
            <path
              d="M283 40L286 48H280L283 40Z"
              fill="#8D620B"
              stroke="#8D620B"
              strokeWidth="2"
            />
            <circle cx="283" cy="53" fill="#8D620B" r="2.5" />

            <path d="M158 176L202 176L192 149L168 149L158 176Z" fill="#FDB642" />
            <rect fill="#FDB642" height="13" rx="6" width="48" x="156" y="174" />
            <path
              d="M180 159L183 166H177L180 159Z"
              fill="#8D620B"
              stroke="#8D620B"
              strokeWidth="2"
            />
            <circle cx="180" cy="172" fill="#8D620B" r="2.5" />

            <rect fill="#FFB000" height="70" rx="8" width="210" x="100" y="252" />
            <rect fill="#0E4D9A" height="70" rx="8" width="26" x="114" y="252" />
            <rect fill="#0E4D9A" height="70" rx="8" width="26" x="166" y="252" />
            <rect fill="#0E4D9A" height="70" rx="8" width="26" x="218" y="252" />
            <rect fill="#0E4D9A" height="70" rx="8" width="26" x="270" y="252" />

            <rect fill="#FFB000" height="18" rx="9" width="22" x="112" y="318" />
            <rect fill="#FFB000" height="18" rx="9" width="22" x="276" y="318" />
            <rect fill="#0E4D9A" height="40" rx="6" width="10" x="118" y="322" />
            <rect fill="#0E4D9A" height="40" rx="6" width="10" x="282" y="322" />

            <path d="M76 370L108 370L95 333L89 333L76 370Z" fill="#FDB642" />
            <rect fill="#F4A52B" height="10" rx="5" width="34" x="75" y="367" />

            <path d="M616 370L648 370L635 333L629 333L616 370Z" fill="#FDB642" />
            <rect fill="#F4A52B" height="10" rx="5" width="34" x="615" y="367" />

            <circle cx="548" cy="182" fill="#FFD9B3" r="20" />
            <path
              d="M532 189C535 174 546 164 560 165C569 166 576 171 580 179C577 188 569 194 560 196C548 198 538 195 532 189Z"
              fill="#2E4872"
            />
            <path
              d="M534 180L547 160H562L573 176L565 188H545L534 180Z"
              fill="#FDB642"
            />
            <rect fill="#2F75C9" height="128" rx="26" width="70" x="510" y="195" />
            <rect fill="#F8A32D" height="128" rx="8" width="12" x="542" y="195" />
            <rect
              fill="#2F75C9"
              height="84"
              rx="18"
              transform="rotate(-24 568 216)"
              width="30"
              x="568"
              y="216"
            />
            <rect
              fill="#F8A32D"
              height="84"
              rx="6"
              transform="rotate(-24 577 219)"
              width="8"
              x="577"
              y="219"
            />
            <rect fill="#1C3763" height="112" rx="20" width="64" x="556" y="292" />
            <rect
              fill="#1C3763"
              height="98"
              rx="20"
              transform="rotate(38 495 285)"
              width="42"
              x="495"
              y="285"
            />
          </svg>
        </div>

        <h1 className={styles.title}>Page Under Maintenance</h1>
        <p className={styles.subtitle}>
          The site is currently undergoing updates. Please check back soon.
        </p>
      </section>
    </main>
  );
}
