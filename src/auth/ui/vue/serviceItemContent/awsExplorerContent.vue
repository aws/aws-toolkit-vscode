<template>
    <div class="service-item-content-container border-common">
        <div class="service-item-content-container-title">Resource Explorer</div>

        <div>
            <img
                src="https://d1.awsstatic.com/developer-tools/01-Toolkit-for-VS-Code-Create-SAM-App.81c8c18274f2062516ba859ed97d61c4cab5ee98.png"
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

export default defineComponent({
    name: 'AwsExplorerContent',
    components: { CredentialsForm },
    extends: BaseServiceItemContent,
    computed: {
        credentialsFormState(): CredentialsState {
            return authFormsState.CREDENTIALS
        },
    },
    methods: {
        async onAuthConnectionUpdated() {
            const isConnected = await this.state.isAuthConnected()
            this.emitIsAuthConnected('RESOURCE_EXPLORER', isConnected)
        },
    },
})

export class ResourceExplorerContentState implements AuthStatus {
    async isAuthConnected(): Promise<boolean> {
        return authFormsState.CREDENTIALS.isAuthConnected()
    }
}
</script>

<style>
@import './baseServiceItemContent.css';
@import '../shared.css';
</style>
