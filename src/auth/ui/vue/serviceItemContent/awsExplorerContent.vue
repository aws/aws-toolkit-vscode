<template>
    <div class="service-item-content-container border-common">
        <div>
            <CredentialsForm
                :state="credentialsFormState"
                @auth-connection-updated="onAuthConnectionUpdated"
            ></CredentialsForm>
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
