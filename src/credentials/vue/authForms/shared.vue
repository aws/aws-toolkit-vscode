<script lang="ts">
import { CodeCatalystBuilderIdState, CodeWhispererBuilderIdState } from './manageBuilderId.vue'
import { CredentialsState } from './manageCredentials.vue'
import authForms from './types.vue'

/**
 * The state instance of all auth forms
 */
const authFormsState = {
    [authForms.CREDENTIALS]: new CredentialsState(),
    [authForms.BUILDER_ID_CODE_WHISPERER]: new CodeWhispererBuilderIdState(),
    [authForms.BUILDER_ID_CODE_CATALYST]: new CodeCatalystBuilderIdState(),
} as const

export interface AuthStatus {
    /**
     * Returns true if the auth is successfully connected.
     */
    isAuthConnected(): Promise<boolean>
}

export default authFormsState
</script>
