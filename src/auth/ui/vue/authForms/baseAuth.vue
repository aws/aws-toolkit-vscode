<script lang="ts">
import { defineComponent } from 'vue'
import { AuthStatus } from './shared.vue'
import { AuthFormId } from './types'

export type ConnectionUpdateCause = 'signIn' | 'signOut' | 'created'
export type ConnectionUpdateArgs = { id: AuthFormId; isConnected: boolean; cause?: ConnectionUpdateCause }

export default defineComponent({
    emits: ['auth-connection-updated'],
    methods: {
        emitAuthConnectionUpdated(args: ConnectionUpdateArgs) {
            this.$emit('auth-connection-updated', args)
        },
    },
})

export class UnimplementedAuthStatus implements AuthStatus {
    isAuthConnected(): Promise<boolean> {
        return Promise.resolve(false)
    }
}
</script>
