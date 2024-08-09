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
                        <vscode-text-field
                            id="partitionKey"
                            type="text"
                            placeholder="Enter partition key value"
                            :value="partitionKeyValue"
                            @input="(event: any) => (partitionKeyValue = event.target.value)"
                            ><i>Partition key: </i><b>{{ partitionKey }}</b>
                        </vscode-text-field>
                        <vscode-text-field
                            id="sortKey"
                            v-if="isSortKeyPresent"
                            type="text"
                            placeholder="Enter sort key value"
                            ><i>Sort key: </i><b>{{ sortKey }}</b>
                        </vscode-text-field>
                        <div class="run-section">
                            <vscode-button style="background: round" @click="resetFields">Reset</vscode-button>
                            <vscode-button :disabled="!partitionKeyValue" @click="executeQuery">Run</vscode-button>
                        </div>
                    </div>
                    <div class="header-right">
                        <vscode-button class="refresh-button" style="visibility: hidden">Refresh</vscode-button>
                        <div class="pagination">
                            <vscode-link :class="{ disabled: isFirstPage }" @click="prevPage">&lt;</vscode-link>
                            <vscode-link href="#">{{ dynamoDbTableData.currentPage }}</vscode-link>
                            <vscode-link :class="{ disabled: isLastPage }" @click="nextPage">&gt;</vscode-link>
                        </div>
                    </div>
                </vscode-panel-view>
            </vscode-panels>
        </div>
        <div class="table-section">
            <div v-if="isLoading" class="progress-container">
                <vscode-progress-ring></vscode-progress-ring>
            </div>
            <vscode-data-grid id="datagrid" aria-label="Sticky Header" :key="pageNumber">
                <vscode-data-grid-row row-type="sticky-header">
                    <vscode-data-grid-cell
                        cell-type="columnheader"
                        v-for="(column, index) in dynamoDbTableData.tableHeader"
                        :grid-column="index + 1"
                        >{{ column.title }}</vscode-data-grid-cell
                    >
                </vscode-data-grid-row>
                <vscode-data-grid-row
                    v-for="row in dynamoDbTableData.tableContent"
                    @contextmenu.prevent="showContextMenu($event, row)"
                >
                    <vscode-data-grid-cell v-for="(key, index) in Object.keys(row)" :grid-column="index + 1">{{
                        row[key]
                    }}</vscode-data-grid-cell>
                </vscode-data-grid-row>
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
            partitionKeyValue: '',
            queryPanelData: {
                isActive: false,
                queryRequest: {
                    partitionKey: '',
                    sortKey: '',
                },
            },
        }
    },
    async created() {
        this.isLoading = true
        this.dynamoDbTableData = await client.init()
        const tableSchema = await client.getTableSchema()
        this.partitionKey = tableSchema.partitionKey.name
        this.sortKey = tableSchema.sortKey?.name ?? ''
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
            this.isLoading = true
            this.resetFields()
            this.updatePageNumber()
            this.dynamoDbTableData = await client.fetchPageData(undefined)
            this.pageKeys = [undefined, this.dynamoDbTableData.lastEvaluatedKey]
            this.queryPanelData.isActive = false
            this.isLoading = false
        },

        async prevPage() {
            if (this.dynamoDbTableData.currentPage > 1) {
                this.isLoading = true
                const newPageNumber = this.dynamoDbTableData.currentPage - 1
                this.updatePageNumber()
                const previousKey = this.pageKeys[this.dynamoDbTableData.currentPage - 2]
                if (this.queryPanelData.isActive) {
                    this.dynamoDbTableData = await client.queryData(this.queryPanelData.queryRequest, previousKey)
                } else {
                    this.dynamoDbTableData = await client.fetchPageData(previousKey)
                }
                this.dynamoDbTableData.currentPage = newPageNumber
                this.isLoading = false
            }
        },

        async nextPage() {
            this.isLoading = true
            const newPageNumber = this.dynamoDbTableData.currentPage + 1
            this.updatePageNumber()
            if (this.queryPanelData.isActive) {
                this.dynamoDbTableData = await client.queryData(
                    this.queryPanelData.queryRequest,
                    this.dynamoDbTableData.lastEvaluatedKey
                )
            } else {
                this.dynamoDbTableData = await client.fetchPageData(this.dynamoDbTableData.lastEvaluatedKey)
            }
            if (this.dynamoDbTableData.lastEvaluatedKey) {
                this.pageKeys.push(this.dynamoDbTableData.lastEvaluatedKey)
            }
            this.dynamoDbTableData.currentPage = newPageNumber
            this.isLoading = false
        },

        updatePageNumber() {
            this.pageNumber += 1
        },

        resetFields() {
            let partitionKeyElement = document.getElementById('partitionKey')
            let sortKeyElement = document.getElementById('sortKey')
            if (sortKeyElement) {
                ;(sortKeyElement as any).value = ''
            }
            if (partitionKeyElement) {
                ;(partitionKeyElement as any).value = ''
            }
        },

        async executeQuery() {
            this.isLoading = true
            let sortKeyElement = document.getElementById('sortKey')
            let partitionKeyElement = document.getElementById('partitionKey')
            let sortKeyValue = ''
            if (sortKeyElement) {
                sortKeyValue = (sortKeyElement as any).value
            }
            const queryRequest = {
                partitionKey: (partitionKeyElement as any).value,
                sortKey: sortKeyValue,
            }
            this.updatePageNumber()
            this.dynamoDbTableData = await client.queryData(queryRequest)
            this.pageKeys = [undefined, this.dynamoDbTableData.lastEvaluatedKey]
            this.queryPanelData.isActive = true
            this.queryPanelData.queryRequest = queryRequest
            this.isLoading = false
        },

        showContextMenu(event: any, row: any) {
            console.log(event)
            console.log(row)
        },
    },
})
</script>

<style>
@import './tableView.css';
</style>
