<script lang="ts">
import { defineComponent } from 'vue'
import { AuthFormId } from './types'
import TelemetryClient from '../telemetry.vue'

export type ConnectionUpdateCause = 'signIn' | 'signOut' | 'created'
export type ConnectionUpdateArgs = { id: AuthFormId; isConnected: boolean; cause?: ConnectionUpdateCause }

export default defineComponent({
    emits: ['auth-connection-updated'],
    extends: TelemetryClient,
    methods: {
        emitAuthConnectionUpdated(args: ConnectionUpdateArgs) {
            this.$emit('auth-connection-updated', args)
        },
    },
})
</script>
