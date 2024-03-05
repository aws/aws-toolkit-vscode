// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.cloudformation.stack

import com.intellij.icons.AllIcons
import com.intellij.notification.NotificationGroup
import com.intellij.notification.NotificationType
import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.actionSystem.LangDataKeys
import com.intellij.openapi.actionSystem.ToggleAction
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.service
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.SimpleToolWindowPanel
import com.intellij.openapi.util.Disposer
import com.intellij.ui.OnePixelSplitter
import com.intellij.ui.components.JBTabbedPane
import com.intellij.ui.content.Content
import com.intellij.uiDesigner.core.GridConstraints
import com.intellij.uiDesigner.core.GridLayoutManager
import com.intellij.util.ui.JBUI
import software.amazon.awssdk.services.cloudformation.model.StackStatus
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.explorer.actions.SingleResourceNodeAction
import software.aws.toolkits.jetbrains.core.toolwindow.ToolkitToolWindow
import software.aws.toolkits.jetbrains.services.cloudformation.CloudFormationStackNode
import software.aws.toolkits.jetbrains.services.cloudformation.toolwindow.CloudFormationToolWindow
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CloudformationTelemetry
import java.time.Duration
import java.util.concurrent.atomic.AtomicBoolean
import javax.swing.BoxLayout
import javax.swing.JComponent
import javax.swing.JPanel
import javax.swing.SwingUtilities

private val UPDATE_STACK_STATUS_INTERVAL = Duration.ofSeconds(5)
private val UPDATE_STACK_STATUS_INTERVAL_ON_FINAL_STATE = Duration.ofSeconds(60)
private const val REDRAW_ANIMATED_ICON_INTERVAL = 70
private const val TREE_TABLE_INITIAL_PROPORTION = 0.25f

class StackWindowManager(private val project: Project) {
    private val toolWindow = CloudFormationToolWindow.getInstance(project)

    fun openStack(stackName: String, stackId: String) {
        assert(SwingUtilities.isEventDispatchThread())
        if (!toolWindow.showExistingContent(stackId)) {
            StackUI(project, stackName, stackId, toolWindow).start()
        }
        CloudformationTelemetry.open(project, success = true)
    }

    companion object {
        fun getInstance(project: Project): StackWindowManager = project.service()
    }
}

class OpenStackUiAction : SingleResourceNodeAction<CloudFormationStackNode>(message("cloudformation.stack.view")), DumbAware {
    override fun actionPerformed(selected: CloudFormationStackNode, e: AnActionEvent) {
        StackWindowManager.getInstance(e.getRequiredData(LangDataKeys.PROJECT)).openStack(selected.stackName, selected.stackId)
    }
}

