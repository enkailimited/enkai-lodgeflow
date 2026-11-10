/**
 * Sign-in screen. Credentials are verified by the backend; there are no
 * client-side demo accounts or bypasses.
 */

import { FormEvent, useState } from 'react';
import { AlertCircle, Lock, Mail, ShieldCheck } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { errorMessage } from '../api/client';

export function LoginPage() {
  const { login, error: sessionError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F4F7FC] flex items-center justify-center px-4">
      <div className="w-full max-w-4xl grid md:grid-cols-2 bg-white rounded-3xl border border-[#E1EAF5] shadow-lg overflow-hidden">
        <div className="hidden md:flex flex-col justify-between bg-[#082B59] text-white p-9">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-9 h-9 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-[#8FC2FF]" />
              </span>
              <div>
                <p className="text-sm font-bold tracking-wide">ENKAI LODGEFLOW</p>
                <p className="text-[11px] text-white/60">Lodge management platform</p>
              </div>
            </div>
            <h1 className="mt-12 text-2xl font-bold leading-snug">
              One workspace for your lodge operations.
            </h1>
            <p className="mt-3 text-xs leading-relaxed text-white/70">
              Reservations, front desk, housekeeping, finance, staff and CCTV
              intelligence — scoped to your business, enforced on the server and
              recorded in the audit trail.
            </p>
          </div>
          <ul className="space-y-2 text-[11px] text-white/60">
            <li>Tenant-isolated data, no shared records</li>
            <li>Role-based access for every action</li>
            <li>CCTV supports staff decisions, never replaces them</li>
          </ul>
        </div>

        <div className="p-8 sm:p-10">
          <h2 className="text-lg font-bold text-[#152B4A]">Sign in</h2>
          <p className="text-xs text-[#718096] mt-1">
            Use the account issued by your lodge administrator.
          </p>

          {(error || sessionError) && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#EF4444]/25 bg-[#EF4444]/5 px-3 py-2.5">
              <AlertCircle className="w-4 h-4 text-[#DC2626] mt-0.5 shrink-0" />
              <p className="text-xs text-[#B42318]">{error ?? sessionError}</p>
            </div>
          )}

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="text-[11px] font-semibold text-[#152B4A]">Email</span>
              <div className="mt-1 relative">
                <Mail className="w-4 h-4 text-[#8EA2BC] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@lodge.co.tz"
                  className="w-full h-10 pl-9 pr-3 text-sm bg-white border border-[#D8E3F1] rounded-xl focus:outline-none focus:border-[#1769E8] focus:ring-2 focus:ring-[#1769E8]/15"
                />
              </div>
            </label>

            <label className="block">
              <span className="text-[11px] font-semibold text-[#152B4A]">Password</span>
              <div className="mt-1 relative">
                <Lock className="w-4 h-4 text-[#8EA2BC] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full h-10 pl-9 pr-3 text-sm bg-white border border-[#D8E3F1] rounded-xl focus:outline-none focus:border-[#1769E8] focus:ring-2 focus:ring-[#1769E8]/15"
                />
              </div>
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="w-full h-10 rounded-xl bg-[#1769E8] hover:bg-[#1258C8] disabled:opacity-60 text-white text-sm font-semibold transition-colors"
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-6 text-[11px] leading-relaxed text-[#8EA2BC]">
            Sessions expire after 12 hours. Contact your platform administrator
            if your business is suspended or your account is deactivated.
          </p>
        </div>
      </div>
    </div>
  );
}
