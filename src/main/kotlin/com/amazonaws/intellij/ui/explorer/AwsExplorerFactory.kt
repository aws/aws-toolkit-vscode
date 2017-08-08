package com.amazonaws.intellij.ui.explorer

import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.SimpleToolWindowPanel
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.components.panels.Wrapper

/**
 * Created by zhaoxiz on 7/19/17.
 */
class AwsExplorerFactory : ToolWindowFactory, DumbAware {

    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val simpleToolWindowPanel = SimpleToolWindowPanel(true, false)
        val wrapperPane = Wrapper()

        simpleToolWindowPanel.setToolbar(ExplorerToolWindow(project, wrapperPane).mainPanel)
        simpleToolWindowPanel.setContent(wrapperPane)
        toolWindow.component.parent.add(simpleToolWindowPanel)
    }

}