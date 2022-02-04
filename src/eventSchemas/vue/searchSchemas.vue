<template>
    <h1>
        {{ initialData.Header }}
    </h1>
    <div id="app">
        <div id="search_input">
            <input type="search" v-model="searchText" :placeholder="initialData.SearchInputPlaceholder" />
        </div>
        <div id="result_content">
            <select id="searchList" v-model="selectedSchema" v-on:change="userSelectedSchema" size="100">
                <option disabled value="">{{ searchProgressInfo }}</option>
                <option v-for="result in searchResults" :key="result" :value="result">{{ result.Title }}</option>
            </select>

            <div id="schemaContent_versionDropdown">
                <select id="versionList" v-model="selectedVersion" v-on:change="userSelectedVersion">
                    <option v-for="result in schemaVersions" :key="result" :value="result">
                        {{ initialData.VersionPrefix }} {{ result }}
                    </option>
                </select>
                <textarea readonly v-model="schemaContent"></textarea>
            </div>
        </div>

        <input type="submit" :disabled="downloadDisabled" v-on:click="downloadClicked" value="Download Code Bindings" />
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import _ from 'lodash'
import { WebviewClientFactory } from '../../webviews/client'
import { SchemaVersionedSummary, SearchSchemasWebview } from '../commands/searchSchemas'
import saveData from '../../webviews/mixins/saveData'

const client = WebviewClientFactory.create<SearchSchemasWebview>()

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
            schemaVersions: [],
            downloadDisabled: true,
        }
    },
    mounted() {
        this.$nextTick(function () {
            window.addEventListener('message', this.handleMessageReceived)
        })
    },
    watch: {
        searchText: function (newKeyword, oldKeyword) {
            this.debouncedSearch()
        },
    },
    async created() {
        this.initialData = (await client.init()) ?? this.initialData
        this.debouncedSearch = _.debounce(this.userSearchedText, 300)
    },
    methods: {
        debouncedSearch: () => {},
        userSearchedText: function () {
            this.resetSearchResults()
            this.resetSchemaContentAndVersionDropdown()
            this.downloadDisabled = true
            if (this.searchText === '') {
                this.searchProgressInfo = this.initialData.LocalizedMessages.noSchemasFound
                return
            }
            this.searchProgressInfo = this.initialData.LocalizedMessages.searching
            client.handler({
                command: 'searchSchemas',
                keyword: this.searchText,
                regionCode: this.initialData.Region,
                registryNames: this.initialData.RegistryNames,
            })
        },
        userSelectedSchema: function () {
            this.resetSchemaContentAndVersionDropdown()
            this.downloadDisabled = false
            this.schemaContent = this.initialData.LocalizedMessages.loading
            client.handler({
                command: 'fetchSchemaContent',
                schemaSummary: this.selectedSchema,
                regionCode: this.initialData.Region,
                version: this.selectedVersion,
            })
        },

        userSelectedVersion: function () {
            this.schemaContent = this.initialData.LocalizedMessages.loading
            client.handler({
                command: 'fetchSchemaContent',
                schemaSummary: this.selectedSchema,
                regionCode: this.initialData.Region,
                version: this.selectedVersion,
            })
        },
        downloadClicked: function () {
            client.handler({
                command: 'downloadCodeBindings',
                schemaSummary: this.selectedSchema,
                regionCode: this.initialData.Region,
            })
        },
        handleMessageReceived: function (event: any) {
            const message = event.data
            switch (message.command) {
                case 'showSchemaContent':
                    this.loadSchemaContent(message.results)
                    this.selectedVersion = message.version
                    break
                case 'showSearchSchemaList':
                    if (message.resultsNotFound || this.searchText === '') {
                        this.searchProgressInfo = this.initialData.LocalizedMessages.noSchemasFound
                        return
                    }
                    this.searchProgressInfo = this.initialData.LocalizedMessages.select
                    this.loadSchemaList(message.results)
                    break
                case 'setVersionsDropdown':
                    this.schemaVersions = message.results
                    break
                case 'setLocalizedMessages':
                    this.initialData.LocalizedMessages.noSchemasFound = message.noSchemasFound
                    this.initialData.LocalizedMessages.searching = message.searching
                    this.initialData.LocalizedMessages.loading = message.loading
                    this.initialData.LocalizedMessages.select = message.select
                    break
            }
        },
        loadSchemaContent: function (content: string) {
            this.schemaContent = content
        },

        loadSchemaList: function (results: SchemaVersionedSummary[]) {
            this.searchResults = results
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
