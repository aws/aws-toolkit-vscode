// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.upload

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.module.ModuleUtil
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.util.text.nullize
import com.intellij.util.ui.UIUtil
import org.jetbrains.annotations.TestOnly
import software.amazon.awssdk.services.iam.IamClient
import software.amazon.awssdk.services.lambda.LambdaClient
import software.amazon.awssdk.services.lambda.model.Runtime
import software.amazon.awssdk.services.s3.S3Client
import software.aws.toolkits.core.utils.listBucketsByRegion
import software.aws.toolkits.jetbrains.components.telemetry.LoggingDialogWrapper
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.credentials.ProjectAccountSettingsManager
import software.aws.toolkits.jetbrains.core.help.HelpIds
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.jetbrains.services.iam.CreateIamRoleDialog
import software.aws.toolkits.jetbrains.services.iam.IamRole
import software.aws.toolkits.jetbrains.services.iam.listRolesFilter
import software.aws.toolkits.jetbrains.services.lambda.Lambda.findPsiElementsForHandler
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilder
import software.aws.toolkits.jetbrains.services.lambda.LambdaFunction
import software.aws.toolkits.jetbrains.services.lambda.runtimeGroup
import software.aws.toolkits.jetbrains.services.lambda.upload.EditFunctionMode.NEW
import software.aws.toolkits.jetbrains.services.lambda.upload.EditFunctionMode.UPDATE_CODE
import software.aws.toolkits.jetbrains.services.lambda.upload.EditFunctionMode.UPDATE_CONFIGURATION
import software.aws.toolkits.jetbrains.services.lambda.validOrNull
import software.aws.toolkits.jetbrains.services.s3.CreateS3BucketDialog
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.jetbrains.utils.ui.blankAsNull
import software.aws.toolkits.jetbrains.utils.ui.selected
import software.aws.toolkits.resources.message
import java.awt.event.ActionEvent
import java.awt.event.FocusAdapter
import java.awt.event.FocusEvent
import java.util.concurrent.TimeUnit
import java.util.function.Function
import javax.swing.Action
import javax.swing.JComponent
import javax.swing.JSlider
import javax.swing.JTextField

private const val MIN_MEMORY = 128
private const val MAX_MEMORY = 3008
private const val MEMORY_INCREMENT = 64
private const val DEFAULT_MEMORY = 128
private val DEFAULT_TIMEOUT = TimeUnit.MINUTES.toSeconds(1).toInt()
private val MAX_TIMEOUT = TimeUnit.MINUTES.toSeconds(15).toInt()
private const val MIN_TIMEOUT = 1
private val NOTIFICATION_TITLE = message("lambda.service_name")

enum class EditFunctionMode {
    NEW, UPDATE_CONFIGURATION, UPDATE_CODE
}

class EditFunctionDialog(
    private val project: Project,
    private val mode: EditFunctionMode,
    private val name: String = "",
    private val description: String = "",
    private val runtime: Runtime? = null,
    private val handlerName: String = "",
    private val envVariables: Map<String, String> = emptyMap(),
    private val timeout: Int = DEFAULT_TIMEOUT,
    private val memorySize: Int = DEFAULT_MEMORY,
    private val xrayEnabled: Boolean = false,
    private val role: IamRole? = null
) : LoggingDialogWrapper(project) {

    constructor(project: Project, lambdaFunction: LambdaFunction, mode: EditFunctionMode = UPDATE_CONFIGURATION) :
            this(
                project = project,
                mode = mode,
                name = lambdaFunction.name,
                description = lambdaFunction.description ?: "",
                runtime = lambdaFunction.runtime,
                handlerName = lambdaFunction.handler,
                envVariables = lambdaFunction.envVariables ?: emptyMap(),
                timeout = lambdaFunction.timeout,
                memorySize = lambdaFunction.memorySize,
                xrayEnabled = lambdaFunction.xrayEnabled,
                role = lambdaFunction.role
            )

    private val view = EditFunctionPanel(project)
    private val validator = UploadToLambdaValidator()
    private val s3Client: S3Client = project.awsClient()
    private val iamClient: IamClient = project.awsClient()

    private val action: OkAction = when (mode) {
        NEW -> CreateNewLambdaOkAction()
        UPDATE_CONFIGURATION -> UpdateFunctionOkAction({ validator.validateConfigurationSettings(view) }, ::updateConfiguration)
        UPDATE_CODE -> UpdateFunctionOkAction({ validator.validateCodeSettings(project, view) }, ::upsertLambdaCode)
    }

    init {
        super.init()
        title = when (mode) {
            NEW -> message("lambda.upload.create.title")
            UPDATE_CONFIGURATION -> message("lambda.upload.updateConfiguration.title", name)
            UPDATE_CODE -> message("lambda.upload.updateCode.title", name)
        }

        view.name.text = name

        view.handler.text = handlerName
        view.timeout.text = timeout.toString()
        view.memorySize.text = memorySize.toString()
        view.description.text = description
        view.envVars.envVars = envVariables

        if (mode == UPDATE_CONFIGURATION) {
            view.name.isEnabled = false
            view.deploySettings.isVisible = false
        } else {
            view.sourceBucket.populateValues {
                val activeRegionId = ProjectAccountSettingsManager.getInstance(project).activeRegion.id
                s3Client.listBucketsByRegion(activeRegionId)
                    .mapNotNull { it.name() }
                    .sortedWith(String.CASE_INSENSITIVE_ORDER)
                    .toList()
            }

            view.createBucket.addActionListener {
                val bucketDialog = CreateS3BucketDialog(
                    project = project,
                    s3Client = s3Client,
                    parent = view.content
                )

                if (bucketDialog.showAndGet()) {
                    bucketDialog.bucketName().let { newBucket -> view.sourceBucket.addAndSelectValue { newBucket } }
                }
            }
        }

        if (mode == UPDATE_CODE) {
            UIUtil.uiChildren(view.configurationSettings).filter { it !== view.handler && it !== view.handlerLabel }.forEach { it.isVisible = false }
        }

        view.setRuntimes(Runtime.knownValues())
        view.runtime.selectedItem = runtime?.validOrNull

        view.xrayEnabled.isSelected = xrayEnabled

        val regionProvider = AwsRegionProvider.getInstance()
        val settings = ProjectAccountSettingsManager.getInstance(project)
        view.setXrayControlVisibility(mode != UPDATE_CODE && regionProvider.isServiceSupported(settings.activeRegion, "xray"))

        view.iamRole.populateValues(default = role) {
            iamClient.listRolesFilter { it.assumeRolePolicyDocument().contains(LAMBDA_PRINCIPAL) }
                .map { IamRole(it.arn()) }
                .sortedWith(Comparator.comparing<IamRole, String>(Function { it.toString() }, String.CASE_INSENSITIVE_ORDER))
                .toList()
        }

        view.createRole.addActionListener {
            val iamRoleDialog = CreateIamRoleDialog(
                project = project,
                iamClient = iamClient,
                parent = view.content,
                defaultAssumeRolePolicyDocument = DEFAULT_ASSUME_ROLE_POLICY,
                defaultPolicyDocument = DEFAULT_POLICY
            )
            if (iamRoleDialog.showAndGet()) {
                iamRoleDialog.iamRole?.let { newRole -> view.iamRole.addAndSelectValue { newRole } }
            }
        }

        bindSliderToTextBox(view.memorySlider, view.memorySize, MIN_MEMORY, MAX_MEMORY, MEMORY_INCREMENT, MEMORY_INCREMENT * 5, true)
        bindSliderToTextBox(view.timeoutSlider, view.timeout, 0, MAX_TIMEOUT, 10, 100, false) {
            if (view.timeoutSlider.value < MIN_TIMEOUT) {
                MIN_TIMEOUT
            } else {
                view.timeoutSlider.value
            }
        }
    }

    private fun configurationChanged(): Boolean = mode != NEW && !(name == view.name.text &&
        description == view.description.text &&
        runtime == view.runtime.selected() &&
        handlerName == view.handler.text &&
        envVariables.entries == view.envVars.envVars.entries &&
        timeout == view.timeout.text.toIntOrNull() &&
        memorySize == view.memorySize.text.toIntOrNull() &&
        xrayEnabled == view.xrayEnabled.isSelected &&
        role == view.iamRole.selected())

    private fun bindSliderToTextBox(
        slider: JSlider,
        textbox: JTextField,
        min: Int,
        max: Int,
        minorTick: Int,
        majorTick: Int,
        snap: Boolean,
        validate: (Int) -> Int = { it }
    ) {
        slider.majorTickSpacing = majorTick
        slider.minorTickSpacing = minorTick
        slider.maximum = max
        slider.minimum = min
        slider.paintLabels = true
        slider.snapToTicks = snap
        slider.labelTable
        slider.value = textbox.text.toInt()
        slider.addChangeListener {
            textbox.text = validate(slider.value).toString()
        }
        textbox.addFocusListener(object : FocusAdapter() {
            override fun focusLost(e: FocusEvent?) {
                slider.value = textbox.text.toIntOrNull() ?: return
            }
        })
    }

    override fun createCenterPanel(): JComponent? = view.content

    override fun getPreferredFocusedComponent(): JComponent? = view.name

    override fun doValidate(): ValidationInfo? = when (mode) {
        NEW -> validator.validateConfigurationSettings(view) ?: validator.validateCodeSettings(project, view)
        UPDATE_CONFIGURATION -> validator.validateConfigurationSettings(view)
        UPDATE_CODE -> validator.validateCodeSettings(project, view)
    }

    override fun getOKAction(): Action = action

    override fun doOKAction() {
        // Do nothing, close logic is handled separately
    }

    override fun getHelpId(): String? =
        when (mode) {
            NEW -> HelpIds.CREATE_FUNCTION_DIALOG.id
            UPDATE_CONFIGURATION -> HelpIds.UPDATE_FUNCTION_CONFIGURATION_DIALOG.id
            UPDATE_CODE -> HelpIds.UPDATE_FUNCTION_CODE_DIALOG.id
        }

    private fun upsertLambdaCode() {
        if (okAction.isEnabled) {
            val functionDetails = viewToFunctionDetails()
            val element = findPsiElementsForHandler(project, functionDetails.runtime, functionDetails.handler).first()
            val psiFile = element.containingFile
            val module = ModuleUtil.findModuleForFile(psiFile) ?: throw IllegalStateException("Failed to locate module for $psiFile")

            val s3Bucket = view.sourceBucket.selectedItem as String

            val lambdaBuilder = psiFile.language.runtimeGroup?.let { LambdaBuilder.getInstance(it) } ?: return
            val lambdaCreator = LambdaCreatorFactory.create(AwsClientManager.getInstance(project), lambdaBuilder)

            FileDocumentManager.getInstance().saveAllDocuments()

            val (future, message) = if (mode == UPDATE_CODE) {
                lambdaCreator.updateLambda(module, element, functionDetails, s3Bucket, configurationChanged()) to
                    message("lambda.function.code_updated.notification", functionDetails.name)
            } else {
                lambdaCreator.createLambda(module, element, functionDetails, s3Bucket) to
                    message("lambda.function.created.notification", functionDetails.name)
            }

            future.whenComplete { _, error ->
                when (error) {
                    null -> notifyInfo(title = NOTIFICATION_TITLE, content = message, project = project)
                    is Exception -> error.notifyError(title = NOTIFICATION_TITLE)
                }
            }
            close(OK_EXIT_CODE)
        }
    }

    private fun updateConfiguration() {
        if (okAction.isEnabled) {

            val functionDetails = viewToFunctionDetails()
            val lambdaClient: LambdaClient = project.awsClient()

            ApplicationManager.getApplication().executeOnPooledThread {
                LambdaFunctionCreator(lambdaClient).update(functionDetails)
                    .thenAccept { runInEdt(ModalityState.any()) { close(OK_EXIT_CODE) } }
                    .whenComplete { _, error ->
                        when (error) {
                            null -> notifyInfo(
                                title = NOTIFICATION_TITLE,
                                content = message("lambda.function.configuration_updated.notification", functionDetails.name)
                            )
                            is Exception -> error.notifyError(title = NOTIFICATION_TITLE)
                        }
                    }
            }
        }
    }

    private fun viewToFunctionDetails(): FunctionUploadDetails = FunctionUploadDetails(
        name = view.name.text!!,
        handler = view.handler.text,
        iamRole = view.iamRole.selected()!!,
        runtime = view.runtime.selected()!!,
        description = view.description.text,
        envVars = view.envVars.envVars,
        timeout = view.timeout.text.toInt(),
        memorySize = view.memorySize.text.toInt(),
        xrayEnabled = view.xrayEnabled.isSelected
    )

    private inner class CreateNewLambdaOkAction : OkAction() {
        init {
            putValue(Action.NAME, message("lambda.upload.create.title"))
        }

        override fun doAction(e: ActionEvent?) {
            // We normally don't validate the deploy settings in case they are editing settings only, but they requested
            // to deploy so start validating that too
            super.doAction(e)
            if (doValidateAll().isNotEmpty()) return
            upsertLambdaCode()
        }
    }

    // Using an OkAction to force the validation logic to trigger as well
    private inner class UpdateFunctionOkAction(private val validation: () -> ValidationInfo?, private val performUpdate: () -> Unit) : OkAction() {
        init {
            putValue(Action.NAME, message("lambda.upload.update_settings_button.title"))
        }

        override fun doAction(e: ActionEvent?) {
            super.doAction(e)
            if (validation() == null) {
                performUpdate()
            }
        }
    }

    override fun getNamespace(): String = "${mode.name}FunctionDialog"

    @TestOnly
    fun getViewForTestAssertions() = view
}

