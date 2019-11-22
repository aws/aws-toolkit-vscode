// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.clouddebug.actions

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import software.aws.toolkits.jetbrains.core.help.HelpIds
import software.aws.toolkits.jetbrains.services.ecs.EcsUtils
import software.aws.toolkits.resources.message
import javax.swing.JComponent

class DeinstrumentDialogWrapper(val project: Project, val serviceArn: String) : DialogWrapper(project) {
    val view: DeinstrumentDialog = DeinstrumentDialog(EcsUtils.originalServiceName(serviceArn))

    init {
        init()
        title = message("cloud_debug.instrument_resource.disable")
        isOKActionEnabled = true
        centerRelativeToParent()
    }

    override fun createCenterPanel(): JComponent? = view.content

    override fun getHelpId(): String? = HelpIds.CLOUD_DEBUG_ENABLE.id
}
