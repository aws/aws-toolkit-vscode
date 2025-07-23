<script setup lang="ts">
/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { computed, reactive } from 'vue'
import TkSpaceBetween from '../../../shared/ux/tkSpaceBetween.vue'
import TkBox from '../../../shared/ux/tkBox.vue'
import TkIconButton from '../../../shared/ux/tkIconButton.vue'
import { jobs } from '../composables/useJobs'
import DownloadIcon from '../../../shared/ux/icons/downloadIcon.vue'

interface State {
    paginatedPage: number
    jobsPerPage: number
    jobToDeleteIndex: number | undefined
}

const state: State = reactive({
    paginatedPage: 0,
    jobsPerPage: 10,
    jobToDeleteIndex: undefined,
})

const jobsPerPaginatedPage = computed(() => {
    const jobsPerPage = []

    const startIndex = state.paginatedPage * state.jobsPerPage
    let endIndex = startIndex + state.jobsPerPage

    if (endIndex > jobs.value.length) {
        endIndex = jobs.value.length
    }

    for (let index = startIndex; index < endIndex; index++) {
        jobsPerPage.push(jobs.value[index])
    }

    return jobsPerPage
})

const paginationLabel = computed(() => {
    const start = state.paginatedPage * state.jobsPerPage + 1
    let end = start + state.jobsPerPage - 1

    if (end > jobs.value.length) {
        end = jobs.value.length
    }

    return `${start} - ${end} of ${jobs.value.length}`
})

const leftPaginationDisabled = computed(() => {
    if (jobs.value.length <= state.jobsPerPage || state.paginatedPage === 0) {
        return true
    }

    return false
})

const rightPaginationDisabled = computed(() => {
    if (jobs.value.length <= state.jobsPerPage || (state.paginatedPage + 1) * state.jobsPerPage >= jobs.value.length) {
        return true
    }

    return false
})

function onReload(): void {
    // NOOP
}

function onDelete(index: number): void {
    resetJobToDelete()

    const jobIndex = state.paginatedPage * state.jobsPerPage + index

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

function onLeftPagination(): void {
    state.paginatedPage -= 1
}

function onRightPagination(): void {
    state.paginatedPage += 1
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

            <tk-box float="right">
                <button class="tk-button" @click="onReload">Reload</button>
            </tk-box>

            <div v-if="jobs.length === 0">
                There are no notebook jobs. Notebook jobs run files in the background, immediately or on a schedule. To
                create a notebook job, right-click on a notebook in the file browser and select "Create Notebook Job".
            </div>

            <tk-space-between v-if="jobs.length > 0">
                <table class="jobs-list-table">
                    <thead class="jobs-list-table-header">
                        <tr>
                            <th scope="col">Job name</th>
                            <th scope="col">Input filename</th>
                            <th scope="col">Output files</th>
                            <th scope="col">Created at</th>
                            <th scope="col">Status</th>
                            <th scope="col">Action</th>
                        </tr>
                    </thead>
                    <tbody class="jobs-list-table-body">
                        <tr v-for="(job, index) in jobsPerPaginatedPage" :key="index">
                            <td>
                                <a>
                                    {{ job.jobName }}
                                </a>
                            </td>
                            <td>{{ job.inputFilename }}</td>
                            <td>
                                <tk-icon-button @clicked="onDownload(index)">
                                    <download-icon />
                                </tk-icon-button>
                            </td>
                            <td>{{ job.createdAt }}</td>
                            <td>{{ job.status }}</td>
                            <td>
                                <button
                                    v-if="!job.delete"
                                    class="button-theme-secondary jobs-list-table-body-delete"
                                    @click="onDelete(index)"
                                >
                                    &times;
                                </button>
                                <button
                                    v-if="job.delete"
                                    class="button-theme-secondary jobs-list-table-body-delete jobs-list-table-body-delete_confirm"
                                    @click="onDeleteConfirm"
                                >
                                    Delete
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>

                <tk-box float="right">
                    <tk-space-between class="jobs-list-table-pagination" direction="horizontal">
                        <div>{{ paginationLabel }}</div>
                        <button :disabled="leftPaginationDisabled" @click="onLeftPagination" aria-label="Previous page">
                            &lt;
                        </button>
                        <button :disabled="rightPaginationDisabled" @click="onRightPagination" aria-label="Next page">
                            &gt;
                        </button>
                    </tk-space-between>
                </tk-box>
            </tk-space-between>
        </tk-space-between>
    </div>
</template>

<style scoped>
/** 
 * Page styles
 **/
.jobs-list {
}

/** 
 * Table styles
 **/
.jobs-list-table {
    border-collapse: collapse;
    width: 100%;
}

.jobs-list-table th,
.jobs-list-table td {
    text-align: left;
    border-bottom: 1px solid var(--vscode-settings-headerBorder);
    padding-top: 10px;
    padding-bottom: 10px;
}

.jobs-list-table th {
    color: var(--vscode-settings-headerForeground);
    padding-top: 0;
}

.jobs-list-table tr td:nth-child(4) {
    width: 225px;
}

.jobs-list-table tr td:nth-child(5) {
    width: 150px;
}

.jobs-list-table tr td:nth-child(6) {
    width: 100px;
}

/** 
 * Table header styles
 **/
.jobs-list-table-header {
}

/** 
 * Table body styles
 **/
.jobs-list-table-body {
}

.jobs-list-table-body .jobs-list-table-body-delete {
    padding: 4px 8px;
}

.jobs-list-table-body .jobs-list-table-body-delete.jobs-list-table-body-delete_confirm {
    background-color: var(--vscode-statusBarItem-errorBackground);
    color: var(--vscode-button-foreground);
    padding: 4px 8px;
}

/** 
 * Pagination styles
 **/
.jobs-list-table-pagination > button {
    background: none;
    border: none;
    color: var(--vscode-button-background);
    cursor: pointer;
    font-size: 18px;
    padding: 0px 4px;
}

.jobs-list-table-pagination > button:disabled {
    color: unset;
    cursor: unset;
}

.jobs-list-table-pagination > button:focus {
    outline: none;
}
</style>
