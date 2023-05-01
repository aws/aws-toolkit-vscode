<template>
    <div class="auth-form container-background border-common" id="credentials-form">
        <FormTitle :isConnected="isConnected">IAM Credentials</FormTitle>

        <div class="form-section">
            <label class="small-description">Credentials will be added to the appropriate `.aws/` files.</label>
            <div>
                <div class="icon icon-vscode-edit edit-icon"></div>
                Edit file directly
            </div>
        </div>

        <div class="form-section">
            <label class="input-title">Profile Name</label>
            <label class="small-description">The identifier for these credentials</label>
            <input v-model="profileName" type="text" :data-invalid="!!errors.profileName" />
            <div class="small-description error-text">{{ errors.profileName }}</div>
        </div>

        <div class="form-section">
            <label class="input-title">Access Key</label>
            <label class="small-description">The access key</label>
            <input v-model="accessKey" :data-invalid="!!errors.aws_access_key_id" type="text" />
            <div class="small-description error-text">{{ errors.aws_access_key_id }}</div>
        </div>

        <div class="form-section">
            <label class="input-title">Secret Key</label>
            <label class="small-description">The secret key</label>
            <input v-model="secretKey" type="text" :data-invalid="!!errors.aws_secret_access_key" />
            <div class="small-description error-text">{{ errors.aws_secret_access_key }}</div>
        </div>

        <div class="form-section">
            <button :disabled="!canSubmit" v-on:click="submitData()">Add Profile</button>
        </div>
    </div>
</template>
<script lang="ts">
import { PropType, defineComponent } from 'vue'
import { AuthStatus } from './RootAuthForm.vue'
import FormTitle from './FormTitle.vue'
import { SectionName, StaticCredentialsProfile } from '../../types'
import { WebviewClientFactory } from '../../../webviews/client'
import { AuthWebview } from '../show'

const client = WebviewClientFactory.create<AuthWebview>()

export default defineComponent({
    components: { FormTitle },
    name: 'CredentialsForm',
    props: {
        state: {
            type: Object as PropType<CredentialsState>,
            required: true,
        },
    },
    data() {
        return {
            profileName: this.state.data.profileName,
            accessKey: this.state.data.aws_access_key_id,
            secretKey: this.state.data.aws_secret_access_key,
            errors: {
                profileName: '',
                aws_access_key_id: '',
                aws_secret_access_key: '',
            } as Record<CredentialsDataKey, string>,
            canSubmit: false,
            isConnected: false,
        }
    },
    async created() {
        await this.updateDataError('profileName')
        await this.updateDataError('aws_access_key_id')
        await this.updateDataError('aws_secret_access_key')

        await Promise.all([this.updateIsConnected(), this.updateCanSubmit()])
    },
    methods: {
        updateData(key: CredentialsDataKey, newVal: string) {
            this.state.updateData({ ...this.state.data, [key]: newVal.trim() })
            this.updateCanSubmit()
        },
        /** Updates the error from the current data */
        async updateDataError(key: CredentialsDataKey): Promise<void> {
            return this.state.getFormatError(key).then(error => {
                this.errors[key] = error ?? ''
            })
        },
        async submitData() {
            await this.state.submitData()

            // clear old data from form
            this.profileName = ''
            this.accessKey = ''
            this.secretKey = ''

            await this.updateIsConnected()
        },
        async updateCanSubmit() {
            return this.state.getSubmissionErrors().then(errors => {
                this.canSubmit = errors === undefined
            })
        },
        async updateIsConnected() {
            return this.state.isAuthConnected().then(isConnected => {
                this.isConnected = isConnected
            })
        },
    },
    watch: {
        profileName(newVal) {
            this.updateData('profileName', newVal)
            this.updateDataError('profileName')
        },
        accessKey(newVal) {
            this.updateData('aws_access_key_id', newVal)
            this.updateDataError('aws_access_key_id')
        },
        secretKey(newVal) {
            this.updateData('aws_secret_access_key', newVal)
            this.updateDataError('aws_secret_access_key')
        },
    },
})

type CredentialsProfile = { profileName: SectionName } & StaticCredentialsProfile
type CredentialsProfileOptional = Partial<CredentialsProfile>
type CredentialsProfileErrors = CredentialsProfileOptional
type CredentialsDataKey = keyof CredentialsProfile

/**
 * Manages the state of credentials data.
 */
export class CredentialsState implements AuthStatus {
    private _data: CredentialsProfile

    constructor(data?: CredentialsProfile) {
        this._data = {
            profileName: '',
            aws_access_key_id: '',
            aws_secret_access_key: '',
            ...data,
        }
    }

    updateData(newData: CredentialsProfile) {
        this._data = newData
    }

    get data(): CredentialsProfile {
        // Shallow copy
        return Object.assign({}, this._data)
    }

    async isAuthConnected(): Promise<boolean> {
        return client.isCredentialConnected()
    }

    async getFormatError(key: CredentialsDataKey): Promise<string | undefined> {
        if (key === 'profileName') {
            return client.getProfileNameError(this._data.profileName, false)
        }

        const result = await client.getCredentialFormatError(key, this._data[key])
        return result
    }

    async getSubmissionErrors(): Promise<CredentialsProfileErrors | undefined> {
        const profileNameError = await client.getProfileNameError(this._data.profileName)
        const formatErrors = await client.getCredentialsSubmissionErrors(this._data)

        // No errors for anything
        if (!profileNameError && !formatErrors) {
            return undefined
        }

        return {
            profileName: profileNameError,
            ...formatErrors,
        }
    }

    async submitData(): Promise<boolean> {
        const data = await this.getSubmittableDataOrThrow()
        return client.trySubmitCredentials(data.profileName, data)
    }

    private async getSubmittableDataOrThrow(): Promise<CredentialsProfile> {
        const errors = await this.getSubmissionErrors()
        const hasError = errors !== undefined
        if (hasError) {
            throw new Error(`authWebview: data should be valid at this point, but is invalid: ${errors}`)
        }
        return this._data as CredentialsProfile
    }
}
</script>
<style>
@import './sharedAuthForms.css';
@import '../shared.css';

#credentials-form {
    width: 300px;
}
</style>
