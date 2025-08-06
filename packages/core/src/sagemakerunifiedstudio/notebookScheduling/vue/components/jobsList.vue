<script setup lang="ts">
/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { computed, reactive, watch } from 'vue'
import { TrainingJob } from '@aws-sdk/client-sagemaker'
import TkSpaceBetween from '../../../shared/ux/tkSpaceBetween.vue'
import TkBox from '../../../shared/ux/tkBox.vue'
import TkBanner from '../../../shared/ux/tkBanner.vue'
import TkIconButton from '../../../shared/ux/tkIconButton.vue'
import TkTable from '../../../shared/ux/tkTable.vue'
import DownloadIcon from '../../../shared/ux/icons/downloadIcon.vue'
import DownIcon from '../../../shared/ux/icons/downIcon.vue'
import UpIcon from '../../../shared/ux/icons/upIcon.vue'
import CloseIcon from '../../../shared/ux/icons/closeIcon.vue'
import { useJobs } from '../composables/useJobs'
import { client } from '../composables/useClient'
import { newJob } from '../composables/useViewJobs'
import { jobDetailPage, JobDetailPageMetadata, SearchSortOrder } from '../../utils/constants'
import {
    getJobName,
    getJobInputNotebookName,
    getFormattedDateTime,
    getFormattedCurrentTime,
    getJobStatus,
} from '../../utils/helpers'

//-------------------------------------------------------------------------------------------------
// Props
//-------------------------------------------------------------------------------------------------
interface Props {
    jobDefinitionId?: string
    hideHeading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
    jobDefinitionId: undefined,
    hideHeading: false,
})

//-------------------------------------------------------------------------------------------------
// State
//-------------------------------------------------------------------------------------------------
interface State {
    paginatedPage: number
    jobToDeleteName: string | undefined
    showLoading: boolean
    lastRefreshed: string | undefined
    jobNameSortOrder: SearchSortOrder
    inputFilenameSortOrder: SearchSortOrder
    createdAtSortOrder: SearchSortOrder
    statusSortOrder: SearchSortOrder
    newJob?: string
}

const state: State = reactive({
    paginatedPage: 0,
    jobToDeleteName: undefined,
    showLoading: true,
    lastRefreshed: undefined,
    jobNameSortOrder: SearchSortOrder.NONE,
    inputFilenameSortOrder: SearchSortOrder.NONE,
    createdAtSortOrder: SearchSortOrder.NONE,
    statusSortOrder: SearchSortOrder.NONE,
    newJob: undefined,
})

//-------------------------------------------------------------------------------------------------
// Composables
//-------------------------------------------------------------------------------------------------
const { jobs, isLoading, isError, errorMessage } = useJobs()

//-------------------------------------------------------------------------------------------------
// Computed Properties
//-------------------------------------------------------------------------------------------------
const filteredJobs = computed(() => {
    /*
    if (props.jobDefinitionId) {
        const jobsForDefinition = jobs.value.filter((job) => job.jobDefinitionId === props.jobDefinitionId)
        return jobsForDefinition
    } else {
        return [...jobs.value]
    }
    */

    state.lastRefreshed = `Last refreshed ${getFormattedCurrentTime()}`

    return [...jobs.value]
})

const jobsPerPage = computed(() => {
    const items = []

    const startIndex = state.paginatedPage * itemsPerTablePage
    let endIndex = startIndex + itemsPerTablePage

    if (endIndex > filteredJobs.value.length) {
        endIndex = filteredJobs.value.length
    }

    for (let index = startIndex; index < endIndex; index++) {
        items.push(filteredJobs.value[index])
    }

    return items
})

const bannerMessage = computed(() => {
    if (state.newJob) {
        return `Your job ${state.newJob} has been created. If you do not see it in the list below, please reload the list in a few seconds.`
    }
})

