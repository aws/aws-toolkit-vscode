// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.upload

import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.module.ModuleUtil
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.ValidationInfo
import org.jetbrains.annotations.TestOnly
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.core.explorer.refreshAwsTree
import software.aws.toolkits.jetbrains.core.help.HelpIds
import software.aws.toolkits.jetbrains.services.lambda.Lambda.findPsiElementsForHandler
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilder
import software.aws.toolkits.jetbrains.services.lambda.LambdaLimits.DEFAULT_MEMORY_SIZE
import software.aws.toolkits.jetbrains.services.lambda.LambdaLimits.DEFAULT_TIMEOUT
import software.aws.toolkits.jetbrains.services.lambda.resources.LambdaResources
import software.aws.toolkits.jetbrains.services.lambda.runtimeGroup
import software.aws.toolkits.jetbrains.services.lambda.sam.SamOptions
import software.aws.toolkits.jetbrains.services.lambda.upload.steps.CreateLambda.Companion.FUNCTION_ARN
import software.aws.toolkits.jetbrains.services.lambda.upload.steps.createLambdaWorkflow
import software.aws.toolkits.jetbrains.services.lambda.validOrNull
import software.aws.toolkits.jetbrains.settings.UpdateLambdaSettings
import software.aws.toolkits.jetbrains.utils.execution.steps.StepExecutor
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.LambdaTelemetry
import software.aws.toolkits.telemetry.Result
import javax.swing.JComponent

class CreateFunctionDialog(private val project: Project, private val initialRuntime: Runtime?, private val handlerName: String?) : DialogWrapper(project) {
    private val view = CreateFunctionPanel(project)

    init {
        super.init()
        title = message("lambda.upload.create.title")
        setOKButtonText(message("lambda.upload.create.title"))

        with(view.configSettings) {
            handlerName?.let { handler ->
                handlerPanel.handler.text = handler
            }
            timeoutSlider.value = DEFAULT_TIMEOUT
            memorySlider.value = DEFAULT_MEMORY_SIZE

            // show a filtered list of runtimes to only ones we can build (since we have to build)
            runtimeModel.setAll(LambdaBuilder.supportedRuntimeGroups().flatMap { it.runtimes })

            initialRuntime?.validOrNull?.let {
                runtime.selectedItem = it
                handlerPanel.setRuntime(it)
            }
        }
    }

    override fun createCenterPanel(): JComponent? = view.content

    override fun getPreferredFocusedComponent(): JComponent? = view.name

    override fun doValidate(): ValidationInfo? = view.validatePanel()

    override fun doCancelAction() {
        LambdaTelemetry.editFunction(project, result = Result.Cancelled)
        super.doCancelAction()
    }

    override fun doOKAction() {
        upsertLambdaCode()
    }

    override fun getHelpId(): String? = HelpIds.CREATE_FUNCTION_DIALOG.id

    private fun upsertLambdaCode() {
        if (!okAction.isEnabled) {
            return
        }
        FileDocumentManager.getInstance().saveAllDocuments()

        val functionDetails = viewToFunctionDetails()
        val samOptions = SamOptions(
            buildInContainer = view.buildSettings.buildInContainerCheckbox.isSelected
        )

        // TODO: Move this so we can share it with UpdateCodeDialog, but don't move it lower since passing PsiElement lower needs to go away since
        // it is causing customer complaints. We need to prompt for baseDir and try to infer it if we can but only as a default value...
        val element = findPsiElementsForHandler(project, functionDetails.runtime, functionDetails.handler).first()
        val module = ModuleUtil.findModuleForPsiElement(element) ?: throw IllegalStateException("Failed to locate module for $element")
        val lambdaBuilder = functionDetails.runtime.runtimeGroup?.let { LambdaBuilder.getInstanceOrNull(it) }
            ?: throw IllegalStateException("LambdaBuilder for ${functionDetails.runtime} not found")
        val s3Bucket = view.codeStorage.sourceBucket.selectedItem as String

        val codeDetails = CodeDetails(
            baseDir = lambdaBuilder.handlerBaseDirectory(module, element),
            handler = functionDetails.handler,
            runtime = functionDetails.runtime
        )

        val workflow = createLambdaWorkflow(
            project = project,
            codeDetails = codeDetails,
            buildDir = lambdaBuilder.getBuildDirectory(module), // TODO ... how do we kill module here? Can we use a temp dir?
            buildEnvVars = lambdaBuilder.additionalEnvironmentVariables(module, samOptions),
            codeStorageLocation = s3Bucket,
            samOptions = samOptions,
            functionDetails = functionDetails
        )

        StepExecutor(project, message("lambda.workflow.create_new.name"), workflow, functionDetails.name).startExecution(
            onSuccess = {
                saveSettings(it.getRequiredAttribute(FUNCTION_ARN))

                notifyInfo(
                    project = project,
                    title = message("lambda.service_name"),
                    content = message("lambda.function.created.notification", functionDetails.name)
                )
                LambdaTelemetry.editFunction(project, update = false, result = Result.Succeeded)
                project.refreshAwsTree(LambdaResources.LIST_FUNCTIONS)
            },
            onError = {
                it.notifyError(project = project, title = message("lambda.service_name"))
                LambdaTelemetry.editFunction(project, update = false, result = Result.Failed)
            }
        )
        close(OK_EXIT_CODE)
    }

    private fun viewToFunctionDetails(): FunctionDetails = FunctionDetails(
        name = view.name.text.trim(),
        handler = view.configSettings.handlerPanel.handler.text,
        iamRole = view.configSettings.iamRole.selected()!!,
        runtime = view.configSettings.runtime.selectedItem as Runtime,
        description = view.description.text,
        envVars = view.configSettings.envVars.envVars,
        timeout = view.configSettings.timeoutSlider.value,
        memorySize = view.configSettings.memorySlider.value,
        xrayEnabled = view.configSettings.xrayEnabled.isSelected
    )

    private fun saveSettings(arn: String) {
        val settings = UpdateLambdaSettings.getInstance(arn)
        settings.bucketName = view.codeStorage.sourceBucket.selectedItem?.toString()
        settings.useContainer = view.buildSettings.buildInContainerCheckbox.isSelected
    }

    @TestOnly
    fun getViewForTestAssertions() = view
}
