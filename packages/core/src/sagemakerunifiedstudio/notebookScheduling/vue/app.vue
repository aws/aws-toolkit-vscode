<script setup lang="ts">
/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { onBeforeMount, reactive } from 'vue'
import TkFixedLayout from '../../shared/ux/tkFixedLayout.vue'
import CreateJobPage from './views/createJobPage.vue'
import ViewJobsPage from './views/viewJobsPage.vue'
import JobDetailPage from './views/jobDetailPage.vue'
import JobDefinitionDetailPage from './views/jobDefinitionDetailPage.vue'
import EditJobDefinitionPage from './views/editJobDefinitionPage.vue'
import { client } from './composables/useClient'
import {
    createJobPage,
    viewJobsPage,
    jobDetailPage,
    jobDefinitionDetailPage,
    editJobDefinitionPage,
    Page,
} from '../utils/constants'

import '../../shared/ux/styles.css'

//-------------------------------------------------------------------------------------------------
// State
//-------------------------------------------------------------------------------------------------
interface State {
    page?: Page
}
const state: State = reactive({
    page: undefined,
})

//-------------------------------------------------------------------------------------------------
// Lifecycle Hooks
//-------------------------------------------------------------------------------------------------
onBeforeMount(async () => {
    state.page = await client.getCurrentPage()

    client.onShowPage((event: { page: Page }) => {
        state.page = event.page
    })
})
</script>

<template>
    <tk-fixed-layout v-if="state.page?.name === createJobPage" :width="628" :max-width="700" :center="false">
        <create-job-page />
    </tk-fixed-layout>

    <tk-fixed-layout v-else-if="state.page?.name === viewJobsPage" :width="800" :center="false">
        <view-jobs-page />
    </tk-fixed-layout>

    <tk-fixed-layout v-else-if="state.page?.name === jobDetailPage" :width="800" :max-width="900" :center="false">
        <job-detail-page />
    </tk-fixed-layout>

    <tk-fixed-layout
        v-else-if="state.page?.name === jobDefinitionDetailPage"
        :width="800"
        :max-width="900"
        :center="false"
    >
        <job-definition-detail-page />
    </tk-fixed-layout>

    <tk-fixed-layout
        v-else-if="state.page?.name === editJobDefinitionPage"
        :width="628"
        :max-width="700"
        :center="false"
    >
        <edit-job-definition-page />
    </tk-fixed-layout>

    <div v-else>Loading...</div>
</template>
