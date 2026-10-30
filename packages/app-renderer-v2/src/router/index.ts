import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useCreatorStore } from '../stores/creator'
import { useContentCenterStore } from '../stores/content-center'
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/replays',
      name: 'replays',
      component: () => import('../views/replay/ReplayView.vue'),
      meta: { titleKey: 'replay.title' },
    },
    {
      path: '/ai-assistant',
      name: 'ai-assistant',
      component: () => import('../views/ai-assistant/AiAssistantView.vue'),
      meta: { titleKey: 'aiAssistant.title' },
    },
    {
      path: '/editor-toolbox',
      name: 'editor-toolbox',
      component: () => import('../views/editor-toolbox/EditorToolboxView.vue'),
      meta: { titleKey: 'toolbox.title' },
    },
    {
      path: '/editor-toolbox/encoding',
      name: 'editor-toolbox-encoding',
      component: () => import('../views/editor-toolbox/EncodingView.vue'),
      meta: { titleKey: 'toolbox.encoding' },
    },
    {
      path: '/workshop/:scnid?',
      name: 'workshop',
      component: () => import('../views/workshop/WorkshopView.vue'),
      meta: { workshop: true, titleKey: 'workshop.title' },
    },
    {
      path: '/creator',
      name: 'creator',
      component: () => import('../views/creator/CreatorView.vue'),
      meta: { workshop: true, creator: true, titleKey: 'contentCenter.creator' },
    },
    {
      path: '/downloads',
      name: 'downloads',
      component: () => import('../views/downloads/DownloadsView.vue'),
      meta: { titleKey: 'contentCenter.downloads' },
    },
    {
      path: '/uploads',
      name: 'uploads',
      component: () => import('../views/uploads/UploadsView.vue'),
      meta: { workshop: true, creator: true, titleKey: 'contentCenter.uploads' },
    },
    {
      path: '/account',
      name: 'account',
      component: () => import('../views/account/AccountView.vue'),
    },
    {
      path: '/campaign',
      name: 'campaign',
      component: () => import('../views/campaign/CampaignView.vue'),
    },
    {
      path: '/customize',
      name: 'customize',
      component: () => import('../views/customize/CustomizeView.vue'),
    },
    {
      path: '/weekly-mutations',
      name: 'weekly-mutations',
      component: () => import('../views/weekly-mutations/WeeklyMutationsView.vue'),
    },
    { path: '/', name: 'home', component: () => import('../views/HomeView.vue') },
    { path: '/settings', name: 'settings', component: () => import('../views/SettingsView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach(async (to) => {
  if (!to.meta.workshop) return
  const center = useContentCenterStore()
  try {
    await center.initialize()
  } catch {
    return '/settings'
  }
  if (!center.enabled) return '/settings'
  if (to.meta.login || to.meta.creator) {
    const auth = useAuthStore()
    if (!auth.signedIn) await auth.initialize()
    if (!auth.signedIn) return { path: '/account', query: { redirect: to.fullPath } }
    if (to.meta.creator) {
      if (!auth.authorization) await auth.loadAccount()
      const creator = useCreatorStore()
      await creator.load()
      if (!creator.active) return '/account'
    }
  }
})
export default router
