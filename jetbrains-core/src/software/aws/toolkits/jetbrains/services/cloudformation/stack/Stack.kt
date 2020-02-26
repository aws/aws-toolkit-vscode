// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.cloudformation.stack

import com.intellij.notification.NotificationGroup
import com.intellij.notification.NotificationType
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.LangDataKeys
import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.ui.OnePixelSplitter
import icons.AwsIcons
import software.amazon.awssdk.services.cloudformation.model.StackStatus
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.explorer.actions.SingleResourceNodeAction
import software.aws.toolkits.jetbrains.core.toolwindow.ToolkitToolWindow
import software.aws.toolkits.jetbrains.core.toolwindow.ToolkitToolWindowManager
import software.aws.toolkits.jetbrains.core.toolwindow.ToolkitToolWindowTab
import software.aws.toolkits.jetbrains.core.toolwindow.ToolkitToolWindowType
import software.aws.toolkits.jetbrains.services.cloudformation.CloudFormationStackNode
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CloudformationTelemetry
import javax.swing.BoxLayout
import javax.swing.JPanel
import javax.swing.SwingUtilities

private const val UPDATE_STACK_STATUS_INTERVAL = 5000
private const val REDRAW_ANIMATED_ICON_INTERVAL = 70
private const val TREE_TABLE_INITIAL_PROPORTION = 0.25f
internal val STACK_TOOL_WINDOW =
    ToolkitToolWindowType("AWS.CloudFormation", message("cloudformation.toolwindow.label"), icon = AwsIcons.Logos.CLOUD_FORMATION_TOOL)

class StackWindowManager(private val project: Project) {
    private val toolWindow = ToolkitToolWindowManager.getInstance(project, STACK_TOOL_WINDOW)

    fun openStack(stackName: String, stackId: String) {
        assert(SwingUtilities.isEventDispatchThread())
        toolWindow.find(stackId)?.run { show() } ?: StackUI(project, stackName, stackId, toolWindow).start()
    }

    companion object {
        fun getInstance(project: Project): StackWindowManager = ServiceManager.getService(project, StackWindowManager::class.java)
    }
}

class OpenStackUiAction : SingleResourceNodeAction<CloudFormationStackNode>(message("cloudformation.stack.view")) {
    override fun actionPerformed(selected: CloudFormationStackNode, e: AnActionEvent) {
        StackWindowManager.getInstance(e.getRequiredData(LangDataKeys.PROJECT)).openStack(selected.stackName, selected.stackId)
        CloudformationTelemetry.open(e.project)
    }
}

private class StackUI(private val project: Project, private val stackName: String, stackId: String, toolWindow: ToolkitToolWindow) : UpdateListener {

    internal val toolWindowTab: ToolkitToolWindowTab
    private val animator: IconAnimator
    private val updater: Updater
    private val notificationGroup: NotificationGroup
    private val pageButtons: PageButtons

    private val table: TableViewImpl

    init {
        val tree = TreeViewImpl(project, stackName)
        animator = IconAnimator(REDRAW_ANIMATED_ICON_INTERVAL, tree)
        table = TableViewImpl()
        pageButtons = PageButtons(this::onPageButtonClick)

        notificationGroup = NotificationGroup.findRegisteredGroup(STACK_TOOL_WINDOW.id)
            ?: NotificationGroup.toolWindowGroup(STACK_TOOL_WINDOW.id, STACK_TOOL_WINDOW.id)

        val mainPanel = OnePixelSplitter(false, TREE_TABLE_INITIAL_PROPORTION).apply {
            firstComponent = tree.component
            secondComponent = JPanel().apply {
                layout = BoxLayout(this, BoxLayout.Y_AXIS)
                add(table.component)
                add(pageButtons.component)
            }
        }

        updater = Updater(
            tree,
            eventsTableView = table,
            stackName = stackName,
            updateEveryMs = UPDATE_STACK_STATUS_INTERVAL,
            listener = this,
            client = AwsClientManager.getInstance(project).getClient(),
            setPagesAvailable = pageButtons::setPagesAvailable
        )

        toolWindowTab = toolWindow.addTab(stackName, mainPanel, id = stackId)
        listOf(tree, updater, animator, table, pageButtons).forEach { Disposer.register(toolWindowTab, it) }
    }

    fun start() {
        toolWindowTab.show()
        animator.start()
        updater.start()
    }

    override fun onError(message: String) {
        notify(message, NotificationType.ERROR)
        toolWindowTab.dispose()
    }

    override fun onStackStatusChanged(stackStatus: StackStatus) {
        when (stackStatus.type) {
            StatusType.COMPLETED -> NotificationType.INFORMATION
            StatusType.FAILED -> NotificationType.ERROR
            StatusType.DELETED -> NotificationType.WARNING
            else -> null
        }?.let { type -> notify(stackStatus.name, type) }
    }

    private fun notify(message: String, notificationType: NotificationType) {
        notificationGroup.createNotification("$stackName: $message", notificationType).notify(project)
    }

    fun onPageButtonClick(page: Page) {
        table.showBusyIcon()
        // To prevent double click, we disable buttons. They will be enabled by Updater when data fetched
        pageButtons.setPagesAvailable(emptySet())
        updater.switchPage(page)
    }
}
