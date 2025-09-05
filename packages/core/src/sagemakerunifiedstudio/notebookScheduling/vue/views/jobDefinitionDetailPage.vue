<script setup lang="ts">
/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { computed, reactive, onBeforeMount } from 'vue'
import TkInputField from '../../../shared/ux/tkInputField.vue'
import TkSpaceBetween from '../../../shared/ux/tkSpaceBetween.vue'
import TkBox from '../../../shared/ux/tkBox.vue'
import TkContainer from '../../../shared/ux/tkContainer.vue'
import TkKeyValue from '../../../shared/ux/tkKeyValue.vue'
import TkLabel from '../../../shared/ux/tkLabel.vue'
import JobsList from '../components/jobsList.vue'
import Breadcrumbs, { BreadcrumbItem } from '../components/breadcrumbs.vue'
import { client } from '../composables/useClient'
import { jobDefinitions, JobDefinition } from '../composables/useJobs'
import {
    viewJobsPage,
    JobDefinitionDetailPageMetadata,
    editJobDefinitionPage,
    EditJobDefinitionPageMetadata,
} from '../../utils/constants'

//-------------------------------------------------------------------------------------------------
// State
//-------------------------------------------------------------------------------------------------
interface State {
    jobDefinition?: JobDefinition
}

const state: State = reactive({
    jobDefinition: undefined,
})

//-------------------------------------------------------------------------------------------------
// Computed
//-------------------------------------------------------------------------------------------------
const breadcrumbItems = computed(() => {
    const items: BreadcrumbItem[] = [
        {
            text: 'Notebook Job Definitions',
            page: viewJobsPage,
            metadata: { showJobDefinitions: true },
        },
    ]

    if (state.jobDefinition) {
        items.push({ text: state.jobDefinition.name })
    }

    return items
})

//-------------------------------------------------------------------------------------------------
// Lifecycle Hooks
//-------------------------------------------------------------------------------------------------
onBeforeMount(async () => {
    const page = await client.getCurrentPage()
    const metadata = page.metadata as JobDefinitionDetailPageMetadata
    state.jobDefinition = jobDefinitions.value.find((jobDefinition) => jobDefinition.id === metadata.jobDefinitionId)
})

//-------------------------------------------------------------------------------------------------
// Variables & Methods
//-------------------------------------------------------------------------------------------------
async function onEdit() {
    const metadata: EditJobDefinitionPageMetadata = {
        jobDefinitionId: state.jobDefinition?.id!,
    }

    await client.setCurrentPage({ name: editJobDefinitionPage, metadata })
}

function onReload() {
    // NOOP
}

function onRunJob() {
    // NOOP
}

function onPause() {
    // NOOP
}

function onDelete() {
    // NOOP
}
</script>

<template>
    <div v-if="state.jobDefinition" class="job-definition-detail-page">
        <div class="tk-page-head">
            <breadcrumbs :items="breadcrumbItems" />
            <h1 class="tk-title">Job Definition</h1>
        </div>

        <div class="job-definition-detail-page-content">
            <tk-space-between>
                <tk-box float="right">
                    <tk-space-between direction="horizontal" size="xs">
                        <button class="tk-button" @click="onReload">Reload Job Definition</button>
                        <button class="tk-button button-theme-secondary" @click="onRunJob">Run Job</button>
                        <button class="tk-button button-theme-secondary" @click="onPause">Pause</button>
                        <button class="tk-button button-theme-secondary" @click="onEdit">Edit Job Definition</button>
                        <button class="tk-button tk-button_red" @click="onDelete">Delete Job Definition</button>
                    </tk-space-between>
                </tk-box>

                <tk-space-between>
                    <tk-container>
                        <div class="detail-content-info">
                            <tk-input-field
                                label="Name"
                                :value="state.jobDefinition?.name"
                                :read-only="true"
                                :compact="true"
                            />
                            <tk-input-field
                                label="Input file"
                                :value="state.jobDefinition?.inputFilename"
                                :read-only="true"
                                :compact="true"
                            />
                            <tk-input-field
                                label="Output directory"
                                :value="state.jobDefinition?.outputDirectory"
                                :read-only="true"
                                :compact="true"
                            />
                            <tk-input-field
                                label="Environment"
                                :value="state.jobDefinition?.environment"
                                :read-only="true"
                                :compact="true"
                            />
                            <tk-input-field
                                label="Status"
                                :value="state.jobDefinition?.status"
                                :read-only="true"
                                :compact="true"
                            />
                            <tk-input-field
                                label="Created at"
                                :value="state.jobDefinition?.createdAt"
                                :read-only="true"
                                :compact="true"
                            />
                            <tk-input-field
                                label="Updated at"
                                :value="state.jobDefinition?.updatedAt"
                                :read-only="true"
                                :compact="true"
                            />
                            <tk-input-field
                                label="Schedule"
                                :value="state.jobDefinition?.schedule"
                                :read-only="true"
                                :compact="true"
                            />
                            <tk-input-field
                                label="Time zone"
                                :value="state.jobDefinition?.timeZone"
                                :read-only="true"
                                :compact="true"
                            />
                            <tk-input-field
                                label="Ran with input folder"
                                :value="state.jobDefinition?.ranWithInputFolder ? 'Yes' : 'No'"
                                :read-only="true"
                                :compact="true"
                            />
                        </div>
                    </tk-container>

                    <tk-container>
                        <jobs-list :job-definition-id="state.jobDefinition.id" :hide-heading="true" />
                    </tk-container>

                    <tk-container header="Advanced Options">
                        <tk-space-between>
                            <tk-input-field
                                label="Image"
                                :value="state.jobDefinition?.image"
                                :read-only="true"
                                :compact="true"
                            />
                            <tk-input-field
                                label="Kernel"
                                :value="state.jobDefinition?.kernel"
                                :read-only="true"
                                :compact="true"
                            />
                            <div>
                                <tk-label text="Environment variables" :optional="true" />
                                <tk-key-value
                                    v-if="state.jobDefinition.envVariables"
                                    :items="state.jobDefinition.envVariables"
                                    key-label="Variable name"
                                    value-label="Variable value"
                                />
                                <div v-else>-</div>
                            </div>
                            <tk-input-field
                                label="Max retry attempts"
                                :value="state.jobDefinition?.maxRetryAttempts"
                                :read-only="true"
                                :compact="true"
                            />
                            <tk-input-field
                                label="Max run time (in seconds)"
                                :value="state.jobDefinition?.maxRunTime"
                                :read-only="true"
                                :compact="true"
                            />
                        </tk-space-between>
                    </tk-container>
                </tk-space-between>
            </tk-space-between>
        </div>
    </div>

    <div v-else class="job-definition-detail-page">Loading...</div>
</template>

<style scope>
.job-definition-detail-page-head a {
    cursor: pointer;
}

.job-definition-detail-page-content .detail-content-info {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-gap: 20px;
}
</style>
