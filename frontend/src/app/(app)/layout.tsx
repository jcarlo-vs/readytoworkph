// Pages are capped at a readable width; a page marked `data-wide` (Messages) uses the full width instead.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-6xl has-[[data-wide]]:max-w-none px-4 py-10 [[data-shell]_&]:py-6 lg:[[data-shell]_&]:px-6">{children}</div>;
}
