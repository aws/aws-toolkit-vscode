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
import software.aws.toolkits.jetbrains.services.lambda.validOrNull
import software.aws.toolkits.jetbrains.settings.UpdateLambdaSettings
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
        val functionDetails = viewToFunctionDetails()
        val element = findPsiElementsForHandler(project, functionDetails.runtime, functionDetails.handler).first()
        val psiFile = element.containingFile
        val module = ModuleUtil.findModuleForFile(psiFile) ?: throw IllegalStateException("Failed to locate module for $psiFile")

        val s3Bucket = view.codeStorage.sourceBucket.selectedItem as String

        val lambdaBuilder = psiFile.language.runtimeGroup?.let { LambdaBuilder.getInstanceOrNull(it) } ?: return
        val lambdaCreator = LambdaCreatorFactory.create(project, lambdaBuilder)

        FileDocumentManager.getInstance().saveAllDocuments()

        val future = lambdaCreator.createLambda(module, element, functionDetails, s3Bucket)
        future.whenComplete { function, error ->
            when (error) {
                null -> {
                    saveSettings(function.arn)

                    notifyInfo(
                        title = message("lambda.service_name"),
                        content = message("lambda.function.created.notification", functionDetails.name),
                        project = project
                    )
                    LambdaTelemetry.editFunction(project, update = false, result = Result.Succeeded)
                    // If we created a new lambda, clear the resource cache for LIST_FUNCTIONS
                    project.refreshAwsTree(LambdaResources.LIST_FUNCTIONS)
                }
                is Exception -> {
                    error.notifyError(title = message("lambda.service_name"))
                    LambdaTelemetry.editFunction(project, update = false, result = Result.Failed)
                }
            }
        }
        close(OK_EXIT_CODE)
    }

    private fun viewToFunctionDetails(): FunctionUploadDetails = FunctionUploadDetails(
        name = view.name.text.trim(),
        description = view.description.text,
        handler = view.configSettings.handlerPanel.handler.text,
        iamRole = view.configSettings.iamRole.selected()!!,
        runtime = view.configSettings.runtime.selectedItem as Runtime,
        envVars = view.configSettings.envVars.envVars,
        timeout = view.configSettings.timeoutSlider.value,
        memorySize = view.configSettings.memorySlider.value,
        xrayEnabled = view.configSettings.xrayEnabled.isSelected,
        samOptions = SamOptions(
            buildInContainer = view.buildSettings.buildInContainerCheckbox.isSelected
        )
    )

    private fun saveSettings(arn: String) {
        val settings = UpdateLambdaSettings.getInstance(arn)
        settings.bucketName = view.codeStorage.sourceBucket.selectedItem?.toString()
        settings.useContainer = view.buildSettings.buildInContainerCheckbox.isSelected
    }

    @TestOnly
    fun getViewForTestAssertions() = view
}
