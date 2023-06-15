<template>
    <div class="auth-form container-background border-common" id="identity-center-form">
        <div v-if="checkIfConnected">
            <FormTitle :isConnected="isConnected">IAM Identity Center</FormTitle>
            <div v-if="!isConnected">Successor to AWS Single Sign-on</div>
        </div>
        <div v-else>
            <!-- In this scenario we do not care about the active IC connection -->
            <FormTitle :isConnected="false">IAM Identity Center</FormTitle>
            <div>Successor to AWS Single Sign-on</div>
        </div>

        <div v-if="stage === 'START'">
            <div class="form-section">
                <a href="https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/sso-credentials.html"
                    >Learn more about IAM Identity Center.</a
                >
            </div>

            <div class="form-section">
                <label class="input-title">Start URL</label>
                <label class="small-description">The Start URL</label>
                <input v-model="data.startUrl" type="text" :data-invalid="!!errors.startUrl" />
                <div class="small-description error-text">{{ errors.startUrl }}</div>
            </div>

            <div class="form-section">
                <label class="input-title">Region</label>
                <label class="small-description">The Region</label>

                <select v-on:click="getRegion()">
                    <option v-if="!!data.region" :selected="true">{{ data.region }}</option>
                </select>
            </div>

            <div class="form-section">
                <button v-on:click="signin()" :disabled="!canSubmit">Sign up or Sign in</button>
            </div>
        </div>

        <div v-if="stage === 'WAITING_ON_USER'">
            <div class="form-section">
                <div>Follow instructions...</div>
            </div>
        </div>

        <div v-if="stage === 'CONNECTED'">
            <div class="form-section">
                <div v-on:click="signout()" style="cursor: pointer; color: #75beff">Sign out</div>
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
import { AuthWebview } from '../show'
import { AuthStatus } from './shared.vue'
import { AuthFormId } from './types'
import { Region } from '../../../../shared/regions/endpoints'

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
    },
    data() {
        return {
            data: {
                startUrl: '',
                region: '' as Region['id'],
            },
            errors: {
                startUrl: '',
            },
            canSubmit: false,
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
            this.stage = 'WAITING_ON_USER'
            await this.state.startIdentityCenterSetup()
            await this.update('signIn')
        },
        async signout(): Promise<void> {
            await this.state.signout()
            this.update('signOut')
        },
        async update(cause?: ConnectionUpdateCause) {
            this.stage = await this.state.stage()
            this.isConnected = this.checkIfConnected ? await this.state.isAuthConnected() : false
            this.emitAuthConnectionUpdated({ id: this.state.id, isConnected: this.isConnected, cause })
        },
        async getRegion() {
            const region = await this.state.getRegion()
            this.data.region = region.id
        },
        async updateData(key: IdentityCenterKey, value: string) {
            this.state.setValue(key, value)

            if (key === 'startUrl') {
                this.errors.startUrl = await this.state.getStartUrlError()
            }

            this.canSubmit = await this.state.canSubmit()
        },
        showView() {
            this.state.showView()
        },
    },
    watch: {
        'data.startUrl'(value: string) {
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
abstract class BaseIdentityCenterState implements AuthStatus {
    protected _data: IdentityCenterData
    protected _stage: IdentityCenterStage = 'START'

    constructor() {
        this._data = {
            startUrl: '',
            region: '',
        }
    }

    abstract get id(): AuthFormId
    abstract get name(): string
    protected abstract _startIdentityCenterSetup(): Promise<void>
    abstract isAuthConnected(): Promise<boolean>
    abstract showView(): Promise<void>
    abstract signout(): Promise<void>

    setValue(key: IdentityCenterKey, value: string) {
        this._data[key] = value
    }

    getValue(key: IdentityCenterKey): string {
        return this._data[key]
    }

    async startIdentityCenterSetup(): Promise<void> {
        this._stage = 'WAITING_ON_USER'
        return this._startIdentityCenterSetup()
    }

    async stage(): Promise<IdentityCenterStage> {
        const isAuthConnected = await this.isAuthConnected()
        this._stage = isAuthConnected ? 'CONNECTED' : 'START'
        return this._stage
    }

    async getRegion(): Promise<Region> {
        return client.getIdentityCenterRegion()
    }

    async getStartUrlError() {
        const error = await client.getSsoUrlError(this._data.startUrl)
        return error ?? ''
    }

    async canSubmit() {
        const allFieldsFilled = Object.values(this._data).every(val => !!val)
        const hasErrors = await this.getStartUrlError()
        return allFieldsFilled && !hasErrors
    }

    protected async getSubmittableDataOrThrow(): Promise<IdentityCenterData> {
        return this._data as IdentityCenterData
    }
}

export class CodeWhispererIdentityCenterState extends BaseIdentityCenterState {
    override get id(): AuthFormId {
        return 'identityCenterCodeWhisperer'
    }

    override get name(): string {
        return 'CodeWhisperer'
    }

    protected override async _startIdentityCenterSetup(): Promise<void> {
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

    override async stage(): Promise<IdentityCenterStage> {
        // We always want to allow the user to add a new connection
        // for this context, so we always keep it as the start
        return 'START'
    }

    protected override async _startIdentityCenterSetup(): Promise<void> {
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
    width: 280px;
    height: fit-content;
}
</style>
