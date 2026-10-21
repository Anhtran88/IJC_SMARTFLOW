import React, { useState } from 'react';
import { LogIn, UserPlus, Shield, Eye, EyeOff, Loader2, KeyRound, AlertCircle, CheckCircle } from 'lucide-react';
import { loginUserInDB, registerUserInDB, logActivity } from '../lib/firebaseService';
import { UserAccount } from '../../types';

interface AuthProps {
  onLogin: (user: UserAccount) => void;
}

export const Auth: React.FC<AuthProps> = ({ onLogin }) => {
  const [isLoginMode, setIsLoginMode] = useState<boolean>(true);
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  
  // Status notifications
  const [errorStatus, setErrorStatus] = useState<string | null>(null);
  const [successStatus, setSuccessStatus] = useState<string | null>(null);

  const cleanInput = () => {
    setErrorStatus(null);
    setSuccessStatus(null);
  };

  const handleToggleMode = () => {
    setIsLoginMode(!isLoginMode);
    setUsername('');
    setPassword('');
    setConfirmPassword('');
    cleanInput();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    cleanInput();

    const trimmedUser = username.trim().toLowerCase();
    const trimmedPass = password.trim();

    if (!trimmedUser || !trimmedPass) {
      setErrorStatus('Vui lòng nhập đầy đủ tên tài khoản và mật khẩu!');
      return;
    }

    if (trimmedUser.length < 3) {
      setErrorStatus('Tên tài khoản phải có ít nhất 3 ký tự!');
      return;
    }

    if (trimmedPass.length < 6) {
      setErrorStatus('Mật khẩu phải có ít nhất 6 ký tự!');
      return;
    }

    setLoading(true);

    try {
      if (isLoginMode) {
        // Handle login
        try {
          const userObj = await loginUserInDB(trimmedUser, trimmedPass);
          
          // Log LOGIN action
          await logActivity(
            userObj.username,
            userObj.role,
            'LOGIN',
            'Cấu hình',
            `Đăng nhập thành công vào hệ thống. Vai trò: ${userObj.role.toUpperCase()}`
          );

          setSuccessStatus('Đăng nhập thành công!');
          setTimeout(() => {
            onLogin({
              username: userObj.username,
              role: userObj.role,
              createdAt: Date.now()
            });
          }, 800);

        } catch (err: any) {
          if (err.message === "USER_NOT_FOUND") {
            setErrorStatus('Tài khoản chưa tồn tại. Vui lòng chọn "Đăng ký" tài khoản lần đầu!');
          } else if (err.message === "WRONG_PASSWORD") {
            setErrorStatus('Mật khẩu không chính xác. Vui lòng kiểm tra lại!');
          } else {
            setErrorStatus(err.message || 'Lỗi hệ thống khi đăng nhập.');
          }
        }
      } else {
        // Handle register
        if (trimmedPass !== confirmPassword.trim()) {
          setErrorStatus('Mật khẩu xác nhận không trùng khớp!');
          setLoading(false);
          return;
        }

        try {
          const newUser = await registerUserInDB(trimmedUser, trimmedPass, 'viewer');
          
          // Log REGISTRATION
          await logActivity(
            newUser.username,
            newUser.role,
            'CREATE',
            'Cấu hình',
            `Đăng ký tài khoản mới thành công. Vai trò mặc định: VIEWER`
          );

          setSuccessStatus('Đăng ký tài khoản mới thành công! Đang chuyển sang màn hình đăng nhập...');
          // Auto switch to login with matching pre-filled fields
          setTimeout(() => {
            setIsLoginMode(true);
            setConfirmPassword('');
            cleanInput();
            setSuccessStatus('Vui lòng nhập lại mật khẩu vừa đăng ký để đăng nhập.');
          }, 2000);

        } catch (err: any) {
          if (err.message === "USER_EXISTS") {
            setErrorStatus('Tên tài khoản đã tồn tại. Vui lòng lựa chọn tên khác!');
          } else {
            setErrorStatus(err.message || 'Đăng ký không thành công. Hãy thử lại.');
          }
        }
      }
    } catch (e: any) {
      setErrorStatus('Đã xảy ra sai sót không mong muốn. Hãy thử lại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950 p-4 font-sans select-none overflow-y-auto">
      {/* Decorative clean radial graphics */}
      <div className="absolute w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none top-1/4 left-1/4"></div>
      <div className="absolute w-[450px] h-[450px] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none bottom-1/4 right-1/4"></div>

      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl relative z-10 overflow-hidden transform transition-all duration-300">
        
        {/* Banner header accent */}
        <div className="pt-8 pb-6 px-8 border-b border-slate-800/80 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-900/60 flex flex-col items-center text-center">
          <div className="w-14 h-14 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center text-white mb-4 shadow-lg shadow-blue-900/30">
            <Shield size={26} className="animate-pulse" />
          </div>
          <h2 className="text-xl font-black text-white tracking-tight uppercase">
            Hệ Thống Vật Tư & Dự Toán
          </h2>
          <p className="text-xs text-slate-400 font-semibold tracking-wide uppercase mt-1.5 text-blue-400">
            {isLoginMode ? 'Cổng đăng nhập bảo mật' : 'Đăng ký tài khoản hệ thống'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-5">
          
          {/* Notifications */}
          {errorStatus && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-xl flex items-start gap-2.5 animate-in fade-in duration-200">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <p className="text-xs font-semibold leading-relaxed">{errorStatus}</p>
            </div>
          )}

          {successStatus && (
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded-xl flex items-start gap-2.5 animate-in fade-in duration-200">
              <CheckCircle size={16} className="shrink-0 mt-0.5" />
              <p className="text-xs font-semibold leading-relaxed">{successStatus}</p>
            </div>
          )}

          {/* Username Input */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block pl-0.5">Tên tài khoản</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                <span className="text-sm font-bold">@</span>
              </div>
              <input
                type="text"
                className="w-full bg-slate-950/80 hover:bg-slate-950 focus:bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl pl-9 pr-4 py-3 text-sm text-slate-200 font-bold outline-none transition-all focus:ring-1 focus:ring-blue-500/30"
                placeholder="Nhập tên đăng nhập..."
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          {/* Password Input */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center pr-0.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block pl-0.5">Mật khẩu</label>
              {isLoginMode && (
                <span className="text-[10px] text-slate-500 font-bold hover:text-slate-400 cursor-help" title="Mặc định: admin / anhtran2261988">
                  Hỗ trợ tài khoản admin
                </span>
              )}
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <KeyRound size={16} />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                className="w-full bg-slate-950/80 hover:bg-slate-950 focus:bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl pl-9 pr-10 py-3 text-sm text-slate-200 font-bold outline-none transition-all focus:ring-1 focus:ring-blue-500/30"
                placeholder="Nhập mật khẩu..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-300 transition-colors"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Confirm Password Input (Register Mode Only) */}
          {!isLoginMode && (
            <div className="space-y-1.5 animate-in slide-in-from-top-2 duration-200">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block pl-0.5">Xác nhận mật khẩu</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <KeyRound size={16} />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="w-full bg-slate-950/80 hover:bg-slate-950 focus:bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl pl-9 pr-10 py-3 text-sm text-slate-200 font-bold outline-none transition-all focus:ring-1 focus:ring-blue-500/30"
                  placeholder="Xác nhận mật khẩu mới..."
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>
          )}

          {/* Action button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-all duration-150 flex items-center justify-center gap-2 shadow-lg shadow-blue-500/10 cursor-pointer disabled:opacity-50 disabled:scale-100"
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : isLoginMode ? (
              <>
                <LogIn size={16} /> Đăng nhập hệ thống
              </>
            ) : (
              <>
                <UserPlus size={16} /> Đăng ký tài khoản
              </>
            )}
          </button>

          {/* Toggle navigation panel */}
          <div className="text-center pt-2">
            <p className="text-xs text-slate-400 font-medium">
              {isLoginMode ? 'Chưa sử dụng hệ thống bao giờ?' : 'Đã có tài khoản được cấp quyền?'}
              <button
                type="button"
                onClick={handleToggleMode}
                disabled={loading}
                className="text-blue-400 hover:text-blue-300 font-bold ml-1.5 focus:underline outline-none transition-colors"
              >
                {isLoginMode ? 'Đăng ký ngay' : 'Về trang đăng nhập'}
              </button>
            </p>
          </div>

        </form>

        {/* Footer info lockups */}
        <div className="px-8 py-4 bg-slate-950/40 border-t border-slate-800 text-center text-[10px] text-slate-500 font-semibold tracking-wide uppercase">
          🛡️ Bảo mật chuẩn doanh nghiệp • ijc
        </div>

      </div>
    </div>
  );
};
