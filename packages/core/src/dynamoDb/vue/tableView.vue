<template>
    <div class="panel-content">
        <div class="header-section">
            <div class="header-left">
                <span class="table-name">{{ dynamoDbTableData.TableName }}</span>
                <span class="last-refreshed-info" style="width: 100%">{{ dynamoDbTableData.Region }}</span>
            </div>
            <div class="header-right">
                <vscode-button class="refresh-button">Refresh</vscode-button>
            </div>
        </div>
        <div>
            <vscode-divider role="separator"></vscode-divider>
        </div>
        <div class="table-section">
            <vscode-data-grid aria-label="Basic">
                <vscode-data-grid-row>
                    <vscode-data-grid-cell grid-column="1">Header 1</vscode-data-grid-cell>
                    <vscode-data-grid-cell grid-column="2">Header 2</vscode-data-grid-cell>
                    <vscode-data-grid-cell grid-column="3">Header 3</vscode-data-grid-cell>
                    <vscode-data-grid-cell grid-column="4">Header 4</vscode-data-grid-cell>
                </vscode-data-grid-row>
                <vscode-data-grid-row>
                    <vscode-data-grid-cell grid-column="1">Cell Data</vscode-data-grid-cell>
                    <vscode-data-grid-cell grid-column="2">Cell Data</vscode-data-grid-cell>
                    <vscode-data-grid-cell grid-column="3">Cell Data</vscode-data-grid-cell>
                    <vscode-data-grid-cell grid-column="4">Cell Data</vscode-data-grid-cell>
                </vscode-data-grid-row>
                <vscode-data-grid-row>
                    <vscode-data-grid-cell grid-column="1">Cell Data</vscode-data-grid-cell>
                    <vscode-data-grid-cell grid-column="2">Cell Data</vscode-data-grid-cell>
                    <vscode-data-grid-cell grid-column="3">Cell Data</vscode-data-grid-cell>
                    <vscode-data-grid-cell grid-column="4">Cell Data</vscode-data-grid-cell>
                </vscode-data-grid-row>
                <vscode-data-grid-row>
                    <vscode-data-grid-cell grid-column="1">Cell Data</vscode-data-grid-cell>
                    <vscode-data-grid-cell grid-column="2">Cell Data</vscode-data-grid-cell>
                    <vscode-data-grid-cell grid-column="3">Cell Data</vscode-data-grid-cell>
                    <vscode-data-grid-cell grid-column="4">Cell Data</vscode-data-grid-cell>
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
import { DynamoDbTableWebview } from './tableView'
import { WebviewClientFactory } from '../../webviews/client'

const client = WebviewClientFactory.create<DynamoDbTableWebview>()

export default defineComponent({
    data() {
        return {
            dynamoDbTableData: {
                TableName: '',
                Region: '',
            },
        }
    },
    async created() {
        this.dynamoDbTableData = (await client.init()) ?? this.dynamoDbTableData
    },
})
</script>

<style>
@import './tableView.css';
</style>
