<template>
    <div class="item-container" :class="{ selected: isSelected }" @click="toggleSelection">
        <div class="icon">
            <svg
                v-if="itemTitle == 'Personal'"
                width="20"
                height="20"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                transform="translate(0, 20)"
            >
                <path
                    fill-rule="evenodd"
                    clip-rule="evenodd"
                    d="M8 2C6.68228 2 5.61 3.07228 5.61 4.39C5.61 5.70772 6.68228 6.78 8 6.78C9.31771 6.78 10.39 5.70772 10.39 4.39C10.39 3.07228 9.31772 2 8 2ZM3.61 4.39C3.61 1.96772 5.57771 0 8 0C10.4223 0 12.39 1.96771 12.39 4.39C12.39 5.66447 11.8453 6.81311 10.9762 7.61551C11.1666 7.71116 11.3535 7.81608 11.5368 7.93001C13.5215 9.15787 15 11.3598 15 14V15H1V14C1 11.147 2.63919 8.7213 4.99701 7.59061C4.14356 6.78943 3.61 5.65134 3.61 4.39ZM10.482 9.62922C9.71501 9.15233 8.88729 8.90797 8.00229 8.91L8 8.91C5.59623 8.91 3.5507 10.634 3.09474 13H12.8975C12.601 11.5742 11.6867 10.3744 10.484 9.63047L10.482 9.62922Z"
                    fill="white"
                />
            </svg>
            <svg
                v-if="itemTitle == 'Workforce'"
                width="20"
                height="20"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                transform="translate(0, 20)"
            >
                <path
                    fill-rule="evenodd"
                    clip-rule="evenodd"
                    d="M4 3C3.44772 3 3 3.44772 3 4C3 4.55229 3.44772 5 4 5C4.55228 5 5 4.55229 5 4C5 3.44772 4.55228 3 4 3ZM1 4C1 2.34315 2.34315 1 4 1C5.65685 1 7 2.34315 7 4C7 5.65676 5.65701 6.99984 4.00029 7C6.21244 7.00016 8 8.78781 8 11C8 8.78772 9.78771 7 12 7C14.2123 7 16 8.78772 16 11V14C16 14.5523 15.5523 15 15 15H9C8.44771 15 8 14.5523 8 14C8 14.5523 7.55228 15 7 15H1C0.447715 15 0 14.5523 0 14V11C0 8.78772 1.78801 7 4.00029 7C2.34344 7 1 5.65685 1 4ZM12 7C10.3431 7 9 5.65685 9 4C9 2.34315 10.3431 1 12 1C13.6569 1 15 2.34315 15 4C15 5.65685 13.6569 7 12 7ZM11 4C11 3.44772 11.4477 3 12 3C12.5523 3 13 3.44772 13 4C13 4.55229 12.5523 5 12 5C11.4477 5 11 4.55229 11 4ZM10 11C10 9.89228 10.8923 9 12 9C13.1077 9 14 9.89228 14 11V13H10V11ZM2 11C2 9.89228 2.89228 9 4 9C5.10772 9 6 9.89228 6 11V13H2V11Z"
                    fill="white"
                />
            </svg>
        </div>
        <div class="text">
            <div class="title">{{ itemTitle }}</div>
            <div class="p">{{ itemText }}</div>
        </div>
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
    display: flex;
}
.selected {
    border: 2px solid #29a7ff;
    user-select: none;
}
.title {
    font-size: 21px;
    font-weight: bold;
}

.text {
    display: flex;
    flex-direction: column;
}
</style>
