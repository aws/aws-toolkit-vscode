// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.codescan.listeners

import com.intellij.icons.AllIcons
import com.intellij.ide.BrowserUtil
import com.intellij.ide.ui.laf.darcula.ui.DarculaButtonUI
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.actionSystem.DataKey
import com.intellij.openapi.actionSystem.impl.SimpleDataContext
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.editor.event.EditorMouseEvent
import com.intellij.openapi.editor.event.EditorMouseEventArea
import com.intellij.openapi.editor.event.EditorMouseMotionListener
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.popup.JBPopup
import com.intellij.openapi.ui.popup.JBPopupFactory
import com.intellij.psi.PsiDocumentManager
import com.intellij.ui.JBColor
import com.intellij.ui.awt.RelativePoint
import com.intellij.ui.components.JBScrollPane
import com.intellij.util.TimeoutUtil.sleep
import icons.AwsIcons
import software.amazon.awssdk.services.codewhispererruntime.model.CodeWhispererRuntimeException
import software.aws.toolkits.core.utils.convertMarkdownToHTML
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.ToolkitPlaces
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.CodeWhispererCodeScanIssue
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.CodeWhispererCodeScanManager
import software.aws.toolkits.jetbrains.services.codewhisperer.credentials.CodeWhispererClientAdaptor
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager
import software.aws.toolkits.jetbrains.services.codewhisperer.language.CodeWhispererProgrammingLanguage
import software.aws.toolkits.jetbrains.services.codewhisperer.language.programmingLanguage
import software.aws.toolkits.jetbrains.services.codewhisperer.telemetry.CodeWhispererTelemetryService
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererColorUtil.getHexString
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.CODE_SCAN_ISSUE_POPUP_DELAY_IN_SECONDS
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.CODE_SCAN_ISSUE_TITLE_MAX_LENGTH
import software.aws.toolkits.jetbrains.services.codewhisperer.util.runIfIdcConnectionOrTelemetryEnabled
import software.aws.toolkits.jetbrains.utils.applyPatch
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.Result
import java.awt.Dimension
import javax.swing.BorderFactory
import javax.swing.Box
import javax.swing.BoxLayout
import javax.swing.Icon
import javax.swing.JButton
import javax.swing.JEditorPane
import javax.swing.JLabel
import javax.swing.JPanel
import javax.swing.ScrollPaneConstants
import javax.swing.event.HyperlinkEvent
import javax.swing.text.html.HTMLEditorKit

class CodeWhispererCodeScanEditorMouseMotionListener(private val project: Project) : EditorMouseMotionListener {
    /**
     * Current context for popup is still being shown.
     */
    private var currentPopupContext: ScanIssuePopupContext? = null

    private val codeBlockBackgroundColor = JBColor.namedColor("Editor.background", JBColor(0xf7f8fa, 0x2b2d30))
    private val codeBlockForegroundColor = JBColor.namedColor("Editor.foreground", JBColor(0x808080, 0xdfe1e5))
    private val codeBlockBorderColor = JBColor.namedColor("borderColor", JBColor(0xebecf0, 0x1e1f22))
    private val deletionBackgroundColor = JBColor.namedColor("FileColor.Rose", JBColor(0xf5c2c2, 0x511e1e))
    private val deletionForegroundColor = JBColor.namedColor("Label.errorForeground", JBColor(0xb63e3e, 0xfc6479))
    private val additionBackgroundColor = JBColor.namedColor("FileColor.Green", JBColor(0xdde9c1, 0x394323))
    private val additionForegroundColor = JBColor.namedColor("Label.successForeground", JBColor(0x42a174, 0xacc49e))
    private val metaBackgroundColor = JBColor.namedColor("FileColor.Blue", JBColor(0xeaf6ff, 0x4f556b))
    private val metaForegroundColor = JBColor.namedColor("Label.infoForeground", JBColor(0x808080, 0x8C8C8C))

    private fun hidePopup() {
        currentPopupContext?.popup?.cancel()
        currentPopupContext = null
    }
    private val issueDataKey = DataKey.create<MutableMap<String, String>>("amazonq.codescan.explainissue")

