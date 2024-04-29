// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.gettingstarted.editor

import com.intellij.icons.AllIcons
import com.intellij.ide.ui.laf.darcula.ui.DarculaButtonUI
import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.PlatformDataKeys
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.openapi.project.DefaultProjectFactory
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.MessageDialogBuilder
import com.intellij.openapi.ui.popup.Balloon
import com.intellij.openapi.wm.impl.welcomeScreen.WelcomeScreenUIManager
import com.intellij.ui.GotItTooltip
import com.intellij.ui.IdeBorderFactory
import com.intellij.ui.TitledSeparator
import com.intellij.ui.components.panels.Wrapper
import com.intellij.ui.dsl.builder.AlignX
import com.intellij.ui.dsl.builder.BottomGap
import com.intellij.ui.dsl.builder.IntelliJSpacingConfiguration
import com.intellij.ui.dsl.builder.Panel
import com.intellij.ui.dsl.builder.TopGap
import com.intellij.ui.dsl.builder.actionListener
import com.intellij.ui.dsl.builder.panel
import com.intellij.ui.dsl.gridLayout.Gaps
import com.intellij.util.Alarm
import com.intellij.util.ui.JBFont
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.UIUtil
import com.intellij.util.ui.components.BorderLayoutPanel
import icons.AwsIcons
import software.aws.toolkits.jetbrains.AwsToolkit
import software.aws.toolkits.jetbrains.core.AwsResourceCache
import software.aws.toolkits.jetbrains.core.credentials.AwsBearerTokenConnection
import software.aws.toolkits.jetbrains.core.credentials.ProfileSsoManagedBearerSsoConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManagerListener
import software.aws.toolkits.jetbrains.core.credentials.deleteSsoConnection
import software.aws.toolkits.jetbrains.core.credentials.logoutFromSsoConnection
import software.aws.toolkits.jetbrains.core.credentials.pinning.CodeCatalystConnection
import software.aws.toolkits.jetbrains.core.credentials.pinning.ConnectionPinningManagerListener
import software.aws.toolkits.jetbrains.core.credentials.pinning.FeatureWithPinnedConnection
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.BearerTokenProviderListener
import software.aws.toolkits.jetbrains.core.explorer.AwsToolkitExplorerToolWindow
import software.aws.toolkits.jetbrains.core.explorer.devToolsTab.DevToolsToolWindow
import software.aws.toolkits.jetbrains.core.explorer.devToolsTab.nodes.CawsServiceNode
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.GettingStartedPanel.PanelConstants.BULLET_PANEL_HEIGHT
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.GettingStartedPanel.PanelConstants.GOT_IT_ID_PREFIX
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.GettingStartedPanel.PanelConstants.PANEL_HEIGHT
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.GettingStartedPanel.PanelConstants.PANEL_TITLE_FONT
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.GettingStartedPanel.PanelConstants.PANEL_WIDTH
import software.aws.toolkits.jetbrains.core.gettingstarted.requestCredentialsForCodeCatalyst
import software.aws.toolkits.jetbrains.core.gettingstarted.requestCredentialsForCodeWhisperer
import software.aws.toolkits.jetbrains.core.gettingstarted.requestCredentialsForExplorer
import software.aws.toolkits.jetbrains.services.caws.CawsEndpoints
import software.aws.toolkits.jetbrains.services.caws.CawsResources
import software.aws.toolkits.jetbrains.services.codewhisperer.learn.LearnCodeWhispererEditorProvider
import software.aws.toolkits.jetbrains.ui.feedback.ToolkitFeedbackDialog
import software.aws.toolkits.jetbrains.utils.isRunningOnRemoteBackend
import software.aws.toolkits.jetbrains.utils.ui.editorNotificationCompoundBorder
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.UiTelemetry
import java.awt.Dimension
import java.awt.Image
import javax.swing.ImageIcon
import javax.swing.JComponent
import javax.swing.JLabel

