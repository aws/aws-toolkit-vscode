<script setup lang="ts">
/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { reactive } from 'vue'
import TkSpaceBetween from '../../../shared/ux/tkSpaceBetween.vue'
import TkBox from '../../../shared/ux/tkBox.vue'
import TkExpandableSection from '../../../shared/ux/tkExpandableSection.vue'
import TkLabel from '../../../shared/ux/tkLabel.vue'
import TkInputField from '../../../shared/ux/tkInputField.vue'
import TkCheckboxField from '../../../shared/ux/tkCheckboxField.vue'
import TkSelectField, { Option } from '../../../shared/ux/tkSelectField.vue'
import TkHighlightContainer from '../../../shared/ux/tkHighlightContainer.vue'
import CronSchedule, { ScheduleChange } from '../components/cronSchedule.vue'
import ScheduleParameters from '../components/scheduleParameters.vue'
import { client } from '../composables/useClient'
import { viewJobsPage, ViewJobsPageMetadata } from '../../utils/constants'

//-------------------------------------------------------------------------------------------------
// State
//-------------------------------------------------------------------------------------------------
interface State {
    jobName: string
    notebookFileName: string
    computeTypeList: Option[]
    imageList: Option[]
    kernel: string
    maxRetryAttempts: number
    maxRuntime: number
    isJobDefinition: boolean
    jobNameErrorMessage: string
    maxRetryAttemptsErrorMessage: string
    maxRuntimeErrorMessage: string
}
const state: State = reactive({
    jobName: 'job-1',
    notebookFileName: 'notebook1.ipynb',
    computeTypeList: [
        { text: 'First', value: 'first' },
        { text: 'Second', value: 'second' },
        { text: 'Third', value: 'third' },
    ],
    imageList: [{ text: 'SageMaker Distribution', value: 'smd' }],
    kernel: 'python3',
    maxRetryAttempts: 1,
    maxRuntime: 172800,
    isJobDefinition: false,
    jobNameErrorMessage: '',
    maxRetryAttemptsErrorMessage: '',
    maxRuntimeErrorMessage: '',
})

//-------------------------------------------------------------------------------------------------
// Variables & Methods
//-------------------------------------------------------------------------------------------------
function onCreate() {
    const metadata: ViewJobsPageMetadata = {}

    if (state.isJobDefinition) {
        metadata.newJobDefinition = 'new-job-definition'
    } else {
        metadata.newJob = 'new-job'
    }

    client.setCurrentPage({ name: viewJobsPage, metadata })
}

function onCancel() {
    const metadata: ViewJobsPageMetadata = {}
    client.setCurrentPage({ name: viewJobsPage, metadata })
}

const onScheduleChange = (schedule: ScheduleChange) => {
    if (schedule.scheduleType === 'runonschedule') {
        state.isJobDefinition = true
    }
}

const onJobNameUpdate = (newValue: string | number) => {
    state.jobName = newValue as string
    state.jobNameErrorMessage = state.jobName.length > 0 ? '' : 'Job name is required.'
}

const onMaxRetryAttemptsUpdate = (newValue: string | number) => {
    state.maxRetryAttempts = newValue as number
    state.maxRetryAttemptsErrorMessage =
        state.maxRetryAttempts >= 1 && state.maxRetryAttempts <= 30
            ? ''
            : 'Invalid max retry attempts must have a minimum value of 1 and a maximum value of 30.'
}

const onMaxRuntimeUpdate = (newValue: string | number) => {
    state.maxRuntime = newValue as number
    state.maxRuntimeErrorMessage = state.maxRuntime > 0 ? '' : 'Invalid max run time must have a minimum value of 1.'
}
</script>

<template>
    <div class="create-schedule-page">
        <div class="create-schedule-page-head">
            <h1 class="tk-title create-schedule-page-title">Create Job</h1>
        </div>

        <div class="create-schedule-page-content">
            <tk-highlight-container>
                <tk-input-field
                    label="Job name"
                    :value="state.jobName"
                    :validation-message="state.jobNameErrorMessage"
                    @update:value="onJobNameUpdate"
                />
            </tk-highlight-container>

            <tk-highlight-container>
                <tk-input-field label="Input file" :value="state.notebookFileName" :read-only="true" />
            </tk-highlight-container>

            <tk-highlight-container>
                <tk-checkbox-field id="jobInputFolder" label="Run job with input folder" />
            </tk-highlight-container>

            <tk-highlight-container>
                <tk-select-field label="Compute type" :options="state.computeTypeList" />
            </tk-highlight-container>

            <tk-highlight-container>
                <tk-space-between size="xs">
                    <tk-label text="Parameters" :optional="true" />
                    <schedule-parameters />
                </tk-space-between>
            </tk-highlight-container>

            <div class="create-schedule-page-additional-options">
                <tk-expandable-section header="Additional options">
                    <tk-space-between size="none">
                        <tk-highlight-container>
                            <tk-select-field
                                label="Image"
                                :options="state.imageList"
                                description="Select the Docker image that contains the required Kernel & Libraries to execute the notebook."
                            />
                        </tk-highlight-container>

                        <tk-highlight-container>
                            <tk-input-field
                                label="Kernel"
                                :value="state.kernel"
                                :read-only="true"
                                description="Kernel to execute the given notebook. This kernel should be installed in the above image."
                            />
                        </tk-highlight-container>

                        <tk-highlight-container>
                            <tk-space-between size="xs">
                                <tk-label
                                    text="Environment variables"
                                    description="Enter key-value pairs that will be accessible in your notebook."
                                    :optional="true"
                                />
                                <schedule-parameters />
                            </tk-space-between>
                        </tk-highlight-container>

                        <tk-highlight-container>
                            <tk-input-field
                                type="number"
                                label="Max retry attempts"
                                :value="state.maxRetryAttempts"
                                description="Enter a minimum value of 1 and a maximum value of 30."
                                :validation-message="state.maxRetryAttemptsErrorMessage"
                                @update:value="onMaxRetryAttemptsUpdate"
                            />
                        </tk-highlight-container>

                        <tk-highlight-container>
                            <tk-input-field
                                type="number"
                                label="Max run time (in seconds)"
                                :value="state.maxRuntime"
                                description="Enter a minimum value of 1."
                                :validation-message="state.maxRuntimeErrorMessage"
                                @update:value="onMaxRuntimeUpdate"
                            />
                        </tk-highlight-container>
                    </tk-space-between>
                </tk-expandable-section>
            </div>

            <tk-highlight-container>
                <tk-space-between size="xs">
                    <tk-label text="Schedule" />
                    <cron-schedule @schedule-change="onScheduleChange" />
                </tk-space-between>
            </tk-highlight-container>

            <tk-highlight-container>
                <tk-box float="right">
                    <tk-space-between direction="horizontal">
                        <button class="tk-button button-theme-secondary" @click="onCancel">Cancel</button>
                        <button class="tk-button button-theme-primary" @click="onCreate">Create</button>
                    </tk-space-between>
                </tk-box>
            </tk-highlight-container>
        </div>
    </div>
</template>

<style scoped>
.create-schedule-page-title {
    padding-left: 12px;
}

.create-schedule-page-additional-options {
    padding: 12px 14px 18px 14px;
}
</style>
