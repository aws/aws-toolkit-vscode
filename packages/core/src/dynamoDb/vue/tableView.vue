<template>
    <div class="panel-content">
        <div class="header-section">
            <vscode-panels>
                <vscode-panel-tab id="tab-1">Scan</vscode-panel-tab>
                <vscode-panel-tab id="tab-2">Query</vscode-panel-tab>
                <vscode-panel-view id="view-1">
                    <div class="header-left">
                        <span class="table-name">{{ dynamoDbTableData.tableName }}</span>
                        <span class="last-refreshed-info" :key="lastRefreshedText" style="width: 100%">{{
                            lastRefreshedText
                        }}</span>
                    </div>
                    <div class="header-right">
                        <vscode-button class="refresh-button" @click="refreshTable">Re-Scan</vscode-button>
                        <div class="pagination">
                            <vscode-link :class="{ disabled: isFirstPage }" @click="prevPage">&lt;</vscode-link>
                            <vscode-link class="disabled" style="color: white">{{
                                dynamoDbTableData.currentPage
                            }}</vscode-link>
                            <vscode-link :class="{ disabled: isLastPage }" @click="nextPage">&gt;</vscode-link>
                            <span class="icon icon-sm icon-vscode-settings-gear" @click="openSettings"></span>
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
                            <vscode-button @click="resetFields">Reset</vscode-button>
                            <vscode-button :disabled="!partitionKeyValue" @click="executeQuery">Run</vscode-button>
                        </div>
                    </div>
                    <div class="header-right">
                        <vscode-button class="refresh-button" @click="refreshTableQueryPanel">Re-Run</vscode-button>
                        <div class="pagination">
                            <vscode-link :class="{ disabled: isFirstPage }" @click="prevPage">&lt;</vscode-link>
                            <vscode-link class="disabled" style="color: white">{{
                                dynamoDbTableData.currentPage
                            }}</vscode-link>
                            <vscode-link :class="{ disabled: isLastPage }" @click="nextPage">&gt;</vscode-link>
                            <span class="icon icon-sm icon-vscode-settings-gear" @click="openSettings"></span>
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
                    <vscode-data-grid-cell
                        v-for="(key, index) in Object.keys(row)"
                        :title="typeof row[key] === 'object' ? JSON.stringify(row[key]) : row[key]"
                        :grid-column="index + 1"
                    >
                        {{ row[key] }}
                    </vscode-data-grid-cell>
                </vscode-data-grid-row>
            </vscode-data-grid>

            <!-- Context Menu -->
            <ContextMenu
                v-if="contextMenuVisible"
                :position="contextMenuPosition"
                :visible="contextMenuVisible"
                @copyCell="handleCopyCell"
                @copyRow="handleCopyRow"
                @delete="handleDelete"
                @edit="handleEdit"
                @close="contextMenuVisible = false"
            />
        </div>
    </div>
</template>

<script setup lang="ts">
import { allComponents, provideVSCodeDesignSystem } from '@vscode/webview-ui-toolkit'
import { ref, onMounted, onUnmounted } from 'vue'
import ContextMenu from './contextMenu.vue'

provideVSCodeDesignSystem().register(allComponents)

onMounted(() => {
    document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
    document.removeEventListener('click', handleClickOutside)
})

function handleClickOutside(event: MouseEvent) {
    const contextMenuElement = document.querySelector('.context-menu')
    if (contextMenuElement && !contextMenuElement.contains(event.target as Node)) {
        contextMenuVisible.value = false
    }
}
</script>

<script lang="ts">
import { defineComponent } from 'vue'
import { RowData, TableSchema } from '../utils/dynamodb'
import { DynamoDbTableWebview, DynamoDbTableData } from './tableView'
import { WebviewClientFactory } from '../../webviews/client'
import { Key } from 'aws-sdk/clients/dynamodb'
import { formatDistanceToNow } from 'date-fns'

const client = WebviewClientFactory.create<DynamoDbTableWebview>()
const contextMenuVisible = ref(false)
const contextMenuPosition = ref({ top: 0, left: 0 })
let selectedRow = ref<RowData>()
let tableSchema: TableSchema
let selectedCell = ''

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
            lastRefreshed: new Date(),
            refreshInterval: null as ReturnType<typeof setInterval> | null,
            lastRefreshedText: '',
        }
    },
    async created() {
        this.isLoading = true
        this.dynamoDbTableData = await client.init()
        tableSchema = await client.getTableSchema()
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
    beforeUnmount() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval)
        }
    },

    mounted() {
        this.refreshInterval = setInterval(() => {
            this.lastRefreshedText =
                'Last refreshed - ' + formatDistanceToNow(this.lastRefreshed, { addSuffix: true, includeSeconds: true })
        }, 10000)
    },
    methods: {
        async refreshTable() {
            this.isLoading = true
            this.updatePageNumber()
            this.dynamoDbTableData = await client.fetchPageData(undefined)
            this.pageKeys = [undefined, this.dynamoDbTableData.lastEvaluatedKey]
            this.queryPanelData.isActive = false
            this.isLoading = false
        },

        async refreshTableQueryPanel() {
            if (!this.queryPanelData.isActive) {
                return this.refreshTable()
            }
            this.isLoading = true
            this.updatePageNumber()
            this.dynamoDbTableData = await client.queryData(this.queryPanelData.queryRequest, undefined)
            this.pageKeys = [undefined, this.dynamoDbTableData.lastEvaluatedKey]
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

        openSettings() {
            client.openPageSizeSettings()
        },

        updatePageNumber() {
            this.pageNumber += 1
            this.lastRefreshed = new Date()
            this.lastRefreshedText =
                'Last refreshed - ' + formatDistanceToNow(this.lastRefreshed, { addSuffix: true, includeSeconds: true })
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
            this.partitionKeyValue = ''
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

        showContextMenu(event: MouseEvent, row: any) {
            event.preventDefault()
            contextMenuPosition.value = { top: event.clientY, left: event.clientX }
            contextMenuVisible.value = true
            selectedRow.value = row
            selectedCell = (event.target as any).innerHTML
        },

        handleCopyCell() {
            client.copyCell(selectedCell)
        },

        handleCopyRow() {
            if (selectedRow.value === undefined) {
                return
            }
            client.copyRow(selectedRow.value)
        },

        async handleDelete() {
            if (selectedRow.value === undefined) {
                return
            }
            const response = await client.deleteItem(selectedRow.value, tableSchema)
            if (response) {
                this.dynamoDbTableData = response
                this.updatePageNumber()
            }
        },

        async handleEdit() {
            if (selectedRow.value === undefined) {
                return
            }
            await client.editItem(selectedRow.value, tableSchema)
        },
    },
})
</script>

<style>
@import './tableView.css';
</style>
