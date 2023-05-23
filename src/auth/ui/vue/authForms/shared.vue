<script lang="ts">
import { CodeCatalystBuilderIdState, CodeWhispererBuilderIdState } from './manageBuilderId.vue'
import { CredentialsState } from './manageCredentials.vue'
import { CodeWhispererIdentityCenterState } from './manageIdentityCenter.vue'
import AuthFormId from './types.vue'

/**
 * The state instance of all auth forms
 */
const authFormsState: Readonly<Record<AuthFormId, any>> = {
    CREDENTIALS: new CredentialsState() as CredentialsState,
    BUILDER_ID_CODE_WHISPERER: new CodeWhispererBuilderIdState(),
    BUILDER_ID_CODE_CATALYST: new CodeCatalystBuilderIdState(),
    IDENTITY_CENTER_CODE_WHISPERER: new CodeWhispererIdentityCenterState(),
} as const

export interface AuthStatus {
    /**
     * Returns true if the auth is successfully connected.
     */
    isAuthConnected(): Promise<boolean>
}

export default authFormsState
</script>
