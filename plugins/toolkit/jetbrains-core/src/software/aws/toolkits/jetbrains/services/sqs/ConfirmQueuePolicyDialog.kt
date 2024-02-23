// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.sqs

import com.fasterxml.jackson.databind.node.ArrayNode
import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.intellij.json.JsonLanguage
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import kotlinx.coroutines.launch
import software.amazon.awssdk.services.sqs.SqsClient
import software.amazon.awssdk.services.sqs.model.QueueAttributeName
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.coroutines.projectCoroutineScope
import software.aws.toolkits.jetbrains.ui.ConfirmPolicyPanel
import software.aws.toolkits.jetbrains.utils.ui.formatAndSet
import software.aws.toolkits.resources.message
import java.awt.Component
import javax.swing.JComponent

class ConfirmQueuePolicyDialog(
    project: Project,
    private val sqsClient: SqsClient,
    private val queue: Queue,
    topicArn: String,
    private val existingPolicy: String?,
    parent: Component? = null
) : DialogWrapper(project, parent, false, IdeModalityType.IDE) {
    private val coroutineScope = projectCoroutineScope(project)
    private val policyStatement = createSqsSnsSubscribePolicyStatement(queue.arn, topicArn)

    val view = ConfirmPolicyPanel(project, message("sqs.confirm.iam.warning.sqs_queue_permissions"))

    init {
        title = message("sqs.confirm.iam.create")
        setOKButtonText(message("sqs.confirm.iam.create"))
        view.policyDocument.formatAndSet(policyStatement, JsonLanguage.INSTANCE)
        init()
    }

    override fun createCenterPanel(): JComponent? = view.component

    override fun doOKAction() {
        if (!isOKActionEnabled) {
            return
        }

        setOKButtonText(message("sqs.confirm.iam.in_progress"))
        isOKActionEnabled = false
        coroutineScope.launch {
            try {
                addPolicy()
                runInEdt(ModalityState.any()) {
                    close(OK_EXIT_CODE)
                }
            } catch (e: Exception) {
                LOG.warn(e) { message("sqs.confirm.iam.failed") }
                setErrorText(e.message)
                setOKButtonText(message("sqs.confirm.iam.create"))
                isOKActionEnabled = true
            }
        }
    }

    private fun addPolicy() {
        val document = mapper.readTree(existingPolicy ?: createSqsPolicy(queue.arn)) as ObjectNode
        val policyArray = document[sqsPolicyStatementArray] as? ArrayNode ?: document.putArray(sqsPolicyStatementArray)
        policyArray.add(mapper.readTree(policyStatement))
        sqsClient.setQueueAttributes {
            it.queueUrl(queue.queueUrl)
            it.attributes(
                mutableMapOf(
                    QueueAttributeName.POLICY to document.toPrettyString()
                )
            )
        }
    }

    private companion object {
        val mapper = jacksonObjectMapper()
        val LOG = getLogger<ConfirmQueuePolicyDialog>()
    }
}
