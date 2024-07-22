<template>
    <div class="panel-content">
        <div class="header-section">
            <div class="header-left">
                <span class="table-name">{{ dynamoDbTableData.TableName }}</span>
                <span class="last-refreshed-info" style="width: 100%">{{
                    'Refreshed on: ' + new Date().toLocaleString()
                }}</span>
            </div>
            <div class="header-right">
                <vscode-button class="refresh-button" @click="refreshTable">Refresh</vscode-button>
                <div class="pagination">
                    <vscode-link :class="{ disabled: isFirstPage }" @click="prevPage">&lt;</vscode-link>
                    <vscode-link href="#">{{ this.dynamoDbTableData.currentPage }}</vscode-link>
                    <vscode-link :class="{ disabled: isLastPage }" @click="nextPage">&gt;</vscode-link>
                </div>
            </div>
        </div>
        <vscode-divider></vscode-divider>
        <div class="table-section">
            <vscode-data-grid id="datagrid" generate-header="sticky" aria-label="Sticky Header">
                {{ updateTableSection() }}
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
import { RowData } from '../utils/dynamodbUtils'
import { DynamoDbTableWebview } from './tableView'
import { WebviewClientFactory } from '../../webviews/client'
import { Key } from 'aws-sdk/clients/dynamodb'

const client = WebviewClientFactory.create<DynamoDbTableWebview>()
export default defineComponent({
    data() {
        return {
            dynamoDbTableData: {
                TableName: '',
                Region: '',
                currentPage: 1,
                tableHeader: [] as RowData[],
                tableContent: [] as RowData[],
            },
            pageKeys: [] as (Key | null)[],
        }
    },
    async created() {
        console.log('I am created')
        this.dynamoDbTableData = await client.init()
        this.pageKeys = [null, this.dynamoDbTableData.lastEvaluatedKey]
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
        updateTableSection() {
            const basicGrid = document.getElementById('datagrid')

            if (basicGrid) {
                // (basicGrid as any).columnDefinitions = this.dynamoDbTableData.tableHeader;
                ;(basicGrid as any).rowsData = this.dynamoDbTableData.tableContent
            }
        },

        async refreshTable() {
            this.dynamoDbTableData = await client.fetchPageData()
            this.pageKeys = [null, this.dynamoDbTableData.lastEvaluatedKey]
            this.updateTableSection()
        },

        async prevPage() {
            if (this.dynamoDbTableData.currentPage > 1) {
                const previousKey = this.pageKeys[this.dynamoDbTableData.currentPage - 2]
                this.dynamoDbTableData = await client.fetchPageData(this.dynamoDbTableData.currentPage, previousKey)
                this.dynamoDbTableData.currentPage -= 1
                this.updateTableSection()
            }
        },

        async nextPage() {
            this.dynamoDbTableData = await client.fetchPageData(
                this.dynamoDbTableData.currentPage,
                this.dynamoDbTableData.lastEvaluatedKey
            )
            if (this.dynamoDbTableData.lastEvaluatedKey) {
                this.pageKeys.push(this.dynamoDbTableData.lastEvaluatedKey)
            }
            this.dynamoDbTableData.currentPage += 1
            this.updateTableSection()
        },
    },
})
</script>

<style>
@import './tableView.css';
</style>
