<template>
    <div class="service-item-content-container border-common">
        <div>
            <CredentialsForm :state="credentialsFormState"></CredentialsForm>
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import authFormsState, { AuthStatus } from '../authForms/RootAuthForm.vue'
import CredentialsForm, { CredentialsState } from '../authForms/CredentialsForm.vue'
import RootServiceItemContent from './RootServiceItemContent.vue'

export default defineComponent({
    name: 'AwsExplorerContent',
    components: { CredentialsForm },
    extends: RootServiceItemContent,
    computed: {
        credentialsFormState(): CredentialsState {
            return authFormsState.CREDENTIALS_FORM_STATE
        },
    },
})

export class AwsExplorerContentState implements AuthStatus {
    private readonly forms = [authFormsState.CREDENTIALS_FORM_STATE]

    async isAuthConnected(): Promise<boolean> {
        return this.forms.some(form => form.isAuthConnected())
    }
}
</script>

<style>
@import './baseServiceItemContent.css';
@import '../shared.css';
</style>
