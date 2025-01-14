/*! * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. * SPDX-License-Identifier: Apache-2.0 */

<template>
    <div class="mb-16">
        <div class="container button-container" style="justify-content: space-between; top: 0">
            <h1>{{ title }} <img class="severity" :src="severityImage" :alt="severity" /></h1>
        </div>

        <div class="mt-16">
            <span v-html="recommendationTextHtml"></span>
        </div>

        <hr />

        <div class="flex-container mt-16">
            <div>
                <b
                    >Common Weakness <br />
                    Enumeration (CWE)</b
                >
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
                <b>Detector library</b>
                <p v-if="!detectorUrl || !detectorUrl.length">-</p>
                <p v-else>
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

        <div
            v-if="isFixAvailable || isGenerateFixLoading || isGenerateFixError || isFixDescriptionAvailable"
            ref="codeFixSection"
        >
            <hr />

            <h3>Suggested code fix preview</h3>
            <pre v-if="isGenerateFixLoading" class="center"><div class="dot-typing"></div></pre>
            <pre v-if="isGenerateFixError" class="center error">
                Something went wrong. <a @click="regenerateFix">Retry</a>
            </pre>
            <div class="code-block">
                <span v-if="isFixAvailable" v-html="suggestedFixHtml"></span>
                <div v-if="isFixAvailable" class="code-diff-actions" ref="codeFixAction">
                    <button class="code-diff-action-button" @click="copyFixedCode">
                        <span class="icon icon-md icon-vscode-copy"></span> Copy
                    </button>
                    <button class="code-diff-action-button" @click="openDiff">
                        <span class="icon icon-md icon-vscode-diff"></span> Open diff
                    </button>
                </div>
            </div>

            <div v-if="isFixDescriptionAvailable && !isGenerateFixLoading">
                <h4 v-if="!suggestedFixDescription.includes('No code fix generated')">Why are we recommending this?</h4>
                <span v-html="suggestedFixDescription"></span>
            </div>
        </div>
    </div>

    <div class="mt-16 mb-16 container button-container container-bottom">
        <button
            v-if="!isFixAvailable"
            @click="generateFix"
            class="mr-8 button-theme-primary"
            :disabled="isGenerateFixLoading"
        >
            Generate Fix
        </button>
        <button v-if="isFixAvailable" @click="applyFix" class="mr-8 button-theme-primary">Accept Fix</button>
        <button v-if="isFixAvailable" @click="regenerateFix" class="mr-8 button-theme-secondary">Regenerate Fix</button>
        <button @click="explainWithQ" class="mr-8 button-theme-secondary">Explain</button>
        <button @click="ignoreIssue" class="mr-8 button-theme-secondary">Ignore</button>
        <button @click="ignoreAllIssues" class="mr-8 button-theme-secondary">Ignore All</button>
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
import { parsePatch } from 'diff'
import { CodeScanIssue } from '../../../models/model'

const client = WebviewClientFactory.create<SecurityIssueWebview>()
const severityImages: Record<string, string> = {
    info: infoSeverity,
    low: lowSeverity,
    medium: mediumSeverity,
    high: highSeverity,
    critical: criticalSeverity,
}

const md = markdownIt({
    highlight: function (str, lang, attrRaw): string {
        const attrs = attrRaw.split(/\s+/g)
        const showLineNumbers = attrs.includes('showLineNumbers')
        const startFrom = parseInt(attrRaw.match(/startFrom=(\d+)/)?.[1] ?? '1')
        const highlightStart = parseInt(attrRaw.match(/highlightStart=(\d+)/)?.[1] ?? '0')
        const highlightEnd = parseInt(attrRaw.match(/highlightEnd=(\d+)/)?.[1] ?? '0')
        if (lang) {
            try {
                const highlighted = hljs.highlight(str, {
                    language: hljs.getLanguage(lang) ? lang : 'plaintext',
                    ignoreIllegals: true,
                }).value
                let result = highlighted
                    .trimEnd()
                    .split('\n')
                    .map((line) => {
                        if (line.startsWith('+')) {
                            return `<span class="hljs-addition">${line}</span>`
                        } else if (line.startsWith('-')) {
                            return `<span class="hljs-deletion">${line}</span>`
                        }
                        return line
                    })
                    .join('\n')
                if (showLineNumbers) {
                    result = applyLineNumbers(result, startFrom - 1)
                }
                if (highlightStart && highlightEnd) {
                    result = applyHighlight(result, startFrom - 1, highlightStart, highlightEnd)
                }
                return result
            } catch (__) {}
        }

        return ''
    },
})

