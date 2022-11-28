// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.Disposable
import com.intellij.openapi.progress.ProcessCanceledException
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogPanel
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.Messages
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
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.core.coroutines.getCoroutineUiContext
import software.aws.toolkits.jetbrains.core.coroutines.projectCoroutineScope
import software.aws.toolkits.jetbrains.core.credentials.sono.ALL_AVAILABLE_SCOPES
import software.aws.toolkits.jetbrains.core.credentials.sono.ALL_SSO_SCOPES
import software.aws.toolkits.jetbrains.core.credentials.sono.SONO_URL
import software.aws.toolkits.jetbrains.core.help.HelpIds
import software.aws.toolkits.resources.message
import javax.swing.JComponent

class ToolkitAddConnectionDialog(private val project: Project, connection: ToolkitConnection? = null) : DialogWrapper(project), Disposable {
    // TODO: update fields
    private class Modal {
        // Default option AWS Builder ID to be selected
        var loginType: LoginOptions = LoginOptions.AWS_BUILDER_ID
        var startUrl: String = ""
        var secretAccessKey: String = ""
        var accessKeyID: String = ""
        var secretAccessKey2: String = ""
    }

    private enum class LoginOptions {
        AWS_BUILDER_ID,
        SSO,
        IAM
    }

    private var modal = Modal()

    private val panel: DialogPanel by lazy { createPanel() }

    init {
        title = message("toolkit.login.dialog.title")
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

    override fun getHelpId(): String = HelpIds.TOOLKIT_ADD_CONNECTIONS_DIALOG.id

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
            }
        }
    }

    override fun dispose() {
        super.dispose()
    }

    private fun createPanel() = panel {
        row {
            label(message("toolkit.login.dialog.label"))
                .bold()
        }

        buttonsGroup {
            // AWS Builder ID
            lateinit var ssoCheckBox: Cell<JBRadioButton>
            row {
                radioButton(message("toolkit.login.dialog.aws_builder_id.title"), LoginOptions.AWS_BUILDER_ID)
                    .comment(
                        message("toolkit.login.dialog.aws_builder_id.comment"),
                        commentMaxLength
                    )
            }

            // SSO
            row {
                ssoCheckBox = radioButton(message("toolkit.login.dialog.sso.title"), LoginOptions.SSO)
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
                    .enabledIf(ssoCheckBox.selected)
                    .layout(RowLayout.INDEPENDENT)
            }

            // IAM
            lateinit var iamCheckBox: Cell<JBRadioButton>
            row {
                iamCheckBox = radioButton(message("toolkit.login.dialog.iam.title"), LoginOptions.IAM)
                    .enabled(false)
                    .comment(
                        message("toolkit.login.dialog.iam.comment"),
                        commentMaxLength
                    ) {
                        // TODO: update this action and enable IAM button
                        Messages.showMessageDialog("${it.description} is clicked", "Message", null)
                    }
            }.topGap(TopGap.MEDIUM)

            // TODO: update these field name
            indent {
                row(message("toolkit.login.dialog.iam.text_field.secret_access_key")) {
                    textField()
                        .columns(COLUMNS_MEDIUM)
                        .bindText(modal::secretAccessKey)
                }.enabledIf(iamCheckBox.selected)

                row(message("toolkit.login.dialog.iam.text_field.access_key_id")) {
                    textField()
                        .columns(COLUMNS_MEDIUM)
                        .bindText(modal::accessKeyID)
                }.enabledIf(iamCheckBox.selected)

                // TODO: confirm what's this field in the mock?
                row(message("toolkit.login.dialog.iam.text_field.secret_access_key")) {
                    textField()
                        .columns(COLUMNS_MEDIUM)
                        .bindText(modal::secretAccessKey2)
                }.enabledIf(iamCheckBox.selected)
            }
        }.bind(modal::loginType)

        separator().topGap(TopGap.MEDIUM)
    }

    private companion object {
        private val LOG = getLogger<ToolkitAddConnectionDialog>()
        const val commentMaxLength = 85
    }
}
