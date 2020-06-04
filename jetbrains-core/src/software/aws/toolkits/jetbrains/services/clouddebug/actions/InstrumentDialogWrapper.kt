// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.clouddebug.actions

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import software.aws.toolkits.jetbrains.core.help.HelpIds
import software.aws.toolkits.jetbrains.settings.CloudDebugSettings
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.ClouddebugTelemetry
import software.aws.toolkits.telemetry.Result
import java.awt.GridBagLayout
import javax.swing.JCheckBox
import javax.swing.JComponent
import javax.swing.JPanel

class InstrumentDialogWrapper(val project: Project, clusterArn: String, private val serviceArn: String) : DialogWrapper(project) {
    val view: InstrumentDialog = InstrumentDialog(project, clusterArn, serviceArn)
    private val settings = CloudDebugSettings.getInstance()

    init {
        init()
        title = message("cloud_debug.instrument")
        isOKActionEnabled = false
        view.iamRole.addActionListener {
            isOKActionEnabled = view.iamRole.selected() != null
        }
        centerRelativeToParent()
    }

    override fun createCenterPanel(): JComponent? = view.content

    override fun getHelpId(): String? = HelpIds.CLOUD_DEBUG_ENABLE.id

    override fun doOKAction() {
        if (!settings.showEnableDebugWarning || ConfirmNonProductionDialogWrapper(project, serviceArn.substringAfterLast("service/")).showAndGet()) {
            super.doOKAction()
        }
    }
}

class ConfirmNonProductionDialogWrapper(private val project: Project, serviceName: String) : DialogWrapper(project) {
    private val view = ConfirmNonProductionDialog(serviceName)
    private val doNotShowAgain = JCheckBox(message("notice.suppress"))
    private val settings = CloudDebugSettings.getInstance()

    init {
        init()
        isOKActionEnabled = false
        title = message("cloud_debug.instrument.production_warning.title")
        createTitlePane()
        view.confirmProceed.addActionListener { isOKActionEnabled = view.confirmProceed.isSelected }
    }

    override fun createCenterPanel(): JComponent? = view.content

    override fun createSouthAdditionalPanel() = JPanel(GridBagLayout()).apply { add(doNotShowAgain) }

    override fun doOKAction() {
        ClouddebugTelemetry.confirmNotProduction(project, Result.Succeeded)
        if (doNotShowAgain.isSelected) {
            settings.showEnableDebugWarning = false
        }
        super.doOKAction()
    }

    override fun doCancelAction() {
        ClouddebugTelemetry.confirmNotProduction(project, Result.Cancelled)
        super.doCancelAction()
    }
}
