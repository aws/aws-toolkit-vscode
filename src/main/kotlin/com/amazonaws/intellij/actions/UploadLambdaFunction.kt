package com.amazonaws.intellij.actions

import com.amazonaws.intellij.aws.AwsResourceManager
import com.amazonaws.intellij.aws.lambda.LambdaCreatorFactory
import com.amazonaws.intellij.ui.modals.UploadToLambdaModal
import com.intellij.lang.Language
import com.intellij.notification.Notification
import com.intellij.notification.NotificationType
import com.intellij.notification.Notifications
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.LangDataKeys

class UploadLambdaFunction : AnAction() {
    override fun actionPerformed(event: AnActionEvent?) {
        if (event == null) return
        val project = event.project ?: return
        val psi = event.getData(LangDataKeys.PSI_FILE)
        if (psi == null) {
            handleError("Couldn't determine language")
            return
        }

        if (!psi.language.`is`(Language.findLanguageByID("JAVA"))) {
            handleError("Invalid language, only Java supported at present, language detected as '${psi.language}'")
            return
        }

        val uploadModal = UploadToLambdaModal(project, psi) { functionDetails ->
            LambdaCreatorFactory.create(AwsResourceManager.getInstance(project)).createLambda(functionDetails, project) {
                Notifications.Bus.notify(Notification("AWS Toolkit", "AWS Lambda Function Created", "AWS Lambda Function '${functionDetails.name}' ($it)", NotificationType.INFORMATION))
            }
        }
        uploadModal.show()
    }

    private fun handleError(msg: String) {
        Notifications.Bus.notify(Notification("AWS Tookit", "Upload Lambda Failed", msg, NotificationType.ERROR))

    }
}