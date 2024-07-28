<template>
    <div class="panel-content">
        <div class="header-section">
            <vscode-panels>
                <vscode-panel-tab id="tab-1">Scan</vscode-panel-tab>
                <vscode-panel-tab id="tab-2">Query</vscode-panel-tab>
                <vscode-panel-view id="view-1">
                    <div class="header-left">
                        <span class="table-name">{{ dynamoDbTableData.tableName }}</span>
                        <span class="last-refreshed-info" style="width: 100%">{{
                            'Refreshed on: ' + new Date().toLocaleString()
                        }}</span>
                    </div>
                    <div class="header-right">
                        <vscode-button class="refresh-button" @click="refreshTable">Refresh</vscode-button>
                        <div class="pagination">
                            <vscode-link :class="{ disabled: isFirstPage }" @click="prevPage">&lt;</vscode-link>
                            <vscode-link href="#">{{ dynamoDbTableData.currentPage }}</vscode-link>
                            <vscode-link :class="{ disabled: isLastPage }" @click="nextPage">&gt;</vscode-link>
                        </div>
                    </div>
                </vscode-panel-view>
                <vscode-panel-view id="view-2">
                    <div class="query-section">
                        <vscode-text-field id="partitionKey" type="text" placeholder="Enter partition key value"
                            >Partition key: {{ partitionKey }}
                        </vscode-text-field>
                        <vscode-text-field
                            id="sortKey"
                            v-if="isSortKeyPresent"
                            type="text"
                            placeholder="Enter sort key value"
                            >Sort key: {{ sortKey }}
                        </vscode-text-field>
                        <div class="run-section">
                            <vscode-button style="background: round" @click="resetFields">Reset</vscode-button>
                            <vscode-button @click="executeQuery">Run</vscode-button>
                        </div>
                    </div>
                </vscode-panel-view>
            </vscode-panels>
        </div>
        <vscode-divider></vscode-divider>
        <div class="table-section">
            <div v-if="isLoading" class="progress-container">
                <vscode-progress-ring></vscode-progress-ring>
            </div>
            <vscode-data-grid id="datagrid" generate-header="sticky" aria-label="Sticky Header" :key="pageNumber">
                {{ updateTableSection(dynamoDbTableData) }}
            </vscode-data-grid>
        </div>
    </div>
</template>

<script setup lang="ts">
import { allComponents, provideVSCodeDesignSystem } from '@vscode/webview-ui-toolkit'

provideVSCodeDesignSystem().register(allComponents)
</script>

<script lang="ts">
import { defineComponent } from 'vue'
import { RowData } from '../utils/dynamodb'
import { DynamoDbTableWebview, DynamoDbTableData } from './tableView'
import { WebviewClientFactory } from '../../webviews/client'
import { Key } from 'aws-sdk/clients/dynamodb'

const client = WebviewClientFactory.create<DynamoDbTableWebview>()
export default defineComponent({
    data() {
        return {
            dynamoDbTableData: {
                tableName: '',
                region: '',
                currentPage: 1,
                tableHeader: [] as RowData[],
                tableContent: [] as RowData[],
            } as DynamoDbTableData,
            pageKeys: [] as (Key | undefined)[],
            pageNumber: 0,
            isLoading: true,
            partitionKey: '',
            sortKey: '',
        }
    },
    async created() {
        this.isLoading = true
        this.dynamoDbTableData = await client.init()
        const tableSchema = await client.getTableSchema()
        this.partitionKey = tableSchema.partitionKey.name
        this.sortKey = tableSchema.sortKey?.name
        this.pageKeys = [undefined, this.dynamoDbTableData.lastEvaluatedKey]
        this.isLoading = false
    },
    computed: {
        isFirstPage() {
            return this.dynamoDbTableData.currentPage === 1
        },
        isLastPage() {
            return this.dynamoDbTableData.lastEvaluatedKey == null
        },
        isSortKeyPresent() {
            if (this.sortKey) {
                return true
            }
            return false
        },
    },
    methods: {
        updateTableSection(dynamoDbTableData: Pick<DynamoDbTableData, 'tableContent'>) {
            const basicGrid = document.getElementById('datagrid')
            if (basicGrid) {
                ;(basicGrid as any).rowsData = dynamoDbTableData.tableContent
            }
        },

        async refreshTable() {
            this.updatePageNumber()
            this.isLoading = true
            this.dynamoDbTableData = await client.fetchPageData(undefined)
            this.isLoading = false
            this.pageKeys = [undefined, this.dynamoDbTableData.lastEvaluatedKey]
        },

        async prevPage() {
            this.updatePageNumber()
            if (this.dynamoDbTableData.currentPage > 1) {
                const previousKey = this.pageKeys[this.dynamoDbTableData.currentPage - 2]
                this.isLoading = true
                this.dynamoDbTableData = await client.fetchPageData(previousKey, this.dynamoDbTableData.currentPage)
                this.isLoading = false
                this.dynamoDbTableData.currentPage -= 1
            }
        },

        async nextPage() {
            this.updatePageNumber()
            this.isLoading = true
            this.dynamoDbTableData = await client.fetchPageData(
                this.dynamoDbTableData.lastEvaluatedKey,
                this.dynamoDbTableData.currentPage
            )
            this.isLoading = false
            if (this.dynamoDbTableData.lastEvaluatedKey) {
                this.pageKeys.push(this.dynamoDbTableData.lastEvaluatedKey)
            }
            this.dynamoDbTableData.currentPage += 1
        },

        updatePageNumber() {
            this.pageNumber += 1
        },

        resetFields() {
            document.getElementById('partitionKey').value = ''
            if (document.getElementById('sortKey')) {
                document.getElementById('sortKey').value = ''
            }
        },

        async executeQuery() {
            let sortKeyValue = ''
            if (document.getElementById('sortKey')) {
                sortKeyValue = document.getElementById('sortKey').value
            }

            const queryRequest = {
                partitionKey: document.getElementById('partitionKey').value,
                sortKey: sortKeyValue,
            }
            this.updatePageNumber()
            this.dynamoDbTableData = await client.queryData(queryRequest)
        },
    },
})
</script>

<style>
@import './tableView.css';
</style>
