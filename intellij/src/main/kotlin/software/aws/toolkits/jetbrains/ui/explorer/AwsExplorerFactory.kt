package software.aws.toolkits.jetbrains.ui.explorer

import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.openapi.wm.WindowManager
import software.aws.toolkits.jetbrains.ui.widgets.AwsSettingsPanel

@Suppress("unused")
class AwsExplorerFactory : ToolWindowFactory, DumbAware {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        toolWindow.component.parent.add(ExplorerToolWindow(project))
        WindowManager.getInstance().getStatusBar(project).addWidget(AwsSettingsPanel(project), project)
    }
}