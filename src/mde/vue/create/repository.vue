<template>
    <label class="label-context" for="repository-url">Repository URL:</label>
    <input
        id="repository-url"
        name="repository-url"
        type="text"
        v-model="modelValue.url"
        placeholder="ex: https://github.com/aws/aws-toolkit-vscode"
        @input="update('url', $event.target.value)"
    />
    <label class="option-label mt-8" for="select-branch" style="padding: 0 0 2px 0">
        <div class="mb-2">Select a branch</div>
    </label>
    <select
        name="select-branch"
        id="select-branch"
        v-model="modelValue.branch"
        :disabled="loadingBranches || !!modelValue.error"
        required
        @input="update('branch', $event.target.value)"
    >
        <option v-if="loadingBranches && !branches.length" disabled selected :value="modelValue.branch">
            {{ 'Loading...' }}
        </option>
        <!-- 
            <option class="input-validation" v-if="modelValue.error" disabled selected :value="modelValue.branch">{{ modelValue.error }}</option>
        -->
        <option v-for="(branch, index) in branches" v-bind:value="branch" :key="index">
            {{ branch }}
        </option>
    </select>
    <p id="repository-error" class="input-validation" v-if="modelValue.error">
        {{ modelValue.error }}
    </p>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { WebviewClientFactory } from '../../../webviews/client'
import saveData from '../../../webviews/mixins/saveData'
import { createClass, createType } from '../../../webviews/util'
import { MdeCreateWebview } from './backend'

export const VueModel = createClass({
    url: '',
    error: '',
    branch: '',
})
const BRANCH_DEBOUNCE_TIME = 1000

const client = WebviewClientFactory.create<MdeCreateWebview>()
const VALID_SCHEMES = ['https://', 'http://', 'ssh://']

export default defineComponent({
    name: 'repository-url',
    props: {
        modelValue: {
            type: createType(VueModel),
            default: new VueModel(),
        },
    },
    data() {
        return {
            branchTimer: undefined as number | undefined,
            loadingBranches: false,
            branches: [] as string[],
        }
    },
    created() {
        // override saved state in case user refreshes during a load
        this.loadingBranches = false
    },
    mixins: [saveData],
    computed: {
        url() {
            return this.modelValue.url
        },
        urlError() {
            // assume git-style ssh format
            if (this.url.match(/^[\w]+@/)) {
                return ''
            } else if (!VALID_SCHEMES.some(scheme => this.url.startsWith(scheme))) {
                return `URL must use one of the following schemes: ${VALID_SCHEMES.join(', ')}`
            }

            return ''
        },
    },
    watch: {
        url() {
            this.loadingBranches = this.url !== ''
            clearTimeout(this.branchTimer)
            this.update('error', this.urlError)
            this.branchTimer = window.setTimeout(() => {
                if (this.urlError) {
                    return
                }
                client.listBranches(this.url).then(branches => {
                    this.branches = branches
                    this.loadingBranches = false
                    if (branches.length === 0) {
                        if (this.url.match(/^([\w]+@|ssh:\/\/)/)) {
                            // TODO: we can just test if it's running
                            this.update('error', 'Is your SSH agent running?')
                        } else {
                            this.update('error', 'No branches found')
                        }
                    } else if (!this.modelValue.branch || !branches.includes(this.modelValue.branch)) {
                        this.update('branch', branches[0])
                    }
                })
            }, BRANCH_DEBOUNCE_TIME)
        },
        urlError() {
            this.update('error', this.urlError)
        },
    },
    methods: {
        update(key: keyof InstanceType<typeof VueModel>, value: string) {
            this.$emit('update:modelValue', { ...this.modelValue, [key]: value })
        },
    },
})
</script>

<style>
#repository-url {
    width: 300px;
}
#select-branch {
    width: 200px;
}
#repository-error {
    width: 300px;
}
</style>
