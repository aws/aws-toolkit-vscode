<template>
    <div class="auth-form container-background border-common" id="identity-center-form">
        <div>
            <FormTitle :isConnected="isConnected">Resource Explorer</FormTitle>
            <div v-if="!isConnected">Successor to AWS Single Sign-on</div>
        </div>

        <div v-if="isConnected" class="form-section">
            <button v-on:click="showExplorer()">Open Resource Explorer</button>
        </div>
    </div>
</template>
<script lang="ts">
import { PropType, defineComponent } from 'vue'
import BaseAuthForm from './baseAuth.vue'
import FormTitle from './formTitle.vue'
import { WebviewClientFactory } from '../../../../webviews/client'
import { AuthWebview } from '../show'
import { ExplorerIdentityCenterState } from './manageIdentityCenter.vue'
import { CredentialsState } from './manageCredentials.vue'

const client = WebviewClientFactory.create<AuthWebview>()

export type IdentityCenterStage = 'START' | 'WAITING_ON_USER' | 'CONNECTED'

/**
 * This component is used to represent all of the multiple auth
 * mechanisms in one place. It aggregates the possible auth mechanisms
 * and if one of them are connected this will show that the explorer
 * is successfully connected.
 */
export default defineComponent({
    name: 'ExplorerAggregateForm',
    extends: BaseAuthForm,
    components: { FormTitle },
    props: {
        identityCenterState: {
            type: Object as PropType<ExplorerIdentityCenterState>,
            required: true,
        },
        credentialsState: {
            type: Object as PropType<CredentialsState>,
            required: true,
        },
    },
    data() {
        return {
            isConnected: false,
        }
    },

    async created() {
        this.isConnected =
            (await this.identityCenterState.isAuthConnected()) || (await this.credentialsState.isAuthConnected())
        this.emitAuthConnectionUpdated({ id: 'aggregateExplorer', isConnected: this.isConnected, cause: 'created' })
    },
    computed: {},
    methods: {
        showExplorer() {
            client.showResourceExplorer()
        },
    },
})
</script>
<style>
@import './sharedAuthForms.css';
@import '../shared.css';

#identity-center-form {
    width: 280px;
    height: fit-content;
}
</style>
