<script lang="ts">
import { CredentialsState } from './manageCredentials.vue'
import authForms from './types.vue'

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
