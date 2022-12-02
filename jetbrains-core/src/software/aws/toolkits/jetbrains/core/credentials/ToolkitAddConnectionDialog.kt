// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DataContext
import com.intellij.openapi.actionSystem.PlatformDataKeys
import com.intellij.openapi.progress.ProcessCanceledException
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogPanel
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.ui.components.JBRadioButton
import com.intellij.ui.dsl.builder.COLUMNS_MEDIUM
import com.intellij.ui.dsl.builder.Cell
import com.intellij.ui.dsl.builder.RowLayout
import com.intellij.ui.dsl.builder.TopGap
import com.intellij.ui.dsl.builder.bind
import com.intellij.ui.dsl.builder.bindText
import com.intellij.ui.dsl.builder.columns
import com.intellij.ui.dsl.builder.panel
import com.intellij.ui.dsl.builder.selected
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import software.amazon.awssdk.services.ssooidc.model.InvalidGrantException
import software.amazon.awssdk.services.ssooidc.model.InvalidRequestException
import software.amazon.awssdk.services.ssooidc.model.SsoOidcException
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.ToolkitPlaces
import software.aws.toolkits.jetbrains.core.coroutines.getCoroutineUiContext
import software.aws.toolkits.jetbrains.core.coroutines.projectCoroutineScope
import software.aws.toolkits.jetbrains.core.credentials.sono.ALL_SONO_SCOPES
import software.aws.toolkits.jetbrains.core.credentials.sono.ALL_SSO_SCOPES
import software.aws.toolkits.jetbrains.core.credentials.sono.SONO_URL
import software.aws.toolkits.jetbrains.core.help.HelpIds
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.UiTelemetry
import javax.swing.JComponent

data class ConnectionDialogCustomizer(
    val title: String? = null,
    val header: String? = null,
    val helpId: HelpIds? = null,
    val replaceIamComment: String? = null,
)

