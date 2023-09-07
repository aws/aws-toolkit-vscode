<!-- This Vue File provides Sandbox files for experimenting CodeWhisperer and generating code suggestions -->
<template>
    <div style="display: flex; flex-direction: column; margin-bottom: 25px">
        <!--Tab Heading-->
        <div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 15px">
            <div
                style="
                    font-family: SF Pro;
                    font-size: 24px;
                    font-weight: 860;
                    line-height: 24px;
                    letter-spacing: 0em;
                    text-align: left;
                    color: #bababa;
                "
            >
                Generate suggestions with examples
            </div>
            <div
                style="
                    font-family: SF Pro;
                    font-size: 14px;
                    font-weight: 510;
                    line-height: 21px;
                    letter-spacing: 0em;
                    text-align: left;
                    color: #cccccc;
                "
            >
                CodeWhisperer supports 15 programming languages, including Python, Java, and C#.
                <a
                    href="https://docs.aws.amazon.com/codewhisperer/latest/userguide/language-ide-support.html"
                    v-on:click="emitUiClick('cw_GenerateSuggestions_LearnMore')"
                >
                    Learn more</a
                >
            </div>
        </div>
        <!--Tab Component-->
        <div>
            <div class="tabs" style="margin-top: 10px; height: 33px">
                <div
                    v-for="(tab, index) in tabs"
                    :key="index"
                    class="tab"
                    :class="{ active: activeTab === index }"
                    @click="activeTabFunction(index)"
                >
                    {{ tab.label }}
                </div>
            </div>
            <table>
                <tbody v-for="(row, index) in tabs[activeTab].tableData" :key="index">
                    <tr>
                        <div
                            style="
                                display: flex;
                                flex-direction: row;
                                color: #454545;
                                gap: 10px;
                                padding-left: 20px;
                                padding-right: 25px;
                                padding-top: 15px;
                                padding-bottom: 15px;
                                align-items: center;
                                justify-content: space-between;
                            "
                        >
                            <div
                                style="
                                    font-family: SF Pro Text;
                                    font-size: 14px;
                                    font-weight: 350;
                                    line-height: 17px;
                                    text-align: left;
                                    color: #ffffff;
                                "
                            >
                                Generate recommendations as you type
                            </div>
                            <button
                                v-on:click="onClick(row.column1)"
                                style="
                                    width: 93px;
                                    height: 26px;
                                    gap: 10px;
                                    background-color: #3a3d41;
                                    font-size: 12px;
                                    font-family: SF Pro Text;
                                    font-weight: 350;
                                    text-align: center;
                                    padding: 5px;
                                "
                            >
                                Try Example
                            </button>
                        </div>
                    </tr>
                    <tr>
                        <div
                            style="
                                display: flex;
                                height: 26px;
                                flex-direction: row;
                                color: #454545;
                                gap: 10px;
                                padding-left: 20px;
                                padding-right: 25px;
                                padding-top: 15px;
                                padding-bottom: 15px;
                                align-items: center;
                                justify-content: space-between;
                            "
                        >
                            <div
                                style="
                                    font-family: SF Pro Text;
                                    font-size: 14px;
                                    font-weight: 350;
                                    line-height: 17px;
                                    text-align: left;
                                    color: #ffffff;
                                    display: flex;
                                    flex-direction: row;
                                    justify-content: center;
                                    align-items: center;
                                "
                            >
                                Manual force CodeWhisperer to offer a suggestion using

                                <div
                                    v-if="osState === 'Mac'"
                                    style="display: flex; flex-direction: row; padding-left: 10px"
                                >
                                    <div id="col2">Option</div>
                                    <div
                                        style="
                                            padding-left: 5px;
                                            padding-right: 5px;
                                            padding-top: 4px;
                                            font-family: Amazon Ember;
                                            text-align: center;
                                            align-items: center;
                                            justify-content: center;
                                            font-size: 18px;
                                            font-weight: 350;
                                        "
                                    >
                                        +
                                    </div>
                                    <div id="col2">C</div>
                                </div>
                                <div v-else style="display: flex; flex-direction: row; padding-left: 10px">
                                    <div id="col2">Alt</div>
                                    <div
                                        style="
                                            padding-left: 5px;
                                            padding-right: 5px;
                                            padding-top: 4px;
                                            font-family: Amazon Ember;
                                            text-align: center;
                                            align-items: center;
                                            justify-content: center;
                                            font-size: 18px;
                                            font-weight: 350;
                                        "
                                    >
                                        +
                                    </div>
                                    <div id="col2">C</div>
                                </div>
                            </div>
                            <button
                                v-on:click="onClick(row.column2)"
                                style="
                                    width: 93px;
                                    height: 26px;
                                    gap: 10px;
                                    background-color: #3a3d41;
                                    font-size: 12px;
                                    font-family: SF Pro Text;
                                    font-weight: 350;
                                    text-align: center;
                                    padding: 5px;
                                "
                            >
                                Try Example
                            </button>
                        </div>
                    </tr>
                    <tr>
                        <div
                            style="
                                display: flex;
                                height: 26px;
                                flex-direction: row;
                                color: #454545;
                                gap: 10px;
                                padding-left: 20px;
                                padding-right: 25px;
                                padding-top: 15px;
                                padding-bottom: 15px;
                                align-items: center;
                                justify-content: space-between;
                            "
                        >
                            <div
                                style="
                                    font-family: SF Pro Text;
                                    font-size: 14px;
                                    font-weight: 350;
                                    line-height: 17px;
                                    text-align: left;
                                    color: #ffffff;
                                "
                            >
                                Interact with CodeWhisperer use comments
                            </div>
                            <button
                                v-on:click="onClick(row.column3)"
                                style="
                                    width: 93px;
                                    height: 26px;
                                    gap: 10px;
                                    background-color: #3a3d41;
                                    font-size: 12px;
                                    font-family: SF Pro Text;
                                    font-weight: 350;
                                    text-align: center;
                                    padding: 5px;
                                "
                            >
                                Try Example
                            </button>
                        </div>
                    </tr>
                    <tr>
                        <div
                            style="
                                display: flex;
                                flex-direction: row;
                                height: 26px;
                                color: #454545;
                                gap: 10px;
                                padding-left: 20px;
                                padding-right: 25px;
                                padding-top: 15px;
                                padding-bottom: 15px;
                                align-items: center;
                                justify-content: space-between;
                            "
                        >
                            <div
                                style="
                                    font-family: SF Pro Text;
                                    font-size: 14px;
                                    font-weight: 350;
                                    line-height: 17px;
                                    text-align: left;
                                    color: #ffffff;
                                "
                            >
                                Generate unit test
                            </div>
                            <button
                                v-on:click="onClick(row.column4)"
                                style="
                                    width: 93px;
                                    height: 26px;
                                    gap: 10px;
                                    background-color: #3a3d41;
                                    font-size: 12px;
                                    font-family: SF Pro Text;
                                    font-weight: 350;
                                    text-align: center;
                                    padding: 5px;
                                "
                            >
                                Try Example
                            </button>
                        </div>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</template>
