import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [passwort, setPasswort] = useState('');
  const { login, isLoading } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await login(email, passwort);
      toast.success('Erfolgreich angemeldet');
      navigate('/');
    } catch (err) {
      // error handled by interceptor
    }
  };

  return (
    <div className="min-h-screen bg-primary-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-400 rounded-2xl mb-4">
            <span className="text-white font-bold text-xl">DMS</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Autohaus DMS</h1>
          <p className="text-white/60 mt-1">Dealer Management System</p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-2xl p-8 shadow-2xl">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Anmelden</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">E-Mail-Adresse</label>
              <input
                type="email"
                className="input"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="name@autohaus.de"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="label">Passwort</label>
              <input
                type="password"
                className="input"
                value={passwort}
                onChange={e => setPasswort(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full justify-center py-3 mt-2"
            >
              {isLoading ? 'Anmelden...' : 'Anmelden'}
            </button>
          </form>
        </div>

        <p className="text-center text-white/40 text-sm mt-6">
          &copy; {new Date().getFullYear()} Autohaus DMS v1.0
        </p>
      </div>
    </div>
  );
}
