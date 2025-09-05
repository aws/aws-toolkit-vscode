<script setup lang="ts">
/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { computed, reactive, onBeforeMount } from 'vue'
import TkBox from '../../../shared/ux/tkBox.vue'
import TkSpaceBetween from '../../../shared/ux/tkSpaceBetween.vue'
import TkHighlightContainer from '../../../shared/ux/tkHighlightContainer.vue'
import TkLabel from '../../../shared/ux/tkLabel.vue'
import TkInputField from '../../../shared/ux/tkInputField.vue'
import Breadcrumbs, { BreadcrumbItem } from '../components/breadcrumbs.vue'
import CronSchedule, { ScheduleChange } from '../components/cronSchedule.vue'
import { client } from '../composables/useClient'
import { jobDefinitions, JobDefinition } from '../composables/useJobs'
import {
    viewJobsPage,
    jobDefinitionDetailPage,
    JobDefinitionDetailPageMetadata,
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
        items.push({
            text: state.jobDefinition.name,
            page: jobDefinitionDetailPage,
            metadata: { jobDefinitionId: state.jobDefinition?.id },
        })

        items.push({ text: 'Edit' })
    }

    return items
})

//-------------------------------------------------------------------------------------------------
// Lifecycle Hooks
//-------------------------------------------------------------------------------------------------
onBeforeMount(async () => {
    const page = await client.getCurrentPage()
    const metadata = page.metadata as EditJobDefinitionPageMetadata
    state.jobDefinition = jobDefinitions.value.find((jobDefinition) => jobDefinition.id === metadata.jobDefinitionId)
})

//-------------------------------------------------------------------------------------------------
// Variables & Methods
//-------------------------------------------------------------------------------------------------
function onScheduleChange(schedule: ScheduleChange) {
    // NOOP
}

function onSave() {
    onCancel()
}

async function onCancel() {
    const metadata: JobDefinitionDetailPageMetadata = { jobDefinitionId: state.jobDefinition?.id! }
    await client.setCurrentPage({ name: jobDefinitionDetailPage, metadata })
}
</script>

<template>
    <div v-if="state.jobDefinition" class="edit-job-definition-page">
        <div class="tk-page-head">
            <breadcrumbs :items="breadcrumbItems" />
            <h1 class="tk-title edit-job-definition-page-title">Edit Job Definition</h1>
        </div>

        <div class="job-definition-detail-page-content">
            <tk-highlight-container>
                <tk-input-field label="Last updated at" :value="state.jobDefinition.updatedAt" :read-only="true" />
            </tk-highlight-container>

            <tk-highlight-container>
                <tk-input-field
                    label="Input file snapshot"
                    description="Drag a file from the file browser and drop it here to update the input file snapshot"
                    :value="state.jobDefinition.inputFilename"
                />
            </tk-highlight-container>

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
                        <button class="tk-button button-theme-primary" @click="onSave">Save Changes</button>
                    </tk-space-between>
                </tk-box>
            </tk-highlight-container>
        </div>
    </div>

    <div v-else class="edit-job-definition-page">Loading...</div>
</template>

<style scoped>
.edit-job-definition-page-title {
    padding-left: 12px;
}

.edit-job-definition-page-head a {
    cursor: pointer;
}
</style>
