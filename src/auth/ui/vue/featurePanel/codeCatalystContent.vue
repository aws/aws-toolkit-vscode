<template>
    <div class="feature-panel-container border-common">
        <div class="feature-panel-container-upper">
            <div class="feature-panel-container-title">Amazon CodeCatalyst</div>

            <div class="centered-items">
                <img
                    class="service-item-content-image"
                    src="https://github.com/aws/aws-toolkit-vscode/raw/HEAD/docs/marketplace/vscode/CC_dev_env.gif"
                    alt="CodeCatalyst example GIF"
                />
            </div>

            <div class="feature-panel-container-description">
                Spend more time coding and less time managing development environments.
                <a href="https://aws.amazon.com/codecatalyst/" v-on:click="emitUiClick('auth_learnMoreCodeCatalyst')"
                    >Learn more.</a
                >
            </div>
        </div>

        <hr />

        <div class="feature-panel-form-container" :key="authFormContainerKey" v-show="isAllAuthsLoaded">
            <div class="feature-panel-form-section">
                <BuilderIdForm
                    :state="builderIdState"
                    @auth-connection-updated="onAuthConnectionUpdated"
                ></BuilderIdForm>
            </div>

            <div class="feature-panel-form-section">
                <div v-on:click="toggleIdentityCenterShown" class="collapsible-title">
                    <div :class="identityCenterCollapsibleClass" style="height: 0"></div>
                    <div>
                        <div>Sign in with IAM Identity Center.</div>
                    </div>
                </div>

                <IdentityCenterForm
                    :state="identityCenterState"
                    :allow-existing-start-url="true"
                    @auth-connection-updated="onAuthConnectionUpdated"
                    v-show="isIdentityCenterShown"
                ></IdentityCenterForm>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import BuilderIdForm, { CodeCatalystBuilderIdState } from '../authForms/manageBuilderId.vue'
import IdentityCenterForm, { CodeCatalystIdentityCenterState } from '../authForms/manageIdentityCenter.vue'
import BaseServiceItemContent from './baseServiceItemContent.vue'
import authFormsState, { AuthForm, FeatureStatus } from '../authForms/shared.vue'
import { AuthFormId } from '../authForms/types'
import { ConnectionUpdateArgs } from '../authForms/baseAuth.vue'
import { WebviewClientFactory } from '../../../../webviews/client'
import { AuthWebview } from '../show'

const client = WebviewClientFactory.create<AuthWebview>()

function initialData() {
    return {
        isLoaded: {
            builderIdCodeCatalyst: false,
        } as Record<AuthFormId, boolean>,
        isAllAuthsLoaded: false,
        isIdentityCenterShown: false,
    }
}

export default defineComponent({
    name: 'CodeCatalystContent',
    components: { BuilderIdForm, IdentityCenterForm },
    extends: BaseServiceItemContent,
    data() {
        return initialData()
    },
    created() {
        this.refreshPanel()
        client.onDidConnectionChangeCodeCatalyst(() => {
            this.refreshPanel()
        })
    },
    computed: {
        builderIdState(): CodeCatalystBuilderIdState {
            return authFormsState.builderIdCodeCatalyst
        },
        identityCenterState(): CodeCatalystIdentityCenterState {
            return authFormsState.identityCenterCodeCatalyst
        },
        identityCenterCollapsibleClass() {
            return this.isIdentityCenterShown ? 'icon icon-vscode-chevron-down' : 'icon icon-vscode-chevron-right'
        },
    },
    methods: {
        async refreshPanel() {
            Object.assign(this.$data, initialData())
            this.isIdentityCenterShown = await this.identityCenterState.isAuthConnected()
            this.refreshAuthFormContainer()
        },
        updateIsAllAuthsLoaded() {
            const hasUnloaded = Object.values(this.isLoaded).filter(val => !val).length > 0
            this.isAllAuthsLoaded = !hasUnloaded
        },
        async onAuthConnectionUpdated(args: ConnectionUpdateArgs) {
            this.isLoaded[args.id] = true
            if (args.id === 'identityCenterCodeCatalyst') {
                this.isIdentityCenterShown = await this.identityCenterState.isAuthConnected()
            }
            this.updateIsAllAuthsLoaded()
            this.emitAuthConnectionUpdated('codecatalyst', args)
        },
        toggleIdentityCenterShown() {
            this.isIdentityCenterShown = !this.isIdentityCenterShown
            if (this.isIdentityCenterShown) {
                client.emitUiClick('auth_codecatalyst_expandIAMIdentityCenter')
            }
        },
    },
})

export class CodeCatalystContentState extends FeatureStatus {
    override getAuthForms(): AuthForm[] {
        return [authFormsState.builderIdCodeCatalyst, authFormsState.identityCenterCodeCatalyst]
    }
}
</script>

<style>
@import './baseServiceItemContent.css';
@import '../shared.css';
</style>
