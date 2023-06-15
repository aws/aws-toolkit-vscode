<script lang="ts">
import { CodeCatalystBuilderIdState, CodeWhispererBuilderIdState } from './manageBuilderId.vue'
import { CredentialsState } from './manageCredentials.vue'
import { CodeWhispererIdentityCenterState, ExplorerIdentityCenterState } from './manageIdentityCenter.vue'
import { AuthFormId } from './types'

/**
 * The state instance of all auth forms
 */
const authFormsState: Readonly<Record<AuthFormId, any>> = {
    credentials: new CredentialsState() as CredentialsState,
    builderIdCodeWhisperer: new CodeWhispererBuilderIdState(),
    builderIdCodeCatalyst: new CodeCatalystBuilderIdState(),
    identityCenterCodeWhisperer: new CodeWhispererIdentityCenterState(),
    identityCenterExplorer: new ExplorerIdentityCenterState()
} as const

export interface AuthStatus {
    /**
     * Returns true if the auth is successfully connected.
     */
    isAuthConnected(): Promise<boolean>
}

export default authFormsState
</script>
