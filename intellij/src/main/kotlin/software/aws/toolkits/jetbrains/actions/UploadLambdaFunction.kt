package software.aws.toolkits.jetbrains.actions

import com.intellij.lang.Language
import com.intellij.notification.Notification
import com.intellij.notification.NotificationListener
import com.intellij.notification.NotificationType
import com.intellij.notification.Notifications
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.LangDataKeys
import software.amazon.awssdk.services.lambda.LambdaClient
import software.amazon.awssdk.services.lambda.model.InvokeRequest
import software.aws.toolkits.jetbrains.aws.lambda.LambdaCreatorFactory
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.ui.LAMBDA_SERVICE_ICON_LARGE
import software.aws.toolkits.jetbrains.ui.modals.UploadToLambdaModal
import java.nio.ByteBuffer
import java.nio.charset.StandardCharsets
import javax.swing.JOptionPane

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
            LambdaCreatorFactory.create(AwsClientManager.getInstance(project)).createLambda(functionDetails, project) {
                val notificationListener = NotificationListener { _, _ ->
                    val input = JOptionPane.showInputDialog(
                            null,
                            "Input",
                            "Run ${functionDetails.name}",
                            JOptionPane.PLAIN_MESSAGE,
                            LAMBDA_SERVICE_ICON_LARGE,
                            null,
                            null
                    )
                    val invoke = InvokeRequest.builder().functionName(functionDetails.name)
                            .payload(ByteBuffer.wrap("\"$input\"".toByteArray())).build()
                    val res = AwsClientManager.getInstance(project).getClient<LambdaClient>().invoke(invoke)

                    val bytes = ByteArray(res.payload().remaining())
                    res.payload().get(bytes)

                    JOptionPane.showMessageDialog(
                            null,
                            String(bytes, StandardCharsets.UTF_8),
                            null,
                            JOptionPane.PLAIN_MESSAGE,
                            LAMBDA_SERVICE_ICON_LARGE
                    )
                }
                Notifications.Bus.notify(
                        Notification(
                                "AWS Toolkit",
                                "AWS Lambda Created",
                                "${functionDetails.name} created <a href=\"$it\">run it</a>",
                                NotificationType.INFORMATION,
                                notificationListener
                        )
                )
            }
        }
        uploadModal.show()
    }

    private fun handleError(msg: String) {
        Notifications.Bus.notify(Notification("AWS Tookit", "Upload Lambda Failed", msg, NotificationType.ERROR))
    }
}