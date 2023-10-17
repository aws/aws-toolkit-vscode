/*! * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. * SPDX-License-Identifier: Apache-2.0 */

<template>
    <div>
        <h1 class="page-header">{{ detectorName }} <img :src="severityImage" /></h1>
        <span v-html="recommendationTextHtml"></span>

        <hr />

        <div class="flex-container detector-details">
            <div>
                <b>Common Weakness Enumeration (CWE)</b>
                <p>
                    <template v-for="(cwe, index) in relatedVulnerabilities">
                        <template v-if="index > 0"> , </template>
                        <a :href="getCweUrl(cwe)">
                            {{ cwe }} <span class="icon icon-sm icon-vscode-link-external"></span>
                        </a>
                    </template>
                </p>
            </div>

            <div>
                <b>Code fix available</b>
                <p v-if="isFixAvailable" style="color: var(--vscode-charts-green)">
                    <span class="icon icon-sm icon-vscode-pass-filled"></span> Yes
                </p>
                <p v-else style="color: var(--vscode-charts-red)">
                    <span class="icon icon-sm icon-vscode-circle-slash"></span> No
                </p>
            </div>

            <div>
                <b>Detector library</b>
                <p>
                    <a :href="detectorUrl">
                        {{ detectorName }} <span class="icon icon-sm icon-vscode-link-external"></span>
                    </a>
                </p>
            </div>
        </div>

        <hr />

        <div v-if="isFixAvailable">
            <h3>Suggested code fix</h3>
            <span v-html="suggestedFixHtml"></span>

            <h4>Why are we recommending this?</h4>
            <span>{{ suggestedFixDescription }}</span>

            <div class="apply-fix">
                <input type="submit" value="Apply Fix" />
            </div>
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { SecurityIssueWebview } from '../securityIssueWebview'
import { WebviewClientFactory } from '../../../../webviews/client'
import infoSeverity from '../../../images/severity-info.svg'
import lowSeverity from '../../../images/severity-low.svg'
import mediumSeverity from '../../../images/severity-medium.svg'
import highSeverity from '../../../images/severity-high.svg'
import criticalSeverity from '../../../images/severity-critical.svg'
import markdownIt from 'markdown-it'
import hljs from 'highlight.js'

const client = WebviewClientFactory.create<SecurityIssueWebview>()
const severityImages: Record<string, string> = {
    info: infoSeverity,
    low: lowSeverity,
    medium: mediumSeverity,
    high: highSeverity,
    critical: criticalSeverity,
}

const md = markdownIt({
    highlight: function (str, lang) {
        if (lang && hljs.getLanguage(lang)) {
            try {
                return hljs.highlight(str, { language: lang }).value
            } catch (__) {}
        }

        return ''
    },
})

export default defineComponent({
    data() {
        return {
            detectorId: '',
            detectorName: '',
            severity: '',
            recommendationText: '',
            suggestedFix: '',
            suggestedFixDescription: '',
            isFixAvailable: false,
            relatedVulnerabilities: [] as string[],
        }
    },
    created() {
        this.getData()
    },
    updated() {
        this.getData()
    },
    methods: {
        async getData() {
            const issue = await client.getIssue()
            if (issue) {
                const [suggestedFix] = issue.remediation.suggestedFixes ?? []

                this.detectorId = issue.detectorId
                this.detectorName = issue.detectorName
                this.relatedVulnerabilities = issue.relatedVulnerabilities
                this.severity = issue.severity
                this.recommendationText = issue.remediation.recommendation.text
                if (suggestedFix) {
                    this.isFixAvailable = true
                    this.suggestedFix = suggestedFix.code
                    this.suggestedFixDescription = suggestedFix.description
                }
            }
        },
        getCweUrl(cwe: string) {
            const num = cwe.split('-').pop()
            return `https://cwe.mitre.org/data/definitions/${num}.html`
        },
    },
    computed: {
        severityImage() {
            return severityImages[this.severity.toLowerCase()]
        },
        detectorUrl() {
            const slug = this.detectorId.split('@').shift()
            return `https://docs.aws.amazon.com/codeguru/detector-library/${slug}`
        },
        recommendationTextHtml() {
            return md.render(this.recommendationText)
        },
        suggestedFixHtml() {
            return md.render(`
\`\`\`diff
${this.suggestedFix}
\`\`\`
      `)
        },
    },
})
</script>

<style>
input[type='submit'] {
    background-color: var(--vscode-button-background);
    border: none;
    color: var(--vscode-button-foreground);
    padding: 6px 14px;
    cursor: pointer;
    border-radius: 5%;
    margin: 20px 0;
}

input[type='submit']:hover {
    background-color: var(--vscode-button-hoverBackground);
}

.flex-container {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
}

.flex-container > div {
    flex: 33%;
}

@media screen and (max-width: 900px) {
    .flex-container > div {
        flex: 50%;
    }
}

@media screen and (max-width: 400px) {
    .flex-container {
        flex-direction: column;
    }
}

.page-header {
    padding-bottom: unset;
    border-bottom-width: unset;
    border-bottom-style: unset;
}

.detector-details {
    padding-top: 10px;
}
</style>
