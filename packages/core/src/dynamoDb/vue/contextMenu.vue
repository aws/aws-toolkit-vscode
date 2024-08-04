<template>
    <div class="context-menu" v-if="visible" :style="style">
        <button @click="onCopy">
            <p>
                <span class="icon icon-sm icon-vscode-copy"></span>
                Copy
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

        const onCopy = () => {
            emit('copy')
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
            onCopy,
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
