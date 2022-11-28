// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.credentials

import com.intellij.openapi.Disposable
import com.intellij.openapi.progress.ProcessCanceledException
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogPanel
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.ui.components.JBRadioButton
import com.intellij.ui.dsl.builder.COLUMNS_MEDIUM
import com.intellij.ui.dsl.builder.Cell
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
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.core.coroutines.getCoroutineUiContext
import software.aws.toolkits.jetbrains.core.coroutines.projectCoroutineScope
import software.aws.toolkits.jetbrains.core.credentials.loginSso
import software.aws.toolkits.jetbrains.core.credentials.sono.ALL_AVAILABLE_SCOPES
import software.aws.toolkits.jetbrains.core.credentials.sono.ALL_SSO_SCOPES
import software.aws.toolkits.jetbrains.core.credentials.sono.SONO_URL
import software.aws.toolkits.jetbrains.core.help.HelpIds
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.UiTelemetry
import javax.swing.JComponent

class CodeWhispererLoginDialog(private val project: Project) : DialogWrapper(project), Disposable {
    private class Modal {
        // Default user option to Sono, radio button has to be selected
        var loginType: CodeWhispererLoginType = CodeWhispererLoginType.Sono
        var startUrl: String = ""
    }

    private var modal = Modal()

    private val panel: DialogPanel by lazy { createPanel() }

    init {
        title = message("codewhisperer.credential.login.dialog.title")
        setOKButtonText(message("toolkit.login.dialog.connect_button"))
        init()
    }

    override fun getHelpId() = HelpIds.CODEWHISPERER_LOGIN_DIALOG.id

    override fun createCenterPanel(): JComponent? = panel

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
        setOKButtonText(message("toolkit.login.dialog.connect_inprogress"))
        isOKActionEnabled = false

        // apply binding value
        this.panel.apply()
        val loginType = modal.loginType
        val startUrl = if (loginType == CodeWhispererLoginType.Sono) SONO_URL else modal.startUrl

        // TODO: is coroutine here ok?
        projectCoroutineScope(project).launch {
            try {
                if (loginType == CodeWhispererLoginType.Logout || loginType == CodeWhispererLoginType.Accountless) error("Should never be here")

                // TODO: which type of exception we wanna throw here? InvalidStateException, InvalidInputException, ...
                // Handle edge case when user choose SSO
                if (loginType == CodeWhispererLoginType.SSO && startUrl == SONO_URL) {
                    error("User should not be do SSO login with AWS Builder ID url")
                }

                val scopes = if (loginType == CodeWhispererLoginType.Sono) {
                    ALL_AVAILABLE_SCOPES
                } else {
                    ALL_SSO_SCOPES
                }

                loginSso(project, startUrl, scopes)

                withContext(getCoroutineUiContext()) {
                    close(OK_EXIT_CODE)
                }
            } catch (e: ProcessCanceledException) {
                LOG.debug(e) { "${e.message}" }
                setErrorText(message("codewhisperer.credential.login.dialog.exception.cancel_login"))
            } catch (e: InvalidGrantException) {
                LOG.debug(e) { "${e.message}" }
                setErrorText(message("codewhisperer.credential.login.exception.invalid_grant"))
            } catch (e: InvalidRequestException) {
                LOG.debug(e) { "${e.message}" }
                setErrorText(message("codewhisperer.credential.login.exception.invalid_input"))
            } catch (e: SsoOidcException) {
                LOG.debug(e) { "${e.message}" }
                setErrorText(message("codewhisperer.credential.login.exception.general.oidc"))
            } catch (e: Exception) {
                LOG.error(e) { "${e.message}" }
                setErrorText(message("codewhisperer.credential.login.exception.general"))
            } finally {
                setOKButtonText(message("codewhisperer.credential.login.dialog.ok_button"))
                isOKActionEnabled = true

                val credType = when (loginType) {
                    CodeWhispererLoginType.Sono -> "connection_optionBuilderID"
                    CodeWhispererLoginType.SSO -> "connection_optionSSO"
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
            label(message("codewhisperer.credential.login.dialog.prompt"))
                .bold()
        }

        buttonsGroup {
            // AWS Builder ID
            row {
                radioButton(message("toolkit.login.dialog.aws_builder_id.title"), CodeWhispererLoginType.Sono)
                    .comment(
                        message("toolkit.login.dialog.aws_builder_id.comment"),
                        commentMaxLength
                    )
            }

            // SSO
            lateinit var ssoCheckBox: Cell<JBRadioButton>
            row {
                ssoCheckBox = radioButton(message("toolkit.login.dialog.sso.title"), CodeWhispererLoginType.SSO)
                    .comment(
                        message("toolkit.login.dialog.sso.comment"),
                        commentMaxLength
                    )
            }.topGap(TopGap.MEDIUM)

            indent {
                row(message("toolkit.login.dialog.sso.text_field.start_url")) {
                    textField()
                        .columns(COLUMNS_MEDIUM)
                        .bindText(modal::startUrl)
                }.enabledIf(ssoCheckBox.selected)
            }

            // IAM
            row {
                radioButton(message("toolkit.login.dialog.iam.title"), CodeWhispererLoginType.Logout)
                    .enabled(false)
                    .comment(
                        message("codewhisperer.credential.login.dialog.iam.description"),
                        commentMaxLength
                    )
            }.topGap(TopGap.MEDIUM)
        }.bind(modal::loginType)

        separator().topGap(TopGap.MEDIUM)
    }

    private companion object {
        val LOG = getLogger<CodeWhispererLoginDialog>()
        const val commentMaxLength = 85
    }
}
