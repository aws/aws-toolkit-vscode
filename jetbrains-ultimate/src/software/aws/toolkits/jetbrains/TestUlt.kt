package software.aws.toolkits.jetbrains

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.StartupActivity
import com.intellij.openapi.ui.Messages

class TestUlt : StartupActivity {
    override fun runActivity(project: Project) {
        ApplicationManager.getApplication().invokeLater {
            Messages.showInfoMessage(project, "Yay", "Ult Plugin loaded");
        }
    }
}