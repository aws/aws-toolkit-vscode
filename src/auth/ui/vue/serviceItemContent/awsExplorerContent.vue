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

        <div v-if="isAuthConnected" class="service-item-content-form-section">
            <ExplorerAggregateForm
                :identityCenterState="identityCenterFormState"
                :credentialsState="credentialsFormState"
            ></ExplorerAggregateForm>

            <div v-on:click="toggleShowIdentityCenter" style="cursor: pointer; display: flex; flex-direction: row">
                <div
                    style="font-weight: bold; font-size: medium"
                    :class="collapsibleClass(isIdentityCenterShown)"
                ></div>
                <div>
                    <div style="font-weight: bold; font-size: 14px">Add another IAM Identity Center Profile</div>
                </div>
            </div>

            <IdentityCenterForm
                :state="identityCenterFormState"
                @auth-connection-updated="onAuthConnectionUpdated"
                :checkIfConnected="false"
                v-show="isIdentityCenterShown"
            ></IdentityCenterForm>

            <div v-on:click="toggleShowCredentials" style="cursor: pointer; display: flex; flex-direction: row">
                <div style="font-weight: bold; font-size: medium" :class="collapsibleClass(isCredentialsShown)"></div>
                <div>
                    <div style="font-weight: bold; font-size: 14px">Add another IAM User Credentials</div>
                </div>
            </div>

            <CredentialsForm
                :state="credentialsFormState"
                @auth-connection-updated="onAuthConnectionUpdated"
                v-show="isCredentialsShown"
            ></CredentialsForm>

            <div>Don't have an AWS account? <a>Sign up for free.</a></div>
        </div>
        <div v-else class="service-item-content-form-section">
            <IdentityCenterForm
                :state="identityCenterFormState"
                @auth-connection-updated="onAuthConnectionUpdated"
                :checkIfConnected="false"
            ></IdentityCenterForm>

            <div v-on:click="toggleShowCredentials" style="cursor: pointer; display: flex; flex-direction: row">
                <div style="font-weight: bold; font-size: medium" :class="collapsibleClass(isCredentialsShown)"></div>
                <div>
                    <div style="font-weight: bold; font-size: 14px">Or add IAM User Credentials</div>
                </div>
            </div>

            <CredentialsForm
                :state="credentialsFormState"
                @auth-connection-updated="onAuthConnectionUpdated"
                v-show="isCredentialsShown"
            ></CredentialsForm>

            <div>Don't have an AWS account? <a>Sign up for free.</a></div>
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import CredentialsForm, { CredentialsState } from '../authForms/manageCredentials.vue'
import IdentityCenterForm, { ExplorerIdentityCenterState } from '../authForms/manageIdentityCenter.vue'
import BaseServiceItemContent from './baseServiceItemContent.vue'
import authFormsState, { AuthStatus } from '../authForms/shared.vue'
import { AuthFormId } from '../authForms/types'
import { ConnectionUpdateArgs } from '../authForms/baseAuth.vue'
import ExplorerAggregateForm from '../authForms/manageExplorer.vue'

export default defineComponent({
    name: 'AwsExplorerContent',
    components: { CredentialsForm, IdentityCenterForm, ExplorerAggregateForm },
    extends: BaseServiceItemContent,
    data() {
        return {
            isAllAuthsLoaded: false,
            isLoaded: {
                credentials: false,
            } as Record<AuthFormId, boolean>,
            isCredentialsShown: false,
            isIdentityCenterShown: false,
            isAuthConnected: false,
        }
    },
    async created() {
        this.isAuthConnected = await this.state.isAuthConnected()
    },
    computed: {
        credentialsFormState(): CredentialsState {
            return authFormsState.credentials
        },
        identityCenterFormState(): ExplorerIdentityCenterState {
            return authFormsState.identityCenterExplorer
        },
    },
    methods: {
        updateIsAllAuthsLoaded() {
            const hasUnloaded = Object.values(this.isLoaded).filter(val => !val).length > 0
            this.isAllAuthsLoaded = !hasUnloaded
        },
        async onAuthConnectionUpdated(args: ConnectionUpdateArgs) {
            this.isLoaded[args.id] = true
            this.updateIsAllAuthsLoaded()
            this.emitAuthConnectionUpdated('resourceExplorer', args)
        },
        toggleShowCredentials() {
            this.isCredentialsShown = !this.isCredentialsShown
        },
        toggleShowIdentityCenter() {
            this.isIdentityCenterShown = !this.isIdentityCenterShown
        },
        collapsibleClass(isShown: boolean): string {
            return isShown ? 'icon icon-vscode-chevron-down' : 'icon icon-vscode-chevron-right'
        },
    },
})

export class ResourceExplorerContentState implements AuthStatus {
    async isAuthConnected(): Promise<boolean> {
        return (
            (await authFormsState.credentials.isAuthConnected()) ||
            (await authFormsState.identityCenterExplorer.isAuthConnected())
        )
    }
}
</script>

<style>
@import './baseServiceItemContent.css';
@import '../shared.css';
</style>
