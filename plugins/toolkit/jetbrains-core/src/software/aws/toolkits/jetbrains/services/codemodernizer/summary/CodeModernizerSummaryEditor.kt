// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.summary

import com.intellij.ide.BrowserUtil
import com.intellij.markdown.utils.MarkdownToHtmlConverter
import com.intellij.openapi.editor.colors.EditorColorsManager
import com.intellij.openapi.fileEditor.FileEditor
import com.intellij.openapi.fileEditor.FileEditorState
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.UserDataHolderBase
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.components.JBScrollPane
import org.intellij.markdown.flavours.gfm.GFMFlavourDescriptor
import software.aws.toolkits.jetbrains.services.codemodernizer.summary.CodeModernizerSummaryEditorProvider.Companion.MIGRATION_SUMMARY_KEY
import java.beans.PropertyChangeListener
import javax.swing.BorderFactory
import javax.swing.JEditorPane
import javax.swing.event.HyperlinkEvent

class CodeModernizerSummaryEditor(val project: Project, val virtualFile: VirtualFile) : UserDataHolderBase(), FileEditor {
    val summary = virtualFile.getUserData(MIGRATION_SUMMARY_KEY) ?: throw RuntimeException("Migration summary not found")

    private val rootPanel = buildRootPanel()

    fun renderCSSStyles(): String {
        var fontFamilies = "-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans',Helvetica,Arial,sans-serif,'Apple Color Emoji','Segoe UI Emoji'"
        var mainFontColor = "#1F2328"
        var mainAnchorColor = "#0969da"
        var mainThemeBorder = "1px solid #d0d7de"
        var mainMarkTagColor = "#fff8c5"
        var secondaryThemeColor = "#d0d7de"
        var tertiaryThemeColor = "#f6f8fa"
        var tertiaryThemeFontColor = "#656d76"
        var codeblockBgColor = "rgba(175,184,193,0.2)"

        if (EditorColorsManager.getInstance().isDarkEditor) {
            mainFontColor = "#e6edf3"
            mainAnchorColor = "#2f81f7"
            mainThemeBorder = "1px solid #21262d"
            mainMarkTagColor = "rgba(187,128,9,0.15)"
            secondaryThemeColor = "#30363d"
            tertiaryThemeColor = "#161b22"
            tertiaryThemeFontColor = "#7d8590"
            codeblockBgColor = "rgba(110,118,129,0.4)"
        }

        return """
            .markdown-body {
              -ms-text-size-adjust: 100%;
              -webkit-text-size-adjust: 100%;
              margin: 0;
              color: $mainFontColor;
              font-family: $fontFamilies;
              font-size: 14px;
              line-height: 1.5;
              word-wrap: break-word;
              padding: 0px 8px;
            }

            .markdown-body details,
            .markdown-body figcaption,
            .markdown-body figure {
              display: block;
            }

            .markdown-body summary {
              display: list-item;
            }

            .markdown-body [hidden] {
              display: none !important;
            }

            .markdown-body a {
              background-color: transparent;
              color: $mainAnchorColor;
              text-decoration: none;
            }

            .markdown-body abbr[title] {
              border-bottom: none;
              -webkit-text-decoration: underline dotted;
              text-decoration: underline dotted;
            }

            .markdown-body b,
            .markdown-body strong {
              font-weight: 600;
            }

            .markdown-body dfn {
              font-style: italic;
            }

            .markdown-body h1 {
              margin: 10px 0;
              font-weight: 600;
              padding-bottom: 8px;
              font-size: 32px;
              border-bottom: $mainThemeBorder;
            }

            .markdown-body mark {
              background-color: $mainMarkTagColor;
              color: $mainFontColor;
            }

            .markdown-body small {
              font-size: 10px
            }

            .markdown-body sub,
            .markdown-body sup {
              font-size: 8px;
              line-height: 0;
              position: relative;
              vertical-align: baseline;
            }

            .markdown-body sub {
              bottom: -4px;
            }

            .markdown-body sup {
              top: -8px;
            }

            .markdown-body img {
              border-style: none;
              max-width: 100%;
              box-sizing: content-box;
              
            }

            .markdown-body code,
            .markdown-body kbd,
            .markdown-body pre,
            .markdown-body samp {
              font-family: monospace;
              font-size: 14px;
            }

            .markdown-body figure {
              margin: 16px 40px;
            }

            .markdown-body hr {
              box-sizing: content-box;
              overflow: hidden;
              background: transparent;
              border-bottom: $mainThemeBorder;
              height: 4px;
              padding: 0;
              margin: 24px 0;
              background-color: $secondaryThemeColor;
              border: 0;
            }

            .markdown-body [type=button],
            .markdown-body [type=reset],
            .markdown-body [type=submit] {
              -webkit-appearance: button;
            }

            .markdown-body a:hover {
              text-decoration: underline;
            }

            .markdown-body hr::before {
              display: table;
              content: '';
            }

            .markdown-body hr::after {
              display: table;
              clear: both;
              content: '';
            }

            .markdown-body table {
              border-spacing: 0;
              border-collapse: collapse;
              display: block;
              width: max-content;
              max-width: 100%;
              overflow: auto;
            }

            .markdown-body td,
            .markdown-body th {
              padding: 0;
            }

            .markdown-body details summary {
              cursor: pointer;
            }

            .markdown-body details:not([open])>*:not(summary) {
              display: none !important;
            }

            .markdown-body h1,
            .markdown-body h2,
            .markdown-body h3,
            .markdown-body h4,
            .markdown-body h5,
            .markdown-body h6 {
              margin-top: 24px;
              margin-bottom: 16px;
              font-weight: 600;
              line-height: 1.25;
            }

            .markdown-body h2 {
              font-weight: 600;
              padding-bottom: 5px;
              font-size: 24px;
              border-bottom: $mainThemeBorder;
            }

            .markdown-body h3 {
              font-weight: 600;
              font-size: 20px;
            }

            .markdown-body h4 {
              font-weight: 600;
              font-size: 16px;
            }

            .markdown-body h5 {
              font-weight: 600;
              font-size: 14px;
            }

            .markdown-body h6 {
              font-weight: 600;
              font-size: 14px;
              color: $tertiaryThemeFontColor;
            }

            .markdown-body p {
              margin-top: 0;
              margin-bottom: 10px;
            }

            .markdown-body blockquote {
              margin: 0;
              padding: 0 16px;
              color: $tertiaryThemeFontColor;
              border-left: 4px solid $secondaryThemeColor;
            }

            .markdown-body ul,
            .markdown-body ol {
              margin-top: 0;
              margin-bottom: 0;
              padding-left: 32px;
            }

            .markdown-body ol ol,
            .markdown-body ul ol {
              list-style-type: lower-roman;
            }

            .markdown-body ul ul ol,
            .markdown-body ul ol ol,
            .markdown-body ol ul ol,
            .markdown-body ol ol ol {
              list-style-type: lower-alpha;
            }

            .markdown-body dd {
              margin-left: 0;
            }

            .markdown-body code,
            .markdown-body samp {
              font-family: ui-monospace,SFMono-Regular,SF Mono,Menlo,Consolas,Liberation Mono,monospace;
              font-size: 12px;
            }

            .markdown-body pre {
              margin-top: 0;
              margin-bottom: 0;
              font-family: ui-monospace,SFMono-Regular,SF Mono,Menlo,Consolas,Liberation Mono,monospace;
              font-size: 12px;
              word-wrap: normal;
            }

            .markdown-body::before {
              display: table;
              content: '';
            }

            .markdown-body::after {
              display: table;
              clear: both;
              content: '';
            }

            .markdown-body>*:first-child {
              margin-top: 0 !important;
            }

            .markdown-body>*:last-child {
              margin-bottom: 0 !important;
            }

            .markdown-body p,
            .markdown-body blockquote,
            .markdown-body ul,
            .markdown-body ol,
            .markdown-body dl,
            .markdown-body table,
            .markdown-body pre,
            .markdown-body details {
              margin-top: 0;
              margin-bottom: 16px;
            }

            .markdown-body blockquote>:first-child {
              margin-top: 0;
            }

            .markdown-body blockquote>:last-child {
              margin-bottom: 0;
            }

            .markdown-body h1 code,
            .markdown-body h2 code,
            .markdown-body h3 code,
            .markdown-body h4 code,
            .markdown-body h5 code,
            .markdown-body h6 code {
              padding: 0 4px;
              font-size: inherit;
            }

            .markdown-body summary h1,
            .markdown-body summary h2,
            .markdown-body summary h3,
            .markdown-body summary h4,
            .markdown-body summary h5,
            .markdown-body summary h6 {
              display: inline-block;
            }


            .markdown-body summary h1,
            .markdown-body summary h2 {
              padding-bottom: 0;
              border-bottom: 0;
            }


            .markdown-body div>ol:not([type]) {
              list-style-type: decimal;
            }

            .markdown-body ul ul,
            .markdown-body ul ol,
            .markdown-body ol ol,
            .markdown-body ol ul {
              margin-top: 0;
              margin-bottom: 0;
            }

            .markdown-body li>p {
              margin-top: 16px;
            }

            .markdown-body li+li {
              margin-top: 4px;
            }

            .markdown-body dl {
              padding: 0;
            }

            .markdown-body dl dt {
              padding: 0;
              margin-top: 16px;
              font-size: 14px;
              font-style: italic;
              font-weight: 600;
            }

            .markdown-body dl dd {
              padding: 0 16px;
              margin-bottom: 16px;
            }

            .markdown-body table th {
              font-weight: 600;
            }

            .markdown-body table th,
            .markdown-body table td {
              padding: 6px 13px;
              border: 1px solid $secondaryThemeColor;
            }

            .markdown-body table td>:last-child {
              margin-bottom: 0;
            }

            .markdown-body table tr {
              border-top: $mainThemeBorder;
            }

            .markdown-body table tr:nth-child(2n) {
              background-color: $tertiaryThemeColor;
            }

            .markdown-body table img {
              background-color: transparent;
            }

            .markdown-body img[align=right] {
              padding-left: 20px;
            }

            .markdown-body img[align=left] {
              padding-right: 20px;
            }

            .markdown-body code {
              padding: 4px 6px;
              margin: 0;
              font-size: 12px;
              white-space: break-spaces;
              background-color: $codeblockBgColor;
              border-radius: 4px;
            }

            .markdown-body code br {
              display: none;
            }

            .markdown-body samp {
              font-size: 12px;
            }

            .markdown-body pre code {
              font-size: 14px;
            }

            .markdown-body pre>code {
              padding: 0;
              margin: 0;
              word-break: normal;
              white-space: pre;
              background: transparent;
              border: 0;
            }

            .markdown-body pre {
              padding: 16px;
              overflow: auto;
              font-size: 12px;
              line-height: 1.45;
              color: $mainFontColor;
              background-color: $tertiaryThemeColor;
              border-radius: 4px;
            }

            .markdown-body pre code{
              display: inline;
              max-width: auto;
              padding: 0;
              margin: 0;
              overflow: visible;
              line-height: inherit;
              word-wrap: normal;
              background-color: $codeblockBgColor;
              border: 0;
            }
        """.trimIndent()
    }

