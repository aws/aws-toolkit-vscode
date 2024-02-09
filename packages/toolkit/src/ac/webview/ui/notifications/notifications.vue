<script lang="ts">
import { reactive } from 'vue'
import { AuthFormDisplayName, AuthFormId } from '../authForms/types'
import { ConnectionUpdateArgs } from '../authForms/baseAuth.vue'

// I don't want the Notifications class as a default export, so this makes Vue happy
export default () => {}

/**
 * This is essentially a Model+Controller in MVC for all things
 * related to the notification messages.
 */
export class Notifications {
    private constructor() {}

    static #instance: Notifications
    static get instance() {
        return (this.#instance ??= new Notifications())
    }

    /** Vue Components using these will update if any value changes due to {@link reactive} */
    model = reactive({
        showSuccessfulConnection: false,
        authName: '',
        showFoundCredentials: false,
    })

    showSuccessNotification(args: ConnectionUpdateArgs) {
        if (args.isConnected && args.cause === 'signIn') {
            this.model.authName = AuthFormDisplayName[args.id]
            this.model.showSuccessfulConnection = true
        }
    }
    clearSuccessNotification() {
        this.model.showSuccessfulConnection = false
    }

    showCredentialsNotification(id: AuthFormId) {
        this.model.authName = AuthFormDisplayName[id]
        this.model.showFoundCredentials = true
    }
    clearCredentialsNotification() {
        this.model.showFoundCredentials = false
    }
}
</script>
