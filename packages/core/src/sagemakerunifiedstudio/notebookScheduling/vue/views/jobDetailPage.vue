<script setup lang="ts">
/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { reactive, onBeforeMount } from 'vue'
import TkInputField from '../../../shared/ux/tkInputField.vue'
import TkContainer from '../../../shared/ux/tkContainer.vue'
import TkSpaceBetween from '../../../shared/ux/tkSpaceBetween.vue'
import TkBox from '../../../shared/ux/tkBox.vue'
import TkLabel from '../../../shared/ux/tkLabel.vue'
import TkKeyValue from '../../../shared/ux/tkKeyValue.vue'
import { client } from '../composables/useClient'
import { jobs, Job } from '../composables/useJobs'
import { viewJobsPage, JobDetailPageMetadata, ViewJobsPageMetadata } from '../../utils/constants'

//-------------------------------------------------------------------------------------------------
// State
//-------------------------------------------------------------------------------------------------
interface State {
    job?: Job
}

const state: State = reactive({
    job: undefined,
})

//-------------------------------------------------------------------------------------------------
// Lifecycle Hooks
//-------------------------------------------------------------------------------------------------
onBeforeMount(async () => {
    const page = await client.getCurrentPage()
    const metadata = page.metadata as JobDetailPageMetadata
    state.job = jobs.value.find((job) => job.id === metadata.jobId)
})

//-------------------------------------------------------------------------------------------------
// Variables & Methods
//-------------------------------------------------------------------------------------------------
async function onNotebookJobsClick() {
    const metadata: ViewJobsPageMetadata = {}

    await client.setCurrentPage({ name: viewJobsPage, metadata })
}

function onDeleteJob() {
    // NOOP
}

function onDownloadJob() {
    // NOOP
}

function onReloadJob() {
    // NOOP
}
</script>

<template>
    <div v-if="state.job" class="job-detail-page">
        <div class="job-detail-page-head">
            <tk-space-between direction="horizontal" size="xs">
                <a @click="onNotebookJobsClick">Notebook Jobs</a>
                <span>/</span>
                <span>{{ state.job?.name }}</span>
            </tk-space-between>
        </div>

        <div class="job-detail-page-content">
            <tk-space-between>
                <h1>Job Details</h1>

                <tk-box float="right">
                    <tk-space-between direction="horizontal" size="xs">
                        <button class="tk-button" @click="onReloadJob">Reload Job</button>
                        <button class="tk-button button-theme-secondary" @click="onDownloadJob">
                            Download Job Files
                        </button>
                        <button class="tk-button tk-button_red" @click="onDeleteJob">Delete Job</button>
                    </tk-space-between>
                </tk-box>

                <div>
                    <tk-space-between>
                        <tk-container>
                            <div class="detail-content-info">
                                <tk-input-field
                                    label="Job name"
                                    :value="state.job?.name"
                                    :read-only="true"
                                    :compact="true"
                                />
                                <tk-input-field
                                    label="Job ID"
                                    :value="state.job?.id"
                                    :read-only="true"
                                    :compact="true"
                                />
                                <tk-input-field
                                    label="Input file"
                                    :value="state.job?.inputFilename"
                                    :read-only="true"
                                    :compact="true"
                                />
                                <tk-input-field
                                    label="Environment"
                                    :value="state.job?.environment"
                                    :read-only="true"
                                    :compact="true"
                                />
                                <tk-input-field
                                    label="Status"
                                    :value="state.job?.status"
                                    :read-only="true"
                                    :compact="true"
                                />
                                <tk-input-field
                                    label="Created at"
                                    :value="state.job?.createdAt"
                                    :read-only="true"
                                    :compact="true"
                                />
                                <tk-input-field
                                    label="Updated at"
                                    :value="state.job?.updatedAt"
                                    :read-only="true"
                                    :compact="true"
                                />
                                <tk-input-field
                                    label="Start time"
                                    :value="state.job?.startTime"
                                    :read-only="true"
                                    :compact="true"
                                />
                                <tk-input-field
                                    label="End time"
                                    :value="state.job?.endTime"
                                    :read-only="true"
                                    :compact="true"
                                />
                                <tk-input-field
                                    label="Ran with input folder"
                                    :value="state.job?.ranWithInputFolder ? 'Yes' : 'No'"
                                    :read-only="true"
                                    :compact="true"
                                />
                            </div>
                        </tk-container>

                        <tk-container header="Parameters">
                            <tk-key-value
                                v-if="state.job.parameters"
                                :items="state.job.parameters"
                                key-label="Parameter name"
                                value-label="Parameter value"
                            />
                            <div v-else>-</div>
                        </tk-container>

                        <tk-container header="Advanced Options">
                            <tk-space-between>
                                <tk-input-field
                                    label="Image"
                                    :value="state.job?.image"
                                    :read-only="true"
                                    :compact="true"
                                />
                                <tk-input-field
                                    label="Kernel"
                                    :value="state.job?.kernel"
                                    :read-only="true"
                                    :compact="true"
                                />
                                <div>
                                    <tk-label text="Environment variables" :optional="true" />
                                    <div class="detail-content-advanced-env">
                                        <tk-key-value
                                            v-if="state.job.envVariables"
                                            :items="state.job.envVariables"
                                            key-label="Variable name"
                                            value-label="Variable value"
                                        />
                                        <div v-else>-</div>
                                    </div>
                                </div>
                                <tk-input-field
                                    label="Max retry attempts"
                                    :value="state.job?.maxRetryAttempts"
                                    :read-only="true"
                                    :compact="true"
                                />
                                <tk-input-field
                                    label="Max run time (in seconds)"
                                    :value="state.job?.maxRunTime"
                                    :read-only="true"
                                    :compact="true"
                                />
                            </tk-space-between>
                        </tk-container>
                    </tk-space-between>
                </div>
            </tk-space-between>
        </div>
    </div>

    <div v-else class="detail-page">Loading...</div>
</template>

<style scoped>
.job-detail-page-head {
    margin-bottom: 20px;
    padding-top: 10px;
}

.job-detail-page-head a {
    cursor: pointer;
}

.job-detail-page-content .detail-content-info {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-gap: 20px;
}
</style>
