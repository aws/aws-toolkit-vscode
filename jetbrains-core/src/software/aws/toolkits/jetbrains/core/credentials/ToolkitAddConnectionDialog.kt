// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DataContext
import com.intellij.openapi.actionSystem.PlatformDataKeys
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.progress.ProcessCanceledException
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogPanel
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.ui.CollectionComboBoxModel
import com.intellij.ui.components.JBRadioButton
import com.intellij.ui.dsl.builder.COLUMNS_MEDIUM
import com.intellij.ui.dsl.builder.Cell
import com.intellij.ui.dsl.builder.RowLayout
import com.intellij.ui.dsl.builder.TopGap
import com.intellij.ui.dsl.builder.bind
import com.intellij.ui.dsl.builder.bindItem
import com.intellij.ui.dsl.builder.bindText
import com.intellij.ui.dsl.builder.columns
import com.intellij.ui.dsl.builder.panel
import com.intellij.ui.dsl.builder.selected
import com.intellij.ui.dsl.builder.toNullableProperty
import com.intellij.util.containers.nullize
import software.amazon.awssdk.services.ssooidc.model.InvalidGrantException
import software.amazon.awssdk.services.ssooidc.model.InvalidRequestException
import software.amazon.awssdk.services.ssooidc.model.SsoOidcException
import software.aws.toolkits.core.credentials.DEFAULT_SSO_REGION
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.ToolkitPlaces
import software.aws.toolkits.jetbrains.core.credentials.sono.SONO_URL
import software.aws.toolkits.jetbrains.core.help.HelpIds
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.jetbrains.utils.runUnderProgressIfNeeded
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.UiTelemetry
import java.io.IOException
import javax.swing.JComponent

data class ConnectionDialogCustomizer(
    val title: String? = null,
    val header: String? = null,
    val helpId: HelpIds? = null,
    val replaceIamComment: String? = null,
    val scopes: List<String>? = null,
    val startUrl: String? = null,
    val region: String? = null,
    val errorMsg: String? = null
)

open class ToolkitAddConnectionDialog(
    private val project: Project,
    private val customizer: ConnectionDialogCustomizer? = null,
) : DialogWrapper(project), Disposable {
    private data class Modal(
        var loginType: LoginOptions,
        var startUrl: String,
        var region: String
    ) {
        constructor() : this(LoginOptions.AWS_BUILDER_ID, SONO_URL, DEFAULT_SSO_REGION)
    }

    private enum class LoginOptions {
        AWS_BUILDER_ID,
        SSO,
        IAM
    }

    private var modal: Modal = Modal()
    private val panel: DialogPanel by lazy { createPanel() }
    private val regions = AwsRegionProvider.getInstance().allRegions().values.filter { it.partitionId == "aws" }.map { it.id }

    constructor(project: Project, connection: ToolkitConnection? = null, customizer: ConnectionDialogCustomizer?) : this(project, customizer) {
        // Fill in login metadata for users to reauthenticate
        connection?.let {
            if (it is ManagedBearerSsoConnection) {
                when (it.startUrl) {
                    SONO_URL -> run { modal.loginType = LoginOptions.AWS_BUILDER_ID }
                    else -> run {
                        modal.loginType = LoginOptions.SSO
                        modal.region = it.region
                        modal.startUrl = it.startUrl
                    }
                }
            }
        }
    }

    init {
        title = customizer?.title ?: message("toolkit.login.dialog.title")
        setOKButtonText(message("toolkit.login.dialog.connect_button"))

        modal.apply {
            this.startUrl = customizer?.startUrl.orEmpty()
            this.region = customizer?.region ?: DEFAULT_SSO_REGION
            this.loginType = if (startUrl.isEmpty()) LoginOptions.AWS_BUILDER_ID else LoginOptions.SSO
        }

        init()
        // this must happen after init()
        customizer?.errorMsg?.let { setErrorText(it) }
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

        val loginType = modal.loginType
        val startUrl = if (loginType == LoginOptions.AWS_BUILDER_ID) SONO_URL else modal.startUrl
        val region = modal.region
        val progressIndicatorTitle = when (loginType) {
            LoginOptions.AWS_BUILDER_ID -> "AWS Builder ID"
            LoginOptions.SSO -> "IAM Identity Center"
            else -> error("User should not be able to choose option other than above ")
        }

        try {
            close(OK_EXIT_CODE)
            runUnderProgressIfNeeded(project, "Login: $progressIndicatorTitle", true) {
                // Edge case when user choose SSO but enter AWS Builder ID url
                if (loginType == LoginOptions.SSO && startUrl == SONO_URL) {
                    error("User should not perform Identity Center login with AWS Builder ID url")
                }

                val scopes = customizer?.scopes?.nullize() ?: listOf("sso:account:access")

                LOG.info { "Try to fetch credential with: $modal" }

                loginSso(project, startUrl, region, scopes)
            }
        } catch (e: Exception) {
            val message = when (e) {
                is IllegalStateException -> e.message ?: message("general.unknown_error")
                is ProcessCanceledException -> message("codewhisperer.credential.login.dialog.exception.cancel_login")
                is InvalidGrantException -> message("codewhisperer.credential.login.exception.invalid_grant")
                is InvalidRequestException -> message("codewhisperer.credential.login.exception.invalid_input")
                is SsoOidcException -> message("codewhisperer.credential.login.exception.general.oidc")
                else -> {
                    val baseMessage = when (e) {
                        is IOException -> "codewhisperer.credential.login.exception.io"
                        else -> "codewhisperer.credential.login.exception.general"
                    }

                    message(baseMessage, "${e.javaClass.name}: ${e.message}")
                }
            }

            LOG.warn(e) { "Failed to fetch credential with: $modal; reason: $message" }

            runInEdt(ModalityState.any()) {
                ToolkitAddConnectionDialog(
                    project,
                    (customizer ?: ConnectionDialogCustomizer()).copy(
                        startUrl = if (startUrl == SONO_URL) "" else startUrl, // TODO: fix this, ugly
                        region = region,
                        errorMsg = message
                    )
                ).showAndGet()
            }
        } finally {
            val credType = when (loginType) {
                LoginOptions.AWS_BUILDER_ID -> "connection_optionBuilderID"
                LoginOptions.SSO -> "connection_optionSSO"
                else -> null
            }

            credType?.let { UiTelemetry.click(project, it) }
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
                row {
                    panel {
                        row {
                            label(message("toolkit.login.dialog.sso.text_field.start_url"))
                        }
                        row {
                            textField().apply {
                                columns(COLUMNS_MEDIUM)
                                bindText(modal::startUrl)
                            }
                        }
                            .enabledIf(ssoRadioButton.selected)
                            .layout(RowLayout.INDEPENDENT)
                    }

                    panel {
                        row(message("toolkit.login.dialog.sso.text_field.region")) {}
                        row {
                            comboBox(CollectionComboBoxModel(regions, DEFAULT_SSO_REGION))
                                .bindItem(modal::region.toNullableProperty())
                        }
                            .enabledIf(ssoRadioButton.selected)
                            .layout(RowLayout.INDEPENDENT)
                    }
                }
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