const applyLineNumbers = (code: string, lineNumberOffset = 0) => {
    const lines = code.split('\n')
    const rows = lines.map((line, idx) => {
        const lineNumber = idx + 1 + lineNumberOffset
        return `<div class="line-number">${lineNumber}</div>${line}`
    })
    return rows.join('\n')
}

const applyHighlight = (code: string, lineNumberOffset = 0, highlightStart: number, highlightEnd: number) => {
    const lines = code.split('\n')
    const rows = lines.map((line, idx) => {
        const lineNumber = idx + 1 + lineNumberOffset
        if (lineNumber >= highlightStart && lineNumber < highlightEnd) {
            return `<div class="highlight reference-tracker">${line}</div>`
        }
        return line
    })
    return rows.join('\n')
}

export default defineComponent({
    data() {
        return {
            title: '',
            detectorId: '',
            detectorName: '',
            detectorUrl: '',
            severity: '',
            recommendationText: '',
            suggestedFix: '',
            suggestedFixDescription: '',
            isFixAvailable: false,
            isFixDescriptionAvailable: false,
            relatedVulnerabilities: [] as string[],
            startLine: 0,
            endLine: 0,
            relativePath: '',
            isGenerateFixLoading: false,
            isGenerateFixError: false,
            languageId: 'plaintext',
            fixedCode: '',
            referenceText: '',
            referenceSpan: [0, 0],
        }
    },
    created() {
        this.getData()
        this.setupEventListeners()
    },
    beforeMount() {
        this.getData()
    },
    methods: {
        async getData() {
            const issue = await client.getIssue()
            if (issue) {
                this.updateFromIssue(issue)
            }
            const relativePath = await client.getRelativePath()
            this.updateRelativePath(relativePath)
            const isGenerateFixLoading = await client.getIsGenerateFixLoading()
            const isGenerateFixError = await client.getIsGenerateFixError()
            this.updateGenerateFixState(isGenerateFixLoading, isGenerateFixError)
            const languageId = await client.getLanguageId()
            if (languageId) {
                this.updateLanguageId(languageId)
            }
            const fixedCode = await client.getFixedCode()
            this.updateFixedCode(fixedCode)
        },
        setupEventListeners() {
            client.onChangeIssue(async (issue) => {
                if (issue) {
                    this.updateFromIssue(issue)
                }
                const fixedCode = await client.getFixedCode()
                this.updateFixedCode(fixedCode)
                this.scrollTo('codeFixActions')
            })
            client.onChangeFilePath(async (filePath) => {
                const relativePath = await client.getRelativePath()
                this.updateRelativePath(relativePath)

                const languageId = await client.getLanguageId()
                if (languageId) {
                    this.updateLanguageId(languageId)
                }
            })
            client.onChangeGenerateFixLoading((isGenerateFixLoading) => {
                this.isGenerateFixLoading = isGenerateFixLoading
                this.scrollTo('codeFixSection')
            })
            client.onChangeGenerateFixError((isGenerateFixError) => {
                this.isGenerateFixError = isGenerateFixError
            })
        },
        updateRelativePath(relativePath: string) {
            this.relativePath = relativePath
        },
        updateGenerateFixState(isGenerateFixLoading: boolean, isGenerateFixError: boolean) {
            this.isGenerateFixLoading = isGenerateFixLoading
            this.isGenerateFixError = isGenerateFixError
        },
        updateLanguageId(languageId: string) {
            this.languageId = languageId
        },
        updateFixedCode(fixedCode: string) {
            this.fixedCode = fixedCode.replaceAll('\n\\ No newline at end of file', '')
        },
        updateFromIssue(issue: CodeScanIssue) {
            const [suggestedFix] = issue.suggestedFixes

            this.title = issue.title
            this.detectorId = issue.detectorId
            this.detectorName = issue.detectorName
            this.detectorUrl = issue.recommendation.url
            this.relatedVulnerabilities = issue.relatedVulnerabilities
            this.severity = issue.severity
            this.recommendationText = issue.recommendation.text
            this.startLine = issue.startLine
            this.endLine = issue.endLine
            this.isFixAvailable = false
            this.isFixDescriptionAvailable = false
            if (suggestedFix) {
                this.isFixAvailable = !!suggestedFix.code && suggestedFix.code?.trim() !== ''
                this.suggestedFix = suggestedFix.code ?? ''
                if (
                    suggestedFix.description?.trim() !== '' &&
                    suggestedFix.description?.trim() !== 'Suggested remediation:'
                ) {
                    this.isFixDescriptionAvailable = true
                }
                this.suggestedFixDescription = md.render(suggestedFix.description)

                const [reference] = suggestedFix.references ?? []
                if (
                    reference &&
                    reference.recommendationContentSpan?.start &&
                    reference.recommendationContentSpan.end
                ) {
                    this.referenceText = `Reference code under <i>${reference.licenseName}</i> license from repository <code>${reference.repository}</code>`
                    this.referenceSpan = [
                        reference.recommendationContentSpan.start,
                        reference.recommendationContentSpan.end,
                    ]
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
        navigateToFile() {
            client.navigateToFile()
        },
        generateFix() {
            client.generateFix()
        },
        regenerateFix() {
            client.regenerateFix()
        },
        rejectFix() {
            client.rejectFix()
        },
        ignoreIssue() {
            client.ignoreIssue()
        },
        ignoreAllIssues() {
            client.ignoreAllIssues()
        },
        copyFixedCode() {
            client.copyFixedCode()
        },
        insertAtCursor() {
            client.insertAtCursor()
        },
        openDiff() {
            client.openDiff()
        },
        computeSuggestedFixHtml() {
            if (!this.isFixAvailable) {
                return
            }
            const [parsedDiff] = parsePatch(this.suggestedFix)
            const { oldStart } = parsedDiff.hunks[0]
            const [referenceStart, referenceEnd] = this.referenceSpan
            const htmlString = md.render(`
\`\`\`${this.languageId} showLineNumbers startFrom=${oldStart} ${
                referenceStart && referenceEnd
                    ? `highlightStart=${referenceStart + 1} highlightEnd=${referenceEnd + 1}`
                    : ''
            }
${this.fixedCode}
\`\`\`
      `)
            const parser = new DOMParser()
            const doc = parser.parseFromString(htmlString, 'text/html')
            const referenceTracker = doc.querySelector('.reference-tracker')
            if (referenceTracker) {
                const tooltip = doc.createElement('div')
                tooltip.classList.add('tooltip')
                tooltip.innerHTML = this.referenceText
                referenceTracker.appendChild(tooltip)
            }
            return doc.body.innerHTML
        },
        scrollTo(refName: string) {
            this.$nextTick(() => this.$refs?.[refName]?.scrollIntoView({ behavior: 'smooth' }))
        },
    },
    computed: {
        severityImage() {
            return severityImages[this.severity.toLowerCase()]
        },
        recommendationTextHtml() {
            return md.render(this.recommendationText)
        },
        suggestedFixHtml() {
            return this.computeSuggestedFixHtml()
        },
    },
})
</script>
