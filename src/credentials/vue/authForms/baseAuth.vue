<script lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
    emits: ['auth-connection-updated'],
    methods: {
        emitAuthConnectionUpdated(id: AuthFormId) {
            this.$emit('auth-connection-updated', id)
        },
    },
})

export interface AuthStatus {
    /**
     * Returns true if the auth is successfully connected.
     */
    isAuthConnected(): Promise<boolean>
}

export class UnimplementedAuthStatus implements AuthStatus {
    isAuthConnected(): Promise<boolean> {
        return Promise.resolve(false)
    }
}

export const authForms = {
    CREDENTIALS: 'CREDENTIALS',
} as const

export type AuthFormId = (typeof authForms)[keyof typeof authForms]
</script>
