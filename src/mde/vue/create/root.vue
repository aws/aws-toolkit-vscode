<template>
    <h2>Create new environment</h2>
    <div id="header-description">
        Use Cloud9's fully managed environments to power your development without worrying about servers or local
        environment setup. Visit the <a>Cloud9 Environments site</a> to learn more about pricing and additional
        features.
    </div>
    <settings-panel
        id="repository-panel"
        title="Git Repository"
        description="Enter a git repository URL to automatically clone into your new environment."
    >
        <repository-item v-model="repo"></repository-item>
    </settings-panel>
    <settings-panel
        id="role-panel"
        title="AWS Identity and Access Management (IAM) role"
        description="Choose an IAM role that allows applications running in your development environment to interact with
        AWS services. If you do not have one we, will create a default role."
    >
        <role-panel v-model="roles"></role-panel>
    </settings-panel>
    <div class="flex-right">
        <button id="cancel-submit" class="ml-8 mr-8 button-theme-secondary" type="button" @click="cancel">
            Cancel
        </button>
        <button id="submit-create" class="button-theme-primary" type="button" @click="submit">
            Create environment
        </button>
    </div>
    <p>More configurations</p>
    <settings-panel
        id="dev-file-panel"
        title="DevFile"
        description="Contains the definition to build your application libraries and toolchain. Can be updated later in your IDE."
        start-collapsed
    >
        <definition-file v-model="definitionFile"></definition-file>
    </settings-panel>
    <settings-panel
        id="tags-and-labels-panel"
        title="Tags and labels - optional"
        description="Use tags (key and value) to track resources and costs. Use labels (key only) to identify your environment."
        start-collapsed
    >
        <tags-panel v-model="tags"></tags-panel>
    </settings-panel>
    <settings-panel
        id="compute-settings-panel"
        vscode-id=""
        title="Compute settings"
        description="All settings except EBS Volume can be changed in settings after creation."
        start-collapsed
    >
        <compute-panel v-model="compute" @edit-settings="editCompute"></compute-panel>
    </settings-panel>
</template>

<script lang="ts">
import repositoryItem, { VueModel as RepositoryModel } from './repository.vue'
import definitionFile, { VueModel as DevFileModel } from '../definitionFile.vue'
import rolePanel, { VueModel as RolesModel } from '../roles.vue'
import tagsPanel, { VueModel as TagsModel } from '../tags.vue'
import computePanel, { VueModel as ComputeModel } from '../compute.vue'
import settingsPanel from '../../../webviews/components/settingsPanel.vue'
import { defineComponent } from 'vue'
import { Commands } from './backend'
import { WebviewClientFactory } from '../../../webviews/client'
import { SettingsForm } from '../../wizards/environmentSettings'
import saveData from '../../../webviews/mixins/saveData'

const client = WebviewClientFactory.create<Commands>()

const model = {
    repo: new RepositoryModel(),
    roles: new RolesModel(),
    definitionFile: new DevFileModel(),
    tags: new TagsModel(),
    compute: new ComputeModel(),
}

export default defineComponent({
    name: 'create',
    components: {
        repositoryItem,
        definitionFile,
        tagsPanel,
        settingsPanel,
        computePanel,
        rolePanel,
    },
    mixins: [saveData],
    data() {
        return model
    },
    created() {
        client.init().then(repo => (this.repo.url = repo?.url ?? ''))
        client.loadRoles().then(r => (this.roles.roles = r))
    },
    methods: {
        submit() {
            if (!this.isValid()) {
                return
            }
            client.submit({
                ...this.compute,
                roleArn: this.roles.roles.find(r => r.RoleName === this.roles.selectedRoleName)?.Arn,
                tags: this.tags.tags.reduce((prev, cur) => Object.assign(prev, { [cur.key]: cur.value }), {}),
                devfile:
                    this.definitionFile.mode === 'registry' ? { uri: { uri: this.definitionFile.url } } : undefined,
                sourceCode: this.repo.error === '' ? [{ uri: this.repo.url, branch: this.repo.branch }] : undefined,
            })
        },
        cancel() {
            client.cancel()
        },
        editCompute(current: SettingsForm) {
            client.editSettings(current).then(settings => {
                this.compute = settings ?? this.compute
            })
        },
        isValid() {
            // TODO: just have components emit an 'error' event to notifiy containers that they should not submit
            // we should also just provide the offending element id so we can link to it
            return !(
                this.tags.tags.map(({ keyError, valueError }) => keyError || valueError).reduce((a, b) => a || b, '') ||
                this.definitionFile.urlError
            )
        },
    },
})
</script>

<style scoped>
html {
    overflow-y: scroll;
}
/* Default padding is 20x, this gives space for the scrollbar which is 8px wide */
body {
    padding-right: 12px;
}
.flex-right {
    display: flex;
    justify-content: flex-end;
}

#header-description {
    max-width: 80%;
}
</style>
