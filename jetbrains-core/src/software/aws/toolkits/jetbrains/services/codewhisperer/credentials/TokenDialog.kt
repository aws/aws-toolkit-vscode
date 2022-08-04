// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.credentials

import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.LangDataKeys
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.openapi.fileEditor.TextEditorWithPreview
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogPanel
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBTextField
import com.intellij.ui.layout.panel
import com.intellij.util.ResourceUtil
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import software.amazon.awssdk.services.codewhisperer.model.CodeWhispererException
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.coroutines.disposableCoroutineScope
import software.aws.toolkits.jetbrains.core.coroutines.getCoroutineUiContext
import software.aws.toolkits.jetbrains.core.help.HelpIds
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.resources.message
import java.net.URL
import javax.swing.event.DocumentEvent
import javax.swing.event.DocumentListener

class TokenDialog(private val project: Project) : DialogWrapper(project), Disposable {
    private val myTextField: JBTextField = JBTextField("").also {
        it.document.addDocumentListener(
            object : DocumentListener {
                override fun insertUpdate(e: DocumentEvent?) {
                    initValidation()
                }

                override fun removeUpdate(e: DocumentEvent?) {
                    initValidation()
                }

                override fun changedUpdate(e: DocumentEvent?) {
                    initValidation()
                }
            }
        )
    }
    private val urlLabel: JBLabel = JBLabel(
        message("codewhisperer.explorer.token.request_link")
    ).also { it.setCopyable(true) }

    val panel: DialogPanel = panel {
        row {
            label(message("codewhisperer.explorer.token.input_prompt"))
        }
        row {
            component(myTextField)
                .focused()
        }
        row {
            component(urlLabel)
        }
    }

    init {
        title = message("codewhisperer.explorer.token.dialog_title")
        setOKButtonText(message("codewhisperer.explorer.token.dialog_enter"))
        init()
    }

    override fun createCenterPanel() = panel

    override fun doCancelAction() {
        super.doCancelAction()
    }

    override fun continuousValidation() = false

    override fun doOKAction() {
        if (!okAction.isEnabled) return

        setOKButtonText(message("feedback.submitting"))
        isOKActionEnabled = false
        disposableCoroutineScope(this).launch {
            val edtContext = getCoroutineUiContext()
            val identityToken = myTextField.text
            try {
                CodeWhispererExplorerActionManager.getInstance().getNewAccessTokenAndPersist(identityToken)
                withContext(edtContext) {
                    if (!isActive) return@withContext

                    close(OK_EXIT_CODE)
                    CodeWhispererExplorerActionManager.getInstance().refreshCodeWhispererNode(project)
                    notifyInfo("Amazon CodeWhisperer", message("codewhisperer.explorer.token.success"), project)

                    // Modal change
                    ApplicationManager.getApplication().invokeLater {
                        CodeWhispererExplorerActionManager.getInstance().enableCodeWhisperer(project)
                    }
                    showBetaLandingPage()
                }
            } catch (e: CodeWhispererException) {
                LOGGER.debug { e.message.toString() }
                withContext(edtContext) {
                    val errorMessage: String = e.awsErrorDetails().errorMessage()
                        ?: message("codewhisperer.explorer.token.error.fall_back")
                    setErrorInfoAll(listOf(ValidationInfo(errorMessage, myTextField)))
                    setOKButtonText(message("codewhisperer.explorer.token.dialog_enter"))
                    isOKActionEnabled = true
                }
            } catch (e: Exception) {
                LOGGER.debug { "Unexpected error happened when getting the token. ${e.message}" }
                withContext(edtContext) {
                    setErrorInfoAll(listOf(ValidationInfo(message("codewhisperer.explorer.token.unknown_error"), myTextField)))
                    setOKButtonText(message("codewhisperer.explorer.token.dialog_enter"))
                    isOKActionEnabled = true
                }
            }
        }
    }

    override fun getHelpId(): String = HelpIds.CODEWHISPERER_TOKEN.id

    override fun dispose() {
        super.dispose()
    }

    private fun showBetaLandingPage() {
        val url: URL = ResourceUtil.getResource(javaClass.classLoader, "codewhisperer", "WelcomeToCodeWhisperer.md")
        VfsUtil.findFileByURL(url)?.let { readme ->
            readme.putUserData(TextEditorWithPreview.DEFAULT_LAYOUT_FOR_FILE, TextEditorWithPreview.Layout.SHOW_PREVIEW)

            val fileEditorManager = FileEditorManager.getInstance(project)
            ApplicationManager.getApplication().invokeLater {
                val editor = fileEditorManager.openTextEditor(OpenFileDescriptor(project, readme), true)
                if (editor == null) {
                    LOGGER.warn { "Failed to open WelcomeToCodeWhisperer.md" }
                }
            }
        }
    }

    companion object {
        private val LOGGER = getLogger<TokenDialog>()
    }
}

class ShowTokenDialogAction : AnAction() {
    override fun update(e: AnActionEvent) {
        e.presentation.isEnabled = e.project != null
    }

    override fun actionPerformed(e: AnActionEvent) {
        TokenDialog(e.getRequiredData(LangDataKeys.PROJECT)).showAndGet()
    }
}
