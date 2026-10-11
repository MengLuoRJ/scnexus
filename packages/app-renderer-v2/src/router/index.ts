import { createRouter, createWebHashHistory } from 'vue-router'
export default createRouter({
  history: createWebHashHistory(),
  routes: [
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
    { path: '/', name: 'home', component: () => import('../views/HomeView.vue') },
    { path: '/settings', name: 'settings', component: () => import('../views/SettingsView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