<script lang="ts">
import { defineComponent } from 'vue'
import { CodeWhispererWebview } from './backend'
import TelemetryClient from '../../codewhisperer/vue/telemetry.vue'
import { WebviewClientFactory } from '../../webviews/client'
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
                                'CodeWhisperer_Python_Example1.py',
                                `# Allow CodeWhisperer to make recommendations as you type.${'\n'}${'\n'}# TODO: place your cursor at the end of the code and press Enter to generate suggestion.${'\n'}${'\n'}fake_users = [${'\n'}    { "name": "User 1", "id": "user1", "city": "San Francisco", "state": "CA" },`,
                            ],
                            column2: [
                                'CodeWhisperer_Python_Example2.py',
                                `# Force CodeWhisperer make a recommendation.${'\n'}${'\n'}# TODO: Pressing either Option + C on MacOS or Alt + C on Windows on a new line.${'\n'}${'\n'}# Function to upload a file to an S3 bucket.`,
                            ],
                            column3: [
                                'CodeWhisperer_Python_Example3.py',
                                `# Allow CodeWhisperer to make recommendations using comments.${'\n'}${'\n'}# TODO: place your cursor at the end of the next comment and press Enter to add a new line.${'\n'}${'\n'}# Function to upload a file to an S3 bucket.`,
                            ],
                            column4: [
                                'CodeWhisperer_Python_Example4.py',
                                `# CodeWhisperer can help generate unit tests.${'\n'}${'\n'}# TODO: Ask CodeWhisperer to write unit tests.${'\n'}${'\n'}from unittest import TestCase${'\n'}${'\n'}# Function to sum two numbers.${'\n'}def sum(x, y):${'\n'}    return x + y${'\n'}${'\n'}class TestSum(TestCase):${'\n'}    # test the sum method with integers`,
                            ],
                        },
                    ],
                },
                {
                    label: 'JavaScript',
                    tableData: [
                        {
                            column1: [
                                'CodeWhisperer_JS_Example1.js',
                                `// Allow CodeWhisperer to make recommendations as you type.${'\n'}// TODO: place your cursor at the end of the code and press Enter to generate suggestion.${'\n'}${'\n'}fake_users = [${'\n'}    { "name": "User 1", "id": "user1", "city": "San Francisco", "state": "CA" },`,
                            ],
                            column2: [
                                'CodeWhisperer_JS_Example2.js',
                                `// Allow CodeWhisperer to make recommendations using comments.${'\n'}${'\n'}// TODO: place your cursor at the end of the next comment and press Enter to add a new line.${'\n'}${'\n'}// Function to upload a file to an S3 bucket.`,
                            ],
                            column3: [
                                'CodeWhisperer_JS_Example3.js',
                                `// Force CodeWhisperer make a recommendation.${'\n'}${'\n'}// TODO: Pressing either Option + C on MacOS or Alt + C on Windows on a new line.${'\n'}${'\n'}// Function to upload a file to an S3 bucket.`,
                            ],
                            column4: [
                                'CodeWhisperer_JS_Example4.js',
                                `// CodeWhisperer can help generate unit tests.${'\n'}${'\n'}// TODO: Ask CodeWhisperer to write unit tests.${'\n'}${'\n'}// Function to sum two numbers.${'\n'}const sum = (x, y) => x + y${'\n'}${'\n'}// Write a test case for the sum function.`,
                            ],
                        },
                    ],
                },
                {
                    label: 'C#',
                    tableData: [
                        {
                            column1: [
                                'CodeWhisperer_C_Example1.cs',
                                `// Allow CodeWhisperer to make recommendations using comments.${'\n'}${'\n'}// TODO: place your cursor at the end of the next comment and press Enter to add a new line.${'\n'}${'\n'}// Function to upload a file to an S3 bucket.`,
                            ],
                            column2: [
                                'CodeWhisperer_C_Example2.cs',
                                `// Allow CodeWhisperer to make recommendations using comments.${'\n'}${'\n'}// TODO: place your cursor at the end of the next comment and press Enter to add a new line.${'\n'}${'\n'}// Function to upload a file to an S3 bucket.`,
                            ],
                            column3: [
                                'CodeWhisperer_C_Example3.cs',
                                `// Force CodeWhisperer make a recommendation.${'\n'}${'\n'}// TODO: Pressing either Option + C on MacOS or Alt + C on Windows on a new line.${'\n'}${'\n'}// Function to upload a file to an S3 bucket.`,
                            ],
                            column4: [
                                'CodeWhisperer_C_Example4.cs',
                                `// CodeWhisperer can help generate unit tests.${'\n'}${'\n'}// TODO: Ask CodeWhisperer to write unit tests.${'\n'}${'\n'}// Function to sum two numbers.${'\n'}int sum(int x, int y) {${'\n'}    return x + y;${'\n'}}${'\n'}// Write a test case for the sum function.`,
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
        onClick(names: string[]) {
            client.emitUiClick('cw_GenerateSuggestions_TryExample')
            client.openFile(names)
        },
        async showOS() {
            this.osState = await client.getOSType()
        },
        activeTabFunction(index: number) {
            client.emitUiClick('cw_GenerateSuggestions_Tab')
            this.activeTab = index
            sessionStorage.setItem('activeTab', index.toString())
        },
    },
})
</script>

<style>
a {
    text-decoration: none;
    cursor: pointer;
    color: #2470b3;
}

.tabs {
    display: flex;
}

.tab {
    width: 102px;
    height: 32px;
    border-radius: 30px;
    border: 1px;
    cursor: pointer;
    display: flex;
    font-family: SF Pro Text;
    font-size: 13px;
    font-weight: 700;
    line-height: 16px;
    letter-spacing: 0em;
    text-align: left;
    align-items: center;
    justify-content: center;
}

.tab.active {
    color: #ffffff;
    border: 1px solid #3592c4;
}

table {
    margin-top: 10px;
    border-collapse: collapse;
    width: 100%;
    border: 1px solid #454545;
}

#col2 {
    border: 1px solid #555353;
    background: linear-gradient(0deg, #3d3d3d, #3d3d3d), linear-gradient(0deg, #555353, #555353);
    border-radius: 3px;
    width: fit-content;
    padding: 2px 10px;
    color: #ffffff;
    margin-right: 5px;
}
</style>
