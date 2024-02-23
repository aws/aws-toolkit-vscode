// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway.welcomescreen

import com.intellij.icons.AllIcons
import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.ActionPlaces
import com.intellij.openapi.actionSystem.ActionToolbar
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.impl.ActionButton
import com.intellij.openapi.actionSystem.impl.IdeaActionButtonLook
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.DefaultProjectFactory
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.rd.util.launchChildOnUi
import com.intellij.openapi.rd.util.withModalProgressContext
import com.intellij.openapi.ui.FrameWrapper
import com.intellij.openapi.ui.InputValidator
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.util.Disposer
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.labels.LinkLabel
import com.intellij.ui.components.panels.NonOpaquePanel
import com.intellij.util.text.DateFormatUtil
import com.intellij.util.text.nullize
import com.intellij.util.ui.AsyncProcessIcon
import com.intellij.util.ui.GridBag
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.UIUtil
import com.jetbrains.gateway.api.GatewayUI
import icons.AwsGatewayIcons
import kotlinx.coroutines.launch
import org.jetbrains.plugins.terminal.LocalTerminalDirectRunner
import software.amazon.awssdk.services.codecatalyst.CodeCatalystClient
import software.amazon.awssdk.services.codecatalyst.model.DevEnvironmentStatus
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.AwsToolkit
import software.aws.toolkits.jetbrains.core.coroutines.applicationCoroutineScope
import software.aws.toolkits.jetbrains.core.utils.buildMap
import software.aws.toolkits.jetbrains.gateway.CawsConnectionParameters
import software.aws.toolkits.jetbrains.gateway.SsoSettings
import software.aws.toolkits.jetbrains.gateway.Workspace
import software.aws.toolkits.jetbrains.gateway.connection.ThinClientTrackerService
import software.aws.toolkits.jetbrains.gateway.connection.caws.CawsCommandExecutor
import software.aws.toolkits.jetbrains.gateway.inProgress
import software.aws.toolkits.jetbrains.services.caws.isSubscriptionFreeTier
import software.aws.toolkits.resources.message
import java.awt.Color
import java.awt.FlowLayout
import java.awt.Graphics
import java.awt.GridBagLayout
import java.awt.Rectangle

