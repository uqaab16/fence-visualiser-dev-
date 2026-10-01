import type { ReactNode } from 'react';

// Wrap any customer or contractor identity text (names, phones, emails, addresses, free-text notes).
// "ph-mask" is PostHog's default maskTextClass, so session replay records it as asterisks.
export default function Pii({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`ph-mask ${className}`.trim()}>{children}</span>;
}
