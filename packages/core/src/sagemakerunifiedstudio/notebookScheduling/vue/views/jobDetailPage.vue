<script setup lang="ts">
/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { computed, reactive, onBeforeMount } from 'vue'
import { TrainingJob } from '@aws-sdk/client-sagemaker'
import TkInputField from '../../../shared/ux/tkInputField.vue'
import TkContainer from '../../../shared/ux/tkContainer.vue'
import TkSpaceBetween from '../../../shared/ux/tkSpaceBetween.vue'
import TkBox from '../../../shared/ux/tkBox.vue'
import TkLabel from '../../../shared/ux/tkLabel.vue'
import TkKeyValue from '../../../shared/ux/tkKeyValue.vue'
import Breadcrumbs, { BreadcrumbItem } from '../components/breadcrumbs.vue'
import { client } from '../composables/useClient'
import { useJobs } from '../composables/useJobs'
import {
    getJobName,
    getJobInputNotebookName,
    getJobEnvironmentName,
    getJobParameters,
    getJobEnvironmentParameters,
    getFormattedDateTime,
    getJobRanWithInputFolder,
    getJobKernelName,
} from '../../utils/helpers'
import { viewJobsPage, JobDetailPageMetadata } from '../../utils/constants'

//-------------------------------------------------------------------------------------------------
// State
//-------------------------------------------------------------------------------------------------
interface State {
    job?: TrainingJob
}

const state: State = reactive({
    job: undefined,
})

//-------------------------------------------------------------------------------------------------
// Composables
//-------------------------------------------------------------------------------------------------
const { jobs } = useJobs()

//-------------------------------------------------------------------------------------------------
// Computed
//-------------------------------------------------------------------------------------------------
const breadcrumbItems = computed(() => {
    const items: BreadcrumbItem[] = [
        {
            text: 'Notebook Jobs',
            page: viewJobsPage,
            metadata: {},
        },
    ]

    if (state.job) {
        items.push({ text: getJobName(state.job) as string })
    }

    return items
})

//-------------------------------------------------------------------------------------------------
// Lifecycle Hooks
//-------------------------------------------------------------------------------------------------
onBeforeMount(async () => {
    const page = await client.getCurrentPage()
    const metadata = page.metadata as JobDetailPageMetadata
    state.job = jobs.value.find((job) => job.TrainingJobName === metadata.jobId)
})

//-------------------------------------------------------------------------------------------------
// Variables & Methods
//-------------------------------------------------------------------------------------------------
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
        <div class="tk-page-head">
            <breadcrumbs :items="breadcrumbItems" />
            <h1 class="tk-title">Job Details</h1>
        </div>

        <div class="job-detail-page-content">
            <tk-space-between>
                <tk-box float="right">
                    <tk-space-between direction="horizontal" size="xs">
                        <button class="tk-button" @click="onReloadJob">Reload Job</button>
                        <button class="tk-button button-theme-secondary" @click="onDownloadJob">
                            Download Job Files
                        </button>
                        <button class="tk-button tk-button_red" @click="onDeleteJob">Delete Job</button>
                    </tk-space-between>
                </tk-box>

                <tk-space-between>
                    <tk-container>
                        <div class="detail-content-info">
                            <tk-input-field
                                label="Job name"
                                :value="getJobName(state.job)"
                                :read-only="true"
                                :compact="true"
                            />
                            <tk-input-field
                                label="Job ID"
                                :value="state.job?.TrainingJobName"
                                :read-only="true"
                                :compact="true"
                            />
                            <tk-input-field
                                label="Input file"
                                :value="getJobInputNotebookName(state.job)"
                                :read-only="true"
                                :compact="true"
                            />
                            <tk-input-field
                                label="Environment"
                                :value="getJobEnvironmentName(state.job)"
                                :read-only="true"
                                :compact="true"
                            />
                            <tk-input-field
                                label="Status"
                                :value="state.job?.TrainingJobStatus"
                                :read-only="true"
                                :compact="true"
                            />
                            <tk-input-field
                                label="Created at"
                                :value="getFormattedDateTime(state.job?.CreationTime as unknown as string)"
                                :read-only="true"
                                :compact="true"
                            />
                            <tk-input-field
                                label="Updated at"
                                :value="getFormattedDateTime(state.job?.LastModifiedTime as unknown as string)"
                                :read-only="true"
                                :compact="true"
                            />
                            <tk-input-field
                                label="Start time"
                                :value="getFormattedDateTime(state.job?.TrainingStartTime as unknown as string)"
                                :read-only="true"
                                :compact="true"
                            />
                            <tk-input-field
                                label="End time"
                                :value="getFormattedDateTime(state.job?.TrainingEndTime as unknown as string)"
                                :read-only="true"
                                :compact="true"
                            />
                            <tk-input-field
                                label="Ran with input folder"
                                :value="getJobRanWithInputFolder(state.job) ? 'Yes' : 'No'"
                                :read-only="true"
                                :compact="true"
                            />
                        </div>
                    </tk-container>

                    <tk-container header="Parameters">
                        <tk-key-value
                            v-if="getJobParameters(state.job)"
                            :items="getJobParameters(state.job)!"
                            key-label="Parameter name"
                            value-label="Parameter value"
                        />
                        <div v-else>-</div>
                    </tk-container>

                    <tk-container header="Advanced Options">
                        <tk-space-between>
                            <tk-input-field
                                label="Image"
                                value="SageMaker Distribution"
                                :read-only="true"
                                :compact="true"
                            />
                            <tk-input-field
                                label="Kernel"
                                :value="getJobKernelName(state.job)"
                                :read-only="true"
                                :compact="true"
                            />
                            <div>
                                <tk-label text="Environment variables" :optional="true" />
                                <tk-key-value
                                    v-if="getJobEnvironmentParameters(state.job)"
                                    :items="getJobEnvironmentParameters(state.job)!"
                                    key-label="Variable name"
                                    value-label="Variable value"
                                />
                                <div v-else>-</div>
                            </div>
                            <tk-input-field
                                label="Max retry attempts"
                                :value="state.job?.RetryStrategy?.MaximumRetryAttempts"
                                :read-only="true"
                                :compact="true"
                            />
                            <tk-input-field
                                label="Max run time (in seconds)"
                                :value="state.job?.StoppingCondition?.MaxRuntimeInSeconds"
                                :read-only="true"
                                :compact="true"
                            />
                        </tk-space-between>
                    </tk-container>
                </tk-space-between>
            </tk-space-between>
        </div>
    </div>

    <div v-else class="job-detail-page">Loading...</div>
</template>

<style scoped>
.job-detail-page-head a {
    cursor: pointer;
}

.job-detail-page-content .detail-content-info {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-gap: 20px;
}
</style>
