<template>
    <div class="auth-form container-background border-common" id="credentials-form" v-show="canShowAll">
        <FormTitle :isConnected="isConnected">IAM Credentials</FormTitle>

        <div v-if="isConnected" class="form-section" v-on:click="toggleShowForm()" id="collapsible">
            <div :class="collapsibleClass"></div>
            <div>Add another profile</div>
        </div>

        <div v-if="isFormShown">
            <div class="form-section">
                <label class="small-description">Credentials will be added to the appropriate `~/.aws/` files.</label>
                <div>
                    <div class="icon icon-vscode-edit edit-icon"></div>
                    Edit file directly
                </div>
            </div>

            <div class="form-section">
                <label class="input-title">Profile Name</label>
                <label class="small-description">The identifier for these credentials</label>
                <input v-model="data.profileName" type="text" :data-invalid="!!errors.profileName" />
                <div class="small-description error-text">{{ errors.profileName }}</div>
            </div>

            <div class="form-section">
                <label class="input-title">Access Key</label>
                <label class="small-description">The access key</label>
                <input v-model="data.aws_access_key_id" :data-invalid="!!errors.aws_access_key_id" type="text" />
                <div class="small-description error-text">{{ errors.aws_access_key_id }}</div>
            </div>

            <div class="form-section">
                <label class="input-title">Secret Key</label>
                <label class="small-description">The secret key</label>
                <input
                    v-model="data.aws_secret_access_key"
                    type="password"
                    :data-invalid="!!errors.aws_secret_access_key"
                />
                <div class="small-description error-text">{{ errors.aws_secret_access_key }}</div>
            </div>

            <div class="form-section">
                <button :disabled="!canSubmit" v-on:click="submitData()">Add Profile</button>
                <div class="small-description error-text">{{ errors.submit }}</div>
            </div>
        </div>
    </div>
</template>
<script lang="ts">
import { PropType, defineComponent } from 'vue'
import BaseAuthForm, { AuthStatus } from './BaseAuthForm.vue'
import FormTitle from './FormTitle.vue'
import { SectionName, StaticProfile } from '../../types'
import { WebviewClientFactory } from '../../../webviews/client'
import { AuthWebview } from '../show'

const client = WebviewClientFactory.create<AuthWebview>()

export default defineComponent({
    name: 'CredentialsForm',
    extends: BaseAuthForm,
    components: { FormTitle },
    props: {
        state: {
            type: Object as PropType<CredentialsState>,
            required: true,
        },
    },
    data() {
        return {
            data: {
                profileName: this.state.getValue('profileName'),
                aws_access_key_id: this.state.getValue('aws_access_key_id'),
                aws_secret_access_key: this.state.getValue('aws_secret_access_key'),
            },
            errors: {
                profileName: '',
                aws_access_key_id: '',
                aws_secret_access_key: '',
                submit: '',
            },
            canSubmit: false,
            isConnected: false,

            /**
             * This is for the edge case when we use an accordion and
             * need to know if we should show the form
             */
            isFormShown: false,

            /**
             * This exists since setup is run async and there is a visual
             * stutter when this form is first shown. This will not allow
             * anything to be shown until this is set to true
             */
            canShowAll: false,
        }
    },

    async created() {
        await this.updateDataError('profileName')
        await this.updateDataError('aws_access_key_id')
        await this.updateDataError('aws_secret_access_key')

        await Promise.all([this.updateConnectedStatus(), this.updateSubmittableStatus()])

        this.isFormShown = !this.isConnected

        this.canShowAll = true // make sure this is last
    },
    computed: {
        /** The appropriate accordion symbol (collapsed/uncollapsed) */
        collapsibleClass() {
            return this.isFormShown ? 'icon icon-vscode-chevron-down' : 'icon icon-vscode-chevron-right'
        },
    },
    methods: {
        setNewValue(key: CredentialsDataKey, newVal: string) {
            // If there is an error under the submit button
            // we can clear it since there is new data
            this.errors.submit = ''

            this.state.setValue(key, newVal.trim())
            this.updateSubmittableStatus()
            this.updateDataError(key)
        },
        /** Updates the error using the current data */
        async updateDataError(key: CredentialsDataKey): Promise<void> {
            return this.state.getFormatError(key).then(error => {
                this.errors[key] = error ?? ''
            })
        },
        async updateSubmittableStatus() {
            return this.state.getSubmissionErrors().then(errors => {
                this.canSubmit = errors === undefined
            })
        },
        async updateConnectedStatus() {
            return this.state.isAuthConnected().then(isConnected => {
                this.isConnected = isConnected
                this.emitAuthConnectionUpdated('CREDENTIALS')
            })
        },
        async submitData() {
            // pre submission
            this.canSubmit = false // disable submit button

            this.errors.submit = '' // Makes UI flicker if same message as before (shows something changed)
            this.errors.submit = await this.state.getAuthenticationError()
            if (this.errors.submit) {
                return // Do not allow submission since data fails authentication
            }

            // submission
            await this.state.submitData()

            // post submission (successfully connected)
            this.clearFormData()
            this.isFormShown = false
            this.canSubmit = true // enable submit button
            await this.updateConnectedStatus()
        },
        toggleShowForm() {
            this.isFormShown = !this.isFormShown
        },
        clearFormData() {
            // This indirectly clears the UI, then triggers the watch handlers
            this.data.profileName = ''
            this.data.aws_access_key_id = ''
            this.data.aws_secret_access_key = ''
        },
    },
    watch: {
        'data.profileName'(newVal) {
            this.setNewValue('profileName', newVal)
        },
        'data.aws_access_key_id'(newVal) {
            this.setNewValue('aws_access_key_id', newVal)
        },
        'data.aws_secret_access_key'(newVal) {
            this.setNewValue('aws_secret_access_key', newVal)
        },
    },
})

type CredentialsProfile = { profileName: SectionName } & StaticProfile
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

    setValue(key: CredentialsDataKey, value: string) {
        this._data[key] = value
    }

    getValue(key: CredentialsDataKey) {
        return this._data[key]
    }

    async isAuthConnected(): Promise<boolean> {
        return await client.isCredentialConnected()
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

    async getAuthenticationError(): Promise<string> {
        const error = await client.getAuthenticatedCredentialsError(this._data)
        if (!error) {
            return ''
        }
        return error.error
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

#collapsible {
    display: flex;
    flex-direction: row;
    cursor: pointer;
}
</style>