open class ToolkitAddConnectionDialog(
    private val project: Project,
    connection: ToolkitConnection? = null,
    private val customizer: ConnectionDialogCustomizer? = null
) : DialogWrapper(project), Disposable {
    // TODO: update fields
    private class Modal {
        // Default option AWS Builder ID to be selected
        var loginType: LoginOptions = LoginOptions.AWS_BUILDER_ID
        var startUrl: String = ""
    }

    private enum class LoginOptions {
        AWS_BUILDER_ID,
        SSO,
        IAM
    }

    private var modal = Modal()

    private val panel: DialogPanel by lazy { createPanel() }

    init {
        title = customizer?.title ?: message("toolkit.login.dialog.title")
        setOKButtonText(message("toolkit.login.dialog.connect_button"))

        // Fill in login metadata for users to reauthenticate
        connection?.let {
            if (it is ManagedBearerSsoConnection) {
                when (it.startUrl) {
                    SONO_URL -> run { modal.loginType = LoginOptions.AWS_BUILDER_ID }
                    else -> run {
                        modal.loginType = LoginOptions.SSO
                        modal.startUrl = it.startUrl
                    }
                }
            }
        }
        init()
    }

    override fun createCenterPanel(): JComponent = panel

    override fun getHelpId(): String = (customizer?.helpId ?: HelpIds.TOOLKIT_ADD_CONNECTIONS_DIALOG).id

    override fun doHelpAction() {
        UiTelemetry.click(project, "connection_help")
        super.doHelpAction()
    }

    override fun doCancelAction() {
        UiTelemetry.click(project, "connection_optionescapecancel")
        super.doCancelAction()
    }

    override fun doOKAction() {
        if (!isOKActionEnabled) {
            return
        }
        this.panel.apply()
        setOKButtonText(message("toolkit.login.dialog.connect_inprogress"))
        isOKActionEnabled = false

        val loginType = modal.loginType
        val startUrl = if (loginType == LoginOptions.AWS_BUILDER_ID) SONO_URL else modal.startUrl

        projectCoroutineScope(project).launch {
            try {
                // Edge case when user choose SSO but enter AWS Builder ID url
                if (loginType == LoginOptions.SSO && startUrl == SONO_URL) {
                    error("User should not do SSO login with AWS Builder ID url")
                }

                val scopes = if (loginType == LoginOptions.AWS_BUILDER_ID) {
                    ALL_SONO_SCOPES
                } else {
                    ALL_SSO_SCOPES
                }

                loginSso(project, startUrl, scopes)

                withContext(getCoroutineUiContext()) {
                    close(OK_EXIT_CODE)
                }
            } catch (e: Exception) {
                val message = when (e) {
                    is ProcessCanceledException -> message("codewhisperer.credential.login.dialog.exception.cancel_login")
                    is InvalidGrantException -> message("codewhisperer.credential.login.exception.invalid_grant")
                    is InvalidRequestException -> message("codewhisperer.credential.login.exception.invalid_input")
                    is SsoOidcException -> message("codewhisperer.credential.login.exception.general.oidc")
                    else -> message("codewhisperer.credential.login.exception.general")
                }
                LOG.warn(e) { message }
                setErrorText(message)
            } finally {
                setOKButtonText(message("codewhisperer.credential.login.dialog.ok_button"))
                isOKActionEnabled = true

                val credType = when (loginType) {
                    LoginOptions.AWS_BUILDER_ID -> "connection_optionBuilderID"
                    LoginOptions.SSO -> "connection_optionSSO"
                    else -> null
                }

                credType?.let { UiTelemetry.click(project, it) }
            }
        }
    }

    override fun dispose() {
        super.dispose()
    }

    private fun createPanel() = panel {
        row {
            label(customizer?.header ?: message("toolkit.login.dialog.label"))
                .bold()
        }

        buttonsGroup {
            // AWS Builder ID
            row {
                radioButton(message("toolkit.login.dialog.aws_builder_id.title"), LoginOptions.AWS_BUILDER_ID)
                    .comment(
                        message("toolkit.login.dialog.aws_builder_id.comment"),
                        commentMaxLength
                    )
            }

            // SSO
            lateinit var ssoRadioButton: Cell<JBRadioButton>
            row {
                ssoRadioButton = radioButton(message("toolkit.login.dialog.sso.title"), LoginOptions.SSO)
                    .comment(
                        message("toolkit.login.dialog.sso.comment"),
                        commentMaxLength
                    )
            }.topGap(TopGap.MEDIUM)

            indent {
                row(message("toolkit.login.dialog.sso.text_field.start_url")) {
                    textField().apply {
                        columns(COLUMNS_MEDIUM)
                        bindText(modal::startUrl)
                    }
                }
                    .enabledIf(ssoRadioButton.selected)
                    .layout(RowLayout.INDEPENDENT)
            }

            // IAM
            row {
                radioButton(message("toolkit.login.dialog.iam.title"), LoginOptions.IAM)
                    .enabled(false)
                    .comment(
                        customizer?.replaceIamComment ?: "<a>${message("configure.toolkit.upsert_credentials.action")}</a>",
                        commentMaxLength
                    ) { hyperlinkEvent ->
                        close(OK_EXIT_CODE)
                        val actionEvent = AnActionEvent.createFromInputEvent(
                            hyperlinkEvent.inputEvent,
                            ToolkitPlaces.ADD_CONNECTION_DIALOG,
                            null,
                            DataContext { if (PlatformDataKeys.PROJECT.`is`(it)) project else null }
                        )
                        ActionManager.getInstance().getAction("aws.settings.upsertCredentials").actionPerformed(actionEvent)
                    }
            }.topGap(TopGap.MEDIUM)
        }.bind(modal::loginType)

        separator().topGap(TopGap.MEDIUM)
    }

    private companion object {
        private val LOG = getLogger<ToolkitAddConnectionDialog>()
        const val commentMaxLength = 85
    }
}
