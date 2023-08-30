<template>
    <div>
        <div v-for="interaction in history">
            <div
                class="chat-messages"
                :class="{ 'user-message': interaction.origin === 'user', 'ai-message': interaction.origin === 'ai' }"
            >
                <div class="chat-message" v-if="interaction.type === 'message'">
                    {{ interaction.content }}
                </div>
                <div v-if="interaction.type === 'codegen'" class="chat-message codegen">
                    <CodeCompare :interaction="interaction" :client="client" />
                </div>
            </div>
        </div>
        <form class="chat-input" @submit.prevent="submit">
            <input v-model="message" />
            <button type="submit" :disabled="isInputDisabled">Submit</button>
        </form>
    </div>
</template>

<script lang="ts" setup>
import CodeCompare from './code-compare.vue'
</script>

<script lang="ts">
import { defineComponent } from 'vue'
import { WebviewClientFactory } from '../../../webviews/client'
import { WeaverbirdChatWebview } from './backend'
import type { Interaction } from './session'
import type { MemoryFile } from '../../memoryFile'

const client = WebviewClientFactory.create<WeaverbirdChatWebview>()

const model = {
    history: [] as Interaction[],
    message: '',
    isInputDisabled: false,
    client,
}

export default defineComponent({
    name: 'chat',
    data() {
        return model
    },
    async created() {
        this.$data.history = []
    },
    emits: {},
    // lazily evaluated and cached based on their dependencies
    // only gets recomputed once it's dependencies change
    // computed: {
    //     model() {
    //         return this.modelValue
    //     },
    //     'model.history'() {
    //         return this.model.history
    //     },
    // },
    // Perform side effects when specific data changes
    watch: {},
    // Regular javascript functions that get called when
    // invoked. Methods don't cache or track dependencies
    methods: {
        // Add the new row to history and then
        // submit the full data to the client
        async submit() {
            const message = this.message
            this.history.push({ origin: 'user', type: 'message', content: message })
            this.message = ''

            this.isInputDisabled = true

            // TODO extract this into a try/catch?
            const serviceResponse = (await client.send(message)) ?? {
                origin: 'ai',
                type: 'message',
                content: 'Could not retrieve message from the Weaverbird service. Please try again.',
            }
            if (Array.isArray(serviceResponse)) this.history.push(...serviceResponse)
            else this.history.push(serviceResponse)

            this.isInputDisabled = false
        },

        displayFileDiff(file: MemoryFile) {
            client.displayDiff(file)
        },

        acceptChanges(files: MemoryFile[]) {
            client.acceptChanges(files)
        },
    },
})
</script>

<style scoped>
.chat-messages {
    padding-bottom: 10px;
}

.chat-messages.ai-message {
    text-align: left;
}

.chat-messages.user-message {
    text-align: right;
}

.chat-message {
    border-radius: 10px;
    padding: 15px;
    display: inline-block;
    width: auto;
    background-color: var(--vscode-chat-requestBackground);
    border-color: var(--vscode-chat-requestBorder);
}

.chat-input {
    text-align: center;
    display: flex;
    bottom: 15px;
}

.button-primary {
    background-color: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border-color: var(--vscode-button-border);
}

.button-primary:hover {
    background-color: var(--vscode-button-hoverBackground);
    display: block;
    margin: 8px 0;
}

.button-secondary {
    background-color: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border-color: var(--vscode-button-secondaryBorder);
    display: block;
    margin: 8px 0;
}

.button-secondary:hover {
    background-color: var(--vscode-button-secondaryHoverBackground);
}

.button-warning {
    background-color: var(--vscode-statusBarItem-warningBackground);
    color: var(--vscode-statusBarItem-warningForeground);
    display: block;
    margin: 8px 0;
}

.button-warning:hover {
    background-color: var(--vscode-statusBarItem-hoverBackground);
}

input {
    height: 25px;
    flex: 1;
}

button {
    flex: 0 0 auto;
}
</style>
