<script setup lang="ts">
/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import TkSpaceBetween from './tkSpaceBetween.vue'

//-------------------------------------------------------------------------------------------------
// Props
//-------------------------------------------------------------------------------------------------
interface Props {
    header?: string
}

const props = withDefaults(defineProps<Props>(), {
    header: '',
})
</script>

<template>
    <div v-if="props.header.length === 0" class="tk-container">
        <slot />
    </div>

    <div v-else class="tk-container">
        <tk-space-between>
            <h3>{{ props.header }}</h3>
            <slot />
        </tk-space-between>
    </div>
</template>

<style scoped>
.tk-container {
    border: 1px solid var(--vscode-widget-border);
    padding: 12px 14px 18px 14px;
}

.tk-container h3 {
    margin: 0;
}
</style>
