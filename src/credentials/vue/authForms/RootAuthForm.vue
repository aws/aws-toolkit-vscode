<script lang="ts">
import { CredentialsState } from './CredentialsForm.vue'

export interface AuthStatus {
    /**
     * Returns true if the auth is successfully connected.
     */
    isAuthConnected(): Promise<boolean>
}

const authFormsState = {
    CREDENTIALS_FORM_STATE: new CredentialsState(),
} as const

export default authFormsState
</script>
