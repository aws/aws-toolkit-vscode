;(function() {
    const vscode = acquireVsCodeApi()
    const app = new Vue({
        el: '#app',
        data: {
            searchText: '',
            searchProgressInfo: '',
            searchResults: [],
            selectedSchema: {},
            selectedVersion: '',
            schemaContent: '',
            schemaVersions: [],
            downloadDisabled: true,
            localizedMessages: {
                noSchemasFound: '',
                searching: '',
                loading: '',
                select: ''
            }
        },
        mounted() {
            this.$nextTick(function() {
                window.addEventListener('message', this.handleMessageReceived)
            })
        },
        watch: {
            searchText: function(newKeyword, oldKeyword) {
                this.debouncedSearch()
            }
        },
        computed: {
            downloadDisabled() {
                return this.downloadDisabled
            }
        },
        created: function() {
            this.debouncedSearch = _.debounce(this.userSearchedText, 300)
        },
        methods: {
            userSearchedText: function() {
                this.resetSearchResults()
                this.resetSchemaContentAndVersionDropdown()
                this.downloadDisabled = true
                if (this.searchText === '') {
                    this.searchProgressInfo = this.localizedMessages.noSchemasFound
                    return
                }
                this.searchProgressInfo = this.localizedMessages.searching
                vscode.postMessage({
                    command: 'searchSchemas',
                    keyword: this.searchText
                })
            },
            userSelectedSchema: function() {
                this.resetSchemaContentAndVersionDropdown()
                this.downloadDisabled = false
                this.schemaContent = this.localizedMessages.loading
                vscode.postMessage({
                    command: 'fetchSchemaContent',
                    schemaSummary: this.selectedSchema
                })
            },

            userSelectedVersion: function() {
                this.schemaContent = this.localizedMessages.loading
                vscode.postMessage({
                    command: 'fetchSchemaContent',
                    schemaSummary: this.selectedSchema,
                    version: this.selectedVersion
                })
            },
            downloadClicked: function() {
                vscode.postMessage({
                    command: 'downloadCodeBindings',
                    schemaSummary: this.selectedSchema
                })
            },
            handleMessageReceived: function(e) {
                const message = event.data
                switch (message.command) {
                    case 'showSchemaContent':
                        this.loadSchemaContent(message.results)
                        this.selectedVersion = message.version
                        break
                    case 'showSearchSchemaList':
                        if (message.resultsNotFound || this.searchText === '') {
                            this.searchProgressInfo = this.localizedMessages.noSchemasFound
                            return
                        }
                        this.searchProgressInfo = this.localizedMessages.select
                        this.loadSchemaList(message.results)
                        break
                    case 'setVersionsDropdown':
                        this.schemaVersions = message.results
                        break
                    case 'setLocalizedMessages':
                        this.localizedMessages.noSchemasFound = message.noSchemasFound
                        this.localizedMessages.searching = message.searching
                        this.localizedMessages.loading = message.loading
                        this.localizedMessages.select = message.select
                        break
                }
            },
            loadSchemaContent: function(content) {
                this.schemaContent = content
            },

            loadSchemaList: function(results) {
                this.searchResults = results
            },
            resetSearchResults: function() {
                this.selectedSchema = ''
                this.searchResults = ''
                this.searchProgressInfo = ''
            },
            resetSchemaContentAndVersionDropdown: function() {
                this.selectedVersion = ''
                this.schemaContent = ''
                this.schemaVersions = []
            }
        }
    })
})()
