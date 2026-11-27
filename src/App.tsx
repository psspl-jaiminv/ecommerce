import { Navigate, Route, Routes } from 'react-router'
import { RedirectIfAuthenticated, RequireAuth } from './auth/RequireAuth.tsx'
import { HomePage } from './pages/HomePage.tsx'
import { LoginPage } from './pages/LoginPage.tsx'
import { SignupPage } from './pages/SignupPage.tsx'
import './App.css'

/** Route table. Expects a router and an `AuthProvider` above it (see `main.tsx`). */
function App() {
  return (
    <Routes>
      <Route element={<RequireAuth />}>
        <Route index element={<HomePage />} />
      </Route>
      <Route element={<RedirectIfAuthenticated />}>
        <Route path="login" element={<LoginPage />} />
        <Route path="signup" element={<SignupPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
