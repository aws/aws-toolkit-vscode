<template>
    <div class="button-container">
        <input
            class="radio"
            type="radio"
            name="mode"
            id="definition-template"
            v-model="modelValue.mode"
            value="template"
            @input="update('mode', $event.target.value)"
        />
        <div class="config-item" :data-disabled="modelValue.mode === 'repository'">
            <label class="option-label" for="definition-template">
                <div class="mb-2">Use a definition file template</div>
                <span class="soft">
                    Choose from the many templates in the DevFile public registry. This file can be edited in your IDE
                    after creation.
                </span>
            </label>
            <select
                name="template-selector"
                v-model="modelValue.definitionFile"
                :disabled="modelValue.mode === 'repository'"
                required
                @input="update('definitionFile', $event.target.value)"
            >
                <option disabled selected value="">Choose a template...</option>
                <option v-for="(template, index) in modelValue.templates" v-bind:value="template.name" :key="index">
                    {{ template.name }}
                </option>
            </select>
        </div>
    </div>

    <div class="button-container">
        <input
            class="radio"
            type="radio"
            name="mode"
            id="repository"
            v-model="modelValue.mode"
            value="repository"
            @input="update('mode', $event.target.value)"
        />
        <div class="config-item" :data-disabled="modelValue.mode === 'template'">
            <label class="option-label" for="repository">
                <div class="mb-2">Clone repository with a custom defintion file</div>
                <span class="soft">
                    We'll attempt to automatically detect a definition file from your selected repository.
                </span>
            </label>
            <label class="label-context soft" for="repository-url">GitHub repository URL:</label>
            <input
                id="repository-url"
                name="repository-url"
                type="text"
                v-model="modelValue.repositoryUrl"
                :disabled="modelValue.mode === 'template'"
                placeholder="ex: https://github.com/repo-name"
                @input="update('repositoryUrl', $event.target.value)"
            />
        </div>
    </div>
</template>

<script lang="ts">
import { WebviewApi } from 'vscode-webview'
import { defineComponent } from 'vue'
import { DefinitionTemplate } from './backend'

declare const webviewApi: WebviewApi<VueModel>

class VueModel {
    public templates!: DefinitionTemplate[]
    public mode!: 'template' | 'repository'
    public definitionFile!: string
    public repositoryUrl!: string
}

export default defineComponent({
    name: 'definition-file',
    props: {
        modelValue: {
            type: VueModel,
            default: {
                mode: 'template',
                templates: [],
                definitionFile: '',
                repositoryUrl: '',
            },
        },
    },
    methods: {
        update(key: string, value: string) {
            this.$emit('update:modelValue', { ...this.modelValue, [key]: value })
        },
    },
})
// --vscode-editor-font-family
// --vscode-editor-font-weight
// --vscode-editor-font-size
// https://code.visualstudio.com/api/extension-guides/webview#theming-webview-content
</script>

<style>
.settings-panel {
    /* https://code.visualstudio.com/api/references/theme-color#menu-bar-colors */
    background: var(--vscode-menu-background);
    margin: 16px 0;
}
.label-context {
    display: block;
    padding: 0 0 4px 0;
}
.option-label {
    display: block;
    max-width: 560px;
    padding: 0 0 8px 0;
}
.button-container {
    display: flex;
    align-items: flex-start;
    flex-direction: row;
    margin: 16px 0 0 0;
}
.config-item {
    display: inline;
    margin-left: 8px;
    /* margin-top: 2px */
}
#repository-url {
    width: 80%;
    max-width: 320px;
}
</style>
