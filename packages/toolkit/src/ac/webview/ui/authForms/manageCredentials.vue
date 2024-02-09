<template>
    <div class="auth-container">
        <div>
            <button v-on:click="toggleInputFormShown" :class="lowPriorityButton">
                <div :class="collapsibleClass" class="auth-container-icon"></div>
                {{ buttonText }}
            </button>

            <div v-show="isInputFormShown" class="auth-form-container">
                <div v-if="isConnected">
                    <button v-on:click="showResourceExplorer">Open Resource Explorer</button>
                </div>

                <div>
                    <label class="form-description-color input-description-small"
                        >Credentials will be added to the appropriate ~/.aws/ files.</label
                    >
                    <div v-on:click="editCredentialsFile()" class="text-link-color" style="cursor: pointer">
                        <div class="icon icon-vscode-edit text-link-color"></div>
                        Edit file directly
                    </div>
                </div>

                <div>
                    <label class="input-title">Profile Name</label>
                    <label class="form-description-color input-description-small"
                        >The identifier for these credentials</label
                    >
                    <input v-model="data.profileName" type="text" :data-invalid="!!errors.profileName" />
                    <div class="form-description-color input-description-small error-text">
                        {{ errors.profileName }}
                    </div>
                </div>

                <div>
                    <label class="input-title">Access Key</label>
                    <input v-model="data.aws_access_key_id" :data-invalid="!!errors.aws_access_key_id" type="text" />
                    <div class="form-description-color input-description-small error-text">
                        {{ errors.aws_access_key_id }}
                    </div>
                </div>

                <div>
                    <label class="input-title">Secret Key</label>
                    <input
                        v-model="data.aws_secret_access_key"
                        type="password"
                        :data-invalid="!!errors.aws_secret_access_key"
                    />
                    <div class="form-description-color input-description-small error-text">
                        {{ errors.aws_secret_access_key }}
                    </div>
                </div>

                <div>
                    <button v-on:click="submitData()" :disabled="!canSubmit">Add Profile</button>
                    <div class="form-description-color input-description-small error-text">{{ errors.submit }}</div>
                </div>
            </div>
        </div>
    </div>
