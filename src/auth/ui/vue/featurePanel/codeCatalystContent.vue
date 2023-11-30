<template>
    <div :id="panelId" class="feature-panel-container border-common" :class="isActive ? 'feature-panel-selected' : ''">
        <div class="feature-panel-container-upper">
            <div class="feature-panel-container-title">Amazon CodeCatalyst</div>

            <img
                class="feature-panel-image"
                src="https://github.com/aws/aws-toolkit-vscode/raw/HEAD/docs/marketplace/vscode/CC_dev_env.gif"
                alt="CodeCatalyst example GIF"
            />

            <div class="feature-panel-container-description">
                Spend more time coding and less time managing development environments.
                <a href="https://aws.amazon.com/codecatalyst/" v-on:click="emitUiClick('auth_learnMoreCodeCatalyst')"
                    >Learn more.</a
                >
            </div>
        </div>

        <hr />

        <template v-if="!removeAuthForms">
            <div class="feature-panel-auth-container" :key="authFormContainerKey" v-show="canShowAuthForms">
                <BuilderIdForm
                    v-if="connectedAuth === undefined || connectedAuth === 'builderIdCodeCatalyst'"
                    :state="builderIdState"
                    @auth-connection-updated="onAuthConnectionUpdated"
                ></BuilderIdForm>

                <IdentityCenterForm
                    v-if="connectedAuth === undefined || connectedAuth === 'identityCenterCodeCatalyst'"
                    :state="identityCenterState"
                    :allow-existing-start-url="true"
                    @auth-connection-updated="onAuthConnectionUpdated"
                ></IdentityCenterForm>

                <button v-if="connectedAuth" v-on:click="showCodeCatalystNode()">Open CodeCatalyst in Toolkit</button>
            </div>
        </template>
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import BuilderIdForm, { CodeCatalystBuilderIdState } from '../authForms/manageBuilderId.vue'
import IdentityCenterForm, { CodeCatalystIdentityCenterState } from '../authForms/manageIdentityCenter.vue'
import BaseServiceItemContent, { PanelActivityState } from './baseServiceItemContent.vue'
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
            identityCenterCodeCatalyst: false,
        } as { [id in AuthFormId]?: boolean },
        panelId: 'codecatalyst-panel',
        connectedAuth: undefined as
            | Extract<AuthFormId, 'builderIdCodeCatalyst' | 'identityCenterCodeCatalyst'>
            | undefined,
        removeAuthForms: false,
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
        client.onDidConnectionChangeCodeCatalyst(() => {
            this.refreshPanel()
        })
    },
    mounted() {
        PanelActivityState.instance.registerPanel(this.$data.panelId, 'codecatalyst')
    },
    computed: {
        builderIdState(): CodeCatalystBuilderIdState {
            return authFormsState.builderIdCodeCatalyst
        },
        identityCenterState(): CodeCatalystIdentityCenterState {
            return authFormsState.identityCenterCodeCatalyst
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
        showCodeCatalystNode() {
            client.showCodeCatalystNode()
            client.emitUiClick('auth_openCodeCatalyst')
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
