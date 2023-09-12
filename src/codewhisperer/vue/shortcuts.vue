<!-- This Vue File provides Shortcuts for CodeWhisperer actions-->
<template>
    <div style="margin-top: 25px">
        <div
            style="
                font-family: SF Pro;
                font-size: 24px;
                font-weight: 700;
                line-height: 24px;
                letter-spacing: 0em;
                text-align: left;
                padding-bottom: 10px;
            "
        >
            Shortcuts (Default)
        </div>
        <div>
            <table style="border-collapse: collapse; border: 1px solid #454545; width: 40%">
                <tbody>
                    <tr v-for="row in tableData" :key="row.id">
                        <td>{{ row.column1 }}</td>
                        <td>
                            <div v-if="row.id === 2 && osState === 'Mac'" style="display: flex; flex-direction: row">
                                <div id="col2">
                                    {{ row.column2 }}
                                </div>
                                <div
                                    style="
                                        padding-left: 5px;
                                        padding-right: 10px;
                                        padding-top: 2px;
                                        font-family: SF Pro;
                                        text-align: center;
                                        align-items: center;
                                        justify-content: center;
                                        font-size: 18px;
                                        font-weight: 400;
                                    "
                                >
                                    +
                                </div>
                                <div id="col2">
                                    {{ row.column3 }}
                                </div>
                            </div>
                            <div
                                v-else-if="row.id === 2 && osState !== 'Mac'"
                                style="display: flex; flex-direction: row"
                            >
                                <div id="col2">
                                    {{ row.column4 }}
                                </div>
                                <div
                                    style="
                                        padding-left: 5px;
                                        padding-right: 10px;
                                        padding-top: 2px;
                                        font-family: SF Pro;
                                        text-align: center;
                                        align-items: center;
                                        justify-content: center;
                                        font-size: 18px;
                                        font-weight: 400;
                                    "
                                >
                                    +
                                </div>
                                <div id="col2">
                                    {{ row.column3 }}
                                </div>
                            </div>
                            <div v-else id="col2">
                                {{ row.column2 }}
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

        <div
            style="
                margin-top: 20px;
                margin-bottom: 30px;
                font-family: SF Pro Text;
                font-size: 13px;
                font-weight: 400;
                line-height: 23px;
                letter-spacing: 0em;
                text-align: left;
                height: 20px;
            "
        >
            You can customize CodeWhisperer Keyboard shortcut in
            <a href="#" @click="onClick">Keyboard Shortcuts Editor</a>.
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
    components: {},
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
                    column1: 'Manual Invoke',
                    column2: 'Option',
                    column3: 'C',
                    column4: 'Alt',
                },
                {
                    id: 3,
                    column1: 'Navigate',
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
            client.emitUiClick('cw_Shortcuts_KeyboardShortcutsEditor')
            client.openShortCuts()
        },
        async showOS() {
            this.osState = await client.getOSType()
        },
    },
})
</script>
<style>
table tr,
td {
    border: 1px solid #454545;
}

td {
    padding-left: 15px;
    padding-top: 5px;
    padding-bottom: 5px;
    font-family: SF Pro;
    font-size: 13px;
    font-weight: 400;
    line-height: 19.5px;
    letter-spacing: 0em;
    text-align: left;
    height: 26px;
}

#col2 {
    border: 1px solid #555353;
    border-radius: 3px;
    width: fit-content;
    padding: 2px 10px;
    font-size: 13px;
    line-height: 19.5px;
    font-weight: 400;
    color: #ffffff;
}
</style>
