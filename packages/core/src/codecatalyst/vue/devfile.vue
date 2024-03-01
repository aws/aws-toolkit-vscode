<template>
    <div id="location">
        <span class="label-context soft">Location:</span>
        <b>{{ filePath }}</b>
    </div>

    <button
        id="preview-devfile"
        class="button-theme-secondary no-wrap mt-8"
        type="button"
        style="grid-area: button"
        @click="preview"
    >
        Open in Editor
    </button>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { WebviewClientFactory } from '../../webviews/client'
import { CodeCatalystConfigureWebview } from './configure/backend'

const client = WebviewClientFactory.create<CodeCatalystConfigureWebview>()

export default defineComponent({
    name: 'devfile',
    props: {
        filePath: String,
    },
    methods: {
        preview() {
            client.openDevfile()
        },
    },
})
</script>
