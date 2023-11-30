<template>
    <div
        class="border-common notification-container"
        :class="textColorClass"
        :style="{
            width: '100%',
            'white-space': 'nowrap',
            display: 'flex',
            'flex-direction': 'row',
            'justify-content': 'space-between',
            'background-color': backgroundColor,
            'align-items': 'center',
            padding: '1%',
        }"
    >
        <div>
            <!-- To use named-slot: <template v-slot:message-slot></template> -->
            <slot name="message-slot"></slot>
        </div>

        <div
            v-on:click="emitCloseNotification(id)"
            :style="{ cursor: 'pointer' }"
            class="icon icon-lg icon-vscode-chrome-close"
        ></div>
    </div>
</template>

<script lang="ts">
import { PropType, defineComponent } from 'vue'

type NotificationType = 'Success' | 'Failure'
export type NotificationId = string

const BackgroundColors: { [type in NotificationType]: string } = {
    Success: '#049410',
    Failure: '#b00202',
} as const

const TextColorClasses: { [type in NotificationType]: string } = {
    Success: 'success-text',
    Failure: 'failure-text',
} as const

/**
 * This is the container of a single message, this has no content in it.
 * You instantiate this component using VueJS "slots".
 */
export default defineComponent({
    name: 'NotificationContainer',
    emits: ['close-notification'],
    props: {
        type: {
            type: String as PropType<NotificationType>,
            required: true,
        },
    },
    data() {
        return {
            id: crypto.randomUUID() as NotificationId,
        }
    },
    computed: {
        backgroundColor(): string {
            return BackgroundColors[this.type]
        },
        textColorClass(): string {
            return TextColorClasses[this.type]
        },
    },
    methods: {
        emitCloseNotification(id: NotificationId) {
            this.$emit('close-notification', id)
        },
    },
})
</script>

<style>
.success-text div {
    color: white;
}

.success-text a {
    color: rgb(47, 111, 249);
}

.failure-text div {
    color: white;
}

.failure-text a {
    color: rgb(78 133 255);
}

.notification-container {
    border: var(--vscode-foreground);
    box-sizing: border-box;
}
</style>
