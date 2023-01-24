<template>
    <div id="app">
        <div class="container button-container" style="justify-content: space-between">
            <h1>{{ initialData.Header }}</h1>
            <div>
                <input
                    type="submit"
                    :disabled="downloadDisabled"
                    v-on:click="downloadClicked"
                    value="Download Code Bindings"
                />
            </div>
        </div>

        <div id="search_input">
            <input type="search" v-model="searchText" :placeholder="initialData.SearchInputPlaceholder" />
        </div>
        <div id="result_content">
            <select id="searchList" v-model="selectedSchema" v-on:change="userSelectedSchema" size="100">
                <option disabled value="">{{ searchProgressInfo }}</option>
                <option v-for="result in searchResults" :key="result.RegistryName" :value="result">
                    {{ result.Title }}
                </option>
            </select>

            <div id="schemaContent_versionDropdown">
                <select id="versionList" v-model="selectedVersion" v-on:change="fetchSchemaContent">
                    <option v-for="result in schemaVersions" :key="result" :value="result">
                        {{ initialData.VersionPrefix }} {{ result }}
                    </option>
                </select>
                <textarea readonly v-model="schemaContent"></textarea>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { WebviewClientFactory } from '../../webviews/client'
import { SchemaVersionedSummary, SearchSchemasWebview } from './searchSchemas'
import saveData from '../../webviews/mixins/saveData'

const client = WebviewClientFactory.create<SearchSchemasWebview>()
let searchTimeout: number

export default defineComponent({
    data() {
        return {
            initialData: {
                Header: '',
                SearchInputPlaceholder: '',
                VersionPrefix: '',
                RegistryNames: [] as string[],
                Region: '',
                LocalizedMessages: {
                    noSchemasFound: '',
                    searching: '',
                    loading: '',
                    select: '',
                },
            },
            searchText: '',
            searchProgressInfo: '',
            searchResults: [] as SchemaVersionedSummary[],
            selectedSchema: {} as SchemaVersionedSummary,
            selectedVersion: '',
            schemaContent: '',
            schemaVersions: [] as string[],
            downloadDisabled: true,
        }
    },
    watch: {
        searchText: function (newKeyword, oldKeyword) {
            window.clearTimeout(searchTimeout)
            searchTimeout = window.setTimeout(() => this.userSearchedText(), 250)
        },
    },
    async created() {
        this.initialData = (await client.init()) ?? this.initialData
    },
    methods: {
        async userSearchedText() {
            this.resetSearchResults()
            this.resetSchemaContentAndVersionDropdown()
            this.downloadDisabled = true
            if (this.searchText === '') {
                this.searchProgressInfo = this.initialData.LocalizedMessages.noSchemasFound
                return
            }
            this.searchProgressInfo = this.initialData.LocalizedMessages.searching
            const resp = await client.searchSchemas(this.searchText)
            if (resp.resultsNotFound) {
                this.searchProgressInfo = this.initialData.LocalizedMessages.noSchemasFound
                return
            }
            this.searchProgressInfo = this.initialData.LocalizedMessages.select
            this.searchResults = resp.results
        },
        userSelectedSchema: function () {
            this.resetSchemaContentAndVersionDropdown()
            this.downloadDisabled = false
            this.fetchSchemaContent()
        },
        downloadClicked: function () {
            client.downloadCodeBindings(this.selectedSchema)
        },
        async fetchSchemaContent() {
            this.schemaContent = this.initialData.LocalizedMessages.loading
            const resp = await client.fetchSchemaContent(this.selectedSchema, this.selectedVersion)
            this.schemaContent = resp.results
            this.selectedVersion = resp.version
            this.schemaVersions = resp.versionList ?? this.schemaVersions
        },
        resetSearchResults: function () {
            this.selectedSchema = {} as SchemaVersionedSummary
            this.searchResults = []
            this.searchProgressInfo = ''
        },
        resetSchemaContentAndVersionDropdown: function () {
            this.selectedVersion = ''
            this.schemaContent = ''
            this.schemaVersions = []
        },
    },
    mixins: [saveData],
})
</script>
