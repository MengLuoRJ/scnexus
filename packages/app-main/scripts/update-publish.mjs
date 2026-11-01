export function desktopPublish(version, baseline = false) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-snapshot\.(0|[1-9]\d*))?$/.test(version)) {
    throw new Error('Desktop releases require a stable version or -snapshot.N prerelease')
  }
  if (baseline && version !== '0.1.0')
    throw new Error('Legacy baseline release must be exactly 0.1.0')
  const channel = version.includes('-snapshot.') ? 'snapshot' : 'stable'
  return [
    {
      provider: 'generic',
      url: baseline
        ? 'https://release.scnexus.net/release/'
        : `https://release.scnexus.net/desktop/${channel}/`,
      channel: 'latest',
      useMultipleRangeRequest: false,
    },
  ]
}
