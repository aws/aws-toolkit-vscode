<script setup lang="ts">
/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import '../../shared/ux/styles.css'
import TkFixedLayout from '../../shared/ux/tkFixedLayout.vue'
import CreateJobPage from './views/createJobPage.vue'
import ViewJobsPage from './views/viewJobsPage.vue'
import { onBeforeMount, reactive } from 'vue'
import { createJobPage, viewJobsPage } from '../utils/constants'
import { client } from './composables/useClient'

interface State {
    showPage: string
}
const state: State = reactive({
    showPage: '',
})

onBeforeMount(async () => {
    state.showPage = await client.getCurrentPage()

    client.onShowPage((payload: { page: string }) => {
        console.log('onShowPage', payload)
        state.showPage = payload.page
    })
})
</script>

<template>
    <tk-fixed-layout v-if="state.showPage === createJobPage" :width="628">
        <create-job-page />
    </tk-fixed-layout>

    <tk-fixed-layout v-else-if="state.showPage === viewJobsPage" :width="800" :center="false">
        <view-jobs-page />
    </tk-fixed-layout>

    <div v-else>Loading...</div>
</template>
