export const aiUsageFields = [
  'aiAssistedDevelopment',
  'aiGeneratedArt',
  'aiGeneratedVoice',
] as const
export type AiUsage = Partial<Record<(typeof aiUsageFields)[number], boolean | null>>
