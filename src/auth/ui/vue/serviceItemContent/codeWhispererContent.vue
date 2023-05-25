<template>
    <div class="service-item-content-container border-common" v-show="isAllAuthsLoaded">
        <div class="service-item-content-container-title">Amazon CodeWhisperer</div>

        <div>
            <img
                src="https://docs.aws.amazon.com/images/codewhisperer/latest/userguide/images/cw-c9-function-from-comment.gif"
            />
        </div>

        <div>INSERT TEXT HERE</div>

        <div>
            <a href="https://aws.amazon.com/codewhisperer/">Learn more about CodeWhisperer.</a>
        </div>

        <hr />

        <div class="service-item-content-form-section">
            <div class="service-item-content-form-container">
                <BuilderIdForm
                    :state="builderIdState"
                    @auth-connection-updated="onAuthConnectionUpdated"
                ></BuilderIdForm>
                <IdentityCenterForm
                    :state="identityCenterState"
                    @auth-connection-updated="onAuthConnectionUpdated"
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
import authFormsState, { AuthStatus } from '../authForms/shared.vue'
import AuthFormId from '../authForms/types.vue'

export default defineComponent({
    name: 'CodeWhispererContent',
    components: { BuilderIdForm, IdentityCenterForm },
    extends: BaseServiceItemContent,
    data() {
        return {
            isAllAuthsLoaded: false,
            isLoaded: {
                BUILDER_ID_CODE_WHISPERER: false,
                IDENTITY_CENTER_CODE_WHISPERER: false,
            } as Record<AuthFormId, boolean>,
        }
    },
    computed: {
        builderIdState(): CodeWhispererBuilderIdState {
            return authFormsState.BUILDER_ID_CODE_WHISPERER
        },
        identityCenterState(): CodeWhispererIdentityCenterState {
            return authFormsState.IDENTITY_CENTER_CODE_WHISPERER
        },
    },
    methods: {
        updateIsAllAuthsLoaded() {
            const hasUnloaded = Object.values(this.isLoaded).filter(val => !val).length > 0
            this.isAllAuthsLoaded = !hasUnloaded
        },
        async onAuthConnectionUpdated(id: AuthFormId) {
            this.isLoaded[id] = true
            this.updateIsAllAuthsLoaded()

            const isConnected = await this.state.isAuthConnected()
            this.emitIsAuthConnected('CODE_WHISPERER', isConnected)
        },
    },
})

export class CodeWhispererContentState implements AuthStatus {
    async isAuthConnected(): Promise<boolean> {
        const result = await Promise.all([
            authFormsState.BUILDER_ID_CODE_WHISPERER.isAuthConnected(),
            authFormsState.IDENTITY_CENTER_CODE_WHISPERER.isAuthConnected(),
        ])
        return result.filter(isConnected => isConnected).length > 0
    }
}
</script>

<style>
@import './baseServiceItemContent.css';
@import '../shared.css';
</style>
