<script setup lang="ts">
/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { reactive, computed, watch } from 'vue'
import TkSpaceBetween from '../../../shared/ux/tkSpaceBetween.vue'
import TkBox from '../../../shared/ux/tkBox.vue'
import TkTable from '../../../shared/ux/tkTable.vue'
import TkIconButton from '../../../shared/ux/tkIconButton.vue'
import TkBanner from '../../../shared/ux/tkBanner.vue'
import PlayIcon from '../../../shared/ux/icons/playIcon.vue'
import PauseIcon from '../../../shared/ux/icons/pauseIcon.vue'
import CloseIcon from '../../../shared/ux/icons/closeIcon.vue'
import { jobDefinitions, JobDefinition } from '../composables/useJobs'
import { newJobDefinition } from '../composables/useViewJobs'
import { client } from '../composables/useClient'
import { jobDefinitionDetailPage, JobDefinitionDetailPageMetadata } from '../../utils/constants'

//-------------------------------------------------------------------------------------------------
// State
//-------------------------------------------------------------------------------------------------
interface State {
    paginatedPage: number
    jobDefinitionToDeleteIndex?: number
    newJobDefinition?: string
}

const state: State = reactive({
    paginatedPage: 0,
    jobDefinitionToDeleteIndex: undefined,
    newJobDefinition: undefined,
})

//-------------------------------------------------------------------------------------------------
// Computed Properties
//-------------------------------------------------------------------------------------------------
const jobsDefinitionsPerPage = computed(() => {
    const items = []

    const startIndex = state.paginatedPage * itemsPerTablePage
    let endIndex = startIndex + itemsPerTablePage

    if (endIndex > jobDefinitions.value.length) {
        endIndex = jobDefinitions.value.length
    }

    for (let index = startIndex; index < endIndex; index++) {
        items.push(jobDefinitions.value[index])
    }

    return items
})

const bannerMessage = computed(() => {
    if (state.newJobDefinition) {
        return `Your job definition ${state.newJobDefinition} has been created. If you do not see it in the list below, please reload the list in a few seconds.`
    }
})

//-------------------------------------------------------------------------------------------------
// Watchers
//-------------------------------------------------------------------------------------------------
watch(newJobDefinition, (newVal, _oldVal) => {
    if (newVal) {
        state.newJobDefinition = newVal
        newJobDefinition.value = undefined
    }
})

//-------------------------------------------------------------------------------------------------
// Variables & Methods
//-------------------------------------------------------------------------------------------------
const itemsPerTablePage = 10
const tableColumns = ['Job definition name', 'Input filename', 'Created at', 'Schedule', 'Status', 'Actions']

async function onJobDefinition(jobDefinition: JobDefinition): Promise<void> {
    const metadata: JobDefinitionDetailPageMetadata = {
        jobDefinitionId: jobDefinition.id,
    }

    await client.setCurrentPage({ name: jobDefinitionDetailPage, metadata })
}

function onPagination(page: number) {
    state.paginatedPage = page
}

function onReload(): void {
    // NOOP
}

function onBannerDismiss(): void {
    state.newJobDefinition = undefined
}

function onStart(index: number): void {
    // NOOP
}

function onPause(index: number): void {
    // NOOP
}

function onDelete(index: number): void {
    resetJobDefinitionToDelete()

    const jobDefinitionIndex = state.paginatedPage * itemsPerTablePage + index

    if (jobDefinitionIndex < jobDefinitions.value.length) {
        jobDefinitions.value[jobDefinitionIndex].delete = true
        state.jobDefinitionToDeleteIndex = jobDefinitionIndex
    }
}

function onDeleteConfirm(): void {
    // NOOP
}

function resetJobDefinitionToDelete(): void {
    if (
        state.jobDefinitionToDeleteIndex !== undefined &&
        state.jobDefinitionToDeleteIndex < jobDefinitions.value.length
    ) {
        jobDefinitions.value[state.jobDefinitionToDeleteIndex].delete = false
        state.jobDefinitionToDeleteIndex = undefined
    }
}
</script>

<template>
    <div class="jobs-definitions">
        <tk-space-between>
            <h1>Notebook Job Definitions</h1>

            <tk-banner v-if="state.newJobDefinition" :content="bannerMessage" @dismiss="onBannerDismiss" />

            <tk-box float="right">
                <button class="tk-button" @click="onReload">Reload</button>
            </tk-box>

            <div v-if="jobDefinitions.length === 0">
                There are no notebook jobs. Notebook jobs run files in the background, immediately or on a schedule. To
                create a notebook job, right-click on a notebook in the file browser and select "Create Notebook Job".
            </div>

            <tk-table
                v-if="jobDefinitions.length > 0"
                :items-per-page="itemsPerTablePage"
                :total-items="jobDefinitions.length"
                @pagination="onPagination"
            >
                <template v-slot:head>
                    <th v-for="(name, index) in tableColumns" :key="index">{{ name }}</th>
                </template>
                <template v-slot:body>
                    <tr v-for="(jobDefinition, index) in jobsDefinitionsPerPage" :key="index">
                        <td>
                            <a class="anchor-link" @click="onJobDefinition(jobDefinition)">
                                {{ jobDefinition.name }}
                            </a>
                        </td>
                        <td>{{ jobDefinition.inputFilename }}</td>
                        <td>{{ jobDefinition.createdAt }}</td>
                        <td :style="{ width: '175px' }">{{ jobDefinition.schedule }}</td>
                        <td :style="{ width: '175px' }">{{ jobDefinition.status }}</td>
                        <td :style="{ width: '150px' }">
                            <tk-space-between direction="horizontal">
                                <tk-icon-button v-if="jobDefinition.status === 'Paused'" @click="onStart(index)">
                                    <play-icon />
                                </tk-icon-button>

                                <tk-icon-button v-if="jobDefinition.status === 'Active'" @click="onPause(index)">
                                    <pause-icon />
                                </tk-icon-button>

                                <tk-icon-button v-if="!jobDefinition.delete" @click="onDelete(index)">
                                    <close-icon />
                                </tk-icon-button>

                                <button
                                    v-if="jobDefinition.delete"
                                    class="tk-button delete-confirm"
                                    @click="onDeleteConfirm"
                                >
                                    Delete
                                </button>
                            </tk-space-between>
                        </td>
                    </tr>
                </template>
            </tk-table>
        </tk-space-between>
    </div>
</template>

<style scoped>
.jobs-definitions .anchor-link {
    cursor: pointer;
}

.jobs-definitions .delete-confirm {
    background-color: var(--vscode-statusBarItem-errorBackground);
    color: var(--vscode-button-foreground);
}

.jobs-definitions .delete-confirm:hover {
    background-color: var(--vscode-statusBarItem-errorBackground);
}
</style>
