<script setup lang="ts">
/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * TkLabel Component
 *
 * A simple label component that displays a label text and optionally appends an "optional" indicator.
 *
 * ### Props
 * @prop {string} text - The label text to display.
 * @prop {boolean} [optional=false] - If true, appends `- optional` to the label.
 *
 * ### Example Usage
 * ```vue
 * <tk-label text="Email Address" />
 *
 * <tk-label text="Phone Number" :optional="true" />
 * ```
 */

//-------------------------------------------------------------------------------------------------
// Props
//-------------------------------------------------------------------------------------------------
interface Props {
    text: string
    optional?: boolean
}

const props = withDefaults(defineProps<Props>(), { optional: false })
</script>

<template>
    <div class="tk-label">
        <label class="tk-label-label">{{ props.text }}</label>
        <em v-if="optional" class="tk-label-optional">- optional</em>
    </div>
</template>

<style scoped>
.tk-label-label {
    color: var(--vscode-settings-headerForeground);
    font-size: var(--tk-font-size-medium);
    font-weight: 600;
}

.tk-label-optional {
    margin-left: 5px;
}
</style>
