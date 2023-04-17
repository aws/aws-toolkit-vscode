<template>
    <div class="modes mb-16">
        <label class="mode-container" :data-disabled="model.type !== 'linked'">
            <input class="radio" type="radio" name="mode" id="from-code-catalyst" v-model="model.type" value="linked" />
            <span class="ml-8 option-label" style="padding: 0px">Use an existing CodeCatalyst repository</span>
        </label>

        <label class="mode-container" :data-disabled="model.type !== 'none'">
            <input class="radio" type="radio" name="mode" id="from-none" v-model="model.type" value="none" />
            <span class="ml-8 option-label" style="padding: 0px">Create an empty Dev Environment</span>
        </label>
    </div>

    <div class="source-pickers" v-if="model.type === 'linked'">
        <div class="modes flex-sizing mt-16">
            <span class="flex-sizing mt-8">
                <label class="option-label soft">Space</label>
                <button class="project-button" @click="quickPickSpace()">
                    {{ selectedSpaceName }}
                    <span class="icon icon-lg icon-vscode-edit edit-icon"></span>
                </button>
            </span>

            <span class="flex-sizing mt-8">
                <label class="option-label soft">Project</label>
                <button class="project-button" @click="quickPickProject()" :disabled="!isSpaceSelected">
                    {{ selectedProjectName }}
                    <span class="icon icon-lg icon-vscode-edit edit-icon"></span>
                </button>
            </span>
        </div>

        <div class="modes flex-sizing mt-16">
            <!-- Existing branch -->
            <span class="flex-sizing">
                <label class="options-label soft mb-8" style="display: block" for="branch-picker">Branch</label>
                <select
                    id="branch-picker"
                    class="picker"
                    :disabled="!model.selectedProject"
                    v-model="model.selectedBranch"
                    @input="update"
                >
                    <option disabled :value="undefined">{{ branchPlaceholder }}</option>
                    <option v-for="branch in availableBranches" :key="branch.id" :value="branch">
                        {{ branchName(branch) }}
                    </option>
                </select>
            </span>

            <!-- New Branch -->
            <span class="flex-sizing">
                <label class="options-label soft mb-8" style="display: block" for="branch-input"
                    >Create Branch - Optional for CodeCatalyst Repos</label
                >
                <input
                    id="branch-input"
                    type="text"
                    :placeholder="newBranchNamePlaceholder"
                    :disabled="!newBranchNameAllowed"
                    v-model="model.newBranch"
                    @input="update"
                />

                <div class="input-validation" v-if="branchError">{{ branchError }}</div>
            </span>
        </div>
    </div>

    <div class="source-pickers" v-if="model.type === 'none'">
        <div class="modes flex-sizing mt-16">
            <span class="flex-sizing mt-8">
                <label class="option-label soft">Space</label>
                <button class="project-button" @click="quickPickSpace()">
                    {{ selectedSpaceName }}
                    <span class="icon icon-lg icon-vscode-edit edit-icon"></span>
                </button>
            </span>

            <span class="flex-sizing mt-8">
                <label class="option-label soft">Project</label>
                <button class="project-button" @click="quickPickProject()" :disabled="!isSpaceSelected">
                    {{ selectedProjectName }}
                    <span class="icon icon-lg icon-vscode-edit edit-icon"></span>
                </button>
            </span>
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { CodeCatalystBranch, CodeCatalystProject } from '../../../shared/clients/codecatalystClient'
import { WebviewClientFactory } from '../../../webviews/client'
import { createClass, createType } from '../../../webviews/util'
import { CodeCatalystCreateWebview, SourceResponse } from './backend'

const client = WebviewClientFactory.create<CodeCatalystCreateWebview>()

type SourceModel = Partial<SourceResponse & { branchError: string }>

export function isValidSource(source: SourceModel): source is SourceResponse {
    if (source.type === 'linked') {
        return !!source.selectedProject && !!source.selectedBranch && !source.branchError
    } else if (source.type === 'none') {
        return !!source.selectedProject
    }

    return false
}

