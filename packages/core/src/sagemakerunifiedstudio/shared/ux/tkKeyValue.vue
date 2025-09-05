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
    items: { key: string; value: string }[]
    keyLabel: string
    valueLabel: string
}

const props = withDefaults(defineProps<Props>(), {})
</script>

<template>
    <tk-space-between>
        <div class="tk-key-value-grid" v-for="(item, index) in props.items" :key="index">
            <div>
                <div class="tk-key-value-label">{{ props.keyLabel }}</div>
                <div>{{ item.key }}</div>
            </div>
            <div>
                <div class="tk-key-value-label">{{ props.valueLabel }}</div>
                <div>{{ item.value }}</div>
            </div>
        </div>
    </tk-space-between>
</template>

<style scoped>
.tk-key-value-grid {
    display: grid;
    grid-template-columns: 150px 150px;
}

.tk-key-value-label {
    font-size: var(--tk-font-size-small);
}
</style>