//-------------------------------------------------------------------------------------------------
// Watchers
//-------------------------------------------------------------------------------------------------
watch(newJob, (newVal, _oldVal) => {
    if (newVal) {
        state.newJob = newVal
        newJob.value = undefined
    }
})

//-------------------------------------------------------------------------------------------------
// Variables & Methods
//-------------------------------------------------------------------------------------------------
const itemsPerTablePage = 10

async function onJobClick(job: TrainingJob): Promise<void> {
    const metadata: JobDetailPageMetadata = {
        jobId: job.TrainingJobName as string,
    }

    await client.setCurrentPage({ name: jobDetailPage, metadata })
}

function onReload(): void {
    state.showLoading = false
    useJobs({ refetch: true })
}

function onJobNameSortOrder(): void {
    state.jobNameSortOrder = getNewSortOrder(state.jobNameSortOrder)
}

function onInputFilenameSortOrder(): void {
    state.inputFilenameSortOrder = getNewSortOrder(state.inputFilenameSortOrder)
}

function onCreatedAtFilenameSortOrder(): void {
    state.createdAtSortOrder = getNewSortOrder(state.createdAtSortOrder)
}

function onStatusSortOrder(): void {
    state.statusSortOrder = getNewSortOrder(state.statusSortOrder)
}

function getNewSortOrder(order: SearchSortOrder) {
    state.jobNameSortOrder = SearchSortOrder.NONE
    state.inputFilenameSortOrder = SearchSortOrder.NONE
    state.createdAtSortOrder = SearchSortOrder.NONE
    state.statusSortOrder = SearchSortOrder.NONE

    if (order === SearchSortOrder.NONE) {
        return SearchSortOrder.ASCENDING
    } else if (order === SearchSortOrder.ASCENDING) {
        return SearchSortOrder.DESCENDING
    } else {
        return SearchSortOrder.ASCENDING
    }
}

function onPagination(page: number) {
    state.paginatedPage = page
}

function onBannerDismiss(): void {
    state.newJob = undefined
}

function onDelete(jobName: string): void {
    state.jobToDeleteName = jobName
}

function onDeleteConfirm(): void {
    // NOOP
}

function onDownload(index: number): void {
    // NOOP
}
</script>

