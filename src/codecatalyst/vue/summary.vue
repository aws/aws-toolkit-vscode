<template>
    <div>
        <div id="summary-grid">
            <div id="alias" style="grid-area: alias">
                <span class="label-context soft">Alias</span>
                <b class="mb-8" style="display: block" v-if="!!summary.alias">
                    {{ summary.alias }}
                </b>
                <button
                    id="edit-alias"
                    class="button-theme-secondary"
                    type="button"
                    :disabled="!isConnected"
                    @click="$emit('editSettings', 'alias')"
                >
                    {{ summary.alias ? 'Edit Alias' : 'Add Alias' }}
                </button>
            </div>
            <!--TODO: render something here if branch is missing-->
            <div id="branch" style="grid-area: branch" v-if="!!branchName">
                <span class="label-context soft">Branch</span>
                <b class="mb-8" style="display: block">{{ branchName }}</b>
                <button class="button-theme-secondary" @click="openBranch">
                    <!--TODO: support 3P links?-->
                    Open Branch in CodeCatalyst
                </button>
            </div>
            <div id="project" style="grid-area: project">
                <span class="label-context soft">Project</span>
                <b>{{ summary.project.name }}</b>
            </div>
            <div id="status" style="grid-area: status" :data-connected="isConnected">
                <span class="label-context soft">Status</span>
                <b>
                    <span id="connected-icon" class="icon icon-lg icon-vscode-pass" v-if="isConnected"></span>
                    <span v-html="isConnected ? 'Connected' : status"></span>
                </b>
            </div>
        </div>
        <button
            id="toggle-state"
            class="button-theme-secondary mt-8"
            type="button"
            :disabled="!isConnected"
            @click="stopDevEnv"
        >
            <span id="stop-icon" class="icon icon-lg icon-vscode-stop-circle"></span>Stop
        </button>
        <!--TODO: add generic 'delete thing' prompt then enable this-->
        <button
            id="delete-devenv"
            class="button-theme-secondary ml-8 mt-8"
            type="button"
            :disabled="!isConnected"
            @click="deleteDevEnv"
            v-show="false"
        >
            Delete Dev Environment
        </button>
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { WebviewClientFactory } from '../../webviews/client'
import { createClass, createType } from '../../webviews/util'
import { CodeCatalystConfigureWebview } from './configure/backend'
import { DevEnvironment } from '../../shared/clients/codecatalystClient'

const client = WebviewClientFactory.create<CodeCatalystConfigureWebview>()

type PartialModel = Pick<DevEnvironment, 'alias' | 'org' | 'project' | 'repositories' | 'status' | 'id'>
export const VueModel = createClass<PartialModel>({
    org: { name: '' },
    project: { name: '' },
    repositories: [],
    status: '',
    id: '',
})

export default defineComponent({
    name: 'devenv-summary',
    props: {
        modelValue: {
            type: createType(VueModel),
            required: true,
        },
    },
    emits: {
        editSettings: (key: 'alias') => key !== undefined,
        'update:modelValue': (model: PartialModel) => model !== undefined,
    },
    computed: {
        status() {
            return this.summary.status.charAt(0).concat(this.summary.status.slice(1).toLowerCase())
        },
        isConnected() {
            return this.summary.status === 'RUNNING'
        },
        summary() {
            return this.modelValue
        },
        branchName() {
            return this.summary.repositories[0]?.branchName
        },
    },
    methods: {
        update<K extends keyof PartialModel>(key: K, value: PartialModel[K]) {
            this.$emit('update:modelValue', { ...this.modelValue, [key]: value })
        },
        // Need to move these two remote calls up into the root component.
        async stopDevEnv() {
            try {
                this.update('status', 'STOPPING')
                await client.stopDevEnv(this.summary)
            } catch {
                this.update('status', 'RUNNING')
            }
        },
        async deleteDevEnv() {
            try {
                this.update('status', 'DELETING')
                await client.deleteDevEnv(this.summary)
            } catch {
                this.update('status', 'RUNNING')
            }
        },
        async openBranch() {
            return client.openBranch()
        },
    },
})
</script>

<style scoped>
#summary-grid {
    display: grid;
    justify-content: left;
    grid-template-areas:
        'alias branch'
        'status project';
    gap: 16px 160px;
}
#edit-compute-settings {
    margin-top: 16px;
}

/* TODO: darker green for light-theme ??? */
#status[data-connected='true'] {
    color: var(--vscode-testing-iconPassed);
}

#connected-icon {
    padding: 4px;
    vertical-align: -0.2em;
}

#stop-icon {
    color: var(--vscode-debugIcon-stopForeground);
    margin-right: 5px;
    vertical-align: -0.2em;
}
</style>
