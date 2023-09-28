<!-- This Vue File provides Sandbox files for experimenting CodeWhisperer and generating code suggestions -->
<template>
    <div class="generateSuggestionDiv">
        <div class="generateSuggestionHeaderDiv">
            <div class="generateSuggestionHeader">Generate code suggestions with examples</div>
            <div class="generateSuggestionDescription">
                CodeWhisperer supports
                <a
                    class="generateSuggestionLearnMore"
                    href="https://docs.aws.amazon.com/codewhisperer/latest/userguide/language-ide-support.html"
                    @click="emitUiClick('codewhisperer_GenerateSuggestions_LearnMore')"
                    >15 programming languages</a
                >, including TypeScript, JavaScript, Python, Java, and C#.
            </div>
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
                        <div class="generateSuggestionTabIcon" v-else-if="tab.label === 'TypeScript'">
                            <svg
                                width="16"
                                height="10"
                                viewBox="0 0 16 10"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                                <path
                                    d="M3.86751 9.59094V1.41199H0.899447V0.283857H8.20544V1.41199H5.23738V9.59094H3.86751ZM11.2839 5.17243C10.5497 4.89487 10.017 4.55912 9.68569 4.16517C9.35442 3.77122 9.18878 3.2743 9.18878 2.67442C9.18878 2.17303 9.31413 1.72984 9.56482 1.34484C9.81552 0.950887 10.1737 0.641994 10.6392 0.418159C11.1138 0.194323 11.6689 0.0824056 12.3046 0.0824056C13.1104 0.0824056 13.9386 0.243567 14.7891 0.56589V1.65373C13.8849 1.37618 13.088 1.2374 12.3986 1.2374C11.8166 1.2374 11.3645 1.35827 11.0421 1.60001C10.7288 1.8328 10.5721 2.16855 10.5721 2.60727C10.5721 2.96541 10.6795 3.25192 10.8944 3.4668C11.1093 3.67273 11.5077 3.88313 12.0897 4.09802L13.3118 4.55464C14.0371 4.82324 14.5564 5.15004 14.8697 5.53504C15.1921 5.91108 15.3532 6.39905 15.3532 6.99893C15.3532 7.85845 15.0443 8.54339 14.4265 9.05374C13.8177 9.56408 12.994 9.81925 11.9554 9.81925C10.9257 9.81925 10.0304 9.63571 9.26936 9.26862V8.19421C10.2095 8.50758 11.0959 8.66426 11.9285 8.66426C12.5642 8.66426 13.0611 8.52548 13.4193 8.24793C13.7864 7.97037 13.9699 7.59433 13.9699 7.1198C13.9699 6.78852 13.8625 6.51544 13.6476 6.30056C13.4417 6.07672 13.088 5.86632 12.5866 5.66934L11.2839 5.17243Z"
                                    fill="#00A1C9"
                                />
                            </svg>
                        </div>
                        <div class="generateSuggestionTabIconC" v-else-if="tab.label === 'JavaScript'">
                            <svg
                                width="16"
                                height="17"
                                viewBox="0 0 16 17"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                                <path
                                    d="M2.27098 10.9804C2.72698 11.1324 3.17898 11.2084 3.62698 11.2084C4.12298 11.2084 4.47898 11.0844 4.69498 10.8364C4.91098 10.5804 5.01898 10.1644 5.01898 9.58838V3.72038H6.24298V9.56438C6.24298 11.3484 5.40698 12.2404 3.73498 12.2404C3.26298 12.2404 2.77498 12.1364 2.27098 11.9284V10.9804ZM9.76527 8.08838C9.10927 7.84038 8.63327 7.54038 8.33727 7.18838C8.04127 6.83638 7.89327 6.39238 7.89327 5.85638C7.89327 5.40838 8.00527 5.01238 8.22927 4.66838C8.45327 4.31638 8.77327 4.04038 9.18927 3.84038C9.61327 3.64038 10.1093 3.54038 10.6773 3.54038C11.3973 3.54038 12.1373 3.68438 12.8973 3.97238V4.94438C12.0893 4.69638 11.3773 4.57238 10.7613 4.57238C10.2413 4.57238 9.83727 4.68038 9.54927 4.89638C9.26927 5.10438 9.12927 5.40438 9.12927 5.79638C9.12927 6.11638 9.22527 6.37238 9.41727 6.56438C9.60927 6.74838 9.96527 6.93638 10.4853 7.12838L11.5773 7.53638C12.2253 7.77638 12.6893 8.06838 12.9693 8.41238C13.2573 8.74838 13.4013 9.18438 13.4013 9.72038C13.4013 10.4884 13.1253 11.1004 12.5733 11.5564C12.0293 12.0124 11.2933 12.2404 10.3653 12.2404C9.44527 12.2404 8.64527 12.0764 7.96527 11.7484V10.7884C8.80527 11.0684 9.59727 11.2084 10.3413 11.2084C10.9093 11.2084 11.3533 11.0844 11.6733 10.8364C12.0013 10.5884 12.1653 10.2524 12.1653 9.82838C12.1653 9.53238 12.0693 9.28838 11.8773 9.09638C11.6933 8.89638 11.3773 8.70838 10.9293 8.53238L9.76527 8.08838Z"
                                    fill="#EE9D28"
                                />
                            </svg>
                        </div>
                        <div class="generateSuggestionTabIcon" v-else-if="tab.label === 'Java'">
                            <svg
                                width="10"
                                height="10"
                                viewBox="0 0 6 10"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                                <path
                                    d="M0.801499 8.40909C1.31184 8.57921 1.81771 8.66426 2.3191 8.66426C2.87422 8.66426 3.27264 8.52548 3.51439 8.24793C3.75613 7.96142 3.877 7.49584 3.877 6.85119V0.283857H5.24687V6.82433C5.24687 8.82095 4.31124 9.81925 2.43998 9.81925C1.91172 9.81925 1.36556 9.70286 0.801499 9.47007V8.40909Z"
                                    fill="#D13212"
                                />
                            </svg>
                        </div>
                        <div class="generateSuggestionTabIconC" v-else-if="tab.label === 'C#'">
                            <svg
                                width="16"
                                height="12"
                                viewBox="0 0 7 10"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                                <path
                                    d="M6.21947 8.80838C5.57147 9.05638 4.87147 9.18038 4.11947 9.18038C2.80747 9.18038 1.81147 8.82038 1.13147 8.10038C0.459469 7.37238 0.123469 6.30838 0.123469 4.90838C0.123469 3.52438 0.471469 2.46038 1.16747 1.71638C1.87147 0.972377 2.87547 0.600377 4.17947 0.600377C4.85947 0.600377 5.49947 0.708377 6.09947 0.924376V1.92038C5.37147 1.75238 4.77947 1.66838 4.32347 1.66838C3.31547 1.66838 2.57947 1.91638 2.11547 2.41238C1.65147 2.90038 1.41947 3.68038 1.41947 4.75238V5.04038C1.41947 6.09638 1.64347 6.87238 2.09147 7.36838C2.54747 7.86438 3.26747 8.11238 4.25147 8.11238C4.75547 8.11238 5.41147 8.01238 6.21947 7.81238V8.80838Z"
                                    fill="#8DC149"
                                />
                            </svg>
                        </div>
                    </div>
                    <div>{{ tab.label }}</div>
                </div>
            </div>

            <div class="tableDivSub" v-for="(row, index) in tabs[activeTab].tableData" :key="index">
                <div
                    v-for="(column, columnIndex) in [row.column1, row.column2, row.column3, row.column4, row.column5]"
                    :key="columnIndex"
                >
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
                            <template v-else-if="columnIndex === 2">
                                Generate code suggestions using comments
                            </template>
                            <template v-else-if="columnIndex === 3">
                                Navigate between code suggestions using
                                <div class="generateSuggestionTabMachine">
                                    <div class="col2">Left / Right Arrows</div>
                                </div></template
                            >
                            <template v-else> Generate unit test cases </template>
                        </div>
                        <button class="tryExample" @click="onClick(column, tabs[activeTab].label)">
                            Try in {{ tabs[activeTab].label }}
                        </button>
                    </div>
                </div>
            </div>
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
                    label: 'TypeScript',
                    tableData: [
                        {
                            column1: [
                                'CodeWhisperer_generate_suggestion.ts',
                                `// TODO: place your cursor at the end of line 5 and press Enter to generate a suggestion.${'\n'}// Tip: press tab to accept the suggestion.${'\n'}${'\n'}const fake_users = [${'\n'}    { "name": "User 1", "id": "user1", "city": "San Francisco", "state": "CA" },`,
                            ],
                            column2: [
                                'CodeWhisperer_manual_invoke.ts',
                                `// TODO: Press either Option + C on MacOS or Alt + C on Windows on a new line.${'\n'}${'\n'}// Function to upload a file to an S3 bucket.${'\n'}`,
                            ],
                            column3: [
                                'CodeWhisperer_use_comments.ts',
                                `// TODO: place your cursor at the end of line 4 and press Enter to generate a suggestion.${'\n'}// Tip: press tab to accept the suggestion.${'\n'}${'\n'}// Function to upload a file to an S3 bucket.`,
                            ],
                            column4: [
                                'CodeWhisperer_navigate_suggestions.ts',
                                `// TODO: place your cursor at the end of line 4 and press Enter to generate a suggestion.${'\n'}// CodeWhisperer generates multiple code recommendations. Use the left and right arrow keys to navigate between them.${'\n'}${'\n'}// Function to upload a file to an S3 bucket.`,
                            ],
                            column5: [
                                'Generate_unit_tests.ts',
                                `// TODO: Ask CodeWhisperer to write unit tests.${'\n'}${'\n'}// Function to sum two numbers.${'\n'}function sum(a: number, b: number): number {${'\n'}  return a + b${'\n'}}${'\n'}${'\n'}// Write a test case for the sum function.${'\n'}`,
                            ],
                        },
                    ],
                },
                {
                    label: 'JavaScript',
                    tableData: [
                        {
                            column1: [
                                'CodeWhisperer_generate_suggestion.js',
                                `// TODO: place your cursor at the end of line 5 and press Enter to generate a suggestion.${'\n'}// Tip: press tab to accept the suggestion.${'\n'}${'\n'}fake_users = [${'\n'}    { "name": "User 1", "id": "user1", "city": "San Francisco", "state": "CA" },`,
                            ],
                            column2: [
                                'CodeWhisperer_manual_invoke.js',
                                `// TODO: Press either Option + C on MacOS or Alt + C on Windows on a new line.${'\n'}${'\n'}// Function to upload a file to an S3 bucket.${'\n'}`,
                            ],
                            column3: [
                                'CodeWhisperer_use_comments.js',
                                `// TODO: place your cursor at the end of line 4 and press Enter to generate a suggestion.${'\n'}// Tip: press tab to accept the suggestion.${'\n'}${'\n'}// Function to upload a file to an S3 bucket.`,
                            ],
                            column4: [
                                'CodeWhisperer_navigate_suggestions.js',
                                `// TODO: place your cursor at the end of line 4 and press Enter to generate a suggestion.${'\n'}// CodeWhisperer generates multiple code recommendations. Use the left and right arrow keys to navigate between them.${'\n'}${'\n'}// Function to upload a file to an S3 bucket.`,
                            ],
                            column5: [
                                'Generate_unit_tests.js',
                                `// TODO: Ask CodeWhisperer to write unit tests.${'\n'}${'\n'}// Function to sum two numbers.${'\n'}function sum(a, b) {${'\n'}  return a + b${'\n'}}${'\n'}${'\n'}// Write a test case for the sum function.${'\n'}`,
                            ],
                        },
                    ],
                },
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
                                'CodeWhisperer_use_comments.py',
                                `# TODO: place your cursor at the end of line 4 and press Enter to generate a suggestion.${'\n'}# Tip: press tab to accept the suggestion.${'\n'}${'\n'}# Function to upload a file to an S3 bucket.`,
                            ],
                            column4: [
                                'CodeWhisperer_navigate_suggestions.py',
                                `# TODO: place your cursor at the end of line 4 and press Enter to generate a suggestion.${'\n'}# CodeWhisperer generates multiple code recommendations. Use the left and right arrow keys to navigate between them.${'\n'}${'\n'}# Function to upload a file to an S3 bucket.`,
                            ],
                            column5: [
                                'Generate_unit_tests.py',
                                `# TODO: Ask CodeWhisperer to write unit tests.${'\n'}${'\n'}def sum(a, b):${'\n'}    """${'\n'}    Function to sum two numbers.${'\n'}${'\n'}    Args:${'\n'}    - a: First number.${'\n'}    - b: Second number.${'\n'}${'\n'}    Returns:${'\n'}    - Sum of the two numbers.${'\n'}    """${'\n'}    return a + b${'\n'}${'\n'}# Write a test case for the above function.${'\n'}`,
                            ],
                        },
                    ],
                },
                {
                    label: 'Java',
                    tableData: [
                        {
                            column1: [
                                'CodeWhisperer_generate_suggestion.java',
                                `import java.util.ArrayList;${'\n'}import java.util.HashMap;${'\n'}import java.util.List;${'\n'}import java.util.Map;${'\n'}${'\n'}public class Main {${'\n'}    public static void main(String[] args) {${'\n'}        // TODO: place your cursor at the end of line 18 and press Enter to generate a suggestion.${'\n'}        // Tip: press tab to accept the suggestion.${'\n'}${'\n'}        List<Map<String, String>> fakeUsers = new ArrayList<>();${'\n'}        Map<String, String> user1 = new HashMap<>();${'\n'}        user1.put("name", "User 1");${'\n'}        user1.put("id", "user1");${'\n'}        user1.put("city", "San Francisco");${'\n'}        user1.put("state", "CA");${'\n'}        fakeUsers.add(user1);${'\n'}        `,
                            ],
                            column2: [
                                'CodeWhisperer_manual_invoke.java',
                                `// TODO: Press either Option + C on MacOS or Alt + C on Windows on a new line.${'\n'}${'\n'}public class S3Uploader {${'\n'}${'\n'}    // Function to upload a file to an S3 bucket.${'\n'}    public static void uploadFile(String filePath, String bucketName) {${'\n'}        `,
                            ],
                            column3: [
                                'CodeWhisperer_use_comments.java',
                                `// TODO: place your cursor at the end of line 4 and press Enter to generate a suggestion.${'\n'}// Tip: press tab to accept the suggestion.${'\n'}${'\n'}// Function to upload a file to an S3 bucket.`,
                            ],
                            column4: [
                                'CodeWhisperer_navigate_suggestions.java',
                                `// TODO: place your cursor at the end of line 4 and press Enter to generate a suggestion.${'\n'}// CodeWhisperer generates multiple code recommendations. Use the left and right arrow keys to navigate between them.${'\n'}${'\n'}// Function to upload a file to an S3 bucket.`,
                            ],
                            column5: [
                                'Generate_unit_tests.java',
                                `// TODO: Ask CodeWhisperer to write unit tests.${'\n'}${'\n'}// Write a test case for the sum function.${'\n'}${'\n'}import junit.framework.Test;${'\n'}${'\n'}public class SumFunction {${'\n'}${'\n'}    /**${'\n'}     * Function to sum two numbers.${'\n'}     *${'\n'}     * @param a First number.${'\n'}     * @param b Second number.${'\n'}     * @return Sum of the two numbers.${'\n'}     */${'\n'}    public static int sum(int a, int b) {${'\n'}        return a + b;${'\n'}    }${'\n'}    `,
                            ],
                        },
                    ],
                },
                {
                    label: 'C#',
                    tableData: [
                        {
                            column1: [
                                'CodeWhisperer_generate_suggestion.cs',
                                `using System;${'\n'}using System.Collections.Generic;${'\n'}${'\n'}public class Program${'\n'}{${'\n'}    public static void Main()${'\n'}    {${'\n'}        // TODO: place your cursor at the end of line 20 and press Enter to generate a suggestion.${'\n'}        // Tip: press tab to accept the suggestion.${'\n'}${'\n'}        List<Dictionary<string, string>> fakeUsers = new List<Dictionary<string, string>>();${'\n'}${'\n'}        Dictionary<string, string> user1 = new Dictionary<string, string>();${'\n'}        user1.Add("name", "User 1");${'\n'}        user1.Add("id", "user1");${'\n'}        user1.Add("city", "San Francisco");${'\n'}        user1.Add("state", "CA");${'\n'}${'\n'}        fakeUsers.Add(user1);${'\n'}${'\n'}        `,
                            ],
                            column2: [
                                'CodeWhisperer_manual_invoke.cs',
                                `// TODO: Press either Option + C on MacOS or Alt + C on Windows on a new line.${'\n'}${'\n'}public class S3Uploader${'\n'}{${'\n'}    // Function to upload a file to an S3 bucket.${'\n'}    public static void UploadFile(string filePath, string bucketName)${'\n'}    {${'\n'}        `,
                            ],
                            column3: [
                                'CodeWhisperer_use_comments.cs',
                                `// TODO: place your cursor at the end of line 4 and press Enter to generate a suggestion.${'\n'}// Tip: press tab to accept the suggestion.${'\n'}${'\n'}// Function to upload a file to an S3 bucket.`,
                            ],
                            column4: [
                                'CodeWhisperer_navigate_suggestions.cs',
                                `// TODO: place your cursor at the end of line 4 and press Enter to generate a suggestion.${'\n'}// CodeWhisperer generates multiple code recommendations. Use the left and right arrow keys to navigate between them.${'\n'}${'\n'}// Function to upload a file to an S3 bucket.`,
                            ],
                            column5: [
                                'Generate_unit_tests.cs',
                                `// TODO: Ask CodeWhisperer to write unit tests.${'\n'}${'\n'}using System;${'\n'}${'\n'}public class SumFunction${'\n'}{${'\n'}    /// <summary>${'\n'}${'\n'}    /// </summary>${'\n'}    /// <param name="a">First number.</param>${'\n'}    /// <param name="b">Second number.</param>${'\n'}    /// <returns>Sum of the two numbers.</returns>${'\n'}    public static int Sum(int a, int b)${'\n'}    {${'\n'}        return a + b;${'\n'}    }${'\n'}${'\n'}    // Write a test case for the Sum function.${'\n'}    `,
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
    padding-top: 10px;
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