<template>
    <div class="jobs-list">
        <pre>isLoading: {{ isLoading }}</pre>
        <pre>isError: {{ isError }}</pre>
        <pre>errorMessage: {{ errorMessage }}</pre>
        <tk-space-between>
            <h1 v-if="!props.hideHeading">Notebook Jobs</h1>

            <tk-banner v-if="state.newJob" :content="bannerMessage" @dismiss="onBannerDismiss" />

            <tk-box float="right">
                <tk-space-between direction="horizontal">
                    <div>{{ state.lastRefreshed }}</div>
                    <button class="tk-button" @click="onReload">Reload</button>
                </tk-space-between>
            </tk-box>

            <div v-if="props.jobDefinitionId && filteredJobs.length === 0">
                No notebook jobs associated with this job definition.
            </div>
            <div v-else-if="isLoading && state.showLoading">Loading...</div>
            <div v-else-if="filteredJobs.length === 0">
                There are no notebook jobs. Notebook jobs run files in the background, immediately or on a schedule. To
                create a notebook job, right-click on a notebook in the file browser and select "Create Notebook Job".
            </div>

            <tk-table
                v-if="filteredJobs.length > 0"
                :items-per-page="itemsPerTablePage"
                :total-items="filteredJobs.length"
                @pagination="onPagination"
            >
                <template v-slot:head>
                    <th class="sort anchor-link" @click="onJobNameSortOrder">
                        <tk-space-between direction="horizontal" size="xxs">
                            <div>Job name</div>
                            <down-icon
                                v-if="
                                    state.jobNameSortOrder === SearchSortOrder.DESCENDING ||
                                    state.jobNameSortOrder === SearchSortOrder.NONE
                                "
                                :class="{ sort_hide: state.jobNameSortOrder === SearchSortOrder.NONE }"
                                :width="12"
                                :height="12"
                            />
                            <up-icon
                                v-if="state.jobNameSortOrder === SearchSortOrder.ASCENDING"
                                :width="12"
                                :height="12"
                            />
                        </tk-space-between>
                    </th>
                    <th class="sort anchor-link" @click="onInputFilenameSortOrder">
                        <tk-space-between direction="horizontal" size="xxs">
                            <div>Input filename</div>
                            <down-icon
                                v-if="
                                    state.inputFilenameSortOrder === SearchSortOrder.DESCENDING ||
                                    state.inputFilenameSortOrder === SearchSortOrder.NONE
                                "
                                :class="{ sort_hide: state.inputFilenameSortOrder === SearchSortOrder.NONE }"
                                :width="12"
                                :height="12"
                            />
                            <up-icon
                                v-if="state.inputFilenameSortOrder === SearchSortOrder.ASCENDING"
                                :width="12"
                                :height="12"
                            />
                        </tk-space-between>
                    </th>
                    <th>Output files</th>
                    <th class="sort anchor-link" @click="onCreatedAtFilenameSortOrder">
                        <tk-space-between direction="horizontal" size="xxs">
                            <div>Created at</div>
                            <down-icon
                                v-if="
                                    state.createdAtSortOrder === SearchSortOrder.DESCENDING ||
                                    state.createdAtSortOrder === SearchSortOrder.NONE
                                "
                                :class="{ sort_hide: state.createdAtSortOrder === SearchSortOrder.NONE }"
                                :width="12"
                                :height="12"
                            />
                            <up-icon
                                v-if="state.createdAtSortOrder === SearchSortOrder.ASCENDING"
                                :width="12"
                                :height="12"
                            />
                        </tk-space-between>
                    </th>
                    <th class="sort anchor-link" @click="onStatusSortOrder">
                        <tk-space-between direction="horizontal" size="xxs">
                            <div>Status</div>
                            <down-icon
                                v-if="
                                    state.statusSortOrder === SearchSortOrder.DESCENDING ||
                                    state.statusSortOrder === SearchSortOrder.NONE
                                "
                                :class="{ sort_hide: state.statusSortOrder === SearchSortOrder.NONE }"
                                :width="12"
                                :height="12"
                            />
                            <up-icon
                                v-if="state.statusSortOrder === SearchSortOrder.ASCENDING"
                                :width="12"
                                :height="12"
                            />
                        </tk-space-between>
                    </th>
                    <th>Action</th>
                </template>

                <template v-slot:body>
                    <tr v-for="(job, index) in jobsPerPage" :key="index">
                        <td>
                            <a class="anchor-link" @click="onJobClick(job)">{{ getJobName(job) }}</a>
                        </td>
                        <td>{{ getJobInputNotebookName(job) }}</td>
                        <td>
                            <tk-icon-button @click="onDownload(index)">
                                <download-icon />
                            </tk-icon-button>
                        </td>
                        <td :style="{ width: '225px' }">
                            {{ getFormattedDateTime(job.CreationTime as unknown as string) }}
                        </td>
                        <td :style="{ width: '175px' }">{{ getJobStatus(job) }}</td>
                        <td :style="{ width: '100px' }">
                            <button
                                v-if="job.TrainingJobName === state.jobToDeleteName"
                                class="tk-button delete-confirm"
                                @click="onDeleteConfirm"
                            >
                                Delete
                            </button>
                            <tk-icon-button v-else @click="onDelete(job.TrainingJobName as string)">
                                <close-icon />
                            </tk-icon-button>
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

.jobs-list .sort {
    user-select: none;
}

.jobs-list .sort_hide {
    visibility: hidden;
}

.jobs-list .delete-confirm {
    background-color: var(--vscode-statusBarItem-errorBackground);
    color: var(--vscode-button-foreground);
}

.jobs-list .delete-confirm:hover {
    background-color: var(--vscode-statusBarItem-errorBackground);
}
</style>