</template>
<script lang="ts">
import { PropType, defineComponent } from 'vue'
import BaseAuthForm, { ConnectionUpdateCause } from './baseAuth.vue'
import FormTitle from './formTitle.vue'
import { SectionName, StaticProfile } from '../../../credentials/types'
import { WebviewClientFactory } from '../../../../webviews/client'
import { AuthWebview } from '../show'
import { AuthForm } from './shared.vue'
import { AuthFormId } from './types'
import { CredentialSourceId, FeatureId } from '../../../../shared/telemetry/telemetry'
import { emptyFields, fieldHasError } from '../types'

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
                ...this.state.data,
            } as CredentialsProfile,
            errors: {
                ...this.state.errors,
            } as CredentialsFormErrors,
            canSubmit: true,
            isConnected: false,

            /**
             * This is for the edge case when we use an accordion and
             * need to know if we should show the form
             */
            isInputFormShown: false,
            lowPriorityButton: 'low-priority-button',
            buttonText: '',
        }
    },
    async created() {
        if (!this.checkIfConnected && (await this.state.isAuthConnected())) {
            this.buttonText = 'Add an IAM Role Credential'
        } else {
            this.buttonText = 'Or, provide IAM Roles Credentials'
        }

        await this.updateConnectedStatus('created')
    },
    computed: {
        /** The appropriate accordion symbol (collapsed/uncollapsed) */
        collapsibleClass() {
            return this.isInputFormShown ? 'icon icon-vscode-chevron-down' : 'icon icon-vscode-chevron-right'
        },
    },
    methods: {
        toggleInputFormShown() {
            this.isInputFormShown = !this.isInputFormShown
        },
        async setNewValue(key: CredentialsDataKey, newVal: string) {
            if (newVal) {
                // Edge Case:
                // Since we allow subsequent credentials to be added,
                // we will automatically wipe the form values after success.
                // That triggers this function, but we only want to
                // indicate a new form interaction if the user adds text themselves.
                await this.state.startAuthFormInteraction()
            }

            await this.state.setData(key, newVal.trim())

            this.updateForm()
        },
        async updateConnectedStatus(cause?: ConnectionUpdateCause) {
            const actualIsConnected = await this.state.isAuthConnected()
            this.isConnected = this.checkIfConnected ? actualIsConnected : false
            this.emitAuthConnectionUpdated({ id: this.state.id, isConnected: actualIsConnected, cause })
        },
        async submitData() {
            this.state.startAuthFormInteraction()
            this.canSubmit = false // disable submit button

            const wasSuccessful = await this.state.submitData()
            if (wasSuccessful) {
                this.isInputFormShown = false
                await this.updateConnectedStatus('signIn')
            }

            this.updateForm()
            this.canSubmit = true // enable submit button
        },
        toggleShowForm() {
            this.isInputFormShown = !this.isInputFormShown
        },
        updateForm() {
            this.data = this.state.data
            this.errors = this.state.errors
        },
        editCredentialsFile() {
            client.editCredentialsFile()
            client.emitUiClick('auth_editCredentials')
        },
        showResourceExplorer() {
            client.showResourceExplorer()
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
type CredentialsDataKey = keyof CredentialsProfile

type CredentialsFormErrors = {
    profileName: string
    aws_access_key_id: string
    aws_secret_access_key: string
    submit: string
}

/**
 * Manages the state of credentials data.
 */
export class CredentialsState implements AuthForm {
    #data: CredentialsData
    #errors: CredentialsErrors

    static #instance: CredentialsState

    static get instance(): CredentialsState {
        return (this.#instance ??= new CredentialsState())
    }

    private constructor() {
        this.#data = CredentialsData.instance
        this.#errors = CredentialsErrors.instance
    }

    async setData(key: CredentialsDataKey, value: string) {
        this.#data.setData(key, value)

        await this.#errors.updateErrorFormatting(this.data, key)
        // If an error under the submit button existed, we clear it out
        // since the form data has changed since last submission
        await this.#errors.setError('submit', '')
    }

    get data(): Readonly<CredentialsProfile> {
        return { ...this.#data.getData() }
    }

    get errors(): Readonly<CredentialsFormErrors> {
        return { ...this.#errors.getErrors() }
    }

    async isAuthConnected(): Promise<boolean> {
        return await client.isExplorerConnected('iam')
    }

    async isConnectionExists(): Promise<boolean> {
        return client.isCredentialExists()
    }

    get id(): AuthFormId {
        return 'credentials'
    }

    get featureType(): FeatureId {
        return 'awsExplorer'
    }

    get authType(): CredentialSourceId {
        return 'sharedCredentials'
    }

    /**
     * For Telemetry
     */
    startAuthFormInteraction() {
        return client.startAuthFormInteraction(this.featureType, this.authType)
    }

    /**
     * Attempts to submit the current data.
     *
     * If there are errors, they will be updated in the state.
     */
    async submitData(): Promise<boolean> {
        // 1. First verify the formatting of the user input
        const hasEmptyFields = this.#errors.updateErrorEmptyFields(this.data)
        const fieldsWithErrors = this.#errors.getFieldsWithErrors()
        if (fieldsWithErrors.length > 0) {
            client.failedAuthAttempt(this.id, {
                reason: hasEmptyFields ? emptyFields : fieldHasError,
                invalidInputFields: this.#errors.getFieldsWithErrors(),
            })
            return false
        }

        // 2. Pre-emptively verify the credentials actually work
        const error = await this.#errors.authenticateCredentials(this.data)
        if (error) {
            client.failedAuthAttempt(this.id, {
                reason: error.key,
                invalidInputFields: this.#errors.getFieldsWithErrors(),
            })
            return false
        }

        // 3. Finally submit/save the credentials
        const wasSuccess = await client.trySubmitCredentials(this.data.profileName, this.data)

        if (wasSuccess) {
            client.successfulAuthAttempt(this.id)
            this.reset()
        } else {
            this.#errors.setError('submit', 'Unexpected extension error. See logs.')
        }

        return wasSuccess
    }

    private reset() {
        this.#data.reset()
        this.#errors.reset()
    }
}

class CredentialsData {
    private data: CredentialsProfile

    setData(key: keyof CredentialsProfile, value: string) {
        this.data[key] = value
    }

    getData(): Readonly<CredentialsProfile> {
        return this.data
    }

    reset() {
        this.data = CredentialsData.defaultData
    }

    private static get defaultData(): CredentialsProfile {
        return {
            profileName: '',
            aws_access_key_id: '',
            aws_secret_access_key: '',
        }
    }

    static #instance: CredentialsData
    static get instance(): CredentialsData {
        return (this.#instance ??= new CredentialsData())
    }
    constructor() {
        this.data = CredentialsData.defaultData
    }
}

/** Manages the state of errors for Credentials */
class CredentialsErrors {
    private errors: CredentialsFormErrors

    getErrors(): Readonly<CredentialsFormErrors> {
        return this.errors
    }

    async setError(key: keyof CredentialsFormErrors, value: string) {
        this.errors[key] = value
        this.setInvalidInputFields()
    }

    reset() {
        this.errors = CredentialsErrors.noErrors
        this.setInvalidInputFields()
    }

    /** Updates the errors if required fields are empty */
    updateErrorEmptyFields(data: CredentialsProfile): boolean {
        const dataFieldKeys = Object.keys(data) as (keyof typeof data)[]
        const emptyFieldKeys = dataFieldKeys.filter(key => !data[key])

        emptyFieldKeys.forEach(fieldName => {
            this.setError(fieldName as keyof CredentialsProfile, 'Cannot be empty.')
        })

        return emptyFieldKeys.length > 0
    }

    /** Updates the error if the given field has a format error */
    async updateErrorFormatting(data: CredentialsProfile, key: CredentialsDataKey): Promise<void> {
        if (key === 'profileName') {
            const error = await client.getProfileNameError(data.profileName, false)
            this.setError(key, error ?? '')
            return
        }

        const result = await client.getCredentialFormatError(key, data[key])
        this.setError(key, result ?? '')
    }

    /** Authenticates the given data actually works */
    async authenticateCredentials(data: CredentialsProfile) {
        const error = await client.getAuthenticatedCredentialsError(data)

        if (error) {
            this.setError(error.key, error.error)
        }

        return error
    }

    /** All fields that currently have an error */
    getFieldsWithErrors(): (keyof CredentialsFormErrors)[] {
        const errorKeys = Object.keys(this.errors) as (keyof CredentialsFormErrors)[]
        return errorKeys.filter(key => this.errors[key])
    }

    private setInvalidInputFields() {
        client.setInvalidInputFields(this.getFieldsWithErrors())
    }

    private static get noErrors(): CredentialsFormErrors {
        return {
            aws_access_key_id: '',
            aws_secret_access_key: '',
            profileName: '',
            submit: '',
        }
    }

    static #instance: CredentialsErrors
    static get instance(): CredentialsErrors {
        return (this.#instance ??= new CredentialsErrors())
    }
    private constructor() {
        this.errors = CredentialsErrors.noErrors
    }
}
</script>
<style>
@import './sharedAuthForms.css';
@import '../shared.css';

#collapsible {
    display: flex;
    flex-direction: row;
    cursor: pointer;
}
</style>
