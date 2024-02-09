<script lang="ts">
import { defineComponent } from 'vue'
import { AuthFormId } from './types'
import TelemetryClient from '../telemetry.vue'
import { Notifications } from '../notifications/notifications.vue'

export type ConnectionUpdateCause = 'signIn' | 'signOut' | 'created'
export type ConnectionUpdateArgs = { id: AuthFormId; isConnected: boolean; cause?: ConnectionUpdateCause }

export default defineComponent({
    emits: ['auth-connection-updated'],
    extends: TelemetryClient,
    methods: {
        emitAuthConnectionUpdated(args: ConnectionUpdateArgs) {
            Notifications.instance.showSuccessNotification(args)
            this.$emit('auth-connection-updated', args)
        },
    },
})
</script>
