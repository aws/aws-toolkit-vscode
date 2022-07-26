<template>
    <div class="modes">
        <label class="mode-container" :data-disabled="value.mode !== 'linked'">
            <input class="radio" type="radio" name="mode" id="from-caws" v-model="value.mode" value="linked" />
            <span class="ml-8 option-label" style="padding: 0px">Select from REMOVED.codes</span>
        </label>

        <label class="mode-container" :data-disabled="value.mode !== 'empty'">
            <input class="radio" type="radio" name="mode" id="from-empty" v-model="value.mode" value="empty" />
            <span class="ml-8 option-label" style="padding: 0px" for="from-empty">Add Source Code Later</span>
        </label>
    </div>

    <div class="source-pickers" v-if="value.mode === 'linked'">
        <span>
            <label class="option-label soft">Project</label>
            <select class="picker" v-model="value.selectedProject" @change="update">
                <option disabled :value="undefined">{{ loadingProjects ? 'Loading...' : 'Select a project' }}</option>
                <option v-for="project in projects" :key="project.id" :value="project">
                    {{ `${project.org.name} / ${project.name}` }}
                </option>
            </select>
        </span>

        <span>
            <label class="option-label soft">Branch</label>
            <select class="picker" v-model="value.selectedBranch" @change="update">
                <option disabled :value="undefined">{{ loading ? 'Loading...' : 'Select a branch' }}</option>
                <option v-for="branch in availableBranches" :key="branch.id" :value="branch">
                    {{ branchName(branch) }}
                </option>
            </select>
        </span>
    </div>
    <div v-else>
        <b>Not Implemented</b>
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { CawsBranch, CawsProject } from '../../../shared/clients/cawsClient'
import { WebviewClientFactory } from '../../../webviews/client'
import { createClass, createType } from '../../../webviews/util'
import { CawsCreateWebview } from './backend'

const client = WebviewClientFactory.create<CawsCreateWebview>()

export const VueModel = createClass({
    mode: 'linked' as 'linked' | 'empty',
    selectedProject: undefined as CawsProject | undefined,
    selectedBranch: undefined as CawsBranch | undefined,
})

export default defineComponent({
    name: 'source-code',
    props: {
        modelValue: {
            type: createType(VueModel),
            default: new VueModel(),
        },
    },
    data() {
        return {
            projects: [] as CawsProject[],
            branches: {} as Record<string, CawsBranch[]>,
            loadingProjects: false,
            loadingBranches: {} as Record<string, boolean>,
        }
    },
    async created() {
        this.loadingProjects = true
        this.projects = await client.getProjects().finally(() => (this.loadingProjects = false))
    },
    watch: {
        async 'value.selectedProject'(project?: CawsProject) {
            if (project && !this.branches[project.name]) {
                this.loadingBranches[project.name] = true
                this.branches[project.name] ??= await client.getBranches(project).finally(() => {
                    this.loadingBranches[project.name] = false
                })
            }
        },
    },
    computed: {
        value() {
            return this.modelValue
        },
        loading() {
            if (!this.value.selectedProject) {
                return false
            }

            return this.loadingBranches[this.value.selectedProject.name] ?? false
        },
        availableBranches() {
            if (!this.value.selectedProject) {
                return []
            }

            return this.branches[this.value.selectedProject.name]
        },
    },
    emits: {
        'update:modelValue': (value: InstanceType<typeof VueModel>) => true,
    },
    methods: {
        update() {
            this.$emit('update:modelValue', this.value)
        },
        branchName(branch: CawsBranch) {
            return `${branch.repo.name} / ${branch.name.replace('refs/heads/', '')}`
        },
    },
})
</script>

<style scope>
.picker {
    min-width: 200px;
}

.source-pickers {
    margin-top: 16px;
    display: flex;
    column-gap: 16px;
}

.modes {
    display: flex;
    column-gap: 16px;
}

.mode-container {
    display: flex;
    border: 1px solid gray;
    padding: 8px;
    align-items: center;
}

.config-item {
    display: inline;
    margin-left: 8px;
}

.mode-container[data-disabled='false'] {
    border: 1px solid var(--vscode-focusBorder);
}

body.vscode-dark .mode-container[data-disabled='true'] .config-item {
    filter: brightness(0.8);
}

body.vscode-light .mode-container[data-disabled='true'] .config-item {
    filter: brightness(1.2);
}
</style>
