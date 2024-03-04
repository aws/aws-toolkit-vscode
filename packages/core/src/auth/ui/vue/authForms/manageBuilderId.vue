<template>
    <div v-bind:class="[disabled ? 'disabled-form' : '']" class="auth-container">
        <template v-if="stage === 'START'">
            <div class="auth-container-section">
                <button v-on:click="startSignIn()">{{ submitButtonText }}</button>
                <div class="form-description-color input-description-small error-text">{{ error }}</div>
            </div>
        </template>

        <template v-if="stage === 'WAITING_ON_USER'">
            <div class="auth-container-section">
                <button disabled>Follow instructions...</button>
            </div>
        </template>

        <template v-if="stage === 'CONNECTED'">
            <FormTitle>AWS Builder ID</FormTitle>

            <div class="auth-container-section">
                <div v-on:click="signout()" class="text-link-color" style="cursor: pointer">Sign out</div>
            </div>
        </template>
    </div>
</template>
<script lang="ts">
import { PropType, defineComponent } from 'vue'
import BaseAuthForm, { ConnectionUpdateCause } from './baseAuth.vue'
import FormTitle from './formTitle.vue'
import { AuthUiClick, AuthWebview } from '../show'
import { AuthFormId } from './types'
import { WebviewClientFactory } from '../../../../webviews/client'
import { AuthError } from '../types'
import { FeatureId } from '../../../../shared/telemetry/telemetry.gen'
import { AuthForm } from './shared.vue'
import { CredentialSourceId } from '../../../../shared/telemetry/telemetry.gen'

const client = WebviewClientFactory.create<AuthWebview>()

/** Where the user is currently in the builder id setup process */
type BuilderIdStage = 'START' | 'WAITING_ON_USER' | 'CONNECTED'

export default defineComponent({
    name: 'CredentialsForm',
    extends: BaseAuthForm,
    components: { FormTitle },
    props: {
        state: {
            type: Object as PropType<BaseBuilderIdState>,
            required: true,
        },
        disabled: {
            type: Boolean,
            default: false,
        },
    },
    data() {
        return {
            stage: 'START' as BuilderIdStage,
            isConnected: false,
            builderIdCode: '',
            name: this.state.name,
            error: '' as string,
            signUpUrl: this.state.getSignUpUrl(),
            submitButtonText: '' as string,
            description: this.state.getDescription(),
        }
    },
    async created() {
        await this.emitUpdate('created')
    },
    methods: {
        async startSignIn() {
            await this.state.startAuthFormInteraction()

            // update UI to show a pending state
            this.stage = 'WAITING_ON_USER'

            const wasSuccessful = await this.state.startBuilderIdSetup()
            if (wasSuccessful) {
                await this.emitUpdate('signIn')
            } else {
                await this.updateForm()
            }
        },
        /** Updates the content of the form using the state data */
        async updateForm() {
            this.error = this.state.error
            this.stage = await this.state.stage()
            this.submitButtonText = await this.state.getSubmitButtonText()
            this.isConnected = await this.state.isAuthConnected()
        },
        async emitUpdate(cause?: ConnectionUpdateCause) {
            await this.updateForm()
            this.emitAuthConnectionUpdated({ id: this.state.id, isConnected: this.isConnected, cause })
        },
        async signout() {
            await this.state.signout()
            this.emitUpdate('signOut')
        },
        showNodeInView() {
            this.state.showNodeInView()
        },
    },
})

/**
 * Manages the state of Builder ID.
 */
abstract class BaseBuilderIdState implements AuthForm {
    protected _stage: BuilderIdStage = 'START'
    #error: string = ''

    abstract get name(): string
    abstract get id(): AuthFormId
    abstract get uiClickOpenId(): AuthUiClick
    abstract get uiClickSignout(): AuthUiClick
    abstract get featureType(): FeatureId
    protected abstract _startBuilderIdSetup(): Promise<AuthError | undefined>
    abstract isAuthConnected(): Promise<boolean>
    abstract _showNodeInView(): Promise<void>
    abstract isConnectionExists(): Promise<boolean>

    /**
     * Starts the Builder ID setup.
     *
     * Returns true if was successful.
     */
    async startBuilderIdSetup(): Promise<boolean> {
        this.#error = ''

        const authError = await this._startBuilderIdSetup()

        if (authError) {
            this.#error = authError.text
            client.failedAuthAttempt(this.id, {
                reason: authError.id,
            })
        } else {
            this.#error = ''
            client.successfulAuthAttempt(this.id)
        }

        return authError === undefined
    }

    async stage(): Promise<BuilderIdStage> {
        const isAuthConnected = await this.isAuthConnected()
        this._stage = isAuthConnected ? 'CONNECTED' : 'START'
        return this._stage
    }