    private fun getHtml(issue: CodeWhispererCodeScanIssue): String {
        val isFixAvailable = issue.suggestedFixes.isNotEmpty()

        val cweLinks = if (issue.relatedVulnerabilities.isNotEmpty()) {
            issue.relatedVulnerabilities.joinToString(", ") { cwe ->
                "<a href=\"https://cwe.mitre.org/data/definitions/${cwe.split("-").last()}.html\">$cwe</a>"
            }
        } else {
            "-"
        }

        val detectorLibraryLink = "<a href=\"https://docs.aws.amazon.com/codeguru/detector-library/${
            issue.detectorId.split("@").first()
        }\">${issue.detectorName}</a>"

        val detectorSection = """
            <br />
            <hr />
            <table>
                <thead>
                    <tr>
                        <th>${message("codewhisperer.codescan.cwe_label")}</th>
                        <th>${message("codewhisperer.codescan.fix_available_label")}</th>
                        <th>${message("codewhisperer.codescan.detector_library_label")}</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>$cweLinks</td>
                        <td>${if (isFixAvailable) "<span style=\"color:${additionForegroundColor.getHexString()};\">Yes</span>" else "<span style=\"color:${deletionForegroundColor.getHexString()};\">No</span>"}</td>
                        <td>$detectorLibraryLink</td>
                    </tr>
                </tbody>
            </table>
        """.trimIndent()

