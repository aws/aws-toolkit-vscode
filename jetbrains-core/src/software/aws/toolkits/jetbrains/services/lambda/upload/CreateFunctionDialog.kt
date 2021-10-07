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
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.lambda.validOrNull
import software.aws.toolkits.jetbrains.core.explorer.refreshAwsTree
import software.aws.toolkits.jetbrains.core.help.HelpIds
import software.aws.toolkits.jetbrains.services.lambda.Lambda.findPsiElementsForHandler
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilder
import software.aws.toolkits.jetbrains.services.lambda.LambdaLimits.DEFAULT_MEMORY_SIZE
import software.aws.toolkits.jetbrains.services.lambda.LambdaLimits.DEFAULT_TIMEOUT
import software.aws.toolkits.jetbrains.services.lambda.resources.LambdaResources
import software.aws.toolkits.jetbrains.services.lambda.runtimeGroup
import software.aws.toolkits.jetbrains.services.lambda.sam.SamOptions
import software.aws.toolkits.jetbrains.services.lambda.steps.CreateLambda.Companion.FUNCTION_ARN
import software.aws.toolkits.jetbrains.services.lambda.steps.createLambdaWorkflowForImage
import software.aws.toolkits.jetbrains.services.lambda.steps.createLambdaWorkflowForZip
import software.aws.toolkits.jetbrains.settings.UpdateLambdaSettings
import software.aws.toolkits.jetbrains.utils.execution.steps.BuildViewWorkflowEmitter
import software.aws.toolkits.jetbrains.utils.execution.steps.StepExecutor
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.jetbrains.utils.ui.selected
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.LambdaPackageType
import software.aws.toolkits.telemetry.LambdaTelemetry
import software.aws.toolkits.telemetry.Result
import java.nio.file.Paths
import javax.swing.JComponent

class CreateFunctionDialog(private val project: Project, private val initialRuntime: Runtime?, private val handlerName: String?) : DialogWrapper(project) {
    private val view = CreateFunctionPanel(project)

    init {
        super.init()
        title = message("lambda.upload.create.title")
        setOKButtonText(message("lambda.upload.create.title"))

        with(view.configSettings) {
            timeoutSlider.value = DEFAULT_TIMEOUT
            memorySlider.value = DEFAULT_MEMORY_SIZE

            // show a filtered list of runtimes to only ones we can build (since we have to build)
            runtimeModel.setAll(LambdaBuilder.supportedRuntimeGroups().flatMap { it.supportedSdkRuntimes })

            handlerName?.let { handler ->
                handlerPanel.handler.text = handler
            }
            initialRuntime?.validOrNull?.let {
                runtimeModel.selectedItem = it
                handlerPanel.setRuntime(it)
            }
        }
    }

    override fun createCenterPanel(): JComponent = view.content

    override fun getPreferredFocusedComponent(): JComponent = view.name

    override fun doValidate(): ValidationInfo? = view.validatePanel()

    override fun doCancelAction() {
        LambdaTelemetry.deploy(
            project,
            result = Result.Cancelled,
            lambdaPackageType = LambdaPackageType.from(view.configSettings.packageType().toString()),
            initialDeploy = true
        )
        super.doCancelAction()
    }

    override fun doOKAction() {
        upsertLambdaCode()
    }

    override fun getHelpId(): String = HelpIds.CREATE_FUNCTION_DIALOG.id

