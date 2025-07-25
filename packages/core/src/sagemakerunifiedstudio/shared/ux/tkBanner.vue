<script setup lang="ts">
/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import TkIconButton from './tkIconButton.vue'
import InfoIcon from './icons/infoIcon.vue'
import CloseIcon from './icons/closeIcon.vue'

//-------------------------------------------------------------------------------------------------
// Props
//-------------------------------------------------------------------------------------------------
interface Props {
    content?: string
}

const props = withDefaults(defineProps<Props>(), { content: '' })

//-------------------------------------------------------------------------------------------------
// Emitted Events
//-------------------------------------------------------------------------------------------------
const emit = defineEmits<{
    (e: 'dismiss'): void
}>()
</script>

<template>
    <div class="tk-banner">
        <div class="tk-banner-icon">
            <info-icon width="20" height="20" />
        </div>
        <div class="tk-banner-content">
            {{ props.content }}
        </div>
        <div>
            <tk-icon-button class="tk-banner-close" @click="emit('dismiss')">
                <close-icon />
            </tk-icon-button>
        </div>
    </div>
</template>

<style scoped>
.tk-banner {
    background-color: rgb(229, 246, 253);
    color: rgb(1, 67, 97);
    display: grid;
    grid-template-columns: auto 1fr auto;
    padding: 10px;
}

.tk-banner .tk-banner-icon {
    padding-right: 10px;
}

.tk-banner-close:hover {
    background-color: rgba(0, 0, 0, 0.04);
}
</style>
