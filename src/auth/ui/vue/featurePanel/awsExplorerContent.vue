<template>
    <div class="feature-panel-container border-common">
        <div class="feature-panel-container-upper">
            <div class="feature-panel-container-title">AWS Explorer</div>

            <div class="centered-items">
                <img
                    class="service-item-content-image"
                    src="https://github.com/aws/aws-toolkit-vscode/raw/HEAD/docs/marketplace/vscode/awsExplorer.gif"
                    alt="AWS Explorer example GIF"
                />
            </div>

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

        <div class="feature-panel-form-container" :key="authFormContainerKey" v-show="isAllAuthsLoaded">
            <div v-if="isAnyAuthConnected" class="feature-panel-form-section">
                <ExplorerAggregateForm
                    :identityCenterState="identityCenterFormState"
                    :credentialsState="credentialsFormState"
                    @auth-connection-updated="onAuthConnectionUpdated"
                >
                </ExplorerAggregateForm>

                <div v-on:click="toggleShowIdentityCenter" class="collapsible-title">
                    <div>
                        <div :class="collapsibleClass(isIdentityCenterShown)"></div>
                        Add another IAM Identity Center Profile
                    </div>
                </div>

                <IdentityCenterForm
                    :state="identityCenterFormState"
                    @auth-connection-updated="onAuthConnectionUpdated"
                    :checkIfConnected="false"
                    v-show="isIdentityCenterShown"
                ></IdentityCenterForm>

                <div v-on:click="toggleShowCredentials" class="collapsible-title">
                    <div>
                        <div :class="collapsibleClass(isCredentialsShown)"></div>
                        Add another IAM User Credential
                    </div>
                </div>

                <CredentialsForm
                    :state="credentialsFormState"
                    :check-if-connected="false"
                    @auth-connection-updated="onAuthConnectionUpdated"
                    v-show="isCredentialsShown"
                ></CredentialsForm>
            </div>
            <div v-else class="feature-panel-form-section">
                <IdentityCenterForm
                    :state="identityCenterFormState"
                    @auth-connection-updated="onAuthConnectionUpdated"
                    :checkIfConnected="false"
                ></IdentityCenterForm>

                <div v-on:click="toggleShowCredentials" style="cursor: pointer; display: flex; flex-direction: row">
                    <div class="collapsible-title">
                        <div
                            style="font-weight: bold; font-size: medium"
                            :class="collapsibleClass(isCredentialsShown)"
                        ></div>
                        Or add IAM User Credentials
                    </div>
                </div>

                <CredentialsForm
                    :state="credentialsFormState"
                    @auth-connection-updated="onAuthConnectionUpdated"
                    v-show="isCredentialsShown"
                ></CredentialsForm>
            </div>

            <div>
                <div>
                    Don't have an AWS account?
                    <a href="https://aws.amazon.com/free/" v-on:click="emitUiClick('auth_signUpForFree')"
                        >Sign up for free.</a
                    >
                </div>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import CredentialsForm, { CredentialsState } from '../authForms/manageCredentials.vue'
import IdentityCenterForm, { ExplorerIdentityCenterState } from '../authForms/manageIdentityCenter.vue'
import BaseServiceItemContent from './baseServiceItemContent.vue'
import authFormsState, { AuthForm, FeatureStatus } from '../authForms/shared.vue'
import { AuthFormId } from '../authForms/types'
import { ConnectionUpdateArgs } from '../authForms/baseAuth.vue'
import ExplorerAggregateForm from '../authForms/manageExplorer.vue'
import { WebviewClientFactory } from '../../../../webviews/client'
import { AuthWebview } from '../show'

const client = WebviewClientFactory.create<AuthWebview>()

function initialData() {
    return {
        /** We want to delay showing auth forms until all are done loading, once they are done this will be true */
        isAllAuthsLoaded: false,
        isLoaded: {
            credentials: false,
            identityCenterExplorer: false,
            aggregateExplorer: false,
        } as { [k in AuthFormId]?: boolean },
        isCredentialsShown: false,
        isIdentityCenterShown: false,
        isAnyAuthConnected: false,
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
        this.refreshPanel()

        client.onDidConnectionChangeExplorer(() => {
            this.refreshPanel()
        })
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
        /**
         * Refreshes the auth form section of the feature panel
         *
         * This overrides the base class method because refreshing
         * is more complex for this feature panel.
         */
        async refreshPanel() {
            Object.assign(this.$data, initialData())

            this.isAnyAuthConnected = await this.state.hasConnectedAuth()
            if (!this.isAnyAuthConnected) {
                // This does not get loaded at all when auth is not connected
                // so we'll mark it as loaded as to not block the overall loading
                this.isLoaded.aggregateExplorer = true
            }

            // The created() method is not truly awaited and this causes a
            // race condition with @auth-connection-updated triggering updateIsAllAuthsLoaded().
            // So we must do a final update here to ensure the latest values.
            this.updateIsAllAuthsLoaded()
            this.refreshAuthFormContainer()
        },
        updateIsAllAuthsLoaded() {
            const allAuthsCount = Object.values(this.isLoaded).length
            const allLoadedAuths = Object.values(this.isLoaded).filter(val => val)
            this.isAllAuthsLoaded = allLoadedAuths.length === allAuthsCount
        },
        async onAuthConnectionUpdated(args: ConnectionUpdateArgs) {
            this.isLoaded[args.id] = true
            this.updateIsAllAuthsLoaded()
            this.emitAuthConnectionUpdated('awsExplorer', args)
        },
        toggleShowCredentials() {
            this.isCredentialsShown = !this.isCredentialsShown
            if (this.isCredentialsShown) {
                client.emitUiClick('auth_explorer_expandIAMCredentials')
            }
        },
        toggleShowIdentityCenter() {
            this.isIdentityCenterShown = !this.isIdentityCenterShown
            if (this.isIdentityCenterShown) {
                client.emitUiClick('auth_explorer_expandIAMIdentityCenter')
            }
        },
        collapsibleClass(isShown: boolean): string {
            return isShown ? 'icon icon-vscode-chevron-down' : 'icon icon-vscode-chevron-right'
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
