<template>
    <div class="service-item-content-container border-common" v-show="isAllAuthsLoaded">
        <div class="service-item-content-container-title">Amazon CodeWhisperer</div>

        <div class="centered-items">
            <img
                class="service-item-content-image"
                src="https://github.com/aws/aws-toolkit-vscode/raw/HEAD/docs/marketplace/vscode/codewhisperer.gif"
                alt="CodeWhisperer example GIF"
            />
        </div>

        <div>
            Amazon CodeWhisperer is an AI coding companion that generates whole line and full function code suggestions
            in your IDE in real-time, to help you quickly write secure code.
        </div>

        <div>
            <a href="https://aws.amazon.com/codewhisperer/" v-on:click="emitUiClick('auth_learnMoreCodeWhisperer')"
                >Learn more about CodeWhisperer.</a
            >
        </div>

        <hr />

        <div class="service-item-content-form-section">
            <div class="codewhisperer-content-form-container">
                <BuilderIdForm
                    :state="builderIdState"
                    :disabled="true"
                    @auth-connection-updated="onAuthConnectionUpdated"
                ></BuilderIdForm>

                <div>
                    <div
                        v-on:click="toggleIdentityCenterShown"
                        style="cursor: pointer; display: flex; flex-direction: row"
                    >
                        <div style="font-weight: bold; font-size: medium" :class="collapsibleClass"></div>
                        <div>
                            <div style="font-weight: bold; font-size: 14px">
                                Have a Professional Tier subscription? Sign in with IAM Identity Center.
                            </div>
                            <div>
                                Professional Tier offers administrative capabilities for organizations of developers.
                            </div>
                            <a
                                href="https://aws.amazon.com/codewhisperer/pricing/"
                                v-on:click="uiClick('auth_learnMoreProfessionalTierCodeWhisperer')"
                                >Learn more.</a
                            >
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

export default defineComponent({
    name: 'CodeWhispererContent',
    components: { BuilderIdForm, IdentityCenterForm },
    extends: BaseServiceItemContent,
    data() {
        return {
            isAllAuthsLoaded: false,
            isLoaded: {
                builderIdCodeWhisperer: false,
                identityCenterCodeWhisperer: false,
            } as Record<AuthFormId, boolean>,
            isIdentityCenterShown: false,
        }
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

.codewhisperer-content-form-container {
    display: flex;
    flex-direction: column;
    gap: 20px;
    justify-content: center;
    align-items: left;
}
</style>
