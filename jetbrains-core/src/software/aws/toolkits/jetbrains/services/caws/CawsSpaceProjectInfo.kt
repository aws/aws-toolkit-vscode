// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.caws

import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.StatusBar
import com.intellij.openapi.wm.StatusBarWidget
import com.intellij.openapi.wm.StatusBarWidgetFactory
import com.intellij.util.Consumer
import java.awt.Component
import java.awt.event.MouseEvent

private const val WIDGET_ID = "CawsSpaceProjectInfo"

class CawsStatusBarInstaller : StatusBarWidgetFactory {
    private val spaceName: String? = System.getenv(CawsConstants.CAWS_ENV_ORG_NAME_VAR)
    private val projectName: String? = System.getenv(CawsConstants.CAWS_ENV_PROJECT_NAME_VAR)

    override fun getId(): String = WIDGET_ID

    override fun getDisplayName(): String = "$spaceName/$projectName"

    override fun isAvailable(project: Project): Boolean = spaceName != null && projectName != null

    override fun createWidget(project: Project): StatusBarWidget = CawsSpaceProjectInfo(spaceName, projectName)

    override fun disposeWidget(widget: StatusBarWidget) {
        Disposer.dispose(widget)
    }

    override fun canBeEnabledOn(statusBar: StatusBar): Boolean = true
}

private class CawsSpaceProjectInfo(val spaceName: String?, val projectName: String?) :
    StatusBarWidget,
    StatusBarWidget.TextPresentation {

    override fun ID(): String = WIDGET_ID

    override fun getPresentation(): StatusBarWidget.WidgetPresentation = this

    override fun getTooltipText(): String = "$spaceName/$projectName"
    override fun getClickConsumer(): Consumer<MouseEvent>? = null

    override fun getText(): String = "$spaceName/$projectName"

    override fun getAlignment(): Float = Component.CENTER_ALIGNMENT

    override fun dispose() {}

    override fun install(statusBar: StatusBar) {}
}