class WorkspaceDetails(
    ws: Workspace,
    workspaces: WorkspaceList,
    cawsClient: CodeCatalystClient,
    ssoSettings: SsoSettings?,
    disposable: Disposable
) : NonOpaquePanel() {
    init {
        layout = GridBagLayout()

        val insetSize = 2

        val gbc = GridBag().apply {
            defaultFill = GridBag.HORIZONTAL
            defaultInsets = JBUI.insets(0, insetSize)
        }

        val statusIconLabel = when {
            ws.status == DevEnvironmentStatus.RUNNING -> JBLabel(AwsGatewayIcons.GATEWAY_RUNNING)
            ws.status.inProgress() -> AsyncProcessIcon(ws.status.name).also {
                Disposer.register(disposable, it)
            }
            ws.status == DevEnvironmentStatus.FAILED -> JBLabel(AllIcons.General.Error)
            else -> JBLabel(AwsGatewayIcons.GATEWAY_STOPPED)
        }

        statusIconLabel.toolTipText = if (!ws.statusReason.isNullOrBlank()) "${ws.status.name}: ${ws.statusReason}" else ws.status.name

        val (ideIcon, ideToolTip) = ws.platformProduct?.let {
            it.icon to it.ideName
        } ?: AllIcons.RunConfigurations.TestUnknown to ws.ides.toString()
        val ideIconLabel = JBLabel(ideIcon)
        ideIconLabel.toolTipText = ideToolTip

        add(statusIconLabel, gbc.next().anchor(GridBag.WEST))
        add(ideIconLabel, gbc.next().anchor(GridBag.WEST).insets(JBUI.insetsRight(insetSize)))

        val wsBranchText = ws.branch?.let { message("caws.branch_title", ws.branch) } ?: ws.identifier.id
        if (ws.isCompatible) {
            add(ActionLinkColoredSearchComponent(wsBranchText) { connectToWs(ws, ssoSettings, it) }, gbc.next().anchor(GridBag.WEST))
        } else {
            add(JBLabel("$wsBranchText ${message("caws.workspace.incompatible")}"), gbc.next().anchor(GridBag.WEST))
        }

        val labels = LabelPanel(ws.alias?.let { listOf(it) } ?: emptyList())

        add(
            labels,
            gbc.next().anchor(GridBag.CENTER).fillCellHorizontally().weightx(1.0).apply {
                foreground = JBUI.CurrentTheme.ActionsList.MNEMONIC_FOREGROUND
            }
        )

        val buttonPanel = NonOpaquePanel(FlowLayout(FlowLayout.RIGHT, 1, 1))
        buttonPanel.add(
            JBLabel(UIUtil.ComponentStyle.SMALL).apply {
                foreground = JBUI.CurrentTheme.ActionsList.MNEMONIC_FOREGROUND
                text = message("caws.workspace.details.last_used", DateFormatUtil.formatPrettyDate(ws.lastUpdated.toEpochMilli()))
                toolTipText = DateFormatUtil.formatDateTime(ws.lastUpdated.toEpochMilli())
            }
        )
        if (ws.status != DevEnvironmentStatus.STOPPING && ws.status != DevEnvironmentStatus.STOPPED) {
            buttonPanel.add(createActionButton(PauseAction(ws, workspaces, cawsClient)))
        }
        buttonPanel.add(createActionButton(TerminateAction(ws, workspaces, cawsClient)))

        if (ws.status == DevEnvironmentStatus.RUNNING) {
            buttonPanel.add(createActionButton(ConfigureAction(ws, workspaces, cawsClient)))

            if (AwsToolkit.isDeveloperMode()) {
                buttonPanel.add(createActionButton(ShellAction(ws, workspaces, cawsClient)))
            }
        }

        add(buttonPanel, gbc.next().anchor(GridBag.EAST).insets(JBUI.insetsLeft(insetSize)))
    }

    @Suppress("UNUSED_PARAMETER")
    private fun onCawsProjectLinkClicked(label: LinkLabel<Any?>, ignored: Any?) {
    }

    private fun createActionButton(action: AnAction): ActionButton =
        ActionButton(action, action.templatePresentation.clone(), ActionPlaces.UNKNOWN, ActionToolbar.NAVBAR_MINIMUM_BUTTON_SIZE).apply {
            setLook(object : IdeaActionButtonLook() {
                override fun paintLookBorder(g: Graphics, rect: Rectangle, color: Color) {}
            })
        }
}

private fun connectToWs(ws: Workspace, ssoSettings: SsoSettings?, e: AnActionEvent) {
    val connectionParameters = mutableMapOf(
        CawsConnectionParameters.CAWS_SPACE to ws.identifier.project.space,
        CawsConnectionParameters.CAWS_PROJECT to ws.identifier.project.project,
        CawsConnectionParameters.CAWS_ENV_ID to ws.identifier.id
    ) + buildMap {
        if (ws.repo != null) {
            put(CawsConnectionParameters.CAWS_GIT_REPO_NAME, ws.repo)
        }
        if (ssoSettings != null) {
            put(CawsConnectionParameters.SSO_START_URL, ssoSettings.startUrl)
            put(CawsConnectionParameters.SSO_REGION, ssoSettings.region)
        }
    }

    GatewayUI.getInstance().connect(connectionParameters)
}

class PauseAction(private val ws: Workspace, private val workspaceList: WorkspaceList, private val cawsClient: CodeCatalystClient) : DumbAwareAction(
    {
        message("caws.pause_action")
    },
    AllIcons.Actions.Pause
) {
    override fun actionPerformed(e: AnActionEvent) {
        val result = Messages.showYesNoCancelDialog(message("caws.pause_warning"), message("caws.pause_warning_title"), null)
        if (result != Messages.YES) return
        ApplicationManager.getApplication().executeOnPooledThread {
            try {
                ThinClientTrackerService.getInstance().terminateIfRunning(ws.identifier.id)
                cawsClient.stopDevEnvironment {
                    it.spaceName(ws.identifier.project.space)
                    it.projectName(ws.identifier.project.project)
                    it.id(ws.identifier.id)
                }
                workspaceList.markWorkspaceAsDirty(ws)
            } catch (e: Exception) {
                val message = message("caws.pause_workspace_failed")
                getLogger<PauseAction>().error(e) { message }
                runInEdt {
                    Messages.showErrorDialog(e.message ?: message("general.unknown_error"), message)
                }
            }
        }
    }
}

