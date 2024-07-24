<template>
    <div class="panel-content">
        <div class="header-section">
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
        </div>
        <vscode-divider></vscode-divider>
        <div class="table-section">
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
        }
    },
    async created() {
        this.dynamoDbTableData = await client.init()
        this.pageKeys = [undefined, this.dynamoDbTableData.lastEvaluatedKey]
    },
    computed: {
        isFirstPage() {
            return this.dynamoDbTableData.currentPage === 1
        },
        isLastPage() {
            return this.dynamoDbTableData.lastEvaluatedKey == null
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
            this.dynamoDbTableData = await client.fetchPageData(undefined)
            this.pageKeys = [undefined, this.dynamoDbTableData.lastEvaluatedKey]
        },

        async prevPage() {
            this.updatePageNumber()
            if (this.dynamoDbTableData.currentPage > 1) {
                const previousKey = this.pageKeys[this.dynamoDbTableData.currentPage - 2]
                this.dynamoDbTableData = await client.fetchPageData(previousKey, this.dynamoDbTableData.currentPage)
                this.dynamoDbTableData.currentPage -= 1
            }
        },

        async nextPage() {
            this.updatePageNumber()
            this.dynamoDbTableData = await client.fetchPageData(
                this.dynamoDbTableData.lastEvaluatedKey,
                this.dynamoDbTableData.currentPage
            )
            if (this.dynamoDbTableData.lastEvaluatedKey) {
                this.pageKeys.push(this.dynamoDbTableData.lastEvaluatedKey)
            }
            this.dynamoDbTableData.currentPage += 1
        },

        updatePageNumber() {
            this.pageNumber += 1
        },
    },
})
</script>

<style>
@import './tableView.css';
</style>
