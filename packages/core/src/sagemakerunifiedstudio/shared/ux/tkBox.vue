<script setup lang="ts">
/**
 * TkBox Component
 *
 * A layout utility component that wraps its slot content in a flex container and aligns the content horizontally based on the `float` prop.
 *
 * ### Props
 * @prop {'left' | 'right'} [float='left'] - Defines horizontal alignment of the content.
 * - `'left'` aligns content to the start (default).
 * - `'right'` aligns content to the end.
 *
 * ### Slots
 * @slot default - Content to render inside the flex container.
 *
 * ### Example Usage
 * ```vue
 * <tk-box>
 *   <button>Click Me</button>
 * </tk-box>
 *
 * <tk-box float="right">
 *   <button>Click Me</button>
 * </tk-box>
 * ```
 */

import { computed } from 'vue'

interface Props {
    float?: 'left' | 'right'
}

const props = withDefaults(defineProps<Props>(), {
    float: 'left',
})

const floatValue = computed(() => {
    switch (props.float) {
        case 'left':
            return 'flex-start'
        case 'right':
            return 'flex-end'
    }
})
</script>

<template>
    <div class="tk-box">
        <slot />
    </div>
</template>

<style scoped>
.tk-box {
    display: flex;
    justify-content: v-bind(floatValue);
}
</style>
