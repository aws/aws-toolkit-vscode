<template>
    <div>
        <input />
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { WebviewClientFactory } from '../../../webviews/client'
import { createClass, createType } from '../../../webviews/util'
import { WeaverbirdChatWebview } from './backend'

const client = WebviewClientFactory.create<WeaverbirdChatWebview>()

type PartialModel = {
    history: string[]
}
export const VueModel = createClass<PartialModel>({
    history: [],
})

export default defineComponent({
    name: 'chat',
    props: {
        modelValue: {
            type: createType(VueModel),
            required: true,
        },
    },
    emits: {},
    computed: {
        history() {
            return this.modelValue.history
        },
    },
    methods: {
        async send(msg: string) {
            return client.send(msg)
        },
    },
})
</script>

<style scoped></style>
