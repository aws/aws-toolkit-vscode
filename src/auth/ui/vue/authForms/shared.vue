<script lang="ts">
import { CodeCatalystBuilderIdState, CodeWhispererBuilderIdState } from './manageBuilderId.vue'
import { CredentialsState } from './manageCredentials.vue'
import { CodeWhispererIdentityCenterState, ExplorerIdentityCenterState } from './manageIdentityCenter.vue'
import { AuthFormId } from './types'

/**
 * The state instance of all auth forms
 */
const authFormsState = {
    credentials: new CredentialsState() as CredentialsState,
    builderIdCodeWhisperer: CodeWhispererBuilderIdState.instance,
    builderIdCodeCatalyst: CodeCatalystBuilderIdState.instance,
    identityCenterCodeWhisperer: new CodeWhispererIdentityCenterState(),
    identityCenterExplorer: new ExplorerIdentityCenterState(),
} as const

export abstract class FeatureStatus {
    /** The auths that this feature uses */
    abstract getAuthForms(): AuthForm[]

    /**
     * The auth that is currently connected, enabling this feature
     */
    async getConnectedAuth(): Promise<AuthFormId | undefined> {
        for (const form of this.getAuthForms()) {
            if (await form.isAuthConnected()) {
                return form.id
            }
        }
    }

    /**
     * True if an auth is enabling this feature
     */
    async hasConnectedAuth(): Promise<boolean> {
        return !!(await this.getConnectedAuth())
    }
}

export interface AuthForm {
    /**
     * If the auth form is successfully connected
     */
    isAuthConnected(): Promise<boolean>

    /**
     * If a connection for this auth form exists, it does
     * not have to be active.
     */
    isConnectionExists(): Promise<boolean>

    get id(): AuthFormId
}

export default authFormsState
</script>
