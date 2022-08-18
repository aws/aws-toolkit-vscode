<template>
    <div class="modes mb-16">
        <label class="mode-container" :data-disabled="model.type !== 'linked'">
            <input class="radio" type="radio" name="mode" id="from-caws" v-model="model.type" value="linked" />
            <span class="ml-8 option-label" style="padding: 0px">Select a REMOVED.codes Repository</span>
        </label>

        <label class="mode-container" :data-disabled="model.type !== 'unlinked'">
            <input class="radio" type="radio" name="mode" id="from-unlinked" v-model="model.type" value="unlinked" />
            <span class="ml-8 option-label" style="padding: 0px">Provide a Repository URL</span>
        </label>

        <label class="mode-container" :data-disabled="model.type !== 'none'">
            <input class="radio" type="radio" name="mode" id="from-none" v-model="model.type" value="none" />
            <span class="ml-8 option-label" style="padding: 0px">Create an Empty Workspace</span>
        </label>
    </div>

    <div class="source-pickers" v-if="model.type === 'linked'">
        <span style="width: 100%">
            <label class="option-label soft">Project</label>
            <select class="picker" v-model="model.selectedProject" @change="update">
                <option disabled :value="undefined">{{ loadingProjects ? 'Loading...' : 'Select a project' }}</option>
                <option v-for="project in projects" :key="project.name" :value="project">
                    {{ `${project.org.name} / ${project.name}` }}
                </option>
            </select>
        </span>

        <div class="modes flex-sizing mt-16">
            <!-- Existing branch -->
            <span class="flex-sizing">
                <label class="options-label soft mb-8" style="display: block" for="branch-picker">Branch</label>
                <select
                    id="branch-picker"
                    class="picker"
                    :disabled="!model.selectedProject"
                    v-model="model.selectedBranch"
                    @change="update"
                >
                    <option disabled :value="undefined">{{ loading ? 'Loading...' : 'Select a branch' }}</option>
                    <option v-for="branch in availableBranches" :key="branch.id" :value="branch">
                        {{ branchName(branch) }}
                    </option>
                </select>
            </span>

            <!-- New Branch -->
            <span class="flex-sizing">
                <label class="options-label soft mb-8" style="display: block" for="branch-input"
                    >Optional - Create new branch from existing</label
                >
                <input
                    id="branch-input"
                    type="text"
                    placeholder="New branch name"
                    v-model="model.newBranch"
                    @change="update"
                />
            </span>
        </div>
    </div>
    <div v-else-if="model.type === 'unlinked'">
        <label class="options-label soft mb-2" style="display: block" for="repository-url">Repository URL</label>
        <input id="repository-url" class="mb-8" type="text" v-model="model.repositoryUrl" />

        <p class="no-spacing soft" style="font-size: smaller">
            The repo will be cloned in the workspace directly from the repo URL. Your SSH agent will be forwarded to the
            workspace for authentication to the repository.
        </p>

        <p id="repository-error" class="input-validation mb-0" v-if="model.urlError">{{ model.urlError }}</p>
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { CawsBranch, CawsProject } from '../../../shared/clients/cawsClient'
import { WebviewClientFactory } from '../../../webviews/client'
import { createClass, createType } from '../../../webviews/util'
import { CawsCreateWebview, SourceResponse } from './backend'

const client = WebviewClientFactory.create<CawsCreateWebview>()
const VALID_SCHEMES = ['https://', 'http://', 'ssh://']

type SourceModel = Partial<SourceResponse> & { urlError?: string }

export function isValidSource(source: SourceModel): source is SourceResponse {
    if (source.urlError) {
        return false
    }

    if (source.type === 'linked') {
        return !!source.selectedProject && !!source.selectedBranch
    } else if (source.type === 'unlinked') {
        return !!source.repositoryUrl
    } else {
        return source.type === 'none'
    }
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
            projects: [] as CawsProject[],
            branches: {} as Record<string, CawsBranch[]>,
            loadingProjects: false,
            loadingBranches: {} as Record<string, boolean>,
            urlValidationTimer: undefined as number | undefined,
        }
    },
    async created() {
        this.loadingProjects = true
        this.projects = await client.getProjects().finally(() => (this.loadingProjects = false))
    },
    watch: {
        async 'model.selectedProject'(project?: CawsProject) {
            if (this.model.type === 'linked') {
                ;(this.model.selectedBranch as any) = undefined
            }

            if (project && !this.branches[project.name]) {
                this.loadingBranches[project.name] = true
                this.branches[project.name] ??= await client.getBranches(project).finally(() => {
                    this.loadingBranches[project.name] = false
                })
            }
        },
        'model.repositoryUrl'(url?: string) {
            clearTimeout(this.urlValidationTimer)
            this.urlValidationTimer = undefined

            if (url && !this.urlError) {
                this.urlValidationTimer = setTimeout(async () => {
                    try {
                        this.modelValue.urlError = await client.validateRepositoryUrl(url)
                    } catch (err) {
                        this.modelValue.urlError = (err as Error).message
                    }

                    this.update()
                }, 100)
            } else {
                this.modelValue.urlError = this.urlError
                this.update()
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
        availableBranches() {
            if (this.model.type !== 'linked' || !this.model.selectedProject) {
                return []
            }

            return this.branches[this.model.selectedProject.name]
        },
        urlError() {
            if (this.model.type !== 'unlinked') {
                return
            }

            const url = this.model.repositoryUrl
            if (
                url &&
                (url.match(/^https?:\/\/REMOVED\.codes/) !== null ||
                    url.match(/^https?:\/\/[^:]*@git\.service\.REMOVED\.codes/) !== null)
            ) {
                return 'URL is from REMOVED.codes. Use `Select a REMOVED.codes Repository` instead.'
            } else if (!url || url?.match(/^[\w]+@/)) {
                return
            } else if (!VALID_SCHEMES.some(scheme => url?.startsWith(scheme))) {
                return `URL must use one of the following schemes: ${VALID_SCHEMES.join(', ')}`
            }
        },
    },
    methods: {
        update() {
            this.$emit('update:modelValue', this.model)
        },
        branchName(branch: CawsBranch) {
            return `${branch.repo.name} / ${branch.name.replace('refs/heads/', '')}`
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
}
</style>
