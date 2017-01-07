package com.amazonaws.intellij.toolWindow

import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.content.ContentFactory
import javax.swing.JPanel

class AwsExplorerToolWindow : ToolWindowFactory {

    lateinit var main: JPanel

    override fun createToolWindowContent(project: Project, window: ToolWindow) {
        val content = ContentFactory.SERVICE.getInstance().createContent(main, "", false)
        window.contentManager.addContent(content)
    }
}