// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.deploy

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.process.CapturingProcessRunner
import com.intellij.execution.process.OSProcessHandler
import com.intellij.execution.process.ProcessHandlerFactory
import com.intellij.execution.process.ProcessOutput
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.progress.ProcessCanceledException
import com.intellij.openapi.progress.util.ProgressIndicatorBase
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.util.ExceptionUtil
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.credentials.ProjectAccountSettingsManager
import software.aws.toolkits.jetbrains.core.credentials.toEnvironmentVariables
import software.aws.toolkits.jetbrains.core.executables.ExecutableInstance
import software.aws.toolkits.jetbrains.core.executables.ExecutableManager
import software.aws.toolkits.jetbrains.core.executables.getExecutable
import software.aws.toolkits.jetbrains.services.lambda.sam.SamCommon
import software.aws.toolkits.jetbrains.services.lambda.sam.SamExecutable
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.SamTelemetry
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionStage
import javax.swing.Action
import javax.swing.JComponent

class SamDeployDialog(
    private val project: Project,
    private val stackName: String,
    private val template: VirtualFile,
    private val parameters: Map<String, String>,
    private val s3Bucket: String,
    private val autoExecute: Boolean,
    private val useContainer: Boolean,
    private val capabilities: List<CreateCapabilities>
) : DialogWrapper(project) {
    private val progressIndicator = ProgressIndicatorBase()
    private val view = SamDeployView(project, progressIndicator)
    private var currentStep = 0
    private val credentialsProvider = ProjectAccountSettingsManager.getInstance(project).activeCredentialProvider
    private val region = ProjectAccountSettingsManager.getInstance(project).activeRegion
    private val changeSetRegex = "(arn:aws.*?:cloudformation:.*changeSet/[^\\s]*)".toRegex()
    val deployFuture: CompletableFuture<String>
    lateinit var changeSetName: String
        private set

    init {
        Disposer.register(disposable, view)

        progressIndicator.setModalityProgress(null)
        title = message("serverless.application.deploy_in_progress.title", stackName)
        setOKButtonText(message("serverless.application.deploy.execute_change_set"))
        setCancelButtonText(message("general.close_button"))

        super.init()

        deployFuture = executeDeployment().toCompletableFuture()
    }

    override fun createActions(): Array<Action> = if (autoExecute) {
        emptyArray()
    } else {
        super.createActions()
    }

    override fun createCenterPanel(): JComponent? = view.content

    private fun executeDeployment(): CompletionStage<String> {
        okAction.isEnabled = false
        cancelAction.isEnabled = false

        return runSamBuild()
            .thenCompose { builtTemplate -> runSamPackage(builtTemplate) }
            .thenCompose { packageTemplate -> runSamDeploy(packageTemplate) }
            .thenApply { changeSet -> finish(changeSet) }
            .exceptionally { e -> handleError(e) }
    }

    private fun runSamBuild(): CompletionStage<Path> {
        val buildDir = Paths.get(template.parent.path, SamCommon.SAM_BUILD_DIR, "build")

        Files.createDirectories(buildDir)

        return createBaseCommand().thenApply {
            it
                .withParameters("build")
                .withParameters("--template")
                .withParameters(template.path)
                .withParameters("--build-dir")
                .withParameters(buildDir.toString())
                .apply {
                    if (useContainer) {
                        withParameters("--use-container")
                    }
                }

            it
        }.thenCompose {
            val builtTemplate = buildDir.resolve("template.yaml")
            runCommand(message("serverless.application.deploy.step_name.build"), it) { builtTemplate }
        }
    }

    private fun runSamPackage(builtTemplateFile: Path): CompletionStage<Path> {
        advanceStep()
        val packagedTemplatePath = builtTemplateFile.parent.resolve("packaged-${builtTemplateFile.fileName}")
        return createBaseCommand().thenApply {
            it
                .withParameters("package")
                .withParameters("--template-file")
                .withParameters(builtTemplateFile.toString())
                .withParameters("--output-template-file")
                .withParameters(packagedTemplatePath.toString())
                .withParameters("--s3-bucket")
                .withParameters(s3Bucket)

            it
        }.thenCompose {
            runCommand(message("serverless.application.deploy.step_name.package"), it) { packagedTemplatePath }
        }
    }

    private fun runSamDeploy(packagedTemplateFile: Path): CompletionStage<String> {
        advanceStep()
        return createBaseCommand().thenApply { it ->
            it.withParameters("deploy")
                .withParameters("--template-file")
                .withParameters(packagedTemplateFile.toString())
                .withParameters("--stack-name")
                .withParameters(stackName)

            if (capabilities.isNotEmpty()) {
                it.withParameters("--capabilities")
                    .withParameters(capabilities.map { it.capability })
            }

            it.withParameters("--no-execute-changeset")

            if (parameters.isNotEmpty()) {
                it.withParameters("--parameter-overrides")
                parameters.forEach { (key, value) ->
                    it.withParameters("$key=$value")
                }
            }

            it
        }.thenCompose { command ->
            runCommand(message("serverless.application.deploy.step_name.create_change_set"), command) { output ->
                changeSetRegex.find(output.stdout)?.value
                    ?: throw RuntimeException(message("serverless.application.deploy.change_set_not_found"))
            }
        }
    }

    private fun finish(changeSet: String): String = changeSet.also {
        changeSetName = changeSet
        progressIndicator.fraction = 1.0
        currentStep = NUMBER_OF_STEPS.toInt()
        okAction.isEnabled = true
        cancelAction.isEnabled = true

        runInEdt(ModalityState.any()) {
            if (autoExecute) {
                doOKAction()
            }
        }

        SamTelemetry.deploy(
            project = project,
            success = true,
            version = SamCommon.getVersionString()
        )
    }

    private fun handleError(error: Throwable): String {
        LOG.warn(error) { "SAM deploy failed" }

        val message = if (error.cause is ProcessCanceledException) {
            message("serverless.application.deploy.abort")
        } else {
            ExceptionUtil.getMessage(error) ?: message("general.unknown_error")
        }
        setErrorText(message)

        SamTelemetry.deploy(
            project = project,
            success = false,
            version = SamCommon.getVersionString()
        )

        progressIndicator.cancel()
        cancelAction.isEnabled = true
        throw error
    }

    private fun createBaseCommand(): CompletionStage<GeneralCommandLine> {
        val envVars = mutableMapOf<String, String>()
        envVars.putAll(region.toEnvironmentVariables())
        envVars.putAll(credentialsProvider.resolveCredentials().toEnvironmentVariables())

        return ExecutableManager.getInstance().getExecutable<SamExecutable>().thenApply {
            val samExecutable = when (it) {
                is ExecutableInstance.Executable -> it
                else -> throw RuntimeException((it as? ExecutableInstance.BadExecutable)?.validationError)
            }
            return@thenApply samExecutable
                .getCommandLine()
                .withWorkDirectory(template.parent.path)
                .withEnvironment(envVars)
        }
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

        ApplicationManager.getApplication().executeOnPooledThread {
            val output = CapturingProcessRunner(processHandler).runProcess(progressIndicator)
            if (output.exitCode == 0) {
                try {
                    future.complete(result.invoke(output))
                } catch (e: Exception) {
                    future.completeExceptionally(e)
                }
            } else {
                future.completeExceptionally(RuntimeException(message("serverless.application.deploy.execution_failed")))
            }
        }

        return future
    }

    private fun createProcess(command: GeneralCommandLine): OSProcessHandler =
        ProcessHandlerFactory.getInstance().createColoredProcessHandler(command)

    private companion object {
        const val NUMBER_OF_STEPS = 3.0
        val LOG = getLogger<SamDeployDialog>()
    }
}
