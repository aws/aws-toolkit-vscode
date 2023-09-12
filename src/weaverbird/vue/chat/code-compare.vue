<template>
    <div class="code-compare">
        <div v-if="interaction.status === 'accepted'">You have accepted these changes! Hoorray!</div>
        <div v-else-if="interaction.status === 'rejected'">You have rejected these changes. Ohnoes :(</div>
        <div v-else>
            The following files have changed:
            <FileTree :treeNode="fileListToTree(interaction.content)" :on-file-clicked="displayFileDiff" />
            <button class="button-primary" @click="acceptChanges">👍 Accept and insert code</button>
            <button :disabled="true" class="button-warning">♻ Iterate with comments</button>
            <button class="button-secondary" @click="rejectChanges">👎 This isn't what I expected</button>
        </div>
    </div>
</template>

<script setup lang="ts">
import FileTree from '../file-tree/file-tree.vue'
import { fileListToTree } from '../file-tree/helpers'
import { CodeGenInteraction } from './sessionState'

interface Props {
    interaction: CodeGenInteraction
    client: WebviewClient<ClassToProtocol<WeaverbirdChatWebview>>
}
defineProps<Props>()
</script>

<script lang="ts">
import { defineComponent } from 'vue'
import { ClassToProtocol } from '../../../webviews/main'
import { WebviewClient } from '../../../webviews/client'
import { WeaverbirdChatWebview } from './backend'

const model = {}

export default defineComponent({
    name: 'code-compare',
    data() {
        return model
    },
    async created() {},
    emits: {},
    watch: {},
    methods: {
        displayFileDiff(filePath: string) {
            this.client.displayDiff(filePath)
        },

        acceptChanges() {
            this.interaction.status = 'accepted'
            this.client.acceptChanges(this.interaction.content)
        },

        rejectChanges() {
            this.interaction.status = 'rejected'
        },
    },
})
</script>

<style scoped>
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

button {
    flex: 0 0 auto;
}
</style>
