<template>
    <div class="service-item-content-container border-common">
        <div>
            <BuilderIdForm :state="builderIdState" @auth-connection-updated="onAuthConnectionUpdated"></BuilderIdForm>
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import BuilderIdForm, { CodeWhispererBuilderIdState } from '../authForms/manageBuilderId.vue'
import BaseServiceItemContent from './baseServiceItemContent.vue'
import authFormsState, { AuthStatus } from '../authForms/shared.vue'

export default defineComponent({
    name: 'CodeWhispererContent',
    components: { BuilderIdForm },
    extends: BaseServiceItemContent,
    computed: {
        builderIdState(): CodeWhispererBuilderIdState {
            return authFormsState.BUILDER_ID_CODE_WHISPERER
        },
    },
    methods: {
        async onAuthConnectionUpdated() {
            const isConnected = await this.state.isAuthConnected()
            this.emitIsAuthConnected('CODE_WHISPERER', isConnected)
        },
    },
})

export class CodeWhispererContentState implements AuthStatus {
    async isAuthConnected(): Promise<boolean> {
        return authFormsState.BUILDER_ID_CODE_WHISPERER.isAuthConnected()
    }
}
</script>

<style>
@import './baseServiceItemContent.css';
@import '../shared.css';
</style>
