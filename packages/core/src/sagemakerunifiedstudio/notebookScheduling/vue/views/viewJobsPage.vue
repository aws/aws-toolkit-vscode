<script setup lang="ts">
/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { reactive, onBeforeMount } from 'vue'
import TkTabs, { Tab } from '../../../shared/ux/tkTabs.vue'
import JobsList from '../components/jobsList.vue'
import JobsDefinitions from '../components/jobsDefinitions.vue'
import { client } from '../composables/useClient'

//-------------------------------------------------------------------------------------------------
// State
//-------------------------------------------------------------------------------------------------
interface State {
    selectedTab: number
}

const state: State = reactive({
    selectedTab: 0,
})

//-------------------------------------------------------------------------------------------------
// Lifecycle Hooks
//-------------------------------------------------------------------------------------------------
onBeforeMount(async () => {
    const newJobDefinition = await client.getNewJobDefinition()

    if (newJobDefinition) {
        state.selectedTab = 1
    }
})

//-------------------------------------------------------------------------------------------------
// Variables & Methods
//-------------------------------------------------------------------------------------------------
const tabs: Tab[] = [
    { label: 'Notebook Jobs', id: 'one', content: JobsList },
    { label: 'Notebook Job Definitions', id: 'two', content: JobsDefinitions },
]
</script>

<template>
    <div class="view-jobs-page">
        <tk-tabs :tabs="tabs" :selected-tab="state.selectedTab" />
    </div>
</template>

<style scope>
.view-jobs-page {
    padding-top: 10px;
}
</style>