private class StackUI(
    private val project: Project,
    private val stackName: String,
    stackId: String,
    private val toolWindow: ToolkitToolWindow
) : UpdateListener, Disposable {

    val toolWindowTab: Content
    private val animator: IconAnimator
    private val updater: Updater
    private val notificationGroup: NotificationGroup
    private val pageButtons: PageButtons

    private val eventsTable: EventsTableImpl
    private val outputsTable = OutputsTableView()
    private val resourcesTable = ResourceTableView()

    init {
        val tree = TreeViewImpl(project, stackName)
        animator = IconAnimator(REDRAW_ANIMATED_ICON_INTERVAL, tree)
        eventsTable = EventsTableImpl()
        pageButtons = PageButtons(this::onPageButtonClick)

        val notificationId = CloudFormationToolWindow.getInstance(project).toolWindowId
        notificationGroup = NotificationGroup.findRegisteredGroup(notificationId)
            ?: NotificationGroup.toolWindowGroup(notificationId, notificationId)

        val window = SimpleToolWindowPanel(false, true)
        val mainPanel = OnePixelSplitter(false, TREE_TABLE_INITIAL_PROPORTION).apply {
            firstComponent = tree.component
            secondComponent = JBTabbedPane().apply {
                this.add(
                    message("cloudformation.stack.tab_labels.events"),
                    JPanel(GridLayoutManager(2, 1)).apply {
                        add(
                            eventsTable.component,
                            GridConstraints(
                                0,
                                0,
                                1,
                                1,
                                0,
                                GridConstraints.FILL_BOTH,
                                GridConstraints.SIZEPOLICY_CAN_GROW or GridConstraints.SIZEPOLICY_WANT_GROW or GridConstraints.SIZEPOLICY_CAN_SHRINK,
                                GridConstraints.SIZEPOLICY_CAN_GROW or GridConstraints.SIZEPOLICY_WANT_GROW or GridConstraints.SIZEPOLICY_CAN_SHRINK,
                                null,
                                null,
                                null
                            )
                        )
                        add(
                            pageButtons.component,
                            GridConstraints(
                                1,
                                0,
                                1,
                                1,
                                0,
                                GridConstraints.FILL_HORIZONTAL,
                                GridConstraints.SIZEPOLICY_CAN_GROW or GridConstraints.SIZEPOLICY_WANT_GROW or GridConstraints.SIZEPOLICY_CAN_SHRINK,
                                GridConstraints.SIZEPOLICY_CAN_GROW or GridConstraints.SIZEPOLICY_CAN_SHRINK,
                                null,
                                null,
                                null
                            )
                        )
                        tabComponentInsets = JBUI.emptyInsets()
                        border = JBUI.Borders.empty()
                    }
                )

                this.add(
                    message("cloudformation.stack.tab_labels.resources"),
                    JPanel().apply {
                        layout = BoxLayout(this, BoxLayout.Y_AXIS)
                        add(resourcesTable.component)
                    }
                )

                this.add(
                    message("cloudformation.stack.tab_labels.outputs"),
                    JPanel().apply {
                        layout = BoxLayout(this, BoxLayout.Y_AXIS)
                        add(add(outputsTable.component))
                    }
                )
            }
        }
        updater = Updater(
            tree,
            eventsTable = eventsTable,
            outputsTable = outputsTable,
            resourceListener = resourcesTable,
            updateInterval = UPDATE_STACK_STATUS_INTERVAL,
            updateIntervalOnFinalState = UPDATE_STACK_STATUS_INTERVAL_ON_FINAL_STATE,
            listener = this,
            client = project.awsClient(),
            setPagesAvailable = pageButtons::setPagesAvailable,
            stackId = stackId
        )

        window.setContent(mainPanel)
        window.toolbar = createToolbar()

        toolWindowTab = toolWindow.addTab(stackName, window, id = stackId)
        // dispose self when toolwindowtab closes
        Disposer.register(toolWindowTab, this)
        listOf(tree, updater, animator, eventsTable, outputsTable, resourcesTable, pageButtons).forEach { Disposer.register(this, it) }
    }

    fun start() {
        toolWindow.show(toolWindowTab)
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

    private fun createToolbar(): JComponent {
        val actionGroup = DefaultActionGroup()
        actionGroup.addAction(object : DumbAwareAction(message("general.refresh"), null, AllIcons.Actions.Refresh) {
            override fun getActionUpdateThread() = ActionUpdateThread.BGT

            override fun actionPerformed(e: AnActionEvent) {
                updater.start()
            }

            override fun update(e: AnActionEvent) {
                e.presentation.isEnabled = !updater.running
            }
        })

        actionGroup.addAction(createFilterAction())

        return ActionManager.getInstance().createActionToolbar("", actionGroup, false).component
    }

    private fun createFilterAction() =
        object : ToggleAction(message("cloudformation.stack.filter.show_completed"), null, AllIcons.RunConfigurations.ShowPassed), DumbAware {
            override fun getActionUpdateThread() = ActionUpdateThread.BGT

            private val state = AtomicBoolean(true)
            override fun isSelected(e: AnActionEvent): Boolean = state.get()

            override fun setSelected(e: AnActionEvent, newState: Boolean) {
                if (state.getAndSet(newState) != newState) {
                    ApplicationManager.getApplication().executeOnPooledThread {
                        updater.applyFilter {
                            newState || it.resourceStatus().type != StatusType.COMPLETED
                        }
                    }
                }
            }
        }

    fun onPageButtonClick(page: Page) {
        eventsTable.showBusyIcon()
        // To prevent double click, we disable buttons. They will be enabled by Updater when data fetched
        pageButtons.setPagesAvailable(emptySet())
        updater.switchPage(page)
    }

    override fun dispose() {
    }
}
