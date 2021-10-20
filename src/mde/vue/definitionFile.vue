<template>
    <label class="option-label" for="devfile-url" v-if="environment === 'local'">
        <div class="mb-0">Devfile URL:</div>
    </label>
    <p v-else>
        You can use the IDE to edit the Devfile for your environment, which needs to be restarted to apply changes. To
        designate another file as your environment's Devfile, right-click the file and choose
        <b>Make Devfile for environment</b> from the menu. <a>Learn more about Devfiles.</a>
    </p>
    <div id="definition-file-grid">
        <input
            id="devfile-url"
            name="devfile-url"
            type="text"
            style="grid-area: input"
            v-model="modelValue.url"
            :data-invalid="!!urlError"
            placeholder="ex: https://registry.devfile.io/devfiles/go"
            @input="updateModel"
        />
        <p class="input-validation mt-0 mb-0" style="grid-area: error" v-if="urlError">
            {{ urlError }}
        </p>
        <button
            id="preview-devfile"
            class="button-theme-secondary no-wrap ml-16"
            type="button"
            style="grid-area: button"
            @click="preview"
        >
            {{ environment === 'local' ? 'Preview file' : 'Open in editor' }}
        </button>
    </div>
    <div class="mt-16">
        <a> Browse and choose another Devfile </a>
        <br />
        <span class="label-context soft"> Copy the Devfile page URL into the field above to update. </span>
    </div>
</template>

<script lang="ts">
import { WebviewApi } from 'vscode-webview'
import { defineComponent, PropType } from 'vue'
import { WebviewClientFactory } from '../../webviews/client'
import { createClass } from '../../webviews/util'
import { Commands } from './create/backend'

declare const webviewApi: WebviewApi<typeof VueModel>
const client = WebviewClientFactory.create<Commands>()

const PUBLIC_REGISTRY_URL = 'https://registry.devfile.io'
const VALID_SCHEMES = ['https://', 'http://', 'ssh://']

export const VueModel = createClass({
    url: '',
    urlError: '',
    mode: 'registry' as 'registry' | 'repository' | 'path',
})

// TODO: write directive to bind one tag's width to another

export default defineComponent({
    name: 'definition-file',
    props: {
        modelValue: {
            type: VueModel,
            default: new VueModel(),
        },
        environment: {
            type: String as PropType<'local' | 'remote'>,
            default: 'local',
        },
    },
    computed: {
        url() {
            return this.modelValue.url
        },
        mode() {
            return this.url.startsWith(PUBLIC_REGISTRY_URL) ? 'registry' : 'repository'
        },
        urlError() {
            const schemes = this.environment === 'remote' ? VALID_SCHEMES.concat('file://') : VALID_SCHEMES

            if (!this.url || (this.environment === 'remote' && this.url.startsWith('/'))) {
                return ''
            }

            if (!schemes.some(scheme => this.url.startsWith(scheme))) {
                return `URL must use one of the following schemes: ${schemes.join(', ')}`
            }

            return ''
        },
    },
    methods: {
        updateModel(event: Event) {
            const target = event.target as HTMLInputElement | undefined
            if (!target) {
                return
            }
            this.$emit('update:modelValue', {
                url: this.url,
                mode: this.mode,
                urlError: this.urlError,
            })
        },
        preview() {
            if (this.mode !== 'registry' || this.urlError) {
                return
            }
            client.openUrl(this.url)
        },
    },
})
</script>

<style scoped>
#definition-file-grid {
    display: grid;
    justify-content: left;
    grid-template-areas:
        'input button'
        'error .';
    grid-template-columns: minmax(auto, 400px) auto;
}
#devfile-url {
    max-height: 32px;
}
</style>
