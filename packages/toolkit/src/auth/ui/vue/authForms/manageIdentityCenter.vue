<template>
    <div class="auth-container">
        <div v-if="stage === 'START'">
            <button v-on:click="toggleInputFormShown" :class="isLowPriority ? lowPriorityButton : ''">
                <div :class="collapsibleClass" class="auth-container-icon"></div>
                {{ buttonText }}
            </button>

            <div v-if="isInputFormShown" class="auth-form-container">
                <div>
                    <label class="input-title">Start URL</label>
                    <label class="form-description-color input-description-small"
                        >URL for your organization, provided by an admin or help desk.</label
                    >
                    <input v-model="data.startUrl" type="text" :data-invalid="!!errors.startUrl" />
                    <div class="form-description-color input-description-small error-text">
                        {{ errors.startUrl }}
                    </div>
                </div>

                <div>
                    <label class="input-title">Region</label>
                    <label class="form-description-color input-description-small"
                        >AWS Region that hosts Identity directory</label
                    >
                    <div
                        v-on:click="selectRegion()"
                        style="display: flex; flex-direction: row; gap: 2%; cursor: pointer"
                    >
                        <div class="icon icon-lg icon-vscode-edit text-link-color"></div>
                        <div class="text-link-color" style="width: 100%">
                            {{ data.region ? data.region : 'Select a region...' }}
                        </div>
                    </div>
                    <div class="form-description-color input-description-small error-text">{{ errors.region }}</div>
                </div>

                <div>
                    <button v-on:click="signin()">Sign in</button>
                    <div class="form-description-color input-description-small error-text">{{ errors.submit }}</div>
                </div>
            </div>
        </div>

        <template v-if="stage === 'WAITING_ON_USER'">
            <button disabled>Follow instructions...</button>
        </template>

        <template v-if="stage === 'CONNECTED'">
            <FormTitle>IAM Identity Center</FormTitle>

            <div v-on:click="signout()" class="text-link-color" style="cursor: pointer">Sign out</div>
        </template>
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
import { AuthError, emptyFields, fieldHasError } from '../types'
import { FeatureId } from '../../../../shared/telemetry/telemetry.gen'
import { AuthForm } from './shared.vue'
import { CredentialSourceId } from '../../../../shared/telemetry/telemetry.gen'

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
        isLowPriority: {
            type: Boolean,
            default: true,
        },
    },
    data() {
        return {
            data: { ...this.state.data } as IdentityCenterData,
            errors: { ...this.state.errors } as IdentityCenterFormErrors,
            isConnected: false,

            stage: 'START' as IdentityCenterStage,

            authName: this.state.name,
            isInputFormShown: false,
            lowPriorityButton: 'low-priority-button',
            buttonText: '',
        }
    },

    async created() {
        // Populate form if data already exists (triggers 'watch' functions)
        this.data = this.state.data

        await this.emitUpdate('created')
    },
    computed: {
        collapsibleClass() {
            return this.isInputFormShown ? 'icon icon-vscode-chevron-down' : 'icon icon-vscode-chevron-right'
        },
    },
    methods: {
        setNewValue(key: IdentityCenterKey, value: string) {
            this.state.setValue(key, value, this.allowExistingStartUrl)
            this.errors = this.state.errors
        },
        async signin(): Promise<void> {
            const wasSuccess = await this.state.startIdentityCenterSetup(() => {
                this.stage = 'WAITING_ON_USER'
            })

            if (wasSuccess) {
                await this.emitUpdate('signIn')
            } else {
                // We do not run update() when there is a submission error
                // so we do not trigger a full re-render, instead
                // only updating this form
                this.updateForm()
            }
        },
        async updateForm() {
            this.stage = await this.state.stage()
            this.data = this.state.data
            this.errors = this.state.errors
            this.isConnected = await this.state.isAuthConnected()

            if (this.isConnected && !this.checkIfConnected) {
                this.buttonText = 'Add an IAM Identity Center profile'
            } else {
                this.buttonText =
                    this.authName === 'CodeWhisperer' ? 'Use Professional License' : 'Use Single Sign-on (SSO)'
            }
        },
        async emitUpdate(cause?: ConnectionUpdateCause) {
            await this.updateForm()
            this.emitAuthConnectionUpdated({
                id: this.state.id,
                isConnected: this.isConnected,
                cause,
            })
        },
        async selectRegion() {
            this.errors.submit = '' // clear old submit error
            const region = await this.state.selectRegion()
            if (region) {
                this.data.region = region.id
            }
        },
        async signout(): Promise<void> {
            await this.state.signout()
            this.emitUpdate('signOut')
        },
        showView() {
            this.state.showView()
        },
        toggleInputFormShown() {
            this.isInputFormShown = !this.isInputFormShown
        },
    },
    watch: {
        'data.startUrl'(value: string) {
            this.setNewValue('startUrl', value)
        },
        'data.region'(value: string) {
            this.setNewValue('region', value)
        },
    },
})

