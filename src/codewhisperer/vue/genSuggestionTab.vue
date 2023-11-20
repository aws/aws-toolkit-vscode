<!-- This Vue File provides Sandbox files for experimenting CodeWhisperer and generating code suggestions -->
<template>
    <div class="generateSuggestionDiv">
        <div class="generateSuggestionHeaderDiv">
            <div class="generateSuggestionHeader">Generate code suggestions with examples</div>
        </div>
        <!-- Tab -->
        <div>
            <div class="generateSuggestionTabHeader">
                <div
                    class="generateSuggestionTab"
                    v-for="(tab, index) in tabs"
                    :key="index"
                    :class="{ active: activeTab === index }"
                    @click="activeTabFunction(index)"
                >
                    <div>
                        <div class="generateSuggestionTabIcon" v-if="tab.label === 'Python'">
                            <svg
                                width="16"
                                height="16"
                                viewBox="0 0 15 18"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                                xmlns:xlink="http://www.w3.org/1999/xlink"
                            >
                                <rect y="0.536377" width="15" height="17" fill="url(#pattern2)" />
                                <defs>
                                    <pattern id="pattern2" patternContentUnits="objectBoundingBox" width="1" height="1">
                                        <use
                                            xlink:href="#image0_227_4951"
                                            transform="matrix(0.0257576 0 0 0.0227273 -0.0280303 0)"
                                        />
                                    </pattern>
                                    <image
                                        id="image0_227_4951"
                                        width="41"
                                        height="44"
                                        xlink:href="data:image/png;base64,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"
                                    />
                                </defs>
                            </svg>
                        </div>
                    </div>
                    <div>{{ tab.label }}</div>
                </div>
            </div>

            <div class="tableDivSub" v-for="(row, index) in tabs[activeTab].tableData" :key="index">
                <div v-for="(column, columnIndex) in [row.column1, row.column2, row.column3]" :key="columnIndex">
                    <div class="generateSuggestionTabRow">
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
                        <button class="tryExample" @click="onClick(column, tabs[activeTab].label)">
                            Try in {{ tabs[activeTab].label }}
                        </button>
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
            } else if (fileName.startsWith('CodeWhisperer_use_comments')) {
                taskType = 'commentAsPrompt'
            } else if (fileName.startsWith('CodeWhisperer_navigate_suggestions')) {
                taskType = 'navigation'
            } else {
                taskType = 'unitTest'
            }
            let telemetryLabel: CodewhispererLanguage = 'typescript'
            if (label === 'TypeScript') {
                telemetryLabel = 'typescript'
            } else if (label === 'JavaScript') {
                telemetryLabel = 'javascript'
            } else if (label === 'Python') {
                telemetryLabel = 'python'
            } else if (label === 'Java') {
                telemetryLabel = 'java'
            } else if (label === 'C#') {
                telemetryLabel = 'csharp'
            }
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
.generateSuggestionTabHeader {
    display: flex;
    margin-top: 10px;
    margin-bottom: 15px;
    margin-left: 20px;
    gap: 15px;
    width: auto;
    height: auto;
}
.generateSuggestionTab {
    width: auto;
    height: 32px;
    border-radius: 34px;
    padding-left: 15px;
    padding-right: 15px;
    border: 1.12px;
    cursor: pointer;
    display: flex;
    font-family: Verdana;
    font-size: 14px;
    font-weight: 700;
    line-height: 16.7px;
    letter-spacing: 0em;
    text-align: left;
    align-items: center;
    justify-content: center;
}
.generateSuggestionTab.active {
    border: 1px solid #3592c4;
}
.generateSuggestionTabIcon {
    display: flex;
    justify-items: center;
    align-items: center;
    padding-right: 5px;
}
.generateSuggestionTabIconC {
    display: flex;
    padding-right: 3px;
    justify-items: center;
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
