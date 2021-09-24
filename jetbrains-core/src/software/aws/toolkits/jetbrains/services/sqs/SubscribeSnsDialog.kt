// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.sqs

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.ValidationInfo
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import software.amazon.awssdk.services.iam.IamClient
import software.amazon.awssdk.services.iam.model.ContextEntry
import software.amazon.awssdk.services.iam.model.ContextKeyTypeEnum
import software.amazon.awssdk.services.iam.model.PolicyEvaluationDecisionType
import software.amazon.awssdk.services.sns.SnsClient
import software.amazon.awssdk.services.sqs.SqsClient
import software.amazon.awssdk.services.sqs.model.QueueAttributeName
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.coroutines.getCoroutineUiContext
import software.aws.toolkits.jetbrains.core.coroutines.projectCoroutineScope
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.Result
import software.aws.toolkits.telemetry.SqsTelemetry
import javax.swing.JComponent

class SubscribeSnsDialog(
    private val project: Project,
    private val queue: Queue
) : DialogWrapper(project) {
    private val coroutineScope = projectCoroutineScope(project)
    private val snsClient: SnsClient = project.awsClient()
    private val sqsClient: SqsClient = project.awsClient()
    private val iamClient: IamClient = project.awsClient()

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

    override fun doCancelAction() {
        SqsTelemetry.subscribeSns(project, Result.Cancelled, queue.telemetryType())
        super.doCancelAction()
    }

    override fun doOKAction() {
        if (!isOKActionEnabled) {
            return
        }
        val topicArn = topicSelected()
        setOKButtonText(message("sqs.subscribe.sns.in_progress"))
        isOKActionEnabled = false

        coroutineScope.launch {
            try {
                val policy = sqsClient.getQueueAttributes {
                    it.queueUrl(queue.queueUrl)
                    it.attributeNames(QueueAttributeName.POLICY)
                }.attributes()[QueueAttributeName.POLICY]

                if (needToEditPolicy(policy)) {
                    val continueAdding = withContext(getCoroutineUiContext()) {
                        ConfirmQueuePolicyDialog(project, sqsClient, queue, topicArn, policy, view.component).showAndGet()
                    }
                    if (!continueAdding) {
                        setOKButtonText(message("sqs.subscribe.sns.subscribe"))
                        isOKActionEnabled = true
                        return@launch
                    }
                }
                subscribe(topicArn)
                withContext(getCoroutineUiContext()) {
                    close(OK_EXIT_CODE)
                }
                notifyInfo(message("sqs.service_name"), message("sqs.subscribe.sns.success", topicSelected()), project)
                SqsTelemetry.subscribeSns(project, Result.Succeeded, queue.telemetryType())
            } catch (e: Exception) {
                LOG.warn(e) { message("sqs.subscribe.sns.failed", queue.queueName, topicArn) }
                setErrorText(e.message)
                setOKButtonText(message("sqs.subscribe.sns.subscribe"))
                isOKActionEnabled = true
                SqsTelemetry.subscribeSns(project, Result.Failed, queue.telemetryType())
            }
        }
    }

    internal fun subscribe(arn: String) {
        snsClient.subscribe {
            it.topicArn(arn)
            it.protocol(PROTOCOL)
            it.endpoint(queue.arn)
        }
    }

    private fun topicSelected(): String = view.topicSelector.selected()?.topicArn() ?: ""

    private fun needToEditPolicy(existingPolicy: String?): Boolean {
        existingPolicy ?: return true

        val allowed = iamClient.simulateCustomPolicy {
            it.contextEntries(
                ContextEntry.builder()
                    .contextKeyType(ContextKeyTypeEnum.STRING)
                    .contextKeyName("aws:SourceArn")
                    .contextKeyValues(topicSelected())
                    .build()
            )
            it.actionNames("sqs:SendMessage")
            it.resourceArns(queue.arn)
            it.policyInputList(existingPolicy)
        }.evaluationResults().first()

        return allowed.evalDecision() != PolicyEvaluationDecisionType.ALLOWED
    }

    private companion object {
        val LOG = getLogger<SubscribeSnsDialog>()
        const val PROTOCOL = "sqs"
    }
}
