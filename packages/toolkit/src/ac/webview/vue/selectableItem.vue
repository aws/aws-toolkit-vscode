<template>
    <div class="item-container" :class="{ selected: isSelected }" @click="toggleSelection">
        {{ itemText }}
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
export default defineComponent({
    name: 'SelectableItem',
    components: {},
    props: {
        itemText: String,
        isSelected: Boolean,
        itemId: Number,
    },
    data() {
        return {
            itemText: this.itemText,
            isSelected: this.isSelected,
            itemId: this.itemId,
        }
    },
    async created() {},
    methods: {
        toggleSelection() {
            this.$emit('toggle', this.itemId)
        },
    },
})
</script>

<style scoped>
.item-container {
    border: 2px solid white;
    padding: 5px;
}
.selected {
    border: 2px solid blue;
    user-select: none;
}
</style>
