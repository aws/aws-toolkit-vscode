// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.status

import com.intellij.icons.AllIcons
import com.intellij.ide.DataManager
import com.intellij.idea.AppMode
import com.intellij.openapi.actionSystem.ActionGroup
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.popup.JBPopupFactory
import com.intellij.openapi.ui.popup.ListPopup
import com.intellij.openapi.wm.StatusBar
import com.intellij.openapi.wm.StatusBarWidget
import com.intellij.openapi.wm.impl.status.EditorBasedWidget
import com.intellij.ui.AnimatedIcon
import com.intellij.util.Consumer
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManagerListener
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.BearerTokenProviderListener
import software.aws.toolkits.jetbrains.services.amazonq.gettingstarted.QActionGroups.Q_SIGNED_OUT_ACTION_GROUP
import software.aws.toolkits.jetbrains.services.codewhisperer.customization.CodeWhispererCustomizationListener
import software.aws.toolkits.jetbrains.services.codewhisperer.customization.CodeWhispererModelConfigurator
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.QStatusBarLoggedInActionGroup
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererInvocationStateChangeListener
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererInvocationStatus
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererUtil.reconnectCodeWhisperer
import software.aws.toolkits.jetbrains.utils.isQConnected
import software.aws.toolkits.jetbrains.utils.isQExpired
import software.aws.toolkits.resources.message
import java.awt.event.MouseEvent
import javax.swing.Icon

class CodeWhispererStatusBarWidget(project: Project) :
    EditorBasedWidget(project),
    StatusBarWidget.MultipleTextValuesPresentation {

    override fun install(statusBar: StatusBar) {
        super.install(statusBar)
        project.messageBus.connect(this).subscribe(
            CodeWhispererInvocationStatus.CODEWHISPERER_INVOCATION_STATE_CHANGED,
            object : CodeWhispererInvocationStateChangeListener {
                override fun invocationStateChanged(value: Boolean) {
                    statusBar.updateWidget(ID)
                }
            }
        )
        ApplicationManager.getApplication().messageBus.connect(this).subscribe(
            BearerTokenProviderListener.TOPIC,
            object : BearerTokenProviderListener {
                override fun onChange(providerId: String, newScopes: List<String>?) {
                    statusBar.updateWidget(ID)
                }
            }
        )

        ApplicationManager.getApplication().messageBus.connect(this).subscribe(
            CodeWhispererCustomizationListener.TOPIC,
            object : CodeWhispererCustomizationListener {
                override fun refreshUi() {
                    statusBar.updateWidget(ID)
                }
            }
        )

        ApplicationManager.getApplication().messageBus.connect(this).subscribe(
            ToolkitConnectionManagerListener.TOPIC,
            object : ToolkitConnectionManagerListener {
                override fun activeConnectionChanged(newConnection: ToolkitConnection?) {
                    statusBar.updateWidget(ID)
                }
            }
        )
    }

    override fun ID(): String = ID

    override fun getPresentation(): StatusBarWidget.WidgetPresentation = this

    override fun getTooltipText(): String = message("codewhisperer.statusbar.tooltip")

    override fun getClickConsumer(): Consumer<MouseEvent>? = null

    override fun getPopupStep(): ListPopup? =
        if (isQExpired(project)) {
            JBPopupFactory.getInstance().createConfirmation(message("codewhisperer.statusbar.popup.title"), { reconnectCodeWhisperer(project) }, 0)
        } else if (!isQConnected(project)) {
            JBPopupFactory.getInstance().createActionGroupPopup(
                "Amazon Q",
                ActionManager.getInstance().getAction(Q_SIGNED_OUT_ACTION_GROUP) as ActionGroup,
                DataManager.getInstance().getDataContext(myStatusBar?.component),
                JBPopupFactory.ActionSelectionAid.MNEMONICS,
                false
            )
        } else {
            JBPopupFactory.getInstance().createActionGroupPopup(
                "Amazon Q",
                QStatusBarLoggedInActionGroup(),
                DataManager.getInstance().getDataContext(myStatusBar?.component),
                JBPopupFactory.ActionSelectionAid.MNEMONICS,
                false
            )
        }

    override fun getSelectedValue(): String = CodeWhispererModelConfigurator.getInstance().activeCustomization(project).let {
        if (it == null) {
            message("codewhisperer.statusbar.display_name")
        } else {
            "${message("codewhisperer.statusbar.display_name")} | ${it.name}"
        }
    }

    override fun getIcon(): Icon =
        if (isQExpired(project)) {
            AllIcons.General.BalloonWarning
        } else if (!isQConnected(project)) {
            AllIcons.RunConfigurations.TestState.Run
        } else if (CodeWhispererInvocationStatus.getInstance().hasExistingInvocation()) {
            // AnimatedIcon can't serialize over remote host
            if (!AppMode.isRemoteDevHost()) {
                AnimatedIcon.Default()
            } else {
                AllIcons.Actions.Download
            }
        } else {
            AllIcons.Debugger.ThreadStates.Idle
        }

    companion object {
        const val ID = "aws.codewhisperer.statusWidget"
    }
}
