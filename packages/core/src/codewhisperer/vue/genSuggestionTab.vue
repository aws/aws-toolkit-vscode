<!-- This Vue File provides Sandbox files for experimenting CodeWhisperer and generating code suggestions -->
<template>
    <div class="generateSuggestionDiv">
        <div class="generateSuggestionHeaderDiv">
            <div class="generateSuggestionHeader">Generate code suggestions with examples</div>
        </div>
        <!-- Tab -->
        <div>
            <div class="tableDivSub" v-for="(row, index) in tabs[activeTab].tableData" :key="index">
                <div v-for="(column, columnIndex) in [row.column1, row.column2, row.column3]" :key="columnIndex">
                    <div
                        :class="[
                            'generateSuggestionTabRow',
                            columnIndex % 2 === 1 ? 'generateSuggestionTabMachineColorGroup1' : '',
                        ]"
                    >
                        <div class="generateSuggestionTabRowLabel">
                            <template v-if="columnIndex === 0"> Generate code suggestions as you type </template>
                            <template v-else-if="columnIndex === 1">
                                Generate code suggestions manually using
                                <div class="generateSuggestionTabMachine">
                                    <div class="col2" v-if="osState === 'Mac'">Option</div>
                                    <div class="col2" v-else>Alt</div>
                                    <div class="generateSuggestionTabMachineText">+</div>
                                    <div class="col2">C</div>
                                </div>
                            </template>
                            <template v-else> Generate unit test cases </template>
                        </div>
                        <button class="tryExample" @click="onClick(column, tabs[activeTab].label)">Try example</button>
                    </div>
                </div>
            </div>
        </div>

        <div class="generateSuggestionDescription">
            CodeWhisperer supports 15 programming languages, including TypeScript, JavaScript, Python, Java, and C#.
            <a
                class="generateSuggestionLearnMore"
                href="https://docs.aws.amazon.com/codewhisperer/latest/userguide/language-ide-support.html"
                @click="emitUiClick('codewhisperer_GenerateSuggestions_LearnMore')"
                >Learn more</a
            >
        </div>
    </div>
</template>
<script lang="ts">
import { defineComponent } from 'vue'
import { CodeWhispererWebview } from './backend'
import TelemetryClient from '../../codewhisperer/vue/telemetry.vue'
import { WebviewClientFactory } from '../../webviews/client'
import { CodewhispererLanguage, CodewhispererGettingStartedTask } from '../../shared/telemetry/telemetry'
const client = WebviewClientFactory.create<CodeWhispererWebview>()

export default defineComponent({
    name: 'GenerateSuggestionTab',
    components: {},
    extends: TelemetryClient,
    data() {
        return {
            activeTab: parseInt(sessionStorage.getItem('activeTab') || '0'),
            osState: '',
            tabs: [
                {
                    label: 'Python',
                    tableData: [
                        {
                            column1: [
                                'CodeWhisperer_generate_suggestion.py',
                                `# TODO: place your cursor at the end of line 5 and press Enter to generate a suggestion.${'\n'}# Tip: press tab to accept the suggestion.${'\n'}${'\n'}fake_users = [${'\n'}    { "name": "User 1", "id": "user1", "city": "San Francisco", "state": "CA" },`,
                            ],
                            column2: [
                                'CodeWhisperer_manual_invoke.py',
                                `# TODO: Press either Option + C on MacOS or Alt + C on Windows on a new line.${'\n'}${'\n'}# Function to upload a file to an S3 bucket.${'\n'}`,
                            ],
                            column3: [
                                'Generate_unit_tests.py',
                                `# TODO: Ask CodeWhisperer to write unit tests.${'\n'}${'\n'}def sum(a, b):${'\n'}    """${'\n'}    Function to sum two numbers.${'\n'}${'\n'}    Args:${'\n'}    - a: First number.${'\n'}    - b: Second number.${'\n'}${'\n'}    Returns:${'\n'}    - Sum of the two numbers.${'\n'}    """${'\n'}    return a + b${'\n'}${'\n'}# Write a test case for the above function.${'\n'}`,
                            ],
                        },
                    ],
                },
            ],
        }
    },
    mounted() {
        this.showOS()
    },
    methods: {
        onClick(names: string[], label: string) {
            let taskType: CodewhispererGettingStartedTask = 'autoTrigger'
            const fileName = names[0]
            if (fileName.startsWith('CodeWhisperer_generate_suggestion')) {
                taskType = 'autoTrigger'
            } else if (fileName.startsWith('CodeWhisperer_manual_invoke')) {
                taskType = 'manualTrigger'
            } else {
                taskType = 'unitTest'
            }
            const telemetryLabel: CodewhispererLanguage = 'python'

            client.emitTryExampleClick(telemetryLabel, taskType)
            client.openFile([names[0], names[1]])
        },
        async showOS() {
            this.osState = await client.getOSType()
        },
        activeTabFunction(index: number) {
            this.activeTab = index
            sessionStorage.setItem('activeTab', index.toString())
        },
    },
})
</script>
<style>
.generateSuggestionDiv {
    width: 100%;
    margin-right: 5%;
    height: auto;
    display: flex;
    flex-direction: column;
    margin-bottom: 40px;
}
.generateSuggestionHeaderDiv {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 15px;
}
.generateSuggestionHeader {
    font-family: Verdana;
    font-size: 24px;
    font-weight: 860;
    line-height: 24px;
    letter-spacing: 0em;
    text-align: left;
}
.generateSuggestionDescription {
    font-family: Verdana;
    font-size: 14px;
    font-weight: 510;
    line-height: 21px;
    padding-top: 20px;
    letter-spacing: 0em;
    text-align: left;
}
.generateSuggestionLearnMore {
    font-size: 14px;
    text-decoration: none;
    cursor: pointer;
    color: #0097fb;
}
.generateSuggestionTabRow {
    display: flex;
    flex-direction: row;
    height: 26px;
    gap: 10px;
    padding-left: 10px;
    padding-right: 25px;
    padding-top: 15px;
    padding-bottom: 15px;
    align-items: center;
    justify-content: space-between;
}
.generateSuggestionTabRowLabel {
    font-family: Verdana;
    font-size: 14px;
    font-weight: 350;
    line-height: 17px;
    text-align: left;
    display: flex;
    flex-direction: row;
    justify-content: center;
    align-items: center;
}
.generateSuggestionTabMachine {
    display: flex;
    flex-direction: row;
    padding-left: 10px;
}
.generateSuggestionTabMachineColorGroup1 {
    background-color: var(--vscode-editorWidget-background);
}
.generateSuggestionTabMachineText {
    padding-left: 5px;
    padding-right: 10px;
    padding-top: 4px;
    font-family: Verdana;
    text-align: center;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    font-weight: 350;
}
.tableDivSub {
    margin-top: 10px;
    border-collapse: collapse;
    width: 100%;
    border-radius: 8px;
    border: 1.12px solid #424750;
}

.col2 {
    border: 1px solid #555353;
    border-radius: 3px;
    width: fit-content;
    padding: 2px 10px;
    margin-right: 5px;
    color: #ffffff;
    background: linear-gradient(0deg, #3d3d3d, #3d3d3d), linear-gradient(0deg, #555353, #555353);
    font-family: Verdana;
    font-size: 13px;
    font-weight: 400;
    line-height: 19px;
    letter-spacing: 0em;
    text-align: left;
    justify-content: center;
    justify-items: center;
    align-items: center;
}
.tryExample {
    justify-content: end;
    height: fit-content;
    width: fit-content;
    padding: 6.7 12.3;
}
</style>
