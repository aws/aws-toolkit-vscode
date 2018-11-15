// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.deploy

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.process.CapturingProcessAdapter
import com.intellij.execution.process.OSProcessHandler
import com.intellij.execution.process.ProcessAdapter
import com.intellij.execution.process.ProcessEvent
import com.intellij.execution.process.ProcessHandlerFactory
import com.intellij.execution.process.ProcessOutput
import com.intellij.openapi.progress.ProcessCanceledException
import com.intellij.openapi.progress.util.ProgressIndicatorBase
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.util.ExceptionUtil
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.core.credentials.ProjectAccountSettingsManager
import software.aws.toolkits.jetbrains.core.credentials.toEnvironmentVariables
import software.aws.toolkits.jetbrains.settings.SamSettings
import software.aws.toolkits.resources.message
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionStage
import javax.swing.JComponent

open class SamDeployDialog(
    project: Project,
    private val stackName: String,
    private val template: VirtualFile,
    private val parameters: Map<String, String>,
    private val region: AwsRegion,
    private val s3Bucket: String,
    execute: Boolean = true
) : DialogWrapper(project) {
    private val progressIndicator = ProgressIndicatorBase()
    private val view = SamDeployView(project, progressIndicator)
    private var currentStep = 0
    private val credentialsProvider = ProjectAccountSettingsManager.getInstance(project).activeCredentialProvider
    private val changeSetRegex = "(arn:aws:cloudformation:.*changeSet/[^\\s]*)".toRegex()
    lateinit var changeSetName: String
        private set

    init {
        Disposer.register(disposable, view)

        progressIndicator.setModalityProgress(null)
        title = message("serverless.application.deploy_in_progress.title", stackName)
        setOKButtonText(message("serverless.application.deploy.execute_change_set"))
        setCancelButtonText(message("general.close_button"))

        super.init()

        // For unit tests we don't want to execute it immediately
        if (execute) {
            executeDeployment()
        }
    }

    override fun createCenterPanel(): JComponent? = view.content

    fun executeDeployment(): CompletionStage<String?> {
        okAction.isEnabled = false
        cancelAction.isEnabled = false

        return runSamPackage()
            .thenCompose { packageTemplate -> runSamDeploy(packageTemplate) }
            .thenApply { changeSet -> finish(changeSet) }
            .exceptionally { e -> handleError(e) }
    }

    private fun runSamPackage(): CompletionStage<String> {
        val packagedTemplate = "packaged-${template.name}"
        val command = createBaseCommand()
            .withParameters("package")
            .withParameters("--template-file")
            .withParameters(template.path)
            .withParameters("--output-template-file")
            .withParameters(packagedTemplate)
            .withParameters("--s3-bucket")
            .withParameters(s3Bucket)

        return runCommand(message("serverless.application.deploy.step_name.package"), command) { packagedTemplate }
    }

    private fun runSamDeploy(packageTemplate: String): CompletionStage<String> {
        advanceStep()
        val command = createBaseCommand()
            .withParameters("deploy")
            .withParameters("--template-file")
            .withParameters(packageTemplate)
            .withParameters("--stack-name")
            .withParameters(stackName)
            .withParameters("--capabilities")
            .withParameters("CAPABILITY_IAM", "CAPABILITY_NAMED_IAM")
            .withParameters("--no-execute-changeset")

        if (parameters.isNotEmpty()) {
            command.withParameters("--parameter-overrides")
            parameters.forEach { key, value ->
                command.withParameters("$key=$value")
            }
        }

        return runCommand(message("serverless.application.deploy.step_name.create_change_set"), command) { output ->
            changeSetRegex.find(output.stdout)?.value
                    ?: throw RuntimeException(message("serverless.application.deploy.change_set_not_found"))
        }
    }

    private fun finish(changeSet: String): String = changeSet.also {
        changeSetName = changeSet
        progressIndicator.fraction = 1.0
        currentStep = NUMBER_OF_STEPS.toInt()
        okAction.isEnabled = true
        cancelAction.isEnabled = true
    }

    private fun handleError(error: Throwable): String? {
        LOGGER.warn("SAM deploy failed", error)

        val message = if (error.cause is ProcessCanceledException) {
            message("serverless.application.deploy.abort")
        } else {
            ExceptionUtil.getMessage(error) ?: message("serverless.application.deploy.unknown_error")
        }
        setErrorText(message)

        progressIndicator.cancel()
        cancelAction.isEnabled = true
        throw error
    }

    private fun createBaseCommand(): GeneralCommandLine {
        val envVars = mutableMapOf<String, String>()
        envVars.putAll(region.toEnvironmentVariables())
        envVars.putAll(credentialsProvider.resolveCredentials().toEnvironmentVariables())

        return GeneralCommandLine()
            .withExePath(
                SamSettings.getInstance().executablePath ?: throw RuntimeException(message("sam.cli_not_configured"))
            )
            .withWorkDirectory(template.parent.path)
            .withEnvironment(envVars)
    }

    private fun advanceStep() {
        currentStep++
        progressIndicator.fraction = currentStep / NUMBER_OF_STEPS
    }

    private fun <T> runCommand(
        title: String,
        command: GeneralCommandLine,
        result: (output: ProcessOutput) -> T
    ): CompletionStage<T> {
        val consoleView = view.addLogTab(title)
        val future = CompletableFuture<T>()
        val processHandler = createProcess(command)

        consoleView.attachToProcess(processHandler)

        val output = CapturingProcessAdapter()
        processHandler.addProcessListener(output)
        processHandler.addProcessListener(object : ProcessAdapter() {
            override fun processTerminated(event: ProcessEvent) {
                if (event.exitCode == 0) {
                    try {
                        future.complete(result.invoke(output.output))
                    } catch (e: Exception) {
                        future.completeExceptionally(e)
                    }
                } else {
                    future.completeExceptionally(RuntimeException(message("serverless.application.deploy.execution_failed")))
                }
            }
        })

        processHandler.startNotify()

        return future
    }

    protected open fun createProcess(command: GeneralCommandLine): OSProcessHandler =
        ProcessHandlerFactory.getInstance().createColoredProcessHandler(command)

    private companion object {
        const val NUMBER_OF_STEPS = 2.0
        val LOGGER = getLogger<SamDeployDialog>()
    }
}