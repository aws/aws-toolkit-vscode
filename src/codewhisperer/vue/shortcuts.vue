<!-- This Vue File provides Shortcuts/Commands for CodeWhisperer actions-->
<template>
    <div class="shortcutsDiv">
        <div class="shortcutsTitle">Commands</div>
        <table class="shortcutsTable">
            <tbody>
                <tr v-for="row in tableData" :key="row.id">
                    <td class="tableDivCol1">{{ row.column1 }}</td>
                    <td>
                        <div class="tableDiv" v-if="row.id === 2">
                            {{ osState === 'Mac' ? row.column2 : row.column4 }} + C
                        </div>
                        <div v-else class="tableDiv">
                            {{ row.column2 }}
                        </div>
                    </td>
                </tr>
            </tbody>
        </table>
        <div class="shortcutsEditor">
            Customize keyboard shortcuts in the
            <a href="#" @click="onClick" class="shortcuts-editor-link">Keyboard Shortcuts Editor</a>.
        </div>
    </div>
</template>
<script lang="ts">
import { defineComponent } from 'vue'
import { WebviewClientFactory } from '../../webviews/client'
import { CodeWhispererWebview } from './backend'
import TelemetryClient from '../../codewhisperer/vue/telemetry.vue'

const client = WebviewClientFactory.create<CodeWhispererWebview>()
export default defineComponent({
    name: 'Shortcuts',
    extends: TelemetryClient,
    data() {
        return {
            osState: '',
            tableData: [
                {
                    id: 1,
                    column1: 'Accept',
                    column2: 'TAB',
                },
                {
                    id: 2,
                    column1: 'Manual invoke',
                    column2: 'Option',
                    column3: 'C',
                    column4: 'Alt',
                },
                {
                    id: 3,
                    column1: 'Navigate code suggestions',
                    column2: 'Left / Right Arrows',
                },
                {
                    id: 4,
                    column1: 'Reject',
                    column2: 'Escape',
                },
            ],
        }
    },
    mounted() {
        this.showOS()
    },
    methods: {
        onClick() {
            client.emitUiClick('codewhisperer_Commands_KeyboardShortcutsEditor')
            client.openShortCuts()
        },
        async showOS() {
            this.osState = await client.getOSType()
        },
    },
})
</script>
<style>
.shortcutsDiv {
    width: 87%;
    border: 1px solid #424750;
    border-radius: 10px;
    padding: 20px;
    gap: 13px;
}
.shortcutsTitle {
    font-family: Verdana;
    font-size: 16px;
    font-weight: 700;
    line-height: 24px;
    letter-spacing: 0em;
    text-align: left;
}
.shortcutsTable {
    width: 100%;
    border-radius: 4px;
    margin-top: 5px;
    border: 1px solid #424750;
}
.tableDiv {
    display: flex;
    flex-direction: columns;
    justify-content: end;
    padding-right: 7px;
    text-align: end;
}
.shortcutsEditor {
    padding-top: 13px;
    font-size: 13px;
    font-family: Verdana;
    font-weight: 400;
    line-height: 20px;
    letter-spacing: 0em;
    text-align: left;
    color: var(--vscode-descriptionForeground);
}
.shortcuts-editor-link {
    color: #0097fb;
    text-decoration: none;
}
table tr,
td {
    border: none;
}
td {
    padding-top: 5px;
    padding-bottom: 5px;
    font-family: Verdana;
    font-size: 13px;
    font-weight: 400;
    line-height: 19.5px;
    letter-spacing: 0em;
    text-align: left;
}
.tableDivCol1 {
    padding-left: 7px;
    color: var(--vscode-descriptionForeground);
}
</style>
