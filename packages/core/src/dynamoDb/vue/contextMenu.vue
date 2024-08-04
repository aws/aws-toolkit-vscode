<template>
    <div class="context-menu" v-if="visible" :style="style">
        <button @click="onCopy">Copy</button>
        <button @click="onDelete">Delete Item</button>
        <button @click="onEdit">Edit Item</button>
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
    position: absolute;
    background: white;
    border: 1px solid #ccc;
    padding: 10px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}
</style>
