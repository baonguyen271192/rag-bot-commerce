import { Link } from 'react-router-dom';

export default function AppShell({ children }) {
  return (
    <div className="min-h-dvh bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-2.5 px-6 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            Z
          </div>
          <Link to="/" className="cursor-pointer text-lg font-semibold text-gray-900 hover:text-primary">
            Zalo RAG Bot — Quản trị
          </Link>
        </div>
      </header>
      <main className="px-6 py-8">{children}</main>
    </div>
  );
}
