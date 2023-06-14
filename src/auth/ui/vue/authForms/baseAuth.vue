<script lang="ts">
import { defineComponent } from 'vue'
import { AuthStatus } from './shared.vue'
import { AuthFormId } from './types'

export default defineComponent({
    emits: ['auth-connection-updated'],
    methods: {
        emitAuthConnectionUpdated(id: AuthFormId) {
            this.$emit('auth-connection-updated', id)
        },
    },
})

export class UnimplementedAuthStatus implements AuthStatus {
    isAuthConnected(): Promise<boolean> {
        return Promise.resolve(false)
    }
}
</script>
