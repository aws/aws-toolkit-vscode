<template>
    <div class="context-menu" v-if="visible" :style="style">
        <button @click="onCopyCell">
            <p>
                <span class="icon icon-sm icon-vscode-copy"></span>
                Copy
            </p>
        </button>
        <button @click="onCopyRow">
            <p>
                <span class="icon icon-sm icon-vscode-copy"></span>
                Copy Row
            </p>
        </button>
        <vscode-divider style="margin-top: 2px"></vscode-divider>
        <button @click="onDelete">
            <p>
                <span class="icon icon-sm icon-vscode-discard"></span>
                Delete Item
            </p>
        </button>
        <button @click="onEdit">
            <p>
                <span class="icon icon-sm icon-vscode-edit"></span>
                Edit Item
            </p>
        </button>
    </div>
</template>

<script lang="ts">
import { defineComponent, computed, PropType } from 'vue'

export default defineComponent({
    props: {
        position: {
            type: Object as PropType<{ top: number; left: number }>,
            required: true,
        },
        visible: {
            type: Boolean,
            required: true,
        },
    },
    setup(props, { emit }) {
        const style = computed(() => ({
            top: `${props.position.top}px`,
            left: `${props.position.left}px`,
        }))

        const onCopyCell = () => {
            emit('copyCell')
            emit('close')
        }

        const onCopyRow = () => {
            emit('copyRow')
            emit('close')
        }

        const onDelete = () => {
            emit('delete')
            emit('close')
        }

        const onEdit = () => {
            emit('edit')
            emit('close')
        }

        return {
            style,
            onCopyCell,
            onCopyRow,
            onDelete,
            onEdit,
        }
    },
})
</script>

<style scoped>
.context-menu {
    display: flex;
    flex-direction: column;
    align-items: center; /* Centers items vertically */
    position: absolute;
    background-color: #fff;
    border: 1px solid #ccc;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
    padding: 10px;
    width: 150px; /* Adjust width as needed */
    border-radius: 5px;
    z-index: 1000; /* Ensure menu appears above other elements */
}

.context-menu button {
    width: 100%;
    padding: 2px;
    border: none;
    cursor: pointer;
    display: flex;
    flex-direction: row;
    justify-content: start;
    background: inherit;
}

.context-menu button:hover {
    background-color: #beb1b1;
}

.context-menu p {
    color: black;
}
</style>
