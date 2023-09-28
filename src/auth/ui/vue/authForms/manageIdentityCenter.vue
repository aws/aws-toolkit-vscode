<template>
    <div class="auth-form container-background border-common" id="identity-center-form">
        <div v-if="checkIfConnected">
            <FormTitle :isConnected="isConnected"
                >IAM Identity Center&nbsp;<a
                    class="icon icon-lg icon-vscode-info"
                    href="https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/sso-credentials.html"
                    v-on:click="emitUiClick('auth_infoIAMIdentityCenter')"
                ></a
            ></FormTitle>
            <div v-if="!isConnected" class="sub-text-color">Successor to AWS Single Sign-on</div>
        </div>
        <div v-else>
            <!-- In this scenario we do not care about the active IC connection -->
            <FormTitle :isConnected="false"
                >IAM Identity Center&nbsp;<a
                    class="icon icon-lg icon-vscode-info"
                    href="https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/sso-credentials.html"
                    v-on:click="emitUiClick('auth_infoIAMIdentityCenter')"
                ></a
            ></FormTitle>
            <div style="color: var(--vscode-descriptionForeground)">Successor to AWS Single Sign-on</div>
        </div>

        <div v-if="stage === 'START'">
            <div class="form-section">
                <label class="input-title">Start URL</label>
                <label class="small-description">URL for your organization, provided by an admin or help desk.</label>
                <input v-model="data.startUrl" type="text" :data-invalid="!!errors.startUrl" />
                <div class="small-description error-text">{{ errors.startUrl }}</div>
            </div>

            <div class="form-section">
                <label class="input-title">Region</label>
                <label class="small-description">AWS Region that hosts Identity directory</label>
                <div v-on:click="getRegion()" style="display: flex; flex-direction: row; gap: 10px; cursor: pointer">
                    <div class="icon icon-lg icon-vscode-edit edit-icon"></div>
                    <div class="text-link-color" style="width: 100%">
                        {{ data.region ? data.region : 'Select a region...' }}
                    </div>
                </div>
                <div class="small-description error-text">{{ errors.region }}</div>
            </div>

            <div class="form-section">
                <button v-on:click="signin()">Sign in</button>
                <div class="small-description error-text">{{ errors.submit }}</div>
            </div>
        </div>

        <div v-if="stage === 'WAITING_ON_USER'">
            <div class="form-section">
                <div>Follow instructions...</div>
            </div>
        </div>

        <div v-if="stage === 'CONNECTED'">
            <div class="form-section">
                <div v-on:click="signout()" class="text-link-color" style="cursor: pointer">Sign out</div>
            </div>

            <div class="form-section">
                <button v-on:click="showView()">Open {{ authName }} in Toolkit</button>
            </div>
        </div>
    </div>
</template>
<script lang="ts">
import { PropType, defineComponent } from 'vue'
import BaseAuthForm, { ConnectionUpdateCause } from './baseAuth.vue'
import FormTitle from './formTitle.vue'
import { WebviewClientFactory } from '../../../../webviews/client'
import { AuthUiClick, AuthWebview } from '../show'
import { AuthFormId } from './types'
import { Region } from '../../../../shared/regions/endpoints'
import { AuthError } from '../types'
import { FeatureId } from '../../../../shared/telemetry/telemetry.gen'
import { AuthForm } from './shared.vue'

const client = WebviewClientFactory.create<AuthWebview>()

export type IdentityCenterStage = 'START' | 'WAITING_ON_USER' | 'CONNECTED'

export default defineComponent({
    name: 'IdentityCenterForm',
    extends: BaseAuthForm,
    components: { FormTitle },
    props: {
        state: {
            type: Object as PropType<BaseIdentityCenterState>,
            required: true,
        },
        checkIfConnected: {
            type: Boolean,
            default: true,
            // In some scenarios we want to show the form and allow setup,
            // but not care about any current identity center auth connections
            // and if they are connected or not.
        },
        /** If we don't care about the start url already existing locally */
        allowExistingStartUrl: {
            type: Boolean,
            default: false,
        },
    },
    data() {
        return {
            data: {
                startUrl: '',
                region: '' as Region['id'],
            },
            errors: {
                startUrl: '',
                region: '',
                submit: '',
            },
            isConnected: false,

            stage: 'START' as IdentityCenterStage,

            authName: this.state.name,
        }
    },

    async created() {
        // Populate form if data already exists (triggers 'watch' functions)
        this.data.startUrl = this.state.getValue('startUrl')
        this.data.region = this.state.getValue('region')

        await this.update('created')
    },
    computed: {},
    methods: {
        async signin(): Promise<void> {
            await client.startAuthFormInteraction(this.state.featureType, 'iamIdentityCenter')

            // Return without actually submitting if the form has errors before submitting
            this.updateEmptyFieldErrors()
            const fieldsWithError = this.processFieldsWithError()
            // If there is an error in the submission field from a previous attempt we want to allow them to try submitting again
            // without needing to update the form. There are cases where they may not need to update the form (eg: cancelled manually)
            // and should be able to submit again
            const submitErrorExcluded = fieldsWithError.filter(field => field !== 'submit')
            if (submitErrorExcluded.length > 0) {
                client.failedAuthAttempt({
                    authType: 'iamIdentityCenter',
                    featureType: this.state.featureType,
                    reason: 'fieldHasError',
                    invalidInputFields: fieldsWithError,
                })
                return
            }

            this.stage = 'WAITING_ON_USER'
            const authError = await this.state.startIdentityCenterSetup()

            if (authError) {
                this.errors.submit = authError.text
                const fieldsWithError = this.processFieldsWithError()
                // We do not run update() when there is a submission error
                // so we do not trigger a full re-render, instead
                // only updating this form
                this.stage = await this.state.stage()

                client.failedAuthAttempt({
                    authType: 'iamIdentityCenter',
                    featureType: this.state.featureType,
                    reason: authError.id,
                    invalidInputFields: fieldsWithError,
                })
            } else {
                client.successfulAuthAttempt({
                    featureType: this.state.featureType,
                    authType: 'iamIdentityCenter',
                })
                await this.update('signIn')
            }
        },
        async signout(): Promise<void> {
            await this.state.signout()
            client.emitUiClick(this.state.uiClickSignout)
            this.update('signOut')
        },
        async update(cause?: ConnectionUpdateCause) {
            this.stage = await this.state.stage()
            const actualIsConnected = await this.state.isAuthConnected()
            this.isConnected = this.checkIfConnected ? actualIsConnected : false
            this.emitAuthConnectionUpdated({ id: this.state.id, isConnected: actualIsConnected, cause })
        },
        async getRegion() {
            client.startAuthFormInteraction(this.state.featureType, 'iamIdentityCenter')
            const region = await this.state.getRegion()
            if (!region) {
                return
            }
            this.errors.region = ''
            this.data.region = region.id
        },
        async updateData(key: IdentityCenterKey, value: string) {
            this.errors.submit = '' // If previous submission error, we clear it when user starts typing
            this.state.setValue(key, value)
            await this.updateError(key)
        },
        async updateError(key: IdentityCenterKey) {
            if (key === 'startUrl') {
                this.errors.startUrl = await this.state.getStartUrlError(this.allowExistingStartUrl)
            }
            this.processFieldsWithError()
        },
        updateEmptyFieldErrors() {
            const cannotBeEmpty = 'Cannot be empty.'
            if (!this.data.startUrl) {
                this.errors.startUrl = cannotBeEmpty
            }
            if (!this.data.region) {
                this.errors.region = 'Select a region.'
            }
        },
        /** This is run whenever errors have updated, it keeps the backend up to date about the latest errors */
        processFieldsWithError(): (keyof typeof this.errors)[] {
            const fieldsWithError = Object.keys(this.errors).filter(key => this.errors[key as keyof typeof this.errors])
            client.setInvalidInputFields(fieldsWithError)
            return fieldsWithError as (keyof typeof this.errors)[]
        },
        showView() {
            this.state.showView()
            client.emitUiClick(this.state.uiClickOpenId)
        },
    },
    watch: {
        'data.startUrl'(value: string) {
            if (value) {
                // Edge Case:
                // Since we CAN allow subsequent identity centers to be added,
                // we will automatically wipe the form values after success.
                // That triggers this function, but we only want to
                // indicate a new form interaction if the user adds text themselves.
                client.startAuthFormInteraction(this.state.featureType, 'iamIdentityCenter')
            }
            this.updateData('startUrl', value)
        },
        'data.region'(value: string) {
            this.updateData('region', value)
        },
    },
})

type IdentityCenterData = { startUrl: string; region: Region['id'] }
type IdentityCenterKey = keyof IdentityCenterData

/**
 * Manages the state of Builder ID.
 */
abstract class BaseIdentityCenterState implements AuthForm {
    protected _data: IdentityCenterData
    protected _stage: IdentityCenterStage = 'START'

    constructor() {
        this._data = BaseIdentityCenterState.initialData()
    }

    abstract get id(): AuthFormId
    abstract get name(): string
    abstract get uiClickOpenId(): AuthUiClick
    abstract get uiClickSignout(): AuthUiClick
    abstract get featureType(): FeatureId
    protected abstract _startIdentityCenterSetup(): Promise<AuthError | undefined>
    abstract isAuthConnected(): Promise<boolean>
    abstract showView(): Promise<void>
    abstract signout(): Promise<void>

    setValue(key: IdentityCenterKey, value: string) {
        this._data[key] = value
    }

    getValue(key: IdentityCenterKey): string {
        return this._data[key]
    }

    /**
     * Runs the Identity Center setup.
     *
     * @returns An error message if it exist, otherwise empty string if no error.
     */
    async startIdentityCenterSetup(): Promise<AuthError | undefined> {
        this._stage = 'WAITING_ON_USER'
        const error = await this._startIdentityCenterSetup()

        // Successful submission, so we can clear
        // old data.
        if (!error) {
            this._data = BaseIdentityCenterState.initialData()
        }
        return error
    }

    async stage(): Promise<IdentityCenterStage> {
        const isAuthConnected = await this.isAuthConnected()
        this._stage = isAuthConnected ? 'CONNECTED' : 'START'
        return this._stage
    }

    async getRegion(): Promise<Region | undefined> {
        return client.getIdentityCenterRegion()
    }

    async getStartUrlError(canUrlExist: boolean) {
        const error = await client.getSsoUrlError(this._data.startUrl, canUrlExist)
        return error ?? ''
    }

    protected async getSubmittableDataOrThrow(): Promise<IdentityCenterData> {
        return this._data as IdentityCenterData
    }

    private static initialData(): IdentityCenterData {
        return {
            startUrl: '',
            region: '',
        }
    }
}

export class CodeWhispererIdentityCenterState extends BaseIdentityCenterState {
    override get id(): AuthFormId {
        return 'identityCenterCodeWhisperer'
    }

    override get name(): string {
        return 'CodeWhisperer'
    }

    override get uiClickOpenId(): AuthUiClick {
        return 'auth_openCodeWhisperer'
    }

    override get uiClickSignout(): AuthUiClick {
        return 'auth_codewhisperer_signoutIdentityCenter'
    }

    override get featureType(): FeatureId {
        return 'codewhisperer'
    }

    protected override async _startIdentityCenterSetup(): Promise<AuthError | undefined> {
        const data = await this.getSubmittableDataOrThrow()
        return client.startCWIdentityCenterSetup(data.startUrl, data.region)
    }

    override async isAuthConnected(): Promise<boolean> {
        return client.isCodeWhispererIdentityCenterConnected()
    }

    override async showView(): Promise<void> {
        client.showCodeWhispererNode()
    }

    override signout(): Promise<void> {
        return client.signoutCWIdentityCenter()
    }
}

/**
 * In the context of the Explorer, an Identity Center connection
 * is not required to be active. This is due to us only needing
 * the connection to exist so we can grab Credentials from it.
 *
 * With this in mind, certain methods in this class don't follow
 * the typical connection flow.
 */
export class ExplorerIdentityCenterState extends BaseIdentityCenterState {
    override get id(): AuthFormId {
        return 'identityCenterExplorer'
    }

    override get name(): string {
        return 'Resource Explorer'
    }

    override get uiClickOpenId(): AuthUiClick {
        return 'auth_openAWSExplorer'
    }

    override get uiClickSignout(): AuthUiClick {
        return 'auth_explorer_signoutIdentityCenter'
    }

    override get featureType(): FeatureId {
        return 'awsExplorer'
    }

    override async stage(): Promise<IdentityCenterStage> {
        // We always want to allow the user to add a new connection
        // for this context, so we always keep it as the start
        return 'START'
    }

    protected override async _startIdentityCenterSetup(): Promise<AuthError | undefined> {
        const data = await this.getSubmittableDataOrThrow()
        return client.createIdentityCenterConnection(data.startUrl, data.region)
    }

    override async isAuthConnected(): Promise<boolean> {
        return client.isIdentityCenterExists()
    }

    override async showView(): Promise<void> {
        client.showResourceExplorer()
    }

    override signout(): Promise<void> {
        throw new Error('Explorer Identity Center should not use "signout functionality')
    }
}
</script>
<style>
@import './sharedAuthForms.css';
@import '../shared.css';

#identity-center-form {
    width: 300px;
    height: fit-content;
}
</style>