export const VueModel = createClass<SourceModel>({ type: 'linked' })

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
            projects: [] as CodeCatalystProject[],
            branches: {} as Record<string, CodeCatalystBranch[] | undefined>,
            loadingProjects: false,
            loadingBranches: {} as Record<string, boolean | undefined>,
            newBranchNameAllowed: false,
            newBranchNamePlaceholder: 'Select branch first...',
        }
    },
    async created() {
        this.loadingProjects = true
    },
    watch: {
        async 'model.selectedProject'(project?: CodeCatalystProject) {
            this.useFirstBranch()

            if (project && !this.branches[project.name]) {
                this.loadingBranches[project.name] = true
                this.branches[project.name] ??= await client.getBranches(project).finally(() => {
                    this.loadingBranches[project.name] = false
                })
                this.useFirstBranch()
            }
        },
        async 'model.selectedBranch'(branch?: CodeCatalystBranch) {
            if (this.model.type !== 'linked' || branch === undefined) {
                this.newBranchNameAllowed = false
                this.newBranchNamePlaceholder = ''
                return
            }

            // Disable user input for new branch name while calculating
            this.newBranchNameAllowed = false
            this.newBranchNamePlaceholder = 'Loading...'

            // Clear the existing new branch value so user does not see it
            const previousNewBranch = this.model.newBranch
            this.$emit('update:modelValue', { ...this.model, newBranch: undefined })

            // Only want to allow users to set a branch name if first party repo
            const isThirdPartyRepo = await client.isThirdPartyRepo({
                spaceName: branch.org.name,
                projectName: branch.project.name,
                sourceRepositoryName: branch.repo.name,
            })
            if (isThirdPartyRepo) {
                this.newBranchNamePlaceholder = 'Not Applicable for Linked Repo'
                this.newBranchNameAllowed = false
                // Clear the new branch in case one was already selected
                this.$emit('update:modelValue', { ...this.model, newBranch: undefined })
            } else {
                // First Party
                this.newBranchNamePlaceholder = 'branch-name'
                this.newBranchNameAllowed = true
                // Since this can have a new branch, set this back to what it previously was
                this.$emit('update:modelValue', { ...this.model, newBranch: previousNewBranch })
            }
        },
    },
    computed: {
        model() {
            return this.modelValue
        },
        loading() {
            if (this.model.type !== 'linked' || !this.model.selectedProject) {
                return false
            }

            return this.loadingBranches[this.model.selectedProject.name] ?? false
        },
        branchPlaceholder() {
            if (this.loading) {
                return 'Loading...'
            }

            return (this.availableBranches?.length ?? 0) === 0 ? 'No branches found' : 'Select a branch'
        },
        availableBranches() {
            if (this.model.type !== 'linked' || !this.model.selectedProject) {
                return []
            }

            return this.branches[this.model.selectedProject.name]
        },
        branchError() {
            if (this.model.type !== 'linked' || !this.model.newBranch) {
                return
            }

            const branch = this.model.newBranch
            if (!!branch && this.availableBranches?.find(b => b.name === `refs/heads/${branch}`) !== undefined) {
                return 'Branch already exists'
            }
        },
        isSpaceSelected() {
            return !!this.model.selectedSpace
        },
        isProjectSelected() {
            return !!this.model.selectedProject
        },
        selectedSpaceName() {
            if (this.model.selectedSpace === undefined) {
                return 'Not Selected'
            }
            return this.model.selectedSpace.name
        },
        selectedProjectName() {
            if (this.model.selectedProject === undefined) {
                return 'Not Selected'
            }
            return this.model.selectedProject.name
        },
    },
    methods: {
        update() {
            this.model.branchError = this.branchError
            this.$emit('update:modelValue', this.model)
        },
        branchName(branch: CodeCatalystBranch) {
            return `${branch.repo.name} / ${branch.name.replace('refs/heads/', '')}`
        },
        useFirstBranch() {
            if (this.model.type !== 'linked') {
                return
            }

            Object.assign<typeof this.model, Partial<SourceModel>>(this.model, {
                selectedBranch: this.availableBranches?.[0],
            })
            this.update()
        },
        async quickPickSpace() {
            const space = await client.quickPickSpace()
            if (space === undefined) {
                return
            }
            this.$emit('update:modelValue', { ...this.modelValue, selectedSpace: space, selectedProject: undefined })
        },
        async quickPickProject() {
            const selectedSpace = this.modelValue.selectedSpace
            if (selectedSpace === undefined) {
                return
            }

            const project = await client.quickPickProject(selectedSpace.name)
            if (project === undefined) {
                return
            }
            this.$emit('update:modelValue', { ...this.modelValue, selectedProject: project })
        },
    },
    emits: {
        'update:modelValue': (value: InstanceType<typeof VueModel>) => true,
    },
})
</script>

<style scope>
.picker {
    min-width: 300px;
    width: 100%;
    box-sizing: border-box;
}

.source-pickers {
    margin-top: 16px;
    display: flex;
    flex-flow: wrap;
    column-gap: 16px;
}

.modes {
    display: flex;
    column-gap: 16px;
}

.flex-sizing {
    flex: 1;
}

.mode-container {
    display: flex;
    flex: 1;
    border: 1px solid gray;
    padding: 8px;
    max-width: calc((1 / 3 * 100%) - (2 / 3 * 32px));
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

#repository-url {
    min-width: 300px;
}

#branch-input {
    min-width: 300px;
    width: 100%;
    box-sizing: border-box;
}

.project-button {
    background-color: transparent;
    padding-left: 0;
    padding-right: 0;
    font-weight: bold;
}

.edit-icon {
    color: #0078d7;
}
</style>
