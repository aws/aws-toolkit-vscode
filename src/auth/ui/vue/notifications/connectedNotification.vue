<template>
    <NotificationContainer type="Success" v-on:close-notification="closeMessage()">
        <template v-slot:message-slot>
            <div style="display: flex; flex-direction: row">
                Connected to&nbsp;<span style="font-weight: bold">{{ args.authName }}</span
                >! See connections in the&nbsp;<a v-on:click="showConnectionQuickPick()" style="cursor: pointer"
                    >Toolkit panel</a
                >.
            </div>
        </template>
    </NotificationContainer>
</template>

<script lang="ts">
import { PropType, defineComponent } from 'vue'
import NotificationContainer from './notificationContainer.vue'
import { WebviewClientFactory } from '../../../../webviews/client'
import { AuthWebview } from '../show'
import BaseNotification from './baseNotification.vue'
import { Notifications } from './notifications.vue'

const client = WebviewClientFactory.create<AuthWebview>()
const notificationController = Notifications.instance

export default defineComponent({
    name: 'ConnectedNotification',
    components: { NotificationContainer },
    extends: BaseNotification,
    props: {
        args: {
            type: Object as PropType<{
                authName: string
            }>,
            required: true,
        },
    },
    methods: {
        showConnectionQuickPick() {
            client.showConnectionQuickPick()
            client.emitUiClick('auth_openConnectionSelector')
        },
        /** {@override} of {@link BaseNotification} */
        getComponentId() {
            return 'ConnectedNotification'
        },
        closeMessage() {
            notificationController.clearSuccessNotification()
        },
    },
})
</script>
