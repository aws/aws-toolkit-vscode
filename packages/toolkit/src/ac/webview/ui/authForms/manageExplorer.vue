<template>
    <div class="auth-container">
        <FormTitle v-if="isConnected">{{ connectionName }}</FormTitle>
    </div>
</template>
<script lang="ts">
import { PropType, defineComponent } from 'vue'
import BaseAuthForm from './baseAuth.vue'
import FormTitle from './formTitle.vue'
import { ExplorerIdentityCenterState } from './manageIdentityCenter.vue'
import { CredentialsState } from './manageCredentials.vue'
import { AuthFormId } from './types'

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
            connectionName: '',
        }
    },

    async created() {
        this.isConnected =
            (await this.credentialsState.isAuthConnected()) || (await this.identityCenterState.isAuthConnected())
        await this.updateConnectionName()
        this.emitAuthConnectionUpdated({ id: 'aggregateExplorer', isConnected: this.isConnected, cause: 'created' })
    },
    methods: {
        async updateConnectionName() {
            const currentConnection = await this.getCurrentConnection()
            if (currentConnection === undefined) {
                this.connectionName = ''
            } else {
                this.connectionName = currentConnection === 'credentials' ? 'IAM Credentials' : 'IAM Identity Center'
            }
        },
        /**
         * Gets the current working connection that the explorer can use.
         */
        async getCurrentConnection(): Promise<AuthFormId | undefined> {
            if (!this.isConnected) {
                return undefined
            }
            return (await this.credentialsState.isAuthConnected()) ? 'credentials' : 'identityCenterExplorer'
        },
    },
})
</script>
<style>
@import './sharedAuthForms.css';
@import '../shared.css';
</style>
