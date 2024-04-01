/*! * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. * SPDX-License-Identifier: Apache-2.0 */

<template>
    <div class="mb-16">
        <div class="container button-container" style="justify-content: space-between">
            <h1>{{ title }} <img class="severity" :src="severityImage" :alt="severity" /></h1>
            <input
                v-if="isFixAvailable"
                class="mt-4 ml-16"
                type="submit"
                @click="applyFix"
                value="Apply Amazon Q Suggestion"
            />
        </div>

        <div class="mt-16">
            <span v-html="recommendationTextHtml"></span>
        </div>

        <hr />

        <div class="flex-container mt-16">
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
                <p v-if="!relatedVulnerabilities || relatedVulnerabilities.length === 0">-</p>
            </div>

            <div>
                <b>Code fix available</b>
                <p v-if="isFixAvailable" style="color: var(--vscode-testing-iconPassed)">
                    <span class="icon icon-sm icon-vscode-pass-filled"></span> Yes
                </p>
                <p v-else style="color: var(--vscode-testing-iconErrored)">
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

            <div>
                <b>File path</b>
                <p>
                    <a href="#" @click="navigateToFile"> {{ relativePath }} [Ln {{ startLine + 1 }}] </a>
                </p>
            </div>
        </div>

        <div v-if="isFixAvailable">
            <hr />

            <h3>Suggested code fix preview</h3>
            <span v-html="suggestedFixHtml"></span>

            <div v-if="isFixDescriptionAvailable">
                <h4>Why are we recommending this?</h4>
                <span>{{ suggestedFixDescription }}</span>
            </div>
        </div>
    </div>

    <hr />

    <div class="mt-16">
        <input type="submit" class="mr-8" @click="explainWithQ" value="Explain with Amazon Q" />
        <input type="submit" class="mr-8" @click="fixWithQ" value="Fix with Amazon Q" />
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { SecurityIssueWebview } from '../securityIssueWebview'
import { WebviewClientFactory } from '../../../../webviews/client'
import infoSeverity from '../../../../../resources/images/severity-info.svg'
import lowSeverity from '../../../../../resources/images/severity-low.svg'
import mediumSeverity from '../../../../../resources/images/severity-medium.svg'
import highSeverity from '../../../../../resources/images/severity-high.svg'
import criticalSeverity from '../../../../../resources/images/severity-critical.svg'
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
            title: '',
            detectorId: '',
            detectorName: '',
            severity: '',
            recommendationText: '',
            suggestedFix: '',
            suggestedFixDescription: '',
            isFixAvailable: false,
            isFixDescriptionAvailable: false,
            relatedVulnerabilities: [] as string[],
            startLine: 0,
            relativePath: '',
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
            const relativePath = await client.getRelativePath()
            if (issue) {
                const [suggestedFix] = issue.suggestedFixes

                this.title = issue.title
                this.detectorId = issue.detectorId
                this.detectorName = issue.detectorName
                this.relatedVulnerabilities = issue.relatedVulnerabilities
                this.severity = issue.severity
                this.recommendationText = issue.recommendation.text
                this.startLine = issue.startLine
                this.relativePath = relativePath
                this.isFixAvailable = false
                if (suggestedFix) {
                    this.isFixAvailable = true
                    this.suggestedFix = suggestedFix.code
                    if (
                        suggestedFix.description.trim() !== '' &&
                        suggestedFix.description.trim() !== 'Suggested remediation:'
                    ) {
                        this.isFixDescriptionAvailable = true
                    }
                    this.suggestedFixDescription = suggestedFix.description
                }
            }
        },
        getCweUrl(cwe: string) {
            const num = cwe.split('-').pop()
            return `https://cwe.mitre.org/data/definitions/${num}.html`
        },
        applyFix() {
            client.applyFix()
        },
        explainWithQ() {
            client.explainWithQ()
        },
        fixWithQ() {
            client.fixWithQ()
        },
        navigateToFile() {
            client.navigateToFile()
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
${this.suggestedFix.replaceAll('\n\\ No newline at end of file', '')}
\`\`\`
      `)
        },
    },
})
</script>
