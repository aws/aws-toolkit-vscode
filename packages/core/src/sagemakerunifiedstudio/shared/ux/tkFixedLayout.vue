<script setup lang="ts">
/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * TkFixedLayout Component
 *
 * A layout container that centers its content horizontally and applies a fixed width
 * based on the `width` prop. Commonly used to constrain page content within a fixed layout.
 *
 * ### Props
 * @prop {number} width - The fixed width (in pixels) applied to the content section.
 * @prop {boolean} [center=true] - If true, content section is center aligned, otherwise left aligned.
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
    center?: boolean
}

const props = withDefaults(defineProps<Props>(), {
    center: true,
})

const widthValue = computed(() => {
    return `${props.width}px`
})
</script>

<template>
    <main class="tk-fixed-layout" :class="props.center ? 'tk-fixed-layout_center' : ''">
        <section>
            <slot />
        </section>
    </main>
</template>

<style scoped>
.tk-fixed-layout.tk-fixed-layout_center {
    display: flex;
}

.tk-fixed-layout > section {
    min-width: v-bind(widthValue);
}

.tk-fixed-layout.tk-fixed-layout_center > section {
    margin: 0 auto;
    width: v-bind(widthValue);
}
</style>
