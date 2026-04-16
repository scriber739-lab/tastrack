import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import TasTrack from './tasmania-tracker';
import AdminApp from './tastrack-admin';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"      element={<TasTrack />} />
        <Route path="/admin" element={<AdminApp />} />
        <Route path="*"      element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