    private fun convertUsingGithubFlavoredMarkdown(markdown: String): String {
        val bodyContents = MarkdownToHtmlConverter(GFMFlavourDescriptor()).convertMarkdownToHtml(markdown)

        return """
            <html>
                <head>
                    <style>
                        ${renderCSSStyles()}
                    </style>
                </head>
                <body class="markdown-body">
                    $bodyContents
                </body>
            </html>
        """.trimIndent()
    }

    private fun buildRootPanel(): JBScrollPane {
        val description = convertUsingGithubFlavoredMarkdown(summary.content)
        val editorPane = JEditorPane().apply {
            contentType = "text/html"
            putClientProperty(JEditorPane.HONOR_DISPLAY_PROPERTIES, true)
            border = BorderFactory.createCompoundBorder(
                BorderFactory.createEmptyBorder(),
                BorderFactory.createEmptyBorder(7, 11, 8, 11)
            )
            isEditable = false
            addHyperlinkListener { he ->
                if (he.eventType == HyperlinkEvent.EventType.ACTIVATED) {
                    BrowserUtil.browse(he.url)
                }
            }
            text = description
        }
        return JBScrollPane(editorPane)
    }

    override fun dispose() {}
    override fun getComponent() = rootPanel
    override fun getPreferredFocusedComponent() = null
    override fun getName() = "CodeModernizerSummary"
    override fun getFile(): VirtualFile = virtualFile
    override fun setState(state: FileEditorState) {}
    override fun isModified() = false
    override fun isValid() = true
    override fun addPropertyChangeListener(listener: PropertyChangeListener) {}
    override fun removePropertyChangeListener(listener: PropertyChangeListener) {}
}