    async signout(): Promise<void> {
        await client.signoutBuilderId()
        client.emitUiClick(this.uiClickSignout)
    }

    get authType(): CredentialSourceId {
        return 'awsId'
    }

    get error(): string {
        return this.#error
    }

    /**
     * In the scenario a Builder ID is already connected,
     * we want to change the submit button text for all unconnected
     * Builder IDs to something else since they are not techincally
     * signing in again, but instead adding scopes.
     */
    async getSubmitButtonText(): Promise<string> {
        if (!(await this.anyBuilderIdConnected())) {
            return this.name === 'CodeWhisperer'
                ? 'Use for free, no AWS Account required'
                : 'Use for free with AWS Builder ID'
        } else {
            return `Connect AWS Builder ID with ${this.name}`
        }
    }

    /**
     * Returns true if any Builder Id is connected
     */
    private async anyBuilderIdConnected(): Promise<boolean> {
        const results = await Promise.all([
            CodeWhispererBuilderIdState.instance.isAuthConnected(),
            CodeCatalystBuilderIdState.instance.isAuthConnected(),
        ])
        return results.some(isConnected => isConnected)
    }

    getSignUpUrl(): string {
        return 'https://docs.aws.amazon.com/signin/latest/userguide/sign-in-aws_builder_id.html'
    }

    getDescription(): string {
        return 'With AWS Builder ID, sign in for free without an AWS account.'
    }

    startAuthFormInteraction() {
        return client.startAuthFormInteraction(this.featureType, this.authType)
    }

    showNodeInView() {
        this._showNodeInView()
        client.emitUiClick(this.uiClickOpenId)
    }
}

export class CodeWhispererBuilderIdState extends BaseBuilderIdState {
    override get name(): string {
        return 'CodeWhisperer'
    }

    override get id(): AuthFormId {
        return 'builderIdCodeWhisperer'
    }

    override get uiClickOpenId(): AuthUiClick {
        return 'auth_openCodeWhisperer'
    }

    override get uiClickSignout(): AuthUiClick {
        return 'auth_codewhisperer_signoutBuilderId'
    }

    override get featureType(): FeatureId {
        return 'codewhisperer'
    }

    override isAuthConnected(): Promise<boolean> {
        return client.isCodeWhispererBuilderIdConnected()
    }

    override isConnectionExists(): Promise<boolean> {
        return client.hasBuilderId('codewhisperer')
    }

    protected override _startBuilderIdSetup(): Promise<AuthError | undefined> {
        return client.startCodeWhispererBuilderIdSetup()
    }

    override _showNodeInView(): Promise<void> {
        return client.showCodeWhispererView()
    }

    override getSignUpUrl(): string {
        return 'https://docs.aws.amazon.com/codewhisperer/latest/userguide/whisper-setup-indv-devs.html'
    }

    private constructor() {
        super()
    }
    static #instance: CodeWhispererBuilderIdState | undefined
    static get instance(): CodeWhispererBuilderIdState {
        return (this.#instance ??= new CodeWhispererBuilderIdState())
    }
}

export class CodeCatalystBuilderIdState extends BaseBuilderIdState {
    override get name(): string {
        return 'CodeCatalyst'
    }

    override get id(): AuthFormId {
        return 'builderIdCodeCatalyst'
    }

    override get uiClickOpenId(): AuthUiClick {
        return 'auth_openCodeCatalyst'
    }

    override get uiClickSignout(): AuthUiClick {
        return 'auth_codecatalyst_signoutBuilderId'
    }

    override get featureType(): FeatureId {
        return 'codecatalyst'
    }

    override isAuthConnected(): Promise<boolean> {
        return client.isCodeCatalystBuilderIdConnected()
    }

    override isConnectionExists(): Promise<boolean> {
        return client.hasBuilderId('codecatalyst')
    }

    protected override _startBuilderIdSetup(): Promise<AuthError | undefined> {
        return client.startCodeCatalystBuilderIdSetup()
    }

    override _showNodeInView(): Promise<void> {
        return client.showCodeCatalystNode()
    }

    override getDescription(): string {
        return 'You must have an existing CodeCatalyst Space connected to your AWS Builder ID.'
    }

    override getSignUpUrl(): string {
        return 'https://aws.amazon.com/codecatalyst/'
    }

    private constructor() {
        super()
    }
    static #instance: CodeCatalystBuilderIdState | undefined
    static get instance(): CodeCatalystBuilderIdState {
        return (this.#instance ??= new CodeCatalystBuilderIdState())
    }
}
</script>
<style>
@import './sharedAuthForms.css';
@import '../shared.css';
</style>
