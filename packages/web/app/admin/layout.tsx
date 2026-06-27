import { AdminNav } from './admin-nav';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="pb-20">
      {children}
      <AdminNav />
    </div>
  );
}
