import { Application } from 'express'
import { API_ROOT } from '../constant/application'

import General from './router'
import authRoutes from './user/authentication'
import userManagementRoutes from './user/management'
import researcherRoutes from './researcher'
import crawlerRoutes from './crawler'
import criticRoutes from './critic'

const App = (app: Application) => {
    app.use(`${API_ROOT}`, General)
    app.use(`${API_ROOT}`, authRoutes)
    app.use(`${API_ROOT}/user`, userManagementRoutes)
    app.use(`${API_ROOT}/researcher`, researcherRoutes)
    app.use(`${API_ROOT}/crawler`, crawlerRoutes)
    app.use(`${API_ROOT}/critic`, criticRoutes)
}

export default App
