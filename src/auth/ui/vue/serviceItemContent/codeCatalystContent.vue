<template>
    <div class="service-item-content-container border-common" v-show="isAllAuthsLoaded">
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
import AuthFormId from '../authForms/types.vue'

export default defineComponent({
    name: 'CodeCatalystContent',
    components: { BuilderIdForm },
    extends: BaseServiceItemContent,
    data() {
        return {
            isLoaded: {
                BUILDER_ID_CODE_CATALYST: false,
            } as Record<AuthFormId, boolean>,
            isAllAuthsLoaded: false,
        }
    },
    computed: {
        builderIdState(): CodeCatalystBuilderIdState {
            return authFormsState.BUILDER_ID_CODE_CATALYST
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
        return authFormsState.BUILDER_ID_CODE_CATALYST.isAuthConnected()
    }
}
</script>

<style>
@import './baseServiceItemContent.css';
@import '../shared.css';
</style>
