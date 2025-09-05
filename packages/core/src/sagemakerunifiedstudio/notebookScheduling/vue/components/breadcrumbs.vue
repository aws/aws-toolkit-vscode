<script setup lang="ts">
/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import TkSpaceBetween from '../../../shared/ux/tkSpaceBetween.vue'
import { client } from '../composables/useClient'
import { ViewJobsPageMetadata, JobDefinitionDetailPageMetadata } from '../../utils/constants'

//-------------------------------------------------------------------------------------------------
// Props
//-------------------------------------------------------------------------------------------------
export interface BreadcrumbItem {
    text: string
    page?: string
    metadata?: ViewJobsPageMetadata | JobDefinitionDetailPageMetadata
}

interface Props {
    items: BreadcrumbItem[]
}

const props = withDefaults(defineProps<Props>(), {})

//-------------------------------------------------------------------------------------------------
// Variables & Methods
//-------------------------------------------------------------------------------------------------
async function onNavigate(item: BreadcrumbItem) {
    if (item.page && item.metadata) {
        await client.setCurrentPage({ name: item.page, metadata: item.metadata })
    }
}
</script>

<template>
    <tk-space-between class="breadcrumb" direction="horizontal" size="xs">
        <template v-for="(item, index) in props.items" :key="index">
            <span v-if="index < props.items.length - 1"
                ><a @click="onNavigate(item)">{{ item.text }}</a></span
            >
            <span v-else>{{ item.text }}</span>

            <span v-if="index < props.items.length - 1">/</span>
        </template>
    </tk-space-between>
</template>

<style scoped>
.breadcrumb a {
    cursor: pointer;
}
</style>