class GettingStartedPanel(
    private val project: Project,
    private val isFirstInstance: Boolean = false,
    private val connectionInitiatedFromExplorer: Boolean = false
) : BorderLayoutPanel(), Disposable {
    private val infoBanner = ConnectionInfoBanner()
    private val featureSetPanel = FeatureColumns()
    private val alarm = Alarm()
    private val oldConnectionCount = getConnectionCount()
    private val initialEnabledConnection = getEnabledConnections(project)

    init {
        background = WelcomeScreenUIManager.getMainAssociatedComponentBackground()

        ApplicationManager.getApplication().messageBus.connect(this).subscribe(
            BearerTokenProviderListener.TOPIC,
            object : BearerTokenProviderListener {
                override fun onChange(providerId: String, newScopes: List<String>?) {
                    connectionUpdated()
                }
            }
        )
        ApplicationManager.getApplication().messageBus.connect(this).subscribe(
            ToolkitConnectionManagerListener.TOPIC,
            object : ToolkitConnectionManagerListener {
                override fun activeConnectionChanged(newConnection: ToolkitConnection?) {
                    connectionUpdated()
                }
            }
        )

        ApplicationManager.getApplication().messageBus.connect(this).subscribe(
            ConnectionPinningManagerListener.TOPIC,
            object : ConnectionPinningManagerListener {
                override fun pinnedConnectionChanged(feature: FeatureWithPinnedConnection, newConnection: ToolkitConnection?) {
                    connectionUpdated()
                }
            }
        )

        addToCenter(
            panel {
                indent {
                    row {
                        icon(AwsIcons.Logos.AWS_SMILE_LARGE)
                        panel {
                            row {
                                label(message("aws.onboarding.getstarted.panel.title")).applyToComponent {
                                    font = JBFont.h1().asBold()
                                }
                            }
                            row {
                                browserLink(message("aws.onboarding.getstarted.panel.comment_link_doc"), url = AwsToolkit.AWS_DOCS_URL)
                                    .actionListener { event, component ->
                                        UiTelemetry.click(project, "auth_GettingStartedDocumentation")
                                    }
                                browserLink(message("aws.onboarding.getstarted.panel.comment_link_github"), url = AwsToolkit.GITHUB_URL)
                                    .actionListener { event, component ->
                                        UiTelemetry.click(project, "auth_GettingStartedConnectOnGithub")
                                    }
                                text(message("aws.onboarding.getstarted.panel.share_feedback")) { hyperlinkEvent ->
                                    val actionEvent = AnActionEvent.createFromInputEvent(
                                        hyperlinkEvent.inputEvent,
                                        PanelConstants.SHARE_FEEDBACK_LINK,
                                        null
                                    ) { if (PlatformDataKeys.PROJECT.`is`(it)) project else null }
                                    ActionManager.getInstance().getAction("aws.toolkit.getstarted.shareFeedback").actionPerformed(actionEvent)
                                }
                            }
                        }
                    }

                    row {
                        cell(infoBanner)
                            .align(AlignX.FILL)

                        topGap(TopGap.MEDIUM)
                        bottomGap(BottomGap.MEDIUM)
                    }

                    // can't use group() because the font cant be overridden
                    row {
                        panel {
                            row {
                                cell(TitledSeparator(message("aws.onboarding.getstarted.panel.group_title"))).applyToComponent {
                                    border = null
                                    setTitleFont(JBFont.h1().asBold())
                                }.align(AlignX.FILL)
                            }
                            row {
                                label("Note: " + (message("gettingstarted.codewhisperer.remote"))).applyToComponent {

                                    font = JBFont.h4().asBold()
                                }
                            }.bottomGap(BottomGap.SMALL).visible(isRunningOnRemoteBackend())
                            featureSetPanel.setFeatureContent()
                            row {
                                cell(featureSetPanel)
                            }
                        }
                    }

                    collapsibleGroup(message("aws.onboarding.getstarted.panel.bottom_text_question")) {
                        row {
                            text(message("aws.onboarding.getstarted.panel.bottom_text"))
                        }
                        row {
                            // CodeWhisperer auth bullets
                            cell(
                                PanelAuthBullets(
                                    message("aws.codewhispererq.tab.title"),
                                    listOf(
                                        AuthPanelBullet(
                                            true,
                                            message("iam_identity_center.name"),
                                            message("aws.onboarding.getstarted.panel.idc_row_comment_text")
                                        ),
                                        AuthPanelBullet(
                                            true,
                                            message("aws_builder_id.service_name"),
                                            message("aws.onboarding.getstarted.panel.builderid_row_comment_text")
                                        ),
                                        AuthPanelBullet(
                                            false,
                                            message("settings.credentials.iam"),
                                            message("aws.getstarted.auth.panel.notSupport_text"),
                                        )
                                    )
                                )
                            ).visible(!isRunningOnRemoteBackend())
                            // Resource Explorer panel auth bullets
                            cell(
                                PanelAuthBullets(
                                    message("aws.getstarted.resource.panel_title"),
                                    listOf(
                                        AuthPanelBullet(
                                            true,
                                            message("iam_identity_center.name"),
                                            message("aws.onboarding.getstarted.panel.idc_row_comment_text")
                                        ),
                                        AuthPanelBullet(
                                            false,
                                            message("aws_builder_id.service_name"),
                                            message("aws.getstarted.auth.panel.notSupport_text")
                                        ),
                                        AuthPanelBullet(
                                            true,
                                            message("settings.credentials.iam"),
                                            message("aws.onboarding.getstarted.panel.iam_row_comment_text")
                                        )
                                    )
                                )
                            )
                            // CodeCatalyst panel auth bullets
                            cell(
                                PanelAuthBullets(
                                    message("caws.title"),
                                    listOf(
                                        AuthPanelBullet(
                                            true,
                                            message("iam_identity_center.name"),
                                            message("aws.onboarding.getstarted.panel.idc_row_comment_text")
                                        ),
                                        AuthPanelBullet(
                                            true,
                                            message("aws_builder_id.service_name"),
                                            message("aws.onboarding.getstarted.panel.builderid_row_comment_text")
                                        ),
                                        AuthPanelBullet(
                                            false,
                                            message("settings.credentials.iam"),
                                            message("aws.getstarted.auth.panel.notSupport_text")
                                        )
                                    )
                                )
                            )
                        }
                    }
                }
            }.apply {
                isOpaque = false
            }
        )

        border = JBUI.Borders.empty(JBUI.scale(32), JBUI.scale(16))
    }

    private fun connectionUpdated() {
        alarm.cancelAllRequests()
        alarm.addRequest(
            {
                featureSetPanel.setFeatureContent()
            },
            1000
        )
    }

    private fun showGotIt(tabName: String, nodeName: String?, tooltip: GotItTooltip) {
        AwsToolkitExplorerToolWindow.toolWindow(project).activate {
            AwsToolkitExplorerToolWindow.getInstance(project).selectTab(tabName)?.let {
                if (tabName == AwsToolkitExplorerToolWindow.DEVTOOLS_TAB_ID) {
                    DevToolsToolWindow.getInstance(project).showGotIt(nodeName, tooltip)
                } else {
                    tooltip.show(it as JComponent, GotItTooltip.TOP_MIDDLE)
                }
            }
        }
    }

    private inner class CodeCatalystPanel : FeatureDescriptionPanel() {
        override val loginSuccessTitle = message("gettingstarted.setup.auth.success.title", message("caws.devtoolPanel.title"))
        override val loginSuccessBody = message("gettingstarted.setup.auth.success.body", message("caws.devtoolPanel.title"))
        lateinit var panelNotConnected: Panel
        lateinit var panelConnected: Panel
        lateinit var panelReauthenticationRequired: Panel
        lateinit var panelConnectionInProgress: Panel

        init {
            addToCenter(
                panel {
                    indent {
                        row {
                            label(message("caws.title"))
                                .applyToComponent {
                                    font = PANEL_TITLE_FONT
                                }
                        }

                        image("/gettingstarted/codecatalyst.png")

                        row {
                            text(message("caws.getstarted.panel.description"))
                        }

                        row {
                            browserLink(message("gettingstarted.panel.learn_more"), CawsEndpoints.ConsoleFactory.baseUrl())
                                .actionListener { event, component ->
                                    UiTelemetry.click(project, "auth_CodecatalystDocumentation")
                                }
                        }

                        panelNotConnected = panel {
                            row {
                                button(message("gettingstarted.panel.login_button")) {
                                    controlPanelVisibility(panelNotConnected, panelConnectionInProgress)
                                    handleCodeCatalystLogin(requestCredentialsForCodeCatalyst(project), panelNotConnected)
                                }.applyToComponent {
                                    putClientProperty(DarculaButtonUI.DEFAULT_STYLE_KEY, true)
                                }
                            }
                            row {
                                browserLink(message("gettingstarted.codecatalyst.panel.setup"), PanelConstants.SET_UP_CODECATALYST)
                            }

                            row {
                                text(message("aws.onboarding.getstarted.panel.login_with_iam")) {
                                    handleCodeCatalystLogin(
                                        requestCredentialsForCodeCatalyst(
                                            project,
                                            popupBuilderIdTab = false,
                                            oldConnectionCount,
                                            initialEnabledConnection,
                                            isFirstInstance,
                                            connectionInitiatedFromExplorer
                                        ),
                                        panelNotConnected
                                    )
                                }
                            }
                        }.visible(activeConnection() is ActiveConnection.NotConnected)

                        panelConnectionInProgress = panel {
                            row {
                                button(
                                    message("gettingstarted.connecting.in.browser")
                                ) {}.applyToComponent {
                                    this.isEnabled = false
                                }
                            }
                            row {
                                browserLink(message("gettingstarted.codecatalyst.panel.setup"), PanelConstants.SET_UP_CODECATALYST)
                            }

                            row {
                                text(message("aws.onboarding.getstarted.panel.login_with_iam")) {
                                    handleCodeCatalystLogin(
                                        requestCredentialsForCodeCatalyst(
                                            project,
                                            popupBuilderIdTab = false,
                                            oldConnectionCount,
                                            initialEnabledConnection,
                                            isFirstInstance,
                                            connectionInitiatedFromExplorer
                                        ),
                                        panelNotConnected
                                    )
                                }
                            }
                        }.visible(false)

                        panelConnected = panel {
                            row {
                                button(message("gettingstarted.codecatalyst.open.explorer")) {
                                    AwsToolkitExplorerToolWindow.getInstance(project).selectTab(AwsToolkitExplorerToolWindow.DEVTOOLS_TAB_ID)?.isVisible = true
                                }
                            }
                            val connectionSettings = ToolkitConnectionManager.getInstance(project).activeConnectionForFeature(
                                CodeCatalystConnection.getInstance()
                            ) as AwsBearerTokenConnection?
                            if (connectionSettings != null) {
                                AwsResourceCache.getInstance().getResource(
                                    CawsResources.ALL_SPACES,
                                    connectionSettings.getConnectionSettings()
                                ).thenAccept { spaces ->
                                    row {
                                        label(message("caws.getstarted.panel.question.text"))
                                    }.visible(spaces.isEmpty())
                                    row {
                                        browserLink(message("gettingstarted.codecatalyst.panel.create.space"), PanelConstants.CREATE_CODECATALYST_SPACE)
                                    }.visible(spaces.isEmpty())
                                }
                            }

                            row {
                                label(message("gettingstarted.auth.connected.builderid")).applyToComponent { this.icon = PanelConstants.CHECKMARK_ICON }
                            }.visible(activeConnection().connectionType == ActiveConnectionType.BUILDER_ID)

                            row {
                                label(message("gettingstarted.auth.connected.idc")).applyToComponent { this.icon = PanelConstants.CHECKMARK_ICON }
                            }.visible(activeConnection().connectionType == ActiveConnectionType.IAM_IDC)

                            row {
                                link(message("toolkit.login.aws_builder_id.already_connected.reconnect")) {
                                    handleSignOut()
                                }
                            }

                            row {
                                text(message("aws.onboarding.getstarted.panel.login_with_iam")) {
                                    handleCodeCatalystLogin(
                                        requestCredentialsForCodeCatalyst(
                                            project,
                                            popupBuilderIdTab = false,
                                            oldConnectionCount,
                                            initialEnabledConnection,
                                            isFirstInstance,
                                            connectionInitiatedFromExplorer
                                        ),
                                        panelConnected
                                    )
                                }
                            }.visible(activeConnection().connectionType == ActiveConnectionType.BUILDER_ID)

                            row {
                                text("<a>${message("gettingstarted.panel.login_button")}</a>") {
                                    controlPanelVisibility(panelConnected, panelConnectionInProgress)
                                    handleCodeCatalystLogin(
                                        requestCredentialsForCodeCatalyst(
                                            project,
                                            popupBuilderIdTab = true,
                                            oldConnectionCount,
                                            initialEnabledConnection,
                                            isFirstInstance,
                                            connectionInitiatedFromExplorer
                                        ),
                                        panelConnected
                                    )
                                }
                            }.visible(activeConnection().connectionType == ActiveConnectionType.IAM_IDC)
                        }.visible(activeConnection() is ActiveConnection.ValidBearer)

                        panelReauthenticationRequired = panel {
                            row {
                                button(message("general.auth.reauthenticate")) {
                                    controlPanelVisibility(panelReauthenticationRequired, panelConnectionInProgress)
                                    handleCodeCatalystLogin(requestCredentialsForCodeCatalyst(project), panelReauthenticationRequired)
                                }.applyToComponent {
                                    putClientProperty(DarculaButtonUI.DEFAULT_STYLE_KEY, true)
                                }
                            }

                            val connectionSettings = ToolkitConnectionManager.getInstance(project).activeConnectionForFeature(
                                CodeCatalystConnection.getInstance()
                            ) as AwsBearerTokenConnection?
                            if (connectionSettings != null) {
                                AwsResourceCache.getInstance().getResource(
                                    CawsResources.ALL_SPACES,
                                    connectionSettings.getConnectionSettings()
                                ).thenAccept { spaces ->
                                    row {
                                        label(message("caws.getstarted.panel.question.text"))
                                    }.visible(spaces.isEmpty())
                                    row {
                                        browserLink(message("gettingstarted.codecatalyst.panel.create.space"), PanelConstants.CREATE_CODECATALYST_SPACE)
                                    }.visible(spaces.isEmpty())
                                }
                            }

                            row {
                                label(message("gettingstarted.auth.builderid.expired")).applyToComponent { this.icon = PanelConstants.X_ICON }
                            }.visible(activeConnection().connectionType == ActiveConnectionType.BUILDER_ID)

                            row {
                                label(message("gettingstarted.auth.idc.expired")).applyToComponent { this.icon = PanelConstants.X_ICON }
                            }.visible(activeConnection().connectionType == ActiveConnectionType.IAM_IDC)

                            row {
                                link(message("toolkit.login.aws_builder_id.already_connected.reconnect")) {
                                    handleSignOut()
                                }
                                text(message("aws.onboarding.getstarted.panel.login_with_iam")) {
                                    handleCodeCatalystLogin(
                                        requestCredentialsForCodeCatalyst(
                                            project,
                                            popupBuilderIdTab = false,
                                            isFirstInstance = isFirstInstance,
                                            connectionInitiatedFromExplorer = connectionInitiatedFromExplorer
                                        ),
                                        panelNotConnected
                                    )
                                }
                            }.visible(activeConnection().connectionType == ActiveConnectionType.BUILDER_ID)

                            row {
                                text("<a>${message("gettingstarted.panel.login_button")}</a>") {
                                    controlPanelVisibility(panelConnected, panelConnectionInProgress)
                                    handleCodeCatalystLogin(
                                        requestCredentialsForCodeCatalyst(
                                            project,
                                            popupBuilderIdTab = true,
                                            oldConnectionCount,
                                            initialEnabledConnection,
                                            isFirstInstance,
                                            connectionInitiatedFromExplorer
                                        ),
                                        panelConnected
                                    )
                                }
                            }.visible(activeConnection().connectionType == ActiveConnectionType.IAM_IDC)
                        }.visible(activeConnection() is ActiveConnection.ExpiredBearer)
                    }
                }.apply {
                    isOpaque = false
                }
            )
        }

        private fun activeConnection() = checkBearerConnectionValidity(project, BearerTokenFeatureSet.CODECATALYST)

        private fun handleSignOut() {
            val validConnection = activeConnection()

            val connection = validConnection.activeConnectionBearer
            if (connection is ProfileSsoManagedBearerSsoConnection) {
                if (validConnection.connectionType == ActiveConnectionType.IAM_IDC) {
                    val confirmDeletion = MessageDialogBuilder.okCancel(
                        message("gettingstarted.auth.idc.sign.out.confirmation.title"),
                        message("gettingstarted.auth.idc.sign.out.confirmation")
                    ).yesText(message("general.confirm")).ask(project)
                    if (confirmDeletion) {
                        deleteSsoConnection(connection)
                    }
                }
            }
            if (connection != null) {
                logoutFromSsoConnection(project, connection) {
                    controlPanelVisibility(panelConnected, panelNotConnected)
                }
            }
        }

        private fun handleCodeCatalystLogin(authResult: Boolean?, revertToPanel: Panel) {
            val r = authResult ?: return

            handleLogin(r)
            if (r) {
                controlPanelVisibility(panelConnectionInProgress, panelConnected)

                val tooltip = GotItTooltip(
                    "aws.toolkit.devtool.tab.whatsnew",
                    message("gettingstarted.explorer.gotit.codecatalyst.body"),
                    project
                )
                    .withHeader(message("gettingstarted.explorer.gotit.codecatalyst.title"))
                    .withPosition(Balloon.Position.above)

                showGotIt(AwsToolkitExplorerToolWindow.DEVTOOLS_TAB_ID, CawsServiceNode.NODE_NAME, tooltip)
            } else {
                controlPanelVisibility(panelConnectionInProgress, revertToPanel)
            }
        }
    }

    private inner class ResourceExplorerPanel : FeatureDescriptionPanel() {
        override val loginSuccessTitle = message("gettingstarted.setup.auth.success.iam.title")
        override val loginSuccessBody = message("gettingstarted.setup.auth.success.iam.body")
        lateinit var panelNotConnected: Panel
        lateinit var panelConnected: Panel
        lateinit var panelReauthenticationRequired: Panel
        lateinit var panelConnectionInProgress: Panel

        init {
            addToCenter(
                panel {
                    indent {
                        row {
                            label(message("aws.getstarted.resource.panel_title"))
                                .applyToComponent {
                                    font = PANEL_TITLE_FONT
                                }
                        }

                        image("/gettingstarted/explorer.png")

                        row {
                            text(message("aws.getstarted.resource.panel_description"))
                        }

                        row {
                            browserLink(
                                message("codewhisperer.gettingstarted.panel.learn_more"),
                                url = PanelConstants.RESOURCE_EXPLORER_LEARN_MORE
                            ).actionListener { event, component ->
                                UiTelemetry.click(project, "auth_ResourceExplorerDocumentation")
                            }
                        }
                        panelNotConnected = panel {
                            row {
                                button(message("aws.onboarding.getstarted.panel.button_iam_login")) {
                                    controlPanelVisibility(panelNotConnected, panelConnectionInProgress)
                                    val loginSuccess = requestCredentialsForExplorer(
                                        project,
                                        oldConnectionCount,
                                        initialEnabledConnection,
                                        isFirstInstance,
                                        connectionInitiatedFromExplorer
                                    )
                                    handleLogin(loginSuccess)

                                    if (loginSuccess == true) {
                                        val tooltip = GotItTooltip(
                                            "$GOT_IT_ID_PREFIX.explorer",
                                            message("gettingstarted.explorer.gotit.explorer.body"),
                                            project
                                        )
                                            .withHeader(message("gettingstarted.explorer.gotit.explorer.title"))
                                            .withPosition(Balloon.Position.below)

                                        showGotIt(AwsToolkitExplorerToolWindow.EXPLORER_TAB_ID, null, tooltip)
                                        controlPanelVisibility(panelConnectionInProgress, panelConnected)
                                    } else {
                                        controlPanelVisibility(panelConnectionInProgress, panelNotConnected)
                                    }
                                }.applyToComponent {
                                    putClientProperty(DarculaButtonUI.DEFAULT_STYLE_KEY, true)
                                }

                                topGap(TopGap.MEDIUM)
                            }

                            row {
                                label(message("aws.getstarted.resource.panel_question_text"))
                            }
                            row {
                                browserLink(message("aws.onboarding.getstarted.panel.signup_iam_text"), url = PanelConstants.RESOURCE_EXPLORER_SIGNUP_DOC)
                            }
                        }.visible(checkIamConnectionValidity(project) is ActiveConnection.NotConnected)
                        panelConnectionInProgress = panel {
                            row {
                                button(message("general.open.in.progress")) {}.applyToComponent {
                                    this.isEnabled = false
                                }
                            }
                            row {
                                label(message("aws.getstarted.resource.panel_question_text"))
                            }
                            row {
                                browserLink(message("aws.onboarding.getstarted.panel.signup_iam_text"), url = PanelConstants.RESOURCE_EXPLORER_SIGNUP_DOC)
                            }
                        }.visible(false)

                        panelConnected = panel {
                            row {
                                button(message("gettingstarted.explorer.open.menu")) {
                                    AwsToolkitExplorerToolWindow.getInstance(project).selectTab(AwsToolkitExplorerToolWindow.EXPLORER_TAB_ID)?.isVisible = true
                                }
                            }
                            row {
                                label(message("gettingstarted.auth.connected.iam")).applyToComponent { icon = PanelConstants.CHECKMARK_ICON }
                            }.visible(checkIamConnectionValidity(project).connectionType == ActiveConnectionType.IAM)
                            row {
                                label(message("gettingstarted.auth.connected.idc")).applyToComponent { this.icon = PanelConstants.CHECKMARK_ICON }
                            }.visible(checkIamConnectionValidity(project).connectionType == ActiveConnectionType.IAM_IDC)
                            row {
                                link(message("toolkit.login.aws_builder_id.already_connected.reconnect")) {
                                    val activeConnection = checkIamConnectionValidity(project)
                                    val connection = activeConnection.activeConnectionIam
                                    if (connection != null) {
                                        val confirmDeletion = MessageDialogBuilder.okCancel(
                                            message("gettingstarted.auth.idc.sign.out.confirmation.title"),
                                            message("gettingstarted.auth.idc.sign.out.confirmation")
                                        ).yesText(message("general.confirm")).ask(project)
                                        if (confirmDeletion) {
                                            deleteSsoConnection(connection)
                                            controlPanelVisibility(panelConnected, panelNotConnected)
                                        }
                                    }
                                }
                            }.visible(checkIamConnectionValidity(project).connectionType == ActiveConnectionType.IAM_IDC)
                            row {
                                link(message("general.add.another")) {
                                    requestCredentialsForExplorer(
                                        project,
                                        oldConnectionCount,
                                        initialEnabledConnection,
                                        isFirstInstance,
                                        connectionInitiatedFromExplorer
                                    )
                                }
                            }
                        }.visible(checkIamConnectionValidity(project) is ActiveConnection.ValidIam)
                        panelReauthenticationRequired = panel {
                            row {
                                button(message("general.auth.reauthenticate")) {
                                    controlPanelVisibility(panelReauthenticationRequired, panelConnectionInProgress)
                                    val loginSuccess = requestCredentialsForExplorer(
                                        project,
                                        oldConnectionCount,
                                        initialEnabledConnection,
                                        isFirstInstance,
                                        connectionInitiatedFromExplorer
                                    )
                                    handleLogin(loginSuccess)

                                    if (loginSuccess == true) {
                                        controlPanelVisibility(panelConnectionInProgress, panelConnected)
                                        val tooltip = GotItTooltip(
                                            "$GOT_IT_ID_PREFIX.explorer",
                                            message("gettingstarted.explorer.gotit.explorer.body"),
                                            project
                                        )
                                            .withHeader(message("gettingstarted.explorer.gotit.explorer.title"))
                                            .withPosition(Balloon.Position.below)

                                        showGotIt(AwsToolkitExplorerToolWindow.EXPLORER_TAB_ID, null, tooltip)
                                    } else {
                                        controlPanelVisibility(panelConnectionInProgress, panelReauthenticationRequired)
                                    }
                                }.applyToComponent {
                                    putClientProperty(DarculaButtonUI.DEFAULT_STYLE_KEY, true)
                                }
                            }
                            row {
                                button(message("gettingstarted.explorer.open.menu")) {
                                    AwsToolkitExplorerToolWindow.getInstance(project).selectTab(AwsToolkitExplorerToolWindow.EXPLORER_TAB_ID)?.isVisible = true
                                }
                            }
                            row {
                                label(message("gettingstarted.auth.idc.expired")).applyToComponent { icon = PanelConstants.X_ICON }
                            }.visible(checkIamConnectionValidity(project).connectionType == ActiveConnectionType.IAM_IDC)

                            row {
                                link(message("toolkit.login.aws_builder_id.already_connected.reconnect")) {
                                    val activeConnection = checkIamConnectionValidity(project)
                                    val connection = activeConnection.activeConnectionIam
                                    if (connection != null) {
                                        val confirmDeletion = MessageDialogBuilder.okCancel(
                                            message("gettingstarted.auth.idc.sign.out.confirmation.title"),
                                            message("gettingstarted.auth.idc.sign.out.confirmation")
                                        ).yesText(message("general.confirm")).ask(project)
                                        if (confirmDeletion) {
                                            deleteSsoConnection(connection)
                                            controlPanelVisibility(panelConnected, panelNotConnected)
                                        }
                                    }
                                }
                            }.visible(checkIamConnectionValidity(project).connectionType == ActiveConnectionType.IAM_IDC)

                            row {
                                label(message("gettingstarted.auth.iam.invalid")).applyToComponent { icon = PanelConstants.X_ICON }
                            }.visible(checkIamConnectionValidity(project).connectionType == ActiveConnectionType.IAM)

                            row {
                                link(message("general.add.another")) {
                                    requestCredentialsForExplorer(
                                        project,
                                        oldConnectionCount,
                                        initialEnabledConnection,
                                        isFirstInstance,
                                        connectionInitiatedFromExplorer
                                    )
                                }
                            }
                        }.visible(checkIamConnectionValidity(project) is ActiveConnection.ExpiredIam)
                    }
                }.apply {
                    isOpaque = false
                }
            )
        }
    }

    private inner class CodeWhispererPanel : FeatureDescriptionPanel() {
        override val loginSuccessTitle = message("gettingstarted.setup.auth.success.title", message("codewhisperer.experiment"))
        override val loginSuccessBody = message("gettingstarted.setup.auth.success.body", message("codewhisperer.experiment"))
        lateinit var panelNotConnected: Panel
        lateinit var panelConnected: Panel
        lateinit var panelReauthenticationRequired: Panel
        lateinit var panelConnectionInProgress: Panel
        init {
            addToCenter(
                panel {
                    indent {
                        row {
                            label(message("aws.codewhispererq.tab.title"))
                                .applyToComponent {
                                    font = PANEL_TITLE_FONT
                                }
                        }

                        image("/gettingstarted/q.png")

                        row {
                            text(message("codewhisperer.gettingstarted.panel.comment"))
                        }

                        row {
                            text(message("codewhisperer.gettingstarted.panel.learn_more.with.q"))
                        }
                        panelNotConnected = panel {
                            row {
                                button(message("codewhisperer.gettingstarted.panel.login_button")) {
                                    controlPanelVisibility(panelNotConnected, panelConnectionInProgress)
                                    handleCodeWhispererLogin(
                                        requestCredentialsForCodeWhisperer(
                                            project,
                                            popupBuilderIdTab = true,
                                            oldConnectionCount,
                                            initialEnabledConnection,
                                            isFirstInstance,
                                            connectionInitiatedFromExplorer
                                        ),
                                        panelNotConnected
                                    )
                                }.applyToComponent {
                                    putClientProperty(DarculaButtonUI.DEFAULT_STYLE_KEY, true)
                                }

                                topGap(TopGap.SMALL)
                            }

                            row {
                                label(message("codewhisperer.gettingstarted.panel.licence_comment"))
                            }
                            row {
                                text(message("aws.onboarding.getstarted.panel.login_with_iam")) {
                                    handleCodeWhispererLogin(
                                        requestCredentialsForCodeWhisperer(
                                            project,
                                            popupBuilderIdTab = false,
                                            oldConnectionCount,
                                            initialEnabledConnection,
                                            isFirstInstance,
                                            connectionInitiatedFromExplorer
                                        ),
                                        panelNotConnected
                                    )
                                }
                            }
                        }.visible(checkBearerConnectionValidity(project, BearerTokenFeatureSet.CODEWHISPERER) is ActiveConnection.NotConnected)

                        panelConnectionInProgress = panel {
                            row {
                                button(message("gettingstarted.connecting.in.browser")) {}.applyToComponent {
                                    this.isEnabled = false
                                }
                            }
                            row {
                                label(message("codewhisperer.gettingstarted.panel.licence_comment"))
                            }
                            row {
                                text(message("aws.onboarding.getstarted.panel.login_with_iam")) {
                                    handleCodeWhispererLogin(
                                        requestCredentialsForCodeWhisperer(
                                            project,
                                            popupBuilderIdTab = false,
                                            oldConnectionCount,
                                            initialEnabledConnection,
                                            isFirstInstance,
                                            connectionInitiatedFromExplorer
                                        ),
                                        panelNotConnected
                                    )
                                }
                            }
                        }.visible(false)
                        panelConnected = panel {
                            row {
                                button(message("codewhisperer.explorer.learn")) {
                                    LearnCodeWhispererEditorProvider.openEditor(project)
                                }
                            }
                            row {
                                label(message("gettingstarted.auth.connected.builderid")).applyToComponent { this.icon = PanelConstants.CHECKMARK_ICON }
                            }.visible(
                                checkBearerConnectionValidity(project, BearerTokenFeatureSet.CODEWHISPERER).connectionType == ActiveConnectionType.BUILDER_ID
                            )
                            row {
                                label(message("gettingstarted.auth.connected.idc")).applyToComponent { this.icon = PanelConstants.CHECKMARK_ICON }
                            }.visible(
                                checkBearerConnectionValidity(project, BearerTokenFeatureSet.CODEWHISPERER).connectionType == ActiveConnectionType.IAM_IDC
                            )
                            row {
                                link(message("toolkit.login.aws_builder_id.already_connected.reconnect")) {
                                    val validConnection = checkBearerConnectionValidity(project, BearerTokenFeatureSet.CODEWHISPERER)

                                    val connection = validConnection.activeConnectionBearer
                                    if (connection is ProfileSsoManagedBearerSsoConnection) {
                                        if (validConnection.connectionType == ActiveConnectionType.IAM_IDC) {
                                            val confirmDeletion = MessageDialogBuilder.okCancel(
                                                message("gettingstarted.auth.idc.sign.out.confirmation.title"),
                                                message("gettingstarted.auth.idc.sign.out.confirmation")
                                            ).yesText(message("general.confirm")).ask(project)
                                            if (confirmDeletion) {
                                                deleteSsoConnection(connection)
                                            }
                                        }
                                    }
                                    if (connection != null) {
                                        logoutFromSsoConnection(project, connection) {
                                            controlPanelVisibility(panelConnected, panelNotConnected)
                                        }
                                    }
                                }
                            }
                            row {
                                text(message("aws.onboarding.getstarted.panel.login_with_iam")) {
                                    handleCodeWhispererLogin(
                                        requestCredentialsForCodeWhisperer(
                                            project,
                                            popupBuilderIdTab = false,
                                            oldConnectionCount,
                                            initialEnabledConnection,
                                            isFirstInstance,
                                            connectionInitiatedFromExplorer
                                        ),
                                        panelNotConnected
                                    )
                                }
                            }.visible(
                                checkBearerConnectionValidity(project, BearerTokenFeatureSet.CODEWHISPERER).connectionType == ActiveConnectionType.BUILDER_ID
                            )
                            row {
                                text("<a>${message("codewhisperer.gettingstarted.panel.login_button")}</a>") {
                                    controlPanelVisibility(panelConnected, panelConnectionInProgress)
                                    handleCodeWhispererLogin(
                                        requestCredentialsForCodeWhisperer(
                                            project,
                                            popupBuilderIdTab = true,
                                            oldConnectionCount,
                                            initialEnabledConnection,
                                            isFirstInstance,
                                            connectionInitiatedFromExplorer
                                        ),
                                        panelConnected
                                    )
                                }
                            }.visible(
                                checkBearerConnectionValidity(project, BearerTokenFeatureSet.CODEWHISPERER).connectionType == ActiveConnectionType.IAM_IDC
                            )
                        }.visible(checkBearerConnectionValidity(project, BearerTokenFeatureSet.CODEWHISPERER) is ActiveConnection.ValidBearer)

                        panelReauthenticationRequired = panel {
                            row {
                                button(message("general.auth.reauthenticate")) {
                                    controlPanelVisibility(panelReauthenticationRequired, panelConnectionInProgress)
                                    handleCodeWhispererLogin(
                                        requestCredentialsForCodeWhisperer(
                                            project,
                                            popupBuilderIdTab = true,
                                            oldConnectionCount,
                                            initialEnabledConnection,
                                            isFirstInstance,
                                            connectionInitiatedFromExplorer
                                        ),
                                        panelReauthenticationRequired
                                    )
                                }.applyToComponent {
                                    putClientProperty(DarculaButtonUI.DEFAULT_STYLE_KEY, true)
                                }

                                topGap(TopGap.SMALL)
                            }
                            row {
                                label(message("gettingstarted.auth.builderid.expired")).applyToComponent { this.icon = PanelConstants.X_ICON }
                            }.visible(
                                checkBearerConnectionValidity(project, BearerTokenFeatureSet.CODEWHISPERER).connectionType == ActiveConnectionType.BUILDER_ID
                            )
                            row {
                                label(message("gettingstarted.auth.idc.expired")).applyToComponent { this.icon = PanelConstants.X_ICON }
                            }.visible(
                                checkBearerConnectionValidity(project, BearerTokenFeatureSet.CODEWHISPERER).connectionType == ActiveConnectionType.IAM_IDC
                            )
                            row {
                                link(message("toolkit.login.aws_builder_id.already_connected.reconnect")) {
                                    val validConnection = checkBearerConnectionValidity(project, BearerTokenFeatureSet.CODEWHISPERER)
                                    val connection = validConnection.activeConnectionBearer
                                    if (connection is ProfileSsoManagedBearerSsoConnection) {
                                        if (validConnection.connectionType == ActiveConnectionType.IAM_IDC) {
                                            val confirmDeletion = MessageDialogBuilder.okCancel(
                                                message("gettingstarted.auth.idc.sign.out.confirmation.title"),
                                                message("gettingstarted.auth.idc.sign.out.confirmation")
                                            ).yesText(message("general.confirm")).ask(project)
                                            if (confirmDeletion) {
                                                deleteSsoConnection(connection)
                                            }
                                        }
                                        logoutFromSsoConnection(project, connection) {
                                            controlPanelVisibility(panelConnected, panelNotConnected)
                                        }
                                    }
                                }
                                text(message("aws.onboarding.getstarted.panel.login_with_iam")) {
                                    handleCodeWhispererLogin(
                                        requestCredentialsForCodeWhisperer(
                                            project,
                                            popupBuilderIdTab = false,
                                            isFirstInstance = isFirstInstance,
                                            connectionInitiatedFromExplorer = connectionInitiatedFromExplorer
                                        ),
                                        panelNotConnected
                                    )
                                }
                            }.visible(
                                checkBearerConnectionValidity(project, BearerTokenFeatureSet.CODEWHISPERER).connectionType == ActiveConnectionType.BUILDER_ID
                            )
                            row {
                                text("<a>${message("codewhisperer.gettingstarted.panel.login_button")}</a>") {
                                    controlPanelVisibility(panelConnected, panelConnectionInProgress)
                                    handleCodeWhispererLogin(
                                        requestCredentialsForCodeWhisperer(
                                            project,
                                            popupBuilderIdTab = true,
                                            oldConnectionCount,
                                            initialEnabledConnection,
                                            isFirstInstance,
                                            connectionInitiatedFromExplorer
                                        ),
                                        panelConnected
                                    )
                                }
                            }.visible(
                                checkBearerConnectionValidity(project, BearerTokenFeatureSet.CODEWHISPERER).connectionType == ActiveConnectionType.IAM_IDC
                            )
                        }.visible(checkBearerConnectionValidity(project, BearerTokenFeatureSet.CODEWHISPERER) is ActiveConnection.ExpiredBearer)
                    }
                }.apply {
                    isOpaque = false
                }
            )
        }

        private fun handleCodeWhispererLogin(authResult: Boolean, revertToPanel: Panel) {
            handleLogin(authResult)
            if (authResult) {
                controlPanelVisibility(panelConnectionInProgress, panelConnected)
                val tooltip = GotItTooltip("$GOT_IT_ID_PREFIX.codewhisperer", message("codewhisperer.explorer.tooltip.comment"), project)
                    .withHeader(message("codewhisperer.explorer.tooltip.title"))
                    .withPosition(Balloon.Position.above)

                showGotIt(AwsToolkitExplorerToolWindow.Q_TAB_ID, message("action.q.openchat.text"), tooltip)
            } else {
                controlPanelVisibility(panelConnectionInProgress, revertToPanel)
            }
        }
    }

    private class PanelAuthBullets(private val panelTitle: String, bullets: List<AuthPanelBullet>) : GettingStartedBorderedPanel() {
        init {
            preferredSize = Dimension(PANEL_WIDTH, BULLET_PANEL_HEIGHT)

            addToCenter(
                panel {
                    indent {
                        row {
                            label(panelTitle).applyToComponent {
                                font = PANEL_TITLE_FONT
                            }
                        }

                        bullets.forEach { bullet ->
                            row {
                                val icon = if (bullet.enable) {
                                    PanelConstants.CHECKMARK_ICON
                                } else {
                                    PanelConstants.X_ICON
                                }

                                icon(icon)
                                panel {
                                    row(bullet.titleName) {
                                    }.rowComment(bullet.comment)
                                        .enabled(bullet.enable)
                                }
                            }
                        }
                    }
                }.apply {
                    isOpaque = false
                }
            )
        }
    }

    private abstract class GettingStartedBorderedPanel : BorderLayoutPanel() {
        init {
            preferredSize = Dimension(PANEL_WIDTH, PANEL_HEIGHT)

            border = IdeBorderFactory.createRoundedBorder().apply {
                setColor(UIUtil.getLabelForeground())
            }

            isOpaque = false
        }

        private val indentSize = IntelliJSpacingConfiguration().horizontalIndent

        protected fun Panel.image(path: String) {
            row {
                // `this` is a [Row], so class needs to be specified or we get the wrong classloader
                val image = ImageIcon(GettingStartedPanel::class.java.getResource(path)).image
                    // need to account for margin introduced by indent
                    // Image.SCALE_DEFAULT is the only valid parameter for gifs
                    .getScaledInstance(PANEL_WIDTH - (indentSize * 2), -1, if (path.endsWith("gif")) Image.SCALE_DEFAULT else Image.SCALE_SMOOTH)
                cell(JLabel(ImageIcon(image)))
                    .customize(Gaps.EMPTY)
            }
        }
    }

    private abstract inner class FeatureDescriptionPanel : GettingStartedBorderedPanel() {
        abstract val loginSuccessTitle: String
        abstract val loginSuccessBody: String

        protected fun handleLogin(authResult: Boolean?) {
            val r = authResult ?: return
            if (r) {
                infoBanner.setSuccessMessage(loginSuccessTitle, loginSuccessBody)
            }
        }
    }

    private class ConnectionInfoBanner : BorderLayoutPanel(10, 0) {
        private val wrapper = Wrapper()
        init {
            addToCenter(wrapper)
        }

        fun setSuccessMessage(title: String, body: String) = setMessage(title, body, false)

        fun setErrorMessage(title: String, body: String) = setMessage(title, body, true)

        fun setConnectionFailedMessage() = setErrorMessage(
            message("gettingstarted.setup.auth.failure.title"),
            message("gettingstarted.setup.auth.failure.body")
        )

        private fun setMessage(title: String, body: String, isError: Boolean) {
            wrapper.setContent(
                panel {
                    row {
                        val icon = if (isError) AllIcons.General.ErrorDialog else AllIcons.General.SuccessDialog
                        icon(icon)
                        panel {
                            row {
                                text(title).applyToComponent {
                                    font = JBFont.label().asBold()
                                }
                            }
                            row {
                                text(body)
                            }
                        }
                    }
                }.apply {
                    isOpaque = false
                }
            )

            val (borderColor, backgroundColor) = if (isError) {
                JBUI.CurrentTheme.Banner.ERROR_BORDER_COLOR to JBUI.CurrentTheme.Banner.ERROR_BACKGROUND
            } else {
                JBUI.CurrentTheme.Banner.SUCCESS_BORDER_COLOR to JBUI.CurrentTheme.Banner.SUCCESS_BACKGROUND
            }

            border = editorNotificationCompoundBorder(
                IdeBorderFactory.createRoundedBorder().apply {
                    setColor(borderColor)
                }
            )

            background = backgroundColor
        }
    }

    private object PanelConstants {
        const val GOT_IT_ID_PREFIX = "aws.toolkit.gettingstarted"
        const val RESOURCE_EXPLORER_LEARN_MORE = "https://docs.aws.amazon.com/toolkit-for-jetbrains/latest/userguide/working-with-aws.html"
        const val RESOURCE_EXPLORER_SIGNUP_DOC = "https://aws.amazon.com/free/"
        const val SHARE_FEEDBACK_LINK = "FeedbackDialog"
        const val SET_UP_CODECATALYST = "https://docs.aws.amazon.com/codecatalyst/latest/userguide/setting-up-topnode.html"
        const val CREATE_CODECATALYST_SPACE = "https://codecatalyst.aws/spaces/create"
        val CHECKMARK_ICON = AllIcons.General.InspectionsOK
        val X_ICON = AllIcons.Ide.Notification.Close
        val PANEL_TITLE_FONT = JBFont.h2().asBold()
        const val PANEL_WIDTH = 300
        const val PANEL_HEIGHT = 450
        const val BULLET_PANEL_HEIGHT = 200
    }

    data class AuthPanelBullet(
        val enable: Boolean,
        val titleName: String,
        val comment: String
    )

    private inner class FeatureColumns : BorderLayoutPanel(10, 0) {
        private val wrapper = Wrapper()
        init {
            isOpaque = false

            addToCenter(wrapper)
        }

        fun setFeatureContent() {
            wrapper.setContent(
                panel {
                    row {
                        // CodeWhisperer panel
                        cell(CodeWhispererPanel()).visible(!isRunningOnRemoteBackend())
                        // Resource Explorer Panel
                        cell(ResourceExplorerPanel())
                        // CodeCatalyst Panel
                        cell(CodeCatalystPanel())
                    }
                }.apply {
                    isOpaque = false
                }
            )
        }
    }

    companion object {
        fun openPanel(project: Project, firstInstance: Boolean = false, connectionInitiatedFromExplorer: Boolean = false) = FileEditorManager.getInstance(
            project
        ).openTextEditor(
            OpenFileDescriptor(
                project,
                GettingStartedVirtualFile(firstInstance, connectionInitiatedFromExplorer)
            ),
            true
        )
    }

    override fun dispose() {
    }
}

class ShareFeedbackInGetStarted : DumbAwareAction() {
    override fun actionPerformed(e: AnActionEvent) {
        runInEdt {
            ToolkitFeedbackDialog(DefaultProjectFactory.getInstance().defaultProject).show()
        }
    }
}
