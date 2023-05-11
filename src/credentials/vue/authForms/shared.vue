<script lang="ts">
import { CredentialsState } from './manageCredentials.vue'

export const authForms = {
    CREDENTIALS: 'CREDENTIALS',
} as const

export type AuthFormId = (typeof authForms)[keyof typeof authForms]

/**
 * The state instance of all auth forms
 */
const authFormsState = {
    [authForms.CREDENTIALS]: new CredentialsState(),
} as const

export interface AuthStatus {
    /**
     * Returns true if the auth is successfully connected.
     */
    isAuthConnected(): Promise<boolean>
}

export default authFormsState
</script>
