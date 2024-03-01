<script lang="ts">
import { CodeCatalystBuilderIdState, CodeWhispererBuilderIdState } from './manageBuilderId.vue'
import { CredentialsState } from './manageCredentials.vue'
import {
    CodeCatalystIdentityCenterState,
    CodeWhispererIdentityCenterState,
    ExplorerIdentityCenterState,
} from './manageIdentityCenter.vue'
import { AuthFormId } from './types'

export const AuthFormIds = {
    credentials: 'credentials',
    builderIdCodeWhisperer: 'builderIdCodeWhisperer',
    builderIdCodeCatalyst: 'builderIdCodeCatalyst',
    identityCenterCodeWhisperer: 'identityCenterCodeWhisperer',
    identityCenterCodeCatalyst: 'identityCenterCodeCatalyst',
    identityCenterExplorer: 'identityCenterExplorer',
    aggregateExplorer: 'aggregateExplorer',
} as const

/**
 * The state instance of all auth forms
 */
const authFormsState = {
    credentials: CredentialsState.instance,
    builderIdCodeWhisperer: CodeWhispererBuilderIdState.instance,
    builderIdCodeCatalyst: CodeCatalystBuilderIdState.instance,
    identityCenterCodeWhisperer: new CodeWhispererIdentityCenterState(),
    identityCenterCodeCatalyst: new CodeCatalystIdentityCenterState(),
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
     * Return true if the toolkit extension is aware of
     * a connection. It does not have to be actively used
     * for it to exist.
     */
    isConnectionExists(): Promise<boolean>

    get id(): AuthFormId
}

export default authFormsState
</script>
