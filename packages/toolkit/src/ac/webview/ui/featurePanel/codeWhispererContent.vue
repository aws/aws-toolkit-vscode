<template>
    <div :id="panelId" class="feature-panel-container border-common" :class="isActive ? 'feature-panel-selected' : ''">
        <div class="feature-panel-container-upper">
            <div class="feature-panel-container-title">Amazon Q + CodeWhisperer</div>

            <img
                class="feature-panel-image"
                src="https://github.com/aws/aws-toolkit-vscode/raw/HEAD/docs/marketplace/vscode/codewhispererChat.gif"
                alt="CodeWhisperer Chat example GIF"
            />

            <div class="feature-panel-container-description">
                Build, maintain, and transform applications using generative AI.
                <br />
                <br />
                Learn more about
                <a href="https://aws.amazon.com/q/" v-on:click="emitUiClick('auth_learnMoreAmazonQ')"> Amazon Q</a>
                and
                <a href="https://aws.amazon.com/codewhisperer/" v-on:click="emitUiClick('auth_learnMoreCodeWhisperer')">
                    CodeWhisperer</a
                >.
            </div>
        </div>

        <hr />

        <template v-if="!removeAuthForms">
            <div class="feature-panel-auth-container" :key="authFormContainerKey" v-show="canShowAuthForms">
                <BuilderIdForm
                    :state="builderIdState"
                    @auth-connection-updated="onAuthConnectionUpdated"
                    v-if="connectedAuth === undefined || connectedAuth === 'builderIdCodeWhisperer'"
                ></BuilderIdForm>

                <IdentityCenterForm
                    :state="identityCenterState"
                    :allow-existing-start-url="true"
                    @auth-connection-updated="onAuthConnectionUpdated"
                    v-if="connectedAuth === undefined || connectedAuth === 'identityCenterCodeWhisperer'"
                ></IdentityCenterForm>

                <button v-if="connectedAuth" v-on:click="showAmazonQChat()">Open Amazon Q chat</button>

                <button v-if="connectedAuth" v-on:click="showCodeWhispererView()">Open CodeWhisperer in Toolkit</button>
            </div>
        </template>
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import BuilderIdForm, { CodeWhispererBuilderIdState } from '../authForms/manageBuilderId.vue'
import IdentityCenterForm, { CodeWhispererIdentityCenterState } from '../authForms/manageIdentityCenter.vue'
import BaseServiceItemContent, { PanelActivityState } from './baseServiceItemContent.vue'
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
        panelId: 'codewhisperer-panel',
        isIdentityCenterShown: true,
        connectedAuth: undefined as
            | Extract<AuthFormId, 'builderIdCodeWhisperer' | 'identityCenterCodeWhisperer'>
            | undefined,
        removeAuthForms: false,
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
        client.onDidConnectionChangeCodeWhisperer(() => {
            this.refreshPanel()
        })
    },
    mounted() {
        PanelActivityState.instance.registerPanel(this.$data.panelId, 'codewhisperer')
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
                this.connectedAuth = args.id as typeof this.connectedAuth
            }

            this.isLoaded[args.id] = true
        },
        uiClick(id: AuthUiClick) {
            client.emitUiClick(id)
        },
        showCodeWhispererView() {
            client.showCodeWhispererView()
            client.emitUiClick('auth_openCodeWhisperer')
        },
        showAmazonQChat() {
            client.showAmazonQChat()
            client.emitUiClick('auth_amazonQChat')
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
