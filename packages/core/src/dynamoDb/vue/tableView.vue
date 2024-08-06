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
                    <vscode-data-grid-cell v-for="(key, index) in Object.keys(row)" :grid-column="index + 1">
                        {{ row[key] }}
                    </vscode-data-grid-cell>
                </vscode-data-grid-row>
            </vscode-data-grid>

            <!-- Context Menu -->
            <ContextMenu
                v-if="contextMenuVisible"
                :position="contextMenuPosition"
                :visible="contextMenuVisible"
                @copy="handleCopy"
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

const client = WebviewClientFactory.create<DynamoDbTableWebview>()
const contextMenuVisible = ref(false)
const contextMenuPosition = ref({ top: 0, left: 0 })
let selectedRow = ref<RowData>()
let tableSchema: TableSchema

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
    methods: {
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
        },

        showContextMenu(event: MouseEvent, row: any) {
            event.preventDefault()
            contextMenuPosition.value = { top: event.clientY, left: event.clientX }
            contextMenuVisible.value = true
            selectedRow.value = row
        },

        handleCopy() {
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

        handleEdit() {
            // Handle edit logic
            console.log('Edit clicked')
        },
    },
})
</script>

<style>
@import './tableView.css';
</style>