class UploadToLambdaValidator {
    fun validateConfigurationSettings(view: EditFunctionPanel): ValidationInfo? {
        val name = view.name.blankAsNull() ?: return ValidationInfo(
            message("lambda.upload_validation.function_name"),
            view.name
        )
        validateFunctionName(name)?.run { return@validateConfigurationSettings ValidationInfo(this, view.name) }
        view.handler.text.nullize(true) ?: return ValidationInfo(
            message("lambda.upload_validation.handler"),
            view.handler
        )
        view.runtime.selected() ?: return ValidationInfo(message("lambda.upload_validation.runtime"), view.runtime)
        view.timeout.text.toIntOrNull().let {
            if (it == null || it < MIN_TIMEOUT || it > MAX_TIMEOUT) {
                return ValidationInfo(
                    message("lambda.upload_validation.timeout", MIN_TIMEOUT, MAX_TIMEOUT),
                    view.timeout
                )
            }
        }
        view.memorySize.text.toIntOrNull().let {
            if (it == null || it < MIN_MEMORY || it > MAX_MEMORY || it.rem(MEMORY_INCREMENT) != 0) {
                return ValidationInfo(
                    message("lambda.upload_validation.memory", MIN_MEMORY, MAX_MEMORY, MEMORY_INCREMENT), view.memorySize
                )
            }
        }
        view.iamRole.selected() ?: return view.iamRole.toValidationInfo(
            loading = message("lambda.upload_validation.iam_role.loading"),
            notSelected = message("lambda.upload_validation.iam_role")
        )

        return null
    }