    private fun upsertLambdaCode() {
        if (!okAction.isEnabled) {
            return
        }

        val functionName = view.name.text
        val workflow = createWorkflow()
        val packageType = LambdaPackageType.from(view.configSettings.packageType().toString())

        workflow.onSuccess = {
            saveSettings(it.getRequiredAttribute(FUNCTION_ARN))

            notifyInfo(
                project = project,
                title = message("lambda.service_name"),
                content = message("lambda.function.created.notification", functionName)
            )
            LambdaTelemetry.deploy(
                project,
                result = Result.Succeeded,
                lambdaPackageType = packageType,
                initialDeploy = true
            )
            project.refreshAwsTree(LambdaResources.LIST_FUNCTIONS)
        }

        workflow.onError = {
            it.notifyError(project = project, title = message("lambda.service_name"))
            LambdaTelemetry.deploy(
                project,
                result = Result.Failed,
                lambdaPackageType = packageType,
                initialDeploy = true
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

        val workflow = when (val packageType = view.configSettings.packageType()) {
            PackageType.ZIP -> {
                val runtime = view.configSettings.runtime.selected() ?: throw IllegalStateException("Runtime is missing when package type is Zip")
                val handler = view.configSettings.handlerPanel.handler.text

                val functionDetails = viewToFunctionDetails(runtime, handler)

                // TODO: Move this so we can share it with CreateFunctionDialog, but don't move it lower since passing PsiElement lower needs to go away since
                // it is causing customer complaints. We need to prompt for baseDir and try to infer it if we can but only as a default value...
                val element = findPsiElementsForHandler(project, runtime, handler).first()
                val module = ModuleUtil.findModuleForPsiElement(element) ?: throw IllegalStateException("Failed to locate module for $element")
                val lambdaBuilder = runtime.runtimeGroup?.let { LambdaBuilder.getInstanceOrNull(it) }
                    ?: throw IllegalStateException("LambdaBuilder for $runtime not found")

                val codeDetails = ZipBasedCode(
                    baseDir = lambdaBuilder.handlerBaseDirectory(module, element),
                    handler = handler,
                    runtime = runtime
                )

                createLambdaWorkflowForZip(
                    project = project,
                    functionDetails = functionDetails,
                    codeDetails = codeDetails,
                    buildDir = lambdaBuilder.getBuildDirectory(module),
                    buildEnvVars = lambdaBuilder.additionalBuildEnvironmentVariables(project, module, samOptions),
                    codeStorageLocation = view.codeStorage.codeLocation(),
                    samOptions = samOptions
                )
            }
            PackageType.IMAGE -> {
                val functionDetails = viewToFunctionDetails()
                val codeDetails = ImageBasedCode(
                    dockerfile = Paths.get(view.configSettings.dockerFile.text)
                )

                createLambdaWorkflowForImage(
                    project = project,
                    functionDetails = functionDetails,
                    codeDetails = codeDetails,
                    codeStorageLocation = view.codeStorage.codeLocation(),
                    samOptions = samOptions
                )
            }
            else -> throw UnsupportedOperationException("$packageType is not supported")
        }

        val emitter = BuildViewWorkflowEmitter.createEmitter(
            project,
            message("lambda.workflow.create_new.name"),
            view.name.text
        )
        return StepExecutor(project, workflow, emitter)
    }

    private fun viewToFunctionDetails(runtime: Runtime? = null, handler: String? = null): FunctionDetails = FunctionDetails(
        name = view.name.text.trim(),
        description = view.description.text,
        packageType = view.configSettings.packageType(),
        runtime = runtime,
        handler = handler,
        iamRole = view.configSettings.iamRole.selected()!!,
        envVars = view.configSettings.envVars.envVars,
        timeout = view.configSettings.timeoutSlider.value,
        memorySize = view.configSettings.memorySlider.value,
        xrayEnabled = view.configSettings.xrayEnabled.isSelected
    )

    private fun saveSettings(arn: String) {
        val settings = UpdateLambdaSettings.getInstance(arn)
        settings.bucketName = view.codeStorage.sourceBucket.selected()
        settings.ecrRepo = view.codeStorage.ecrRepo.selected()?.repositoryArn
        settings.dockerfile = view.configSettings.dockerFile.text.nullize()
        settings.useContainer = view.buildSettings.buildInContainerCheckbox.isSelected
    }

    @TestOnly
    fun getViewForTestAssertions() = view
}
