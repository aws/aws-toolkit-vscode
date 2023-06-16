<template>
    <div class="service-item-content-container border-common" v-show="isAllAuthsLoaded">
        <div class="service-item-content-container-title">Resource Explorer</div>

        <div>
            <img
                src="https://github.com/aws/aws-toolkit-vscode/assets/118216176/7542f78b-f6ce-47c9-aa8c-cab48cd06997"
            />
        </div>

        <div>
            Add multiple IAM Roles to work across AWS Accounts. Manage and edit S3 files, view CloudWatch Logs, Debug
            Lambda Functions, and more!
        </div>

        <div>
            <a>Learn more about the Resource Explorer.</a>
        </div>

        <hr />

        <div class="service-item-content-form-section">
            <div>
                <div class="form-section-title">Provide IAM Credentials to access the Resource Explorer:</div>
                <div>Don't have an AWS account? <a>Sign up for free.</a></div>
            </div>

            <div class="service-item-content-form-container">
                <CredentialsForm
                    :state="credentialsFormState"
                    @auth-connection-updated="onAuthConnectionUpdated"
                ></CredentialsForm>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import CredentialsForm, { CredentialsState } from '../authForms/manageCredentials.vue'
import BaseServiceItemContent from './baseServiceItemContent.vue'
import authFormsState, { AuthStatus } from '../authForms/shared.vue'
import { AuthFormId } from '../authForms/types'

export default defineComponent({
    name: 'AwsExplorerContent',
    components: { CredentialsForm },
    extends: BaseServiceItemContent,
    data() {
        return {
            isAllAuthsLoaded: false,
            isLoaded: {
                credentials: false,
            } as Record<AuthFormId, boolean>,
        }
    },
    computed: {
        credentialsFormState(): CredentialsState {
            return authFormsState.credentials
        },
    },
    methods: {
        updateIsAllAuthsLoaded() {
            const hasUnloaded = Object.values(this.isLoaded).filter(val => !val).length > 0
            this.isAllAuthsLoaded = !hasUnloaded
        },
        async onAuthConnectionUpdated(id: AuthFormId) {
            this.isLoaded[id] = true
            this.updateIsAllAuthsLoaded()

            const isConnected = await this.state.isAuthConnected()
            this.emitIsAuthConnected('RESOURCE_EXPLORER', isConnected)
        },
    },
})

export class ResourceExplorerContentState implements AuthStatus {
    async isAuthConnected(): Promise<boolean> {
        return authFormsState.credentials.isAuthConnected()
    }
}
</script>

<style>
@import './baseServiceItemContent.css';
@import '../shared.css';
</style>
