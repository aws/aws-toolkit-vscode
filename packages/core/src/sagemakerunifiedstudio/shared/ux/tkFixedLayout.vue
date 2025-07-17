<script setup lang="ts">
/**
 * TkFixedLayout Component
 *
 * A layout container that centers its content horizontally and applies a fixed width
 * based on the `width` prop. Commonly used to constrain page content within a fixed layout.
 *
 * ### Props
 * @prop {number} width - The fixed width (in pixels) applied to the content section.
 *
 * ### Slots
 * @slot default - The content to render inside the fixed-width layout container.
 *
 * ### Example Usage
 * ```vue
 * <tk-fixed-layout :width="800">
 *   <p>This content is centered and 800px wide.</p>
 * </tk-fixed-layout>
 * ```
 */

import { computed } from 'vue'

interface Props {
    width: number
}

const props = withDefaults(defineProps<Props>(), {})

const widthValue = computed(() => {
    return `${props.width}px`
})
</script>

<template>
    <main class="tk-fixed-layout">
        <section>
            <slot />
        </section>
    </main>
</template>

<style scoped>
.tk-fixed-layout {
    display: flex;
}

.tk-fixed-layout > section {
    margin: 0 auto;
    min-width: v-bind(widthValue);
    width: v-bind(widthValue);
}
</style>