        // add a link sections
        val explainButton = "<a href=\"amazonq://issue/explain-${issue.title}\" style=\"font-size: 120%\">${message(
            "codewhisperer.codescan.explain_button_label"
        )}</a>"
        val linksSection = """
        <br />
        &nbsp;&bull;$explainButton
        <br />
        """.trimIndent()

        val suggestedFixSection = if (isFixAvailable) {
            val isFixDescriptionAvailable = issue.suggestedFixes[0].description.isNotBlank() &&
                issue.suggestedFixes[0].description.trim() != "Suggested remediation:"
            """
            |<hr />
            |<br />
            |
            |## ${message("codewhisperer.codescan.suggested_fix_label")}
            |
            |```diff
            |${issue.suggestedFixes[0].code}
            |```
            |
            |${
                if (isFixDescriptionAvailable) {
                    "|### ${
                        message(
                            "codewhisperer.codescan.suggested_fix_description"
                        )
                    }\n${issue.suggestedFixes[0].description}"
                } else {
                    ""
                }
            }
            """.trimMargin()
        } else {
            ""
        }

        return convertMarkdownToHTML(
            """
            |$linksSection
            |
            |${issue.recommendation.text}
            |
            |$detectorSection
            |
            |$suggestedFixSection
            """.trimMargin()
        )
    }

    private fun getSeverityIcon(issue: CodeWhispererCodeScanIssue): Icon? = when (issue.severity) {
        "Info" -> AwsIcons.Resources.CodeWhisperer.SEVERITY_INFO
        "Low" -> AwsIcons.Resources.CodeWhisperer.SEVERITY_LOW
        "Medium" -> AwsIcons.Resources.CodeWhisperer.SEVERITY_MEDIUM
        "High" -> AwsIcons.Resources.CodeWhisperer.SEVERITY_HIGH
        "Critical" -> AwsIcons.Resources.CodeWhisperer.SEVERITY_CRITICAL
        else -> null
    }

    private fun showPopup(issues: List<CodeWhispererCodeScanIssue>, e: EditorMouseEvent, issueIndex: Int = 0) {
        if (issues == null || issues.isEmpty()) {
            LOG.debug {
                "Unable to show popup issue at ${e.logicalPosition} as the issue was null"
            }
            return
        }

        val issue = issues[issueIndex]
        val content = getHtml(issue)
        val kit = HTMLEditorKit()
        kit.styleSheet.apply {
            addRule("h1, h3 { margin-bottom: 0 }")
            addRule("th { text-align: left; }")
            addRule(".code-block { background-color: ${codeBlockBackgroundColor.getHexString()}; border: 1px solid ${codeBlockBorderColor.getHexString()}; }")
            addRule(".code-block pre { margin: 0; }")
            addRule(".code-block div { color: ${codeBlockForegroundColor.getHexString()}; }")
            addRule(
                ".code-block div.deletion { background-color: ${deletionBackgroundColor.getHexString()}; color: ${deletionForegroundColor.getHexString()}; }"
            )
            addRule(
                ".code-block div.addition { background-color: ${additionBackgroundColor.getHexString()}; color: ${additionForegroundColor.getHexString()}; }"
            )
            addRule(".code-block div.meta { background-color: ${metaBackgroundColor.getHexString()}; color: ${metaForegroundColor.getHexString()}; }")
        }
        val doc = kit.createDefaultDocument()
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
                    when {
                        he.description.startsWith("amazonq://issue/explain-") -> {
                            val issueItemMap = mutableMapOf<String, String>()
                            issueItemMap["title"] = issue.title
                            issueItemMap["description"] = issue.description.markdown
                            issueItemMap["code"] = issue.codeText
                            val myDataContext = SimpleDataContext.builder().add(issueDataKey, issueItemMap).add(CommonDataKeys.PROJECT, issue.project).build()
                            val actionEvent = AnActionEvent.createFromInputEvent(
                                he.inputEvent,
                                ToolkitPlaces.EDITOR_PSI_REFERENCE,
                                null,
                                myDataContext
                            )
                            ActionManager.getInstance().getAction("aws.amazonq.explainCodeScanIssue").actionPerformed(actionEvent)
                        }
                        else -> {
                            BrowserUtil.browse(he.url)
                        }
                    }
                    hidePopup()
                }
            }
            editorKit = kit
            document = doc
            text = content
            caretPosition = 0
        }
        val scrollPane = JBScrollPane(editorPane).apply {
            verticalScrollBarPolicy = ScrollPaneConstants.VERTICAL_SCROLLBAR_AS_NEEDED
            horizontalScrollBarPolicy = ScrollPaneConstants.HORIZONTAL_SCROLLBAR_AS_NEEDED
        }
        val label = JLabel(truncateTitle(issue.title)).apply {
            icon = getSeverityIcon(issue)
            horizontalTextPosition = JLabel.LEFT
        }
        val button = JButton(message("codewhisperer.codescan.apply_fix_button_label")).apply {
            toolTipText = message("codewhisperer.codescan.apply_fix_button_tooltip")
            putClientProperty(DarculaButtonUI.DEFAULT_STYLE_KEY, true)
        }
        button.addActionListener {
            handleApplyFix(issue)
            button.isVisible = false
        }
        val nextButton = JButton(AllIcons.Actions.ArrowExpand).apply {
            preferredSize = Dimension(30, this.height)
            addActionListener {
                hidePopup()
                showPopup(issues, e, (issueIndex + 1) % issues.size)
            }
        }
        val prevButton = JButton(AllIcons.Actions.ArrowCollapse).apply {
            preferredSize = Dimension(30, this.height)
            addActionListener {
                hidePopup()
                showPopup(issues, e, (issues.size - (issueIndex + 1)) % issues.size)
            }
        }

        val titlePane = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.X_AXIS)
            preferredSize = Dimension(this.width, 30)
            add(Box.createHorizontalGlue())
            add(label)
            add(Box.createHorizontalGlue())
            if (issues.size > 1) {
                add(prevButton)
                add(JLabel("${issueIndex + 1} of ${issues.size}"))
                add(nextButton)
            }

            if (issue.suggestedFixes.isNotEmpty()) {
                add(button)
            }
        }

        val containerPane = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.PAGE_AXIS)
            add(titlePane)
            add(scrollPane)
            preferredSize = Dimension(650, 350)
        }

        val popup = JBPopupFactory.getInstance().createComponentPopupBuilder(containerPane, null).setFocusable(true).setResizable(true)
            .createPopup()
        // Set the currently shown issue popup context as this issue
        currentPopupContext = ScanIssuePopupContext(issue, popup)

        popup.show(RelativePoint(e.mouseEvent))

        CodeWhispererTelemetryService.getInstance().sendCodeScanIssueHoverEvent(issue)
        sendCodeRemediationTelemetryToServiceApi(
            issue.file.programmingLanguage(),
            "CODESCAN_ISSUE_HOVER",
            issue.detectorId,
            issue.findingId,
            issue.ruleId,
            null,
            null,
            null,
            issue.suggestedFixes.isNotEmpty()
        )
    }

    private fun sendCodeRemediationTelemetryToServiceApi(
        language: CodeWhispererProgrammingLanguage?,
        codeScanRemediationEventType: String?,
        detectorId: String?,
        findingId: String?,
        ruleId: String?,
        component: String?,
        reason: String?,
        result: String?,
        includesFix: Boolean?
    ) {
        runIfIdcConnectionOrTelemetryEnabled(project) {
            ApplicationManager.getApplication().executeOnPooledThread {
                try {
                    val response = CodeWhispererClientAdaptor.getInstance(project)
                        .sendCodeScanRemediationTelemetry(
                            language,
                            codeScanRemediationEventType,
                            detectorId,
                            findingId,
                            ruleId,
                            component,
                            reason,
                            result,
                            includesFix
                        )
                    LOG.debug { "Successfully sent code scan remediation telemetry. RequestId: ${response.responseMetadata().requestId()}" }
                } catch (e: Exception) {
                    val requestId = if (e is CodeWhispererRuntimeException) e.requestId() else null
                    LOG.debug {
                        "Failed to send code scan remediation telemetry. RequestId: $requestId, ErrorMessage: ${e.message}"
                    }
                }
            }
        }
    }

    override fun mouseMoved(e: EditorMouseEvent) {
        val scanManager = CodeWhispererCodeScanManager.getInstance(project)
        if (e.area != EditorMouseEventArea.EDITING_AREA || !e.isOverText) {
            hidePopup()
            return
        }
        val offset = e.offset
        val file = FileDocumentManager.getInstance().getFile(e.editor.document) ?: return
        val issuesInRange = scanManager.getScanNodesInRange(file, offset).map {
            it.userObject as CodeWhispererCodeScanIssue
        }
        if (issuesInRange.isEmpty()) {
            hidePopup()
            return
        }
        if (issuesInRange.contains(currentPopupContext?.issue)) return

        // No popups should be visible at this point.
        hidePopup()
        // Show popup for only the first issue found.
        // Only add popup if the issue is still valid. If the issue has gone stale or invalid because
        // the user has made some edits, we don't need to show the popup for the stale or invalid issues.
        if (!issuesInRange.first().isInvalid) {
            sleep(CODE_SCAN_ISSUE_POPUP_DELAY_IN_SECONDS)
            showPopup(issuesInRange, e)
        }
    }

    private data class ScanIssuePopupContext(val issue: CodeWhispererCodeScanIssue, val popup: JBPopup)

    companion object {
        private val LOG = getLogger<CodeWhispererCodeScanEditorMouseMotionListener>()
    }

    private fun handleApplyFix(issue: CodeWhispererCodeScanIssue) {
        try {
            WriteCommandAction.runWriteCommandAction(issue.project) {
                val document = FileDocumentManager.getInstance().getDocument(issue.file) ?: return@runWriteCommandAction

                val documentContent = document.text
                val updatedContent = applyPatch(issue.suggestedFixes[0].code, documentContent, issue.file.name)
                if (updatedContent == null) {
//                    println(applyPatchToContent(issue.suggestedFixes[0].code, documentContent))
                    throw Error("Patch apply failed.")
                }
                document.replaceString(document.getLineStartOffset(0), document.getLineEndOffset(document.lineCount - 1), updatedContent)
                PsiDocumentManager.getInstance(issue.project).commitDocument(document)
                CodeWhispererTelemetryService.getInstance().sendCodeScanIssueApplyFixEvent(issue, Result.Succeeded)
                hidePopup()
                if (CodeWhispererExplorerActionManager.getInstance().isAutoEnabledForCodeScan()) {
                    CodeWhispererCodeScanManager.getInstance(issue.project).removeIssueByFindingId(issue.file, issue.findingId)
                }
            }
            sendCodeRemediationTelemetryToServiceApi(
                issue.file.programmingLanguage(),
                "CODESCAN_ISSUE_APPLY_FIX",
                issue.detectorId,
                issue.findingId,
                issue.ruleId,
                null,
                null,
                Result.Succeeded.toString(),
                issue.suggestedFixes.isNotEmpty()
            )
        } catch (err: Error) {
            notifyError(message("codewhisperer.codescan.fix_applied_fail", err))
            LOG.error { "Apply fix command failed. $err" }
            CodeWhispererTelemetryService.getInstance().sendCodeScanIssueApplyFixEvent(issue, Result.Failed, err.message)
            sendCodeRemediationTelemetryToServiceApi(
                issue.file.programmingLanguage(),
                "CODESCAN_ISSUE_APPLY_FIX",
                issue.detectorId,
                issue.findingId,
                issue.ruleId,
                null,
                err.message,
                Result.Failed.toString(),
                issue.suggestedFixes.isNotEmpty()
            )
        }
    }

    private fun truncateTitle(title: String): String = title.takeUnless { it.length <= CODE_SCAN_ISSUE_TITLE_MAX_LENGTH }?.let {
        it.substring(0, CODE_SCAN_ISSUE_TITLE_MAX_LENGTH - 3) + "..."
    } ?: title
}
