<template>
    <div class="item-container" :class="{ selected: isSelected }" @click="toggleSelection">
        <div class="title">{{ itemTitle }}</div>
        <div class="p">{{ itemText }}</div>
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
export default defineComponent({
    name: 'SelectableItem',
    components: {},
    props: {
        itemText: String,
        itemTitle: String,
        isSelected: Boolean,
        itemId: Number,
    },
    data() {
        return {
            itemText: this.itemText,
            isSelected: this.isSelected,
            itemId: this.itemId,
            itemTitle: this.itemTitle,
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
    border: 2px solid #29a7ff;
    user-select: none;
}
.title {
    font-size: 24px;
    font-weight: bold;
}
</style>
