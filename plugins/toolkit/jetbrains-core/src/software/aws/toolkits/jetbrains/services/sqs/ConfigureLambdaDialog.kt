// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.sqs

import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.ValidationInfo
import kotlinx.coroutines.launch
import software.amazon.awssdk.services.iam.IamClient
import software.amazon.awssdk.services.lambda.LambdaClient
import software.amazon.awssdk.services.lambda.model.InvalidParameterValueException
import software.amazon.awssdk.services.lambda.model.LambdaException
import software.amazon.awssdk.services.lambda.model.ResourceConflictException
import software.amazon.awssdk.services.lambda.model.ResourceNotFoundException
import software.amazon.awssdk.services.lambda.model.ServiceException
import software.aws.toolkits.core.utils.WaiterTimeoutException
import software.aws.toolkits.core.utils.Waiters.waitUntil
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.coroutines.projectCoroutineScope
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.Result
import software.aws.toolkits.telemetry.SqsTelemetry
import java.time.Duration
import javax.swing.JComponent

class ConfigureLambdaDialog(
    private val project: Project,
    private val queue: Queue
) : DialogWrapper(project) {
    private val coroutineScope = projectCoroutineScope(project)
    private val lambdaClient: LambdaClient = project.awsClient()
    private val iamClient: IamClient = project.awsClient()
    val view = ConfigureLambdaPanel(project)

    init {
        title = message("sqs.configure.lambda")
        setOKButtonText(message("general.configure_button"))
        setOKButtonTooltip(message("sqs.configure.lambda.configure.tooltip"))

        init()
    }

    override fun createCenterPanel(): JComponent? = view.component

    override fun getPreferredFocusedComponent(): JComponent? = view.lambdaFunction

    override fun doValidate(): ValidationInfo? {
        if (functionSelected().isEmpty()) {
            return ValidationInfo(message("sqs.configure.lambda.validation.function"), view.lambdaFunction)
        }
        return null
    }

    override fun doCancelAction() {
        SqsTelemetry.configureLambdaTrigger(project, Result.Cancelled, queue.telemetryType())
        super.doCancelAction()
    }

    override fun doOKAction() {
        if (!isOKActionEnabled) {
            return
        }

        isOKActionEnabled = false
        setOKButtonText(message("sqs.configure.lambda.in_progress"))

        coroutineScope.launch {
            try {
                configureLambda(functionSelected())
                runInEdt(ModalityState.any()) {
                    close(OK_EXIT_CODE)
                }
                notifyInfo(message("sqs.service_name"), message("sqs.configure.lambda.success", functionSelected()), project)
                SqsTelemetry.configureLambdaTrigger(project, Result.Succeeded, queue.telemetryType())
            } catch (e: InvalidParameterValueException) { // Exception thrown for invalid permission
                // DO NOT change to withCoroutineUiContext, it breaks the panel with the wrong state
                runInEdt(ModalityState.any()) {
                    if (ConfirmIamPolicyDialog(project, iamClient, lambdaClient, functionSelected(), queue, view.component).showAndGet()) {
                        retryConfiguration(functionSelected())
                    } else {
                        setOKButtonText(message("general.configure_button"))
                        isOKActionEnabled = true
                    }
                }
            } catch (e: Exception) {
                LOG.warn(e) { message("sqs.configure.lambda.error", functionSelected()) }
                setErrorText(e.message)
                setOKButtonText(message("general.configure_button"))
                isOKActionEnabled = true
                SqsTelemetry.configureLambdaTrigger(project, Result.Failed, queue.telemetryType())
            }
        }
    }

    private fun functionSelected(): String = view.lambdaFunction.selected()?.functionName() ?: ""

    internal fun configureLambda(functionName: String) {
        lambdaClient.createEventSourceMapping {
            it.functionName(functionName)
            it.eventSourceArn(queue.arn)
        }
    }

    // It takes a few seconds for the role policy to update, so this function will attempt configuration for a duration of time until it succeeds.
    internal suspend fun waitUntilConfigured(functionName: String): String? {
        var identifier: String? = null
        try {
            waitUntil(
                succeedOn = {
                    it.eventSourceArn().isNotEmpty()
                },
                exceptionsToIgnore = setOf(InvalidParameterValueException::class),
                exceptionsToStopOn = setOf(LambdaException::class, ResourceConflictException::class, ResourceNotFoundException::class, ServiceException::class),
                maxDuration = Duration.ofSeconds(CONFIGURATION_WAIT_TIME),
                call = {
                    lambdaClient.createEventSourceMapping {
                        it.functionName(functionName)
                        it.eventSourceArn(queue.arn)
                    }.apply {
                        identifier = this.uuid()
                    }
                }
            )
        } catch (e: WaiterTimeoutException) {
            identifier = null
        }
        return identifier
    }

    private fun retryConfiguration(functionName: String) {
        coroutineScope.launch {
            val identifier = waitUntilConfigured(functionName)
            if (!identifier.isNullOrEmpty()) {
                runInEdt(ModalityState.any()) {
                    close(OK_EXIT_CODE)
                }
                notifyInfo(message("sqs.service_name"), message("sqs.configure.lambda.success", functionName), project)
                SqsTelemetry.configureLambdaTrigger(project, Result.Succeeded, queue.telemetryType())
            } else {
                setErrorText(message("sqs.configure.lambda.error", functionName))
                setOKButtonText(message("general.configure_button"))
                isOKActionEnabled = true
                SqsTelemetry.configureLambdaTrigger(project, Result.Failed, queue.telemetryType())
            }
        }
    }

    private companion object {
        val LOG = getLogger<ConfigureLambdaDialog>()
        const val CONFIGURATION_WAIT_TIME: Long = 30
    }
}
