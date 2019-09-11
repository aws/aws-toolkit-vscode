// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.core.stack

import com.intellij.notification.NotificationGroup
import com.intellij.notification.NotificationType
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.LangDataKeys
import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.project.Project
import com.intellij.ui.OnePixelSplitter
import software.amazon.awssdk.services.cloudformation.model.StackStatus
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.explorer.actions.SingleResourceNodeAction
import software.aws.toolkits.jetbrains.services.cloudformation.CloudFormationStackNode
import software.aws.toolkits.resources.message
import javax.swing.BoxLayout
import javax.swing.JPanel
import javax.swing.SwingUtilities

private const val UPDATE_STACK_STATUS_INTERVAL = 5000
private const val REDRAW_ANIMATED_ICON_INTERVAL = 70
private const val TREE_TABLE_INITIAL_PROPORTION = 0.25f

class StackWindowManager(private val project: Project) {

    private val stackTabs = mutableMapOf<String, ToolWindowTab>()

    fun openStack(stackName: String, stackId: String) {
        assert(SwingUtilities.isEventDispatchThread())
        val tab = stackTabs[stackId]
        when {
            tab?.isDisposed() == false -> tab.show()
            else -> {
                val stackUI = StackUI(project, stackName)
                stackTabs[stackId] = stackUI.toolWindowTab
                stackUI.start()
            }
        }
    }

    companion object {
        fun getInstance(project: Project): StackWindowManager = ServiceManager.getService(project, StackWindowManager::class.java)
    }
}

class OpenStackUiAction : SingleResourceNodeAction<CloudFormationStackNode>(message("cloudformation.stack.view")) {
    override fun actionPerformed(selected: CloudFormationStackNode, e: AnActionEvent) {
        StackWindowManager.getInstance(e.getRequiredData(LangDataKeys.PROJECT)).openStack(selected.stackName, selected.stackId)
    }
}

private class StackUI(
    private val project: Project,
    private val stackName: String
) : UpdateListener {

    internal val toolWindowTab: ToolWindowTab
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

        notificationGroup = NotificationGroup.findRegisteredGroup(STACK_TOOLWINDOW_ID)
            ?: NotificationGroup.toolWindowGroup(STACK_TOOLWINDOW_ID, STACK_TOOLWINDOW_ID)

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
        toolWindowTab = ToolWindowTab(
            component = mainPanel,
            project = project,
            stackName = stackName,
            disposables = *arrayOf(tree, updater, animator, table, pageButtons)
        )
    }

    fun start() {
        toolWindowTab.show()
        animator.start()
        updater.start()
    }

    override fun onError(message: String) {
        notify(message, NotificationType.ERROR)
        toolWindowTab.destroy()
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
