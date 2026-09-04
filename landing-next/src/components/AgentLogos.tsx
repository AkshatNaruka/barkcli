export function OpenCodeLogo({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      <rect width="512" height="512" fill="#131010" />
      <path d="M320 224V352H192V224H320Z" fill="#5A5858" />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M384 416H128V96H384V416ZM320 160H192V352H320V160Z"
        fill="white"
      />
    </svg>
  );
}

export function ClaudeCodeLogo({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      <path
        fill="#D97757"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M24 0C10.745 0 0 10.745 0 24s10.745 24 24 24 24-10.745 24-24S37.255 0 24 0Zm0 4c-9.942 0-18 8.058-18 18.027v1.942c.06 9.941 8.1 17.967 18.042 18.01 9.911-.062 17.944-8.095 17.958-18.006L42 22.05C41.947 12.07 33.917 4.035 24 4Z"
      />
      <path
        fill="#D97757"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M13 26h4v5a1 1 0 0 1-2 0v-3h-1v3a1 1 0 0 1-2 0v-5h1Zm2-10c1.657 0 3 1.343 3 3s-1.343 3-3 3-3-1.343-3-3 1.343-3 3-3Zm6 0h6v3h-6v3h6v3h-6v6h-4V16h4Zm8 5.349c2.177.455 3.506 1.702 3.506 3.651 0 2.7-2.456 4.4-5.506 4.4V16c.7 0 1.35.055 2 .16v5.19ZM31 26c0 1.1-.7 1.505-2 1.505H29v-3.01h.006L31 26Z"
      />
    </svg>
  );
}

export function CursorLogo({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      <path
        fill="#5C5F62"
        d="M11.503.131 1.891 5.678a.84.84 0 0 0-.42.726v11.188c0 .3.162.575.42.724l9.609 5.55a1 1 0 0 0 .998 0l9.61-5.55a.84.84 0 0 0 .42-.724V6.404a.84.84 0 0 0-.42-.726L12.497.131a1.01 1.01 0 0 0-.996 0Z"
      />
      <path
        fill="#fff"
        d="M2.657 6.338h18.55c.263 0 .43.287.297.515L12.23 22.918c-.062.107-.229.064-.229-.06V12.335a.59.59 0 0 0-.295-.51l-9.11-5.257c-.109-.063-.064-.23.061-.23Z"
      />
    </svg>
  );
}

export function AnyAgentLogo({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      <rect x="8" y="8" width="32" height="32" rx="8" fill="currentColor" fillOpacity="0.06" />
      <path
        d="M19 30.5 29.5 20"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M21 17.5 29 25.5" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  );
}
