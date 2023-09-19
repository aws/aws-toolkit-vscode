<template>
    <div class="code-compare">
        <div v-if="interaction.status === 'accepted'">You have accepted these changes! Hoorray!</div>
        <div v-else-if="interaction.status === 'rejected'">You have rejected these changes. Ohnoes :(</div>
        <div v-else>
            The following files have changed:
            <FileTree :treeNode="fileListToTree(interaction.content)" :on-file-clicked="displayFileDiff" />
            <div v-if="interaction.status === 'iterating'">
                We are still discussing these changes. Let's keep them here for now.
            </div>
            <div v-else>
                <button class="button-primary" @click="acceptChanges">👍 Accept and insert code</button>
                <button class="button-warning" @click="iterateWithComments">♻ Iterate with comments</button>
                <button class="button-secondary" @click="rejectChanges">👎 This isn't what I expected</button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import FileTree from '../file-tree/file-tree.vue'
import { fileListToTree } from '../file-tree/helpers'
import type { CodeGenInteraction } from '../../types'

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
        async displayFileDiff(filePath: string) {
            await this.client.displayDiff(filePath)
        },

        async acceptChanges() {
            this.interaction.status = 'accepted'
            await this.client.acceptChanges(this.interaction.content)
        },

        iterateWithComments() {
            this.interaction.status = 'iterating'
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
