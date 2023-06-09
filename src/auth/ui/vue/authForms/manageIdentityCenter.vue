<template>
    <div class="auth-form container-background border-common" id="identity-center-form">
        <div v-show="canShowAll">
            <FormTitle :isConnected="isConnected">IAM Identity Center</FormTitle>
            <div v-if="!isConnected">Successor to AWS Single Sign-on</div>

            <div v-if="stage === 'START'">
                <div class="form-section">
                    If your organization has provided you a CodeWhisperer license, sign in with your Identity Center
                    access portal login page.
                    <a>Read more.</a>
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
            </div>
        </div>
    </div>
</template>
<script lang="ts">
import { PropType, defineComponent } from 'vue'
import BaseAuthForm from './baseAuth.vue'
import FormTitle from './formTitle.vue'
import { WebviewClientFactory } from '../../../../webviews/client'
import { AuthWebview } from '../show'
import { AuthStatus } from './shared.vue'
import { AuthFormId, authForms } from './types.vue'
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

            canShowAll: false,
        }
    },

    async created() {
        // Populate form if data already exists (triggers 'watch' functions)
        this.data.startUrl = this.state.getValue('startUrl')
        this.data.region = this.state.getValue('region')

        await this.update()
        this.canShowAll = true
    },
    computed: {},
    methods: {
        async signin(): Promise<void> {
            await this.state.startIdentityCenterSetup()
        },
        async signout(): Promise<void> {
            await this.state.signout()
        },
        async update() {
            this.stage = await this.state.stage()
            this.isConnected = await this.state.isAuthConnected()
            this.emitAuthConnectionUpdated(this.state.id)
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
    protected abstract _startIdentityCenterSetup(): Promise<void>
    abstract isAuthConnected(): Promise<boolean>

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

    async signout(): Promise<void> {
        return client.signoutIdentityCenter()
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
        return authForms.IDENTITY_CENTER_CODE_WHISPERER
    }

    protected override async _startIdentityCenterSetup(): Promise<void> {
        const data = await this.getSubmittableDataOrThrow()
        return client.startIdentityCenterSetup(data.startUrl, data.region)
    }

    override async isAuthConnected(): Promise<boolean> {
        return client.isCodeWhispererIdentityCenterConnected()
    }
}
</script>
<style>
@import './sharedAuthForms.css';
@import '../shared.css';

#identity-center-form {
    width: 250px;
    height: fit-content;
}
</style>
