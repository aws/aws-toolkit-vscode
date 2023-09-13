<template>
    <ul>
        <div v-if="treeNode.type === 'folder'">
            <li class="folder" @click="toggleFolderCollapse()">
                <span class="icon icon-lg icon-vscode-folder" style="color: #ffffff"></span>
                {{ treeNode.name }}
            </li>
            <div v-show="!collapsed">
                <div v-for="child in treeNode.children">
                    <file-tree :treeNode="child" :on-file-clicked="onFileClicked" />
                </div>
            </div>
        </div>
        <div v-else>
            <li class="file" @click="fileClicked(treeNode as FileNode)">
                <span class="icon icon-lg icon-vscode-file" style="color: #ffffff"></span>
                {{ treeNode.name }}
            </li>
        </div>
    </ul>
</template>

<script setup lang="ts">
import type { FileNode, TreeNode } from '../file-tree/helpers'

defineProps<{ treeNode: TreeNode; onFileClicked: (filePath: string) => void }>()
</script>

<script lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
    data() {
        return { collapsed: false }
    },
    methods: {
        fileClicked(fileNode: FileNode) {
            this.onFileClicked(fileNode.filePath)
        },
        toggleFolderCollapse() {
            this.collapsed = !this.collapsed
        },
    },
})
</script>

<style scoped>
ul {
    padding-inline-start: 20px;
}

li {
    list-style-type: none;
    height: 1.7em;
}

.file {
    cursor: pointer;
}

.file:hover {
    background-color: var(--vscode-editor-hoverHighlightBackground);
}

.folder {
    cursor: pointer;
}
</style>
