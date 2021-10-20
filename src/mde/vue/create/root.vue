<template>
    <h2>Create new environment</h2>
    Just some filler text
    <settings-panel
        id="role-panel"
        title="IAM Role"
        description="This environment requires an associated IAM role. If you do not have one, we will create a default role."
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
        description="All settings except EBS Volume can be modified in settings after creation."
        start-collapsed
    >
        <compute-panel v-model="compute" @edit-settings="editCompute"></compute-panel>
    </settings-panel>
</template>

<script lang="ts">
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
    roles: new RolesModel(),
    definitionFile: new DevFileModel(),
    tags: new TagsModel(),
    compute: new ComputeModel(),
}

// key design ideas:
// 1. only store state in a component if there is no two-way communication between parent/child
// 2. if there is two-way communication, store state in the parent
// 3. children can act independently to update their own models
export default defineComponent({
    name: 'create',
    components: {
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
                sourceCode: this.definitionFile.mode === 'repository' ? [{ uri: this.definitionFile.url }] : undefined,
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
</style>
