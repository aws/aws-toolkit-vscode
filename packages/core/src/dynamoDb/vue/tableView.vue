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
                <vscode-button class="refresh-button">Refresh</vscode-button>
            </div>
        </div>
        <div class="table-section">
            <vscode-data-grid id="datagrid" generate-header="sticky" aria-label="Sticky Header">
                {{ getTableHeader() }}
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
import { DynamoDbTableWebview } from './tableView'
import { WebviewClientFactory } from '../../webviews/client'
import { RowData } from '../utils/dynamodbUtils'

const client = WebviewClientFactory.create<DynamoDbTableWebview>()
export default defineComponent({
    data() {
        return {
            dynamoDbTableData: {
                TableName: '',
                Region: '',
                tableHeader: [] as RowData[],
                tableContent: [] as RowData[],
            },
        }
    },
    async created() {
        this.dynamoDbTableData = (await client.init()) ?? this.dynamoDbTableData
    },
    methods: {
        getTableHeader() {
            const basicGrid = document.getElementById('datagrid')

            if (basicGrid) {
                // (basicGrid as any).columnDefinitions = this.dynamoDbTableData.tableHeader;
                ;(basicGrid as any).rowsData = this.dynamoDbTableData.tableContent
            }
        },
    },
})
</script>

<style>
@import './tableView.css';
</style>
