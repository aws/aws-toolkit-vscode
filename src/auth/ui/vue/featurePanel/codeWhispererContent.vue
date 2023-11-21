<template>
    <div class="feature-panel-container border-common">
        <div class="feature-panel-container-upper">
            <div class="feature-panel-container-title">Amazon CodeWhisperer</div>

            <div class="centered-items">
                <img
                    class="service-item-content-image"
                    src="https://github.com/aws/aws-toolkit-vscode/raw/HEAD/docs/marketplace/vscode/codewhisperer.gif"
                    alt="CodeWhisperer example GIF"
                />
            </div>

            <div class="feature-panel-container-description">
                An AI coding companion that generates code suggestions as you type.
                <a href="https://aws.amazon.com/codewhisperer/" v-on:click="emitUiClick('auth_learnMoreCodeWhisperer')"
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

                <div>
                    <div v-on:click="toggleIdentityCenterShown" class="collapsible-title">
                        <div>
                            <div>
                                <div :class="collapsibleClass" style="height: 0"></div>
                                Have a Professional Tier subscription?
                            </div>
                            <div class="collapsible-description" style="margin-left: 1.3rem">
                                Sign in with IAM Identity Center (SSO)
                                <a
                                    class="icon icon-lg icon-vscode-question"
                                    href="https://aws.amazon.com/codewhisperer/pricing/"
                                    v-on:click="uiClick('auth_learnMoreProfessionalTierCodeWhisperer')"
                                ></a>
                            </div>
                        </div>
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
import BuilderIdForm, { CodeWhispererBuilderIdState } from '../authForms/manageBuilderId.vue'
import IdentityCenterForm, { CodeWhispererIdentityCenterState } from '../authForms/manageIdentityCenter.vue'
import BaseServiceItemContent from './baseServiceItemContent.vue'
import authFormsState, { AuthForm, FeatureStatus } from '../authForms/shared.vue'
import { AuthFormId } from '../authForms/types'
import { ConnectionUpdateArgs } from '../authForms/baseAuth.vue'
import { WebviewClientFactory } from '../../../../webviews/client'
import { AuthUiClick, AuthWebview } from '../show'

const client = WebviewClientFactory.create<AuthWebview>()

function initialData() {
    return {
        isLoaded: {
            builderIdCodeWhisperer: false,
            identityCenterCodeWhisperer: false,
        } as Record<AuthFormId, boolean>,
        isAllAuthsLoaded: false,
        isIdentityCenterShown: false,
    }
}

export default defineComponent({
    name: 'CodeWhispererContent',
    components: { BuilderIdForm, IdentityCenterForm },
    extends: BaseServiceItemContent,
    data() {
        return initialData()
    },
    created() {
        this.refreshPanel()
        client.onDidConnectionChangeCodeWhisperer(() => {
            this.refreshPanel()
        })
    },
    computed: {
        builderIdState(): CodeWhispererBuilderIdState {
            return authFormsState.builderIdCodeWhisperer
        },
        identityCenterState(): CodeWhispererIdentityCenterState {
            return authFormsState.identityCenterCodeWhisperer
        },
        /** The appropriate accordion symbol (collapsed/uncollapsed) */
        collapsibleClass() {
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
            if (args.id === 'identityCenterCodeWhisperer') {
                // Want to show the identity center form if already connected
                this.isIdentityCenterShown = await this.identityCenterState.isAuthConnected()
            }

            this.isLoaded[args.id] = true
            this.updateIsAllAuthsLoaded()

            this.emitAuthConnectionUpdated('codewhisperer', args)
        },
        toggleIdentityCenterShown() {
            this.isIdentityCenterShown = !this.isIdentityCenterShown
            if (this.isIdentityCenterShown) {
                client.emitUiClick('auth_codewhisperer_expandIAMIdentityCenter')
            }
        },
        uiClick(id: AuthUiClick) {
            client.emitUiClick(id)
        },
    },
})

export class CodeWhispererContentState extends FeatureStatus {
    override getAuthForms(): AuthForm[] {
        return [authFormsState.builderIdCodeWhisperer, authFormsState.identityCenterCodeWhisperer]
    }
}
</script>

<style>
@import './baseServiceItemContent.css';
@import '../shared.css';
</style>
