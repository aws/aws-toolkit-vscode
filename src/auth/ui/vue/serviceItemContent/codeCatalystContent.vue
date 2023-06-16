<template>
    <div class="service-item-content-container border-common" v-show="isAllAuthsLoaded">
        <div class="service-item-content-container-title">Amazon CodeCatalyst</div>

        <div>
            <img
                src="https://github.com/aws/aws-toolkit-vscode/assets/118216176/37e373c5-25f1-4098-95a8-9204daf8dde8"
            />
        </div>

        <div>
            Amazon CodeCatalyst, is a cloud-based collaboration space for software development teams. You can create a
            project that will generate resources that you can manage, including Dev Environments and workflows. Through
            the AWS Toolkit for Visual Studio Code, you can view and manage your CodeCatalyst resources directly from VS
            Code.
        </div>

        <div>
            <a href="https://aws.amazon.com/codewhisperer/">Learn more about CodeCatalyst.</a>
        </div>

        <hr />

        <div class="service-item-content-form-section">
            <div class="service-item-content-form-container">
                <BuilderIdForm
                    :state="builderIdState"
                    @auth-connection-updated="onAuthConnectionUpdated"
                ></BuilderIdForm>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import BuilderIdForm, { CodeCatalystBuilderIdState } from '../authForms/manageBuilderId.vue'
import BaseServiceItemContent from './baseServiceItemContent.vue'
import authFormsState, { AuthStatus } from '../authForms/shared.vue'
import { AuthFormId } from '../authForms/types'

export default defineComponent({
    name: 'CodeCatalystContent',
    components: { BuilderIdForm },
    extends: BaseServiceItemContent,
    data() {
        return {
            isLoaded: {
                builderIdCodeCatalyst: false,
            } as Record<AuthFormId, boolean>,
            isAllAuthsLoaded: false,
        }
    },
    computed: {
        builderIdState(): CodeCatalystBuilderIdState {
            return authFormsState.builderIdCodeCatalyst
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
            this.emitIsAuthConnected('CODE_CATALYST', isConnected)
        },
    },
})

export class CodeCatalystContentState implements AuthStatus {
    async isAuthConnected(): Promise<boolean> {
        return authFormsState.builderIdCodeCatalyst.isAuthConnected()
    }
}
</script>

<style>
@import './baseServiceItemContent.css';
@import '../shared.css';
</style>
