// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.sqs

import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.ValidationInfo
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import software.amazon.awssdk.services.sns.SnsClient
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import software.aws.toolkits.jetbrains.utils.getCoroutineUiContext
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.resources.message
import javax.swing.JComponent

class SubscribeSnsDialog(
    private val project: Project,
    private val queue: Queue
) : DialogWrapper(project), CoroutineScope by ApplicationThreadPoolScope("SubscribeSnsDialog") {
    private val snsClient: SnsClient = project.awsClient()
    val view = SubscribeSnsPanel(project)

    init {
        title = message("sqs.subscribe.sns")
        setOKButtonText(message("sqs.subscribe.sns.subscribe"))

        init()
    }

    override fun createCenterPanel(): JComponent? = view.component

    override fun getPreferredFocusedComponent(): JComponent? = view.topicSelector

    override fun doValidate(): ValidationInfo? {
        if (topicSelected().isEmpty()) {
            return ValidationInfo(message("sqs.subscribe.sns.validation.empty_topic"), view.topicSelector)
        }
        return null
    }

    override fun doOKAction() {
        if (!isOKActionEnabled) {
            return
        }

        setOKButtonText(message("sqs.subscribe.sns.in_progress"))
        isOKActionEnabled = false

        launch {
            try {
                subscribe(topicSelected())
                withContext(getCoroutineUiContext(ModalityState.any())) {
                    close(OK_EXIT_CODE)
                }
                notifyInfo(message("sqs.service_name"), message("sqs.subscribe.sns.success", topicSelected()), project)
            } catch (e: Exception) {
                LOG.warn(e) { message("sqs.subscribe.sns.failed", queue.queueName, topicSelected()) }
                setErrorText(e.message)
                setOKButtonText(message("sqs.subscribe.sns.subscribe"))
                isOKActionEnabled = true
            }
        }
    }

    private fun topicSelected(): String = view.topicSelector.selected()?.topicArn() ?: ""

    internal fun subscribe(arn: String) {
        snsClient.subscribe {
            it.topicArn(arn)
            it.protocol(PROTOCOL)
            it.endpoint(queue.arn)
        }
    }

    private companion object {
        val LOG = getLogger<SubscribeSnsDialog>()
        const val PROTOCOL = "sqs"
    }
}