type IdentityCenterData = { startUrl: string; region: Region['id'] }
type IdentityCenterKey = keyof IdentityCenterData
type IdentityCenterFormErrors = IdentityCenterData & { submit: string }

/**
 * Manages the state of Builder ID.
 */
abstract class BaseIdentityCenterState implements AuthForm {
    protected _data: IdentityCenterData
    protected _stage: IdentityCenterStage = 'START'

    #errors: IdentityCenterErrors

    constructor() {
        this._data = BaseIdentityCenterState.initialData
        this.#errors = IdentityCenterErrors.instance
    }

    abstract get id(): AuthFormId
    abstract get name(): string
    abstract get uiClickOpenId(): AuthUiClick
    abstract get uiClickSignout(): AuthUiClick
    abstract get featureType(): FeatureId
    protected abstract _startIdentityCenterSetup(): Promise<AuthError | undefined>
    abstract isAuthConnected(): Promise<boolean>
    abstract _showView(): Promise<void>
    abstract _signout(): Promise<void>
    abstract isConnectionExists(): Promise<boolean>

    async setValue(key: IdentityCenterKey, value: string, allowExistingStartUrl: boolean) {
        this._data[key] = value

        this.#errors.setError('submit', '')
        if (key === 'startUrl') {
            if (value) {
                /**
                 * Edge case when we cleared the form it was being
                 * considered as a user interaction, but was not.
                 * Now we only consider it if there is content.
                 */
                await this.startAuthFormInteraction()
            }
            this.#errors.setError(key, await this.#errors.getStartUrlError(value, allowExistingStartUrl))
        }
        if (key === 'region' && value) {
            this._data.region = value
            this.#errors.setError('region', '')
        }
    }

    get data(): IdentityCenterData {
        return { ...this._data }
    }

    get errors(): IdentityCenterFormErrors {
        return this.#errors.getErrors()
    }

    get authType(): CredentialSourceId {
        return 'iamIdentityCenter'
    }

    /**
     * Runs the Identity Center setup.
     *
     * @param setWaitingStage sets the frontend ui to display 'waiting on user' since the identity
     *                        center setup is in progress.
     * @returns true if successfully setup
     */
    async startIdentityCenterSetup(setWaitingStage: () => void): Promise<boolean> {
        await this.startAuthFormInteraction()

        // Pre-submission error checks
        const hasEmptyFields = this.#errors.updateEmptyFieldErrors(this.data)
        // Do not consider errors under 'submit', otherwise it will block re-submission without updating the fields.
        const fieldsWithError = this.#errors.getFieldsWithErrors().filter(field => field !== 'submit')
        if (fieldsWithError.length > 0) {
            client.failedAuthAttempt(this.id, {
                reason: hasEmptyFields ? emptyFields : fieldHasError,
                invalidInputFields: fieldsWithError,
            })
            return false
        }

        setWaitingStage()

        // Submission error checks
        const authError = await this._startIdentityCenterSetup()

        if (authError) {
            this.#errors.setError('submit', authError.text)

            client.failedAuthAttempt(this.id, {
                reason: authError.id,
                invalidInputFields: this.#errors.getFieldsWithErrors(),
            })
        } else {
            client.successfulAuthAttempt(this.id)
            this.reset()
        }

        return authError === undefined
    }

    async stage(): Promise<IdentityCenterStage> {
        const isAuthConnected = await this.isAuthConnected()
        this._stage = isAuthConnected ? 'CONNECTED' : 'START'
        return this._stage
    }

    async selectRegion(): Promise<Region | undefined> {
        await this.startAuthFormInteraction()
        this.#errors.setError('submit', '')
        return client.getIdentityCenterRegion()
    }

    startAuthFormInteraction(): Promise<void> {
        return client.startAuthFormInteraction(this.featureType, this.authType)
    }

    private reset() {
        this._data = BaseIdentityCenterState.initialData
        this.#errors.reset()
    }

    private static get initialData(): IdentityCenterData {
        return {
            startUrl: '',
            region: '',
        }
    }

    showView(): void {
        client.emitUiClick(this.uiClickOpenId)
        this._showView()
    }

    async signout(): Promise<void> {
        client.emitUiClick(this.uiClickSignout)
        return this._signout()
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
        return client.startCWIdentityCenterSetup(this.data.startUrl, this.data.region)
    }

    override async isAuthConnected(): Promise<boolean> {
        return client.isCodeWhispererIdentityCenterConnected()
    }

    override isConnectionExists(): Promise<boolean> {
        return client.isCodeWhispererIdCExists()
    }

    override async _showView(): Promise<void> {
        return client.showCodeWhispererView()
    }

    override _signout(): Promise<void> {
        return client.signoutCWIdentityCenter()
    }
}

export class CodeCatalystIdentityCenterState extends BaseIdentityCenterState {
    override get id(): AuthFormId {
        return 'identityCenterCodeCatalyst'
    }

    override get name(): string {
        return 'CodeCatalyst'
    }

    override get uiClickOpenId(): AuthUiClick {
        return 'auth_openCodeCatalyst'
    }

    override get uiClickSignout(): AuthUiClick {
        return 'auth_codecatalyst_signoutIdentityCenter'
    }

    override get featureType(): FeatureId {
        return 'codecatalyst'
    }

    protected override async _startIdentityCenterSetup(): Promise<AuthError | undefined> {
        return client.startCodeCatalystIdentityCenterSetup(this.data.startUrl, this.data.region)
    }

    override async isAuthConnected(): Promise<boolean> {
        return client.isCodeCatalystIdentityCenterConnected()
    }

    override isConnectionExists(): Promise<boolean> {
        return client.isCodeCatalystIdCExists()
    }

    override _showView(): Promise<void> {
        return client.showCodeCatalystNode()
    }

    override _signout(): Promise<void> {
        return client.signoutCodeCatalystIdentityCenter()
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
        return client.createIdentityCenterConnection(this.data.startUrl, this.data.region)
    }

    override async isAuthConnected(): Promise<boolean> {
        return await client.isExplorerConnected('idc')
    }

    override isConnectionExists(): Promise<boolean> {
        return client.isIdentityCenterExists()
    }

    override async _showView(): Promise<void> {
        return client.showResourceExplorer()
    }

    override _signout(): Promise<void> {
        throw new Error('Explorer Identity Center should not use "signout functionality')
    }
}

class IdentityCenterErrors {
    private errors: IdentityCenterFormErrors

    getErrors(): IdentityCenterFormErrors {
        return { ...this.errors }
    }

    setError(key: keyof IdentityCenterFormErrors, value: string) {
        this.errors[key] = value
        this.setInvalidInputFields()
    }

    reset() {
        this.errors = IdentityCenterErrors.defaultErrors
        this.setInvalidInputFields()
    }

    updateEmptyFieldErrors(data: IdentityCenterData): boolean {
        const dataFieldKeys = Object.keys(data) as (keyof typeof data)[]
        const emptyFieldKeys = dataFieldKeys.filter(key => !data[key])

        emptyFieldKeys.forEach(fieldName => {
            this.setError(fieldName as keyof IdentityCenterData, 'Cannot be empty.')
        })

        return emptyFieldKeys.length > 0
    }

    async getStartUrlError(startUrl: string, canUrlExist: boolean) {
        const error = await client.getSsoUrlError(startUrl, canUrlExist)
        return error ?? ''
    }

    /** All fields that currently have an error */
    getFieldsWithErrors(): (keyof IdentityCenterFormErrors)[] {
        const errorKeys = Object.keys(this.errors) as (keyof IdentityCenterFormErrors)[]
        return errorKeys.filter(key => this.errors[key])
    }

    private setInvalidInputFields() {
        client.setInvalidInputFields(this.getFieldsWithErrors())
    }

    private static get defaultErrors(): IdentityCenterFormErrors {
        return {
            startUrl: '',
            region: '',
            submit: '',
        }
    }

    static #instance: IdentityCenterErrors
    static get instance(): IdentityCenterErrors {
        return (this.#instance ??= new IdentityCenterErrors())
    }
    private constructor() {
        this.errors = IdentityCenterErrors.defaultErrors
    }
}
</script>
<style>
@import '../shared.css';
@import './sharedAuthForms.css';
</style>
