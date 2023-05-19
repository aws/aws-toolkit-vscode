<template>
    <div class="service-item-content-container border-common">
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

export default defineComponent({
    name: 'CodeCatalystContent',
    components: { BuilderIdForm },
    extends: BaseServiceItemContent,
    computed: {
        builderIdState(): CodeCatalystBuilderIdState {
            return authFormsState.BUILDER_ID_CODE_CATALYST
        },
    },
    methods: {
        async onAuthConnectionUpdated() {
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
