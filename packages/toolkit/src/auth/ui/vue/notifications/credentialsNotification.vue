<template>
    <NotificationContainer type="Success" v-on:close-notification="closeMessage()">
        <template v-slot:message-slot>
            <div style="display: flex; flex-direction: row">
                IAM Credentials detected, select one in the&nbsp;<a
                    v-on:click="showConnectionQuickPick()"
                    style="cursor: pointer"
                    >Toolkit panel</a
                >&nbsp;to enable the AWS Explorer.
            </div>
        </template>
    </NotificationContainer>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import NotificationContainer from './notificationContainer.vue'
import { WebviewClientFactory } from '../../../../webviews/client'
import { AuthWebview } from '../show'
import { Notifications } from './notifications.vue'

const client = WebviewClientFactory.create<AuthWebview>()

const notificationController = Notifications.instance

export default defineComponent({
    name: 'CredentialsNotification',
    components: { NotificationContainer },
    emits: [
        /** Inherited from {@link NotificationContainer} and Propagated */
        'close-notification',
    ],
    methods: {
        showConnectionQuickPick() {
            client.showConnectionQuickPick()
            client.emitUiClick('auth_openConnectionSelector')
        },
        closeMessage() {
            notificationController.clearCredentialsNotification()
        },
    },
})

/**
 * Shows a message to the user if this is their first time using the extension
 * and we have detected existing credentials on their system.
 */
export async function showFoundExistingCredentials(notificationController: Notifications) {
    const isFirstUse = await client.isExtensionFirstUse()
    // Order these are called matters since isCredentialExists() pulls in local credentials
    const isCredentialConnected = await client.isCredentialConnected()
    const isCredentialExists = await client.isCredentialExists()

    if (isFirstUse && (isCredentialConnected || isCredentialExists)) {
        notificationController.model.showFoundCredentials = true
    } else {
        notificationController.model.showFoundCredentials = false
    }
}
</script>
