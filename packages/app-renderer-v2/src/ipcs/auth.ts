import type {
  AuthLoginInput,
  AuthRegisterInput,
  AuthFactorInput,
  AuthChallengeInput,
  AuthResetInput,
  AuthSnapshot,
} from '@scnexus/app-shared/types/auth.type'
import { ipcDesktop, ipcRequest, ipcSnapshot, ipcSubscription } from './internal/ipc-common'

export const ipcAuthGetSnapshot = () => ipcRequest(() => ipcDesktop().auth.getSnapshot())
export const ipcAuthLogin = (input: AuthLoginInput) =>
  ipcRequest(() => ipcDesktop().auth.login(ipcSnapshot(input)))
export const ipcAuthRegister = (input: AuthRegisterInput) =>
  ipcRequest(() => ipcDesktop().auth.register(ipcSnapshot(input)))
export const ipcAuthCompleteMfa = (input: AuthFactorInput) =>
  ipcRequest(() => ipcDesktop().auth.completeMfa(ipcSnapshot(input)))
export const ipcAuthRequestChallenge = (input: AuthChallengeInput) =>
  ipcRequest(() => ipcDesktop().auth.requestChallenge(ipcSnapshot(input)))
export const ipcAuthResetPassword = (input: AuthResetInput) =>
  ipcRequest(() => ipcDesktop().auth.resetPassword(ipcSnapshot(input)))
export const ipcAuthRefresh = () => ipcRequest(() => ipcDesktop().auth.refresh())
export const ipcAuthLogout = () => ipcRequest(() => ipcDesktop().auth.logout())
export const ipcAuthOnChanged = (listener: (snapshot: AuthSnapshot) => void) =>
  ipcSubscription((callback) => ipcDesktop().auth.onChanged(callback), listener)
