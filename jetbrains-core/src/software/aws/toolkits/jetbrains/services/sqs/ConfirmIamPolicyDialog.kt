// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.sqs

import com.intellij.json.JsonLanguage
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import kotlinx.coroutines.launch
import software.amazon.awssdk.services.iam.IamClient
import software.amazon.awssdk.services.lambda.LambdaClient
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.coroutines.projectCoroutineScope
import software.aws.toolkits.jetbrains.services.lambda.upload.createSqsPollerPolicy
import software.aws.toolkits.jetbrains.ui.ConfirmPolicyPanel
import software.aws.toolkits.jetbrains.utils.ui.formatAndSet
import software.aws.toolkits.resources.message
import java.awt.Component
import javax.swing.JComponent

class ConfirmIamPolicyDialog(
    project: Project,
    private val iamClient: IamClient,
    private val lambdaClient: LambdaClient,
    private val functionName: String,
    private val queue: Queue,
    parent: Component? = null
) : DialogWrapper(project, parent, false, IdeModalityType.IDE) {
    private val coroutineScope = projectCoroutineScope(project)
    private val rolePolicy: String by lazy { createSqsPollerPolicy(queue.arn) }
    private val policyName: String by lazy { "AWSLambdaSQSPollerExecutionRole-$functionName-${queue.queueName}-${queue.region.id}" }
    val view = ConfirmPolicyPanel(project, message("sqs.confirm.iam.warning.text"))

    init {
        title = message("sqs.confirm.iam")
        setOKButtonText(message("sqs.confirm.iam.create"))
        view.policyDocument.formatAndSet(rolePolicy, JsonLanguage.INSTANCE)
        init()
    }

    override fun createCenterPanel(): JComponent? = view.component

    override fun doOKAction() {
        if (!isOKActionEnabled) {
            return
        }

        setOKButtonText(message("general.create_in_progress"))
        isOKActionEnabled = false
        coroutineScope.launch {
            try {
                val policyArn = createPolicy()
                attachPolicy(policyArn)
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

    private fun createPolicy(): String {
        val policy = iamClient.createPolicy {
            it.policyName(policyName)
            it.policyDocument(rolePolicy)
        }.policy()
        return policy.arn()
    }

    private fun attachPolicy(policyArn: String) {
        // getFunctionConfiguration().role() returns the ARN of the role like this: arn:aws:iam::123456789012:role/service-role/ROLE-NAME.
        // We must use substringAfterLast to extract only the role name.
        val role = lambdaClient.getFunctionConfiguration { it.functionName(functionName) }.role().substringAfterLast('/')
        iamClient.attachRolePolicy {
            it.policyArn(policyArn)
            it.roleName(role)
        }
    }

    private companion object {
        val LOG = getLogger<ConfirmIamPolicyDialog>()
    }
}
