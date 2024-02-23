// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.upload

import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.module.ModuleUtil
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.util.text.nullize
import org.jetbrains.annotations.TestOnly
import software.amazon.awssdk.services.lambda.model.PackageType
import software.aws.toolkits.jetbrains.core.help.HelpIds
import software.aws.toolkits.jetbrains.services.lambda.Lambda.findPsiElementsForHandler
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilder
import software.aws.toolkits.jetbrains.services.lambda.LambdaFunction
import software.aws.toolkits.jetbrains.services.lambda.runtimeGroup
import software.aws.toolkits.jetbrains.services.lambda.sam.SamOptions
import software.aws.toolkits.jetbrains.services.lambda.steps.updateLambdaCodeWorkflowForImage
import software.aws.toolkits.jetbrains.services.lambda.steps.updateLambdaCodeWorkflowForZip
import software.aws.toolkits.jetbrains.settings.UpdateLambdaSettings
import software.aws.toolkits.jetbrains.utils.execution.steps.BuildViewWorkflowEmitter
import software.aws.toolkits.jetbrains.utils.execution.steps.StepExecutor
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.LambdaPackageType
import software.aws.toolkits.telemetry.LambdaTelemetry
import software.aws.toolkits.telemetry.Result
import java.nio.file.Paths
import javax.swing.JComponent

class UpdateFunctionCodeDialog(private val project: Project, private val initialSettings: LambdaFunction) : DialogWrapper(project) {
    private val view = UpdateFunctionCodePanel(project, initialSettings.packageType)
    private val updateSettings = UpdateLambdaSettings.getInstance(initialSettings.arn)

    init {
        super.init()
        title = message("lambda.upload.updateCode.title", initialSettings.name)
        setOKButtonText(message("general.update_button"))

        initialSettings.handler?.let {
            view.handlerPanel.handler.text = it
        }
        view.handlerPanel.setRuntime(initialSettings.runtime)

        loadSettings()
    }

    override fun createCenterPanel(): JComponent = view.content

    override fun getPreferredFocusedComponent(): JComponent = view.handlerPanel.handler

    override fun doValidate(): ValidationInfo? = view.validatePanel()

    override fun doCancelAction() {
        LambdaTelemetry.deploy(
            project,
            result = Result.Cancelled,
            lambdaPackageType = LambdaPackageType.from(initialSettings.packageType.toString()),
            initialDeploy = false
        )
        super.doCancelAction()
    }

    override fun doOKAction() {
        saveSettings()
        upsertLambdaCode()
    }

    override fun getHelpId(): String = HelpIds.UPDATE_FUNCTION_CODE_DIALOG.id

    private fun upsertLambdaCode() {
        if (!okAction.isEnabled) {
            return
        }

        val workflow = createWorkflow()

        workflow.onSuccess = {
            notifyInfo(
                project = project,
                title = message("lambda.service_name"),
                content = message("lambda.function.code_updated.notification", initialSettings.name)
            )
            LambdaTelemetry.deploy(
                project,
                result = Result.Succeeded,
                lambdaPackageType = LambdaPackageType.from(initialSettings.packageType.toString()),
                initialDeploy = false
            )
        }

        workflow.onError = {
            it.notifyError(project = project, title = message("lambda.service_name"))
            LambdaTelemetry.deploy(
                project,
                result = Result.Failed,
                lambdaPackageType = LambdaPackageType.from(initialSettings.packageType.toString()),
                initialDeploy = false
            )
        }

        workflow.startExecution()

        close(OK_EXIT_CODE)
    }

    @TestOnly
    fun createWorkflow(): StepExecutor {
        FileDocumentManager.getInstance().saveAllDocuments()

        val samOptions = SamOptions(
            buildInContainer = view.buildSettings.buildInContainerCheckbox.isSelected
        )

        val workflow = when (val packageType = initialSettings.packageType) {
            PackageType.ZIP -> {
                val runtime = initialSettings.runtime ?: throw IllegalStateException("Runtime is missing when package type is Zip")
                val handler = view.handlerPanel.handler.text

                // TODO: Move this so we can share it with CreateFunctionDialog, but don't move it lower since passing PsiElement lower needs to go away since
                // it is causing customer complaints. We need to prompt for baseDir and try to infer it if we can but only as a default value...
                val element = findPsiElementsForHandler(project, runtime, handler).first()
                val module = ModuleUtil.findModuleForPsiElement(element) ?: throw IllegalStateException("Failed to locate module for $element")
                val lambdaBuilder = initialSettings.runtime.runtimeGroup?.let { LambdaBuilder.getInstanceOrNull(it) }
                    ?: throw IllegalStateException("LambdaBuilder for ${initialSettings.runtime} not found")

                val codeDetails = ZipBasedCode(
                    baseDir = lambdaBuilder.handlerBaseDirectory(module, element),
                    handler = handler,
                    runtime = runtime
                )

                updateLambdaCodeWorkflowForZip(
                    project = project,
                    functionName = initialSettings.name,
                    codeDetails = codeDetails,
                    buildDir = lambdaBuilder.getBuildDirectory(module),
                    buildEnvVars = lambdaBuilder.additionalBuildEnvironmentVariables(project, module, samOptions),
                    codeStorageLocation = view.codeStorage.codeLocation(),
                    samOptions = samOptions,
                    updatedHandler = handler.takeIf { it != initialSettings.handler }
                )
            }
            PackageType.IMAGE -> {
                val codeDetails = ImageBasedCode(
                    dockerfile = Paths.get(view.dockerFile.text)
                )

                updateLambdaCodeWorkflowForImage(
                    project = project,
                    functionName = initialSettings.name,
                    codeDetails = codeDetails,
                    codeStorageLocation = view.codeStorage.codeLocation(),
                    samOptions = samOptions
                )
            }
            else -> throw UnsupportedOperationException("$packageType is not supported")
        }

        val emitter = BuildViewWorkflowEmitter.createEmitter(project, message("lambda.workflow.update_code.name"), initialSettings.name)
        return StepExecutor(project, workflow, emitter)
    }

    private fun loadSettings() {
        view.codeStorage.sourceBucket.selectedItem = updateSettings.bucketName
        updateSettings.ecrRepo?.let { savedArn ->
            view.codeStorage.ecrRepo.selectedItem { it.repositoryArn == savedArn }
        }
        updateSettings.dockerfile?.let {
            view.dockerFile.text = it
        }
        view.buildSettings.buildInContainerCheckbox.isSelected = updateSettings.useContainer ?: false
    }

    private fun saveSettings() {
        updateSettings.bucketName = view.codeStorage.sourceBucket.selected()
        updateSettings.ecrRepo = view.codeStorage.ecrRepo.selected()?.repositoryArn
        updateSettings.dockerfile = view.dockerFile.text.nullize()
        updateSettings.useContainer = view.buildSettings.buildInContainerCheckbox.isSelected
    }

    @TestOnly
    fun getViewForTestAssertions() = view
}
