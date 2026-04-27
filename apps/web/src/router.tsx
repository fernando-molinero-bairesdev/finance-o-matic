import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import PrivateRoute from './components/PrivateRoute'
import AppLayout from './components/AppLayout'
import { AuthProvider } from './features/auth/AuthProvider'
import LoginPage from './features/auth/LoginPage'
import RegisterPage from './features/auth/RegisterPage'

import CurrenciesPage   from './pages/CurrenciesPage'
import ConceptsPage     from './pages/ConceptsPage'
import ProcessesPage    from './pages/ProcessesPage'
import EntityTypesPage  from './pages/EntityTypesPage'
import EntitiesPage     from './pages/EntitiesPage'
import SnapshotsPage    from './pages/SnapshotsPage'
import ReportsPage      from './pages/ReportsPage'

export default function AppRouter() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login"    element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          <Route element={<PrivateRoute />}>
            <Route element={<AppLayout />}>
              {/* Configuration */}
              <Route path="/configuration/currencies"   element={<CurrenciesPage />} />
              <Route path="/configuration/concepts"     element={<ConceptsPage />} />
              <Route path="/configuration/processes"    element={<ProcessesPage />} />
              <Route path="/configuration/entity-types" element={<EntityTypesPage />} />

              {/* Data */}
              <Route path="/data/entities" element={<EntitiesPage />} />

              {/* Processes */}
              <Route path="/processes/snapshots" element={<SnapshotsPage />} />

              {/* Reports */}
              <Route path="/reports" element={<ReportsPage />} />
            </Route>
          </Route>

          {/* Redirect everything else to the first useful page */}
          <Route path="*" element={<Navigate to="/configuration/concepts" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