    fun validateCodeSettings(project: Project, view: EditFunctionPanel): ValidationInfo? {
        val handler = view.handler.text
        val runtime = view.runtime.selected()
                ?: return ValidationInfo(message("lambda.upload_validation.runtime"), view.runtime)

        runtime.runtimeGroup?.let { LambdaBuilder.getInstance(it) } ?: return ValidationInfo(
            message("lambda.upload_validation.unsupported_runtime", runtime),
            view.runtime
        )

        findPsiElementsForHandler(project, runtime, handler).firstOrNull() ?: return ValidationInfo(
            message("lambda.upload_validation.handler_not_found"),
            view.handler
        )

        view.sourceBucket.selected() ?: return view.sourceBucket.toValidationInfo(
            loading = message("lambda.upload_validation.source_bucket.loading"),
            notSelected = message("lambda.upload_validation.source_bucket")
        )

        return null
    }

    private fun validateFunctionName(name: String): String? {
        if (!FUNCTION_NAME_PATTERN.matches(name)) {
            return message("lambda.upload_validation.function_name_invalid")
        }
        if (name.length > 64) {
            return message("lambda.upload_validation.function_name_too_long", 64)
        }
        return null
    }

    companion object {
        private val FUNCTION_NAME_PATTERN = "[a-zA-Z0-9-_]+".toRegex()
    }
}