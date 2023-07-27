<template>
    <div>
        <div class="chat-messages" v-for="row in history" :key="row">
            <div class="chat-message">
                {{ row }}
            </div>
        </div>
        <form class="chat-input" @submit.prevent="submit">
            <input v-model="message" />
            <button type="submit" :disabled="isInputDisabled">Submit</button>
        </form>
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { WebviewClientFactory } from '../../../webviews/client'
import { WeaverbirdChatWebview } from './backend'

const client = WebviewClientFactory.create<WeaverbirdChatWebview>()

const model = {
    history: ['asd', 'asdasd'] as string[],
    message: '',
    isInputDisabled: false,
}

export default defineComponent({
    name: 'chat',
    data() {
        return model
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
            this.history.push(message)
            this.message = ''

            this.isInputDisabled = true

            // Simulate waiting for server before re-enabling button
            await new Promise(r => setTimeout(r, 2500))

            // TODO extract this into a try/catch?
            const serviceResponse = await client.send(message)
            this.history.push(
                serviceResponse ?? 'Could not retrieve message from the Weaverbird service. Please try again.'
            )

            this.isInputDisabled = false
        },
    },
})
</script>

<style scoped>
.chat-messages:nth-child(even) {
    text-align: left;
}

.chat-messages:nth-child(odd) {
    text-align: right;
}

.chat-messages {
    padding-bottom: 10px;
}

.chat-message {
    background-color: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border-radius: 10px;
    padding: 15px;
    display: inline-block;
    width: auto;
}

.chat-input {
    text-align: center;
    display: flex;
    bottom: 15px;
}

input {
    height: 25px;
    flex: 1;
}

button {
    flex: 0 0 auto;
}
</style>
