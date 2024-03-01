<template>
    <div :id="panelId" class="feature-panel-container border-common" :class="isActive ? 'feature-panel-selected' : ''">
        <div class="feature-panel-container-upper">
            <div class="feature-panel-container-title">Resource Explorer</div>

            <img
                class="feature-panel-image"
                src="https://github.com/aws/aws-toolkit-vscode/raw/HEAD/docs/marketplace/vscode/awsExplorer.gif"
                alt="AWS Explorer example GIF"
            />

            <div class="feature-panel-container-description">
                Work with S3, CloudWatch, and more.
                <a
                    href="https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/toolkit-navigation.html"
                    v-on:click="emitUiClick('auth_learnMoreAWSResources')"
                    >Learn more.</a
                >
            </div>
        </div>

        <hr />

        <template v-if="!removeAuthForms">
            <div :key="authFormContainerKey" v-show="canShowAuthForms" class="feature-panel-auth-container">
                <ExplorerAggregateForm
                    v-if="connectedAuth"
                    :identityCenterState="identityCenterFormState"
                    :credentialsState="credentialsFormState"
                >
                </ExplorerAggregateForm>
                <!-- @auth-connection-updated="onAuthConnectionUpdated" -->

                <button v-if="connectedAuth" v-on:click="showExplorer()">Open Resource Explorer</button>

                <IdentityCenterForm
                    :state="identityCenterFormState"
                    @auth-connection-updated="onAuthConnectionUpdated"
                    :checkIfConnected="false"
                    :is-low-priority="!!connectedAuth"
                ></IdentityCenterForm>

                <CredentialsForm
                    :state="credentialsFormState"
                    @auth-connection-updated="onAuthConnectionUpdated"
                    :is-low-priority="true"
                ></CredentialsForm>

                <div v-if="!connectedAuth">
                    Don't have an AWS account?
                    <a href="https://aws.amazon.com/free/" v-on:click="emitUiClick('auth_signUpForFree')"
                        >Sign up for free.</a
                    >
                </div>
            </div>
        </template>
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import CredentialsForm, { CredentialsState } from '../authForms/manageCredentials.vue'
import IdentityCenterForm, { ExplorerIdentityCenterState } from '../authForms/manageIdentityCenter.vue'
import BaseServiceItemContent, { PanelActivityState } from './baseServiceItemContent.vue'
import authFormsState, { AuthForm, FeatureStatus } from '../authForms/shared.vue'
import { AuthFormId } from '../authForms/types'
import { ConnectionUpdateArgs } from '../authForms/baseAuth.vue'
import ExplorerAggregateForm from '../authForms/manageExplorer.vue'
import { WebviewClientFactory } from '../../../../webviews/client'
import { AuthWebview } from '../show'

const client = WebviewClientFactory.create<AuthWebview>()

function initialData() {
    return {
        isLoaded: {
            credentials: false,
            identityCenterExplorer: false,
        } as { [k in AuthFormId]?: boolean },
        isCredentialsShown: false,
        isIdentityCenterShown: false,
        panelId: 'explorer-panel',
        connectedAuth: undefined as Extract<AuthFormId, 'credentials' | 'identityCenterExplorer'> | undefined,
        removeAuthForms: false,
    }
}

export default defineComponent({
    name: 'AwsExplorerContent',
    components: { CredentialsForm, IdentityCenterForm, ExplorerAggregateForm },
    extends: BaseServiceItemContent,
    data() {
        return initialData()
    },
    async created() {
        client.onDidConnectionChangeExplorer(() => {
            this.refreshPanel()
        })
    },
    mounted() {
        PanelActivityState.instance.registerPanel(this.$data.panelId, 'awsExplorer')
    },
    computed: {
        credentialsFormState(): CredentialsState {
            return authFormsState.credentials
        },
        identityCenterFormState(): ExplorerIdentityCenterState {
            return authFormsState.identityCenterExplorer
        },
        canShowAuthForms() {
            if (this.connectedAuth) {
                return true
            }

            const hasUnloaded = Object.values(this.isLoaded).filter(val => !val).length > 0
            return !hasUnloaded
        },
    },
    methods: {
        async refreshPanel() {
            Object.assign(this.$data, initialData())
            this.refreshAuthFormContainer()
        },
        async onAuthConnectionUpdated(args: ConnectionUpdateArgs) {
            if (args.cause === 'signOut') {
                // Clears all auth forms to prevent UI stuttering due to
                // auth changes. We are expecting an event for force this panel
                // to refresh and restore the forms.
                this.removeAuthForms = true
                return
            }

            if (args.isConnected) {
                this.connectedAuth = args.id as any
            }

            this.isLoaded[args.id] = true
        },
        showExplorer() {
            client.showResourceExplorer()
        },
    },
})

export class ResourceExplorerContentState extends FeatureStatus {
    getAuthForms(): AuthForm[] {
        return [authFormsState.credentials, authFormsState.identityCenterExplorer]
    }
}
</script>

<style>
@import './baseServiceItemContent.css';
@import '../shared.css';
</style>
