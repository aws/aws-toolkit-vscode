// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.upload

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.util.ExceptionUtil
import software.amazon.awssdk.services.lambda.LambdaClient
import software.amazon.awssdk.services.lambda.model.PackageType
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.help.HelpIds
import software.aws.toolkits.jetbrains.services.lambda.LambdaFunction
import software.aws.toolkits.jetbrains.services.lambda.waitForUpdatableState
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.LambdaPackageType
import software.aws.toolkits.telemetry.LambdaTelemetry
import software.aws.toolkits.telemetry.Result
import javax.swing.JComponent

class UpdateFunctionConfigDialog(private val project: Project, private val initialSettings: LambdaFunction) : DialogWrapper(project) {
    private val view = UpdateFunctionConfigPanel(project)

    init {
        super.init()
        title = message("lambda.upload.updateConfiguration.title", initialSettings.name)
        setOKButtonText(message("general.update_button"))

        view.name.text = initialSettings.name
        view.description.text = initialSettings.description

        with(view.configSettings) {
            if (initialSettings.packageType == PackageType.IMAGE) {
                packageImage.isSelected = true
            } else {
                packageZip.isSelected
                runtimeModel.selectedItem = initialSettings.runtime
                handlerPanel.setRuntime(initialSettings.runtime)
                initialSettings.handler?.let {
                    handlerPanel.handler.text = initialSettings.handler
                }
            }
            envVars.envVars = initialSettings.envVariables ?: emptyMap()
            timeoutSlider.value = initialSettings.timeout
            memorySlider.value = initialSettings.memorySize
            iamRole.selectedItem = initialSettings.role
            xrayEnabled.isSelected = initialSettings.xrayEnabled
        }
    }

    override fun createCenterPanel(): JComponent = view.content

    override fun getPreferredFocusedComponent(): JComponent = view.configSettings.handlerPanel.handler

    override fun doValidate(): ValidationInfo? = view.validatePanel()

    override fun doCancelAction() {
        LambdaTelemetry.editFunction(
            project,
            update = true,
            lambdaPackageType = LambdaPackageType.from(view.configSettings.packageType().toString()),
            result = Result.Cancelled
        )
        super.doCancelAction()
    }

    override fun doOKAction() {
        if (!isOKActionEnabled) {
            return
        }

        setOKButtonText(message("general.in_progress_button"))
        isOKActionEnabled = false

        val functionDetails = viewToFunctionDetails()
        val lambdaClient: LambdaClient = project.awsClient()

        ApplicationManager.getApplication().executeOnPooledThread {
            try {
                lambdaClient.waitForUpdatableState(functionDetails.name)
                lambdaClient.updateFunctionConfiguration(functionDetails)

                notifyInfo(
                    project = project,
                    title = message("lambda.service_name"),
                    content = message("lambda.function.configuration_updated.notification", functionDetails.name)
                )
                runInEdt(ModalityState.any()) { close(OK_EXIT_CODE) }
                LambdaTelemetry.editFunction(
                    project,
                    update = true,
                    lambdaPackageType = LambdaPackageType.from(functionDetails.packageType.toString()),
                    result = Result.Succeeded
                )
            } catch (e: Exception) {
                setErrorText(ExceptionUtil.getNonEmptyMessage(e, ExceptionUtil.getNonEmptyMessage(e, e::class.java.simpleName)))
                LambdaTelemetry.editFunction(
                    project,
                    update = true,
                    lambdaPackageType = LambdaPackageType.from(functionDetails.packageType.toString()),
                    result = Result.Failed
                )
                setOKButtonText(message("general.update_button"))
                isOKActionEnabled = true
            }
        }
    }

    private fun viewToFunctionDetails(): FunctionDetails = FunctionDetails(
        name = initialSettings.name,
        description = view.description.text,
        packageType = view.configSettings.packageType(),
        runtime = if (view.configSettings.packageType() == PackageType.ZIP) view.configSettings.runtime.selectedItem as Runtime else null,
        handler = view.configSettings.handlerPanel.handler.text,
        iamRole = view.configSettings.iamRole.selected()!!,
        envVars = view.configSettings.envVars.envVars,
        timeout = view.configSettings.timeoutSlider.value,
        memorySize = view.configSettings.memorySlider.value,
        xrayEnabled = view.configSettings.xrayEnabled.isSelected
    )

    override fun getHelpId(): String = HelpIds.UPDATE_FUNCTION_CONFIGURATION_DIALOG.id
}
