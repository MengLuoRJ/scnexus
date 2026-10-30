import { apiRequest } from './internal/client'
import {
  mutationRegions,
  mutationLanguages,
  validateWeeklyMutation,
  validateMutatorCatalog,
} from '@scnexus/app-shared/mutations/contracts'
import type { MutationRegion, MutationLanguage } from '@scnexus/app-shared/mutations/contracts'
export * from '@scnexus/app-shared/mutations/contracts'

export const apiWeeklyMutation = (
  region: MutationRegion = 'CN',
  selectedLanguage: MutationLanguage = 'zhCN',
) => {
  if (!mutationRegions.includes(region) || !mutationLanguages.includes(selectedLanguage))
    return Promise.reject(new Error('Invalid selection'))
  return apiRequest(
    '/sc2/coop/weekly-mutations/current',
    (value) => validateWeeklyMutation(value, region, selectedLanguage),
    undefined,
    'GET',
    undefined,
    { region, language: selectedLanguage },
  )
}
export const apiMutatorCatalog = (selectedLanguage: MutationLanguage = 'zhCN') => {
  if (!mutationLanguages.includes(selectedLanguage))
    return Promise.reject(new Error('Invalid selection'))
  return apiRequest(
    '/sc2/coop/mutators',
    (value) => validateMutatorCatalog(value, selectedLanguage),
    undefined,
    'GET',
    undefined,
    { language: selectedLanguage },
  )
}
