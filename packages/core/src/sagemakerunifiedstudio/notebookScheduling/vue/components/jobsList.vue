<script setup lang="ts">
/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { computed, reactive, onBeforeMount } from 'vue'
import TkSpaceBetween from '../../../shared/ux/tkSpaceBetween.vue'
import TkBox from '../../../shared/ux/tkBox.vue'
import TkBanner from '../../../shared/ux/tkBanner.vue'
import TkIconButton from '../../../shared/ux/tkIconButton.vue'
import TkTable from '../../../shared/ux/tkTable.vue'
import DownloadIcon from '../../../shared/ux/icons/downloadIcon.vue'
import CloseIcon from '../../../shared/ux/icons/closeIcon.vue'
import { jobs, Job } from '../composables/useJobs'
import { client } from '../composables/useClient'
import { jobDetailPage, JobDetailPageMetadata, ViewJobsPageMetadata } from '../../utils/constants'

//-------------------------------------------------------------------------------------------------
// State
//-------------------------------------------------------------------------------------------------
interface State {
    paginatedPage: number
    jobToDeleteIndex: number | undefined
    newJob?: string
}

const state: State = reactive({
    paginatedPage: 0,
    jobToDeleteIndex: undefined,
    newJob: undefined,
})

//-------------------------------------------------------------------------------------------------
// Computed Properties
//-------------------------------------------------------------------------------------------------
const jobsPerPage = computed(() => {
    const items = []

    const startIndex = state.paginatedPage * itemsPerTablePage
    let endIndex = startIndex + itemsPerTablePage

    if (endIndex > jobs.value.length) {
        endIndex = jobs.value.length
    }

    for (let index = startIndex; index < endIndex; index++) {
        items.push(jobs.value[index])
    }

    return items
})

const bannerMessage = computed(() => {
    if (state.newJob) {
        return `Your job ${state.newJob} has been created. If you do not see it in the list below, please reload the list in a few seconds.`
    }
})

//-------------------------------------------------------------------------------------------------
// Lifecycle Hooks
//-------------------------------------------------------------------------------------------------
onBeforeMount(async () => {
    const page = await client.getCurrentPage()
    const metadata = page.metadata as ViewJobsPageMetadata

    if (metadata.newJob) {
        state.newJob = metadata.newJob
    }
})

//-------------------------------------------------------------------------------------------------
// Variables & Methods
//-------------------------------------------------------------------------------------------------
const itemsPerTablePage = 10
const tableColumns = ['Job name', 'Input filename', 'Output files', 'Created at', 'Status', 'Action']

async function onJobClick(job: Job): Promise<void> {
    const metadata: JobDetailPageMetadata = {
        jobId: job.id,
    }

    await client.setCurrentPage({ name: jobDetailPage, metadata })
}

function onReload(): void {
    // NOOP
}

function onPagination(page: number) {
    state.paginatedPage = page
}

function onBannerDismiss(): void {
    state.newJob = undefined
}

function onDelete(index: number): void {
    resetJobToDelete()

    const jobIndex = state.paginatedPage * itemsPerTablePage + index

    if (jobIndex < jobs.value.length) {
        jobs.value[jobIndex].delete = true
        state.jobToDeleteIndex = jobIndex
    }
}

function onDeleteConfirm(): void {
    // NOOP
}

function onDownload(index: number): void {
    // NOOP
}

function resetJobToDelete(): void {
    if (state.jobToDeleteIndex !== undefined && state.jobToDeleteIndex < jobs.value.length) {
        jobs.value[state.jobToDeleteIndex].delete = false
        state.jobToDeleteIndex = undefined
    }
}
</script>

<template>
    <div class="jobs-list">
        <tk-space-between>
            <h1>Notebook Jobs</h1>

            <tk-banner v-if="state.newJob" :content="bannerMessage" @dismiss="onBannerDismiss" />

            <tk-box float="right">
                <button class="tk-button" @click="onReload">Reload</button>
            </tk-box>

            <div v-if="jobs.length === 0">
                There are no notebook jobs. Notebook jobs run files in the background, immediately or on a schedule. To
                create a notebook job, right-click on a notebook in the file browser and select "Create Notebook Job".
            </div>

            <tk-table
                v-if="jobs.length > 0"
                :items-per-page="itemsPerTablePage"
                :total-items="jobs.length"
                @pagination="onPagination"
            >
                <template v-slot:head>
                    <th v-for="(name, index) in tableColumns" :key="index">{{ name }}</th>
                </template>
                <template v-slot:body>
                    <tr v-for="(job, index) in jobsPerPage" :key="index">
                        <td>
                            <a class="anchor-link" @click="onJobClick(job)">{{ job.name }}</a>
                        </td>
                        <td>{{ job.inputFilename }}</td>
                        <td>
                            <tk-icon-button @click="onDownload(index)">
                                <download-icon />
                            </tk-icon-button>
                        </td>
                        <td :style="{ width: '225px' }">{{ job.createdAt }}</td>
                        <td :style="{ width: '175px' }">{{ job.status }}</td>
                        <td :style="{ width: '100px' }">
                            <tk-icon-button v-if="!job.delete" @click="onDelete(index)">
                                <close-icon />
                            </tk-icon-button>

                            <button v-if="job.delete" class="tk-button delete-confirm" @click="onDeleteConfirm">
                                Delete
                            </button>
                        </td>
                    </tr>
                </template>
            </tk-table>
        </tk-space-between>
    </div>
</template>

<style scoped>
.jobs-list .anchor-link {
    cursor: pointer;
}

.jobs-list .delete-confirm {
    background-color: var(--vscode-statusBarItem-errorBackground);
    color: var(--vscode-button-foreground);
}

.jobs-list .delete-confirm:hover {
    background-color: var(--vscode-statusBarItem-errorBackground);
}
</style>