class TerminateAction(private val ws: Workspace, private val workspaceList: WorkspaceList, private val cawsClient: CodeCatalystClient) : DumbAwareAction(
    {
        message("caws.delete_workspace")
    },
    AllIcons.Actions.Cancel
) {
    override fun actionPerformed(e: AnActionEvent) {
        val result = Messages.showYesNoDialog(message("caws.delete_workspace_warning"), message("caws.delete_workspace_warning_title"), null)
        if (result != Messages.YES) return
        ApplicationManager.getApplication().executeOnPooledThread {
            try {
                cawsClient.deleteDevEnvironment {
                    it.spaceName(ws.identifier.project.space)
                    it.projectName(ws.identifier.project.project)
                    it.id(ws.identifier.id)
                }
                runInEdt {
                    // TODO: UX question..should we instantly hide this, or let it go into spinning state?
                    workspaceList.removeWorkspace(ws)
                }
            } catch (e: Exception) {
                val message = message("caws.delete_failed")
                getLogger<TerminateAction>().error(e) { message }
                runInEdt {
                    Messages.showErrorDialog(e.message ?: message("general.unknown_error"), message)
                }
            }
        }
    }
}

class ShellAction(private val ws: Workspace, private val workspaceList: WorkspaceList, private val cawsClient: CodeCatalystClient) : DumbAwareAction(
    {
        "Shell"
    }
) {
    override fun actionPerformed(e: AnActionEvent) {
        val portsToForward = Messages.showInputDialog("Comma-separated ports to forward", ws.toString(), null, null, csvIntValidator).splitIntsByComma()

        val disposable = Disposer.newDisposable()

        val project = DefaultProjectFactory.getInstance().defaultProject
        val widget = object : LocalTerminalDirectRunner(project) {
            override fun getInitialCommand(envs: MutableMap<String, String>): List<String> {
                val command = CawsCommandExecutor(cawsClient, ws.identifier.id, ws.identifier.project.space, ws.identifier.project.project)
                    .buildSshCommand {
                        portsToForward.forEach { port ->
                            it.localPortForward(port, port, noShell = false)
                        }
                    }
                return command.getCommandLineList(null)
            }
        }.createTerminalWidget(disposable, null, true)

        val dialog = FrameWrapper(null, null, title = ws.toString(), component = widget)
        Disposer.register(dialog, disposable)
        dialog.show()
    }

    companion object {
        private fun String?.splitIntsByComma(): List<Int> = nullize(nullizeSpaces = true)?.split(',')?.map { it.toInt() } ?: emptyList()
        private val csvIntValidator = object : InputValidator {
            override fun checkInput(inputString: String) = runCatching { inputString.splitIntsByComma() }.isSuccess
            override fun canClose(inputString: String) = runCatching { inputString.splitIntsByComma() }.isSuccess
        }
    }
}

class ConfigureAction(private val ws: Workspace, private val workspaceList: WorkspaceList, private val cawsClient: CodeCatalystClient) : DumbAwareAction(
    {
        message("caws.configure_workspace")
    },
    AllIcons.General.GearPlain
) {
    override fun actionPerformed(e: AnActionEvent) {
        applicationCoroutineScope().launch {
            val isFreeTier = withModalProgressContext(message("loading_resource.loading")) {
                val envStatus = cawsClient.getDevEnvironment {
                    val (cawsProject, envId) = ws.identifier
                    val (space, project) = cawsProject

                    it.spaceName(space)
                    it.projectName(project)
                    it.id(envId)
                }

                if (envStatus.status() != DevEnvironmentStatus.RUNNING) {
                    error(message("caws.configure_workspace_not_running"))
                }

                isSubscriptionFreeTier(cawsClient, ws.identifier.project.space)
            }

            launchChildOnUi {
                WorkspaceConfigurationDialog.buildDialog(cawsClient, isFreeTier, ws, workspaceList)
                    .showAndGet()
            }.join()
        }.invokeOnCompletion { err ->
            if (err == null) {
                return@invokeOnCompletion
            }

            val message = message("caws.configure_workspace_failed")
            getLogger<ConfigureAction>().error(err) { message }
            runInEdt {
                Messages.showErrorDialog(err.message ?: message("general.unknown_error"), message("caws.configure_workspace_failed"))
            }
        }
    }
}
