// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.upload

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.module.ModuleUtil
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.util.text.nullize
import software.amazon.awssdk.services.iam.IamClient
import software.amazon.awssdk.services.lambda.LambdaClient
import software.amazon.awssdk.services.lambda.model.Runtime
import software.amazon.awssdk.services.s3.S3Client
import software.aws.toolkits.core.utils.listBucketsByRegion
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.credentials.ProjectAccountSettingsManager
import software.aws.toolkits.jetbrains.services.iam.CreateIamRoleDialog
import software.aws.toolkits.jetbrains.services.iam.IamRole
import software.aws.toolkits.jetbrains.services.iam.listRolesFilter
import software.aws.toolkits.jetbrains.services.lambda.Lambda.findPsiElementsForHandler
import software.aws.toolkits.jetbrains.services.lambda.LambdaFunction
import software.aws.toolkits.jetbrains.services.lambda.LambdaPackager
import software.aws.toolkits.jetbrains.services.lambda.runtimeGroup
import software.aws.toolkits.jetbrains.services.s3.CreateS3BucketDialog
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.jetbrains.utils.ui.addAndSelectValue
import software.aws.toolkits.jetbrains.utils.ui.blankAsNull
import software.aws.toolkits.jetbrains.utils.ui.populateValues
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

class EditLambdaDialog(
    private val project: Project,
    private val isUpdate: Boolean,
    name: String = "",
    description: String = "",
    runtime: Runtime? = null,
    handlerName: String = "",
    envVariables: Map<String, String> = emptyMap(),
    timeout: Int = DEFAULT_TIMEOUT,
    memorySize: Int = DEFAULT_MEMORY,
    role: IamRole? = null
) : DialogWrapper(project) {

    constructor(project: Project, lambdaFunction: LambdaFunction) :
            this(
                project = project,
                isUpdate = true,
                name = lambdaFunction.name,
                description = lambdaFunction.description ?: "",
                runtime = lambdaFunction.runtime,
                handlerName = lambdaFunction.handler,
                envVariables = lambdaFunction.envVariables ?: emptyMap(),
                timeout = lambdaFunction.timeout,
                memorySize = lambdaFunction.memorySize,
                role = lambdaFunction.role
            )

    private val view = EditLambdaPanel(project)
    private val validator = UploadToLambdaValidator()
    private val s3Client: S3Client = project.awsClient()
    private val iamClient: IamClient = project.awsClient()

    private val updateAction = UpdateLambdaSettingsAction()
    private val deployAction = DeployLambdaAction()

    private var validateDeploySettings = false

    init {
        super.init()
        title = if (isUpdate) message("lambda.upload.edit.title", name) else message("lambda.upload.create.title")

        view.name.text = name

        if (isUpdate) {
            view.name.isEnabled = false
        }

        view.handler.text = handlerName
        view.timeout.text = timeout.toString()
        view.memorySize.text = memorySize.toString()
        view.description.text = description
        view.envVars.envVars = envVariables

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

        view.runtime.populateValues(selected = runtime) { Runtime.knownValues() }

        view.iamRole.populateValues(selected = role) {
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

    override fun doValidate(): ValidationInfo? {
        val validateSettings = validator.validateSettings(view)
        updateAction.isEnabled = validateSettings == null // We can call update settings, but not deploy lambda

        return validateSettings ?: if (validateDeploySettings) validator.validateDeploymentSettings(project, view) else null
    }

    override fun getOKAction(): Action = deployAction

    override fun createActions(): Array<Action> {
        val actions = mutableListOf<Action>()
        actions.add(okAction)
        if (isUpdate) {
            actions.add(updateAction)
        }
        actions.add(cancelAction)

        return actions.toTypedArray()
    }

    override fun doOKAction() {
        // Do nothing, close logic is handled separately
    }

    private fun deployLambda() {
        if (okAction.isEnabled) {
            val functionDetails = viewToFunctionDetails()
            val element = findPsiElementsForHandler(project, functionDetails.runtime, functionDetails.handler).first()
            val psiFile = element.containingFile
            val module = ModuleUtil.findModuleForFile(psiFile)
                    ?: throw IllegalStateException("Failed to locate module for $psiFile")

            val s3Bucket = view.sourceBucket.selected()!!

            val packager = psiFile.language.runtimeGroup?.let { LambdaPackager.getInstance(it) } ?: return
            val lambdaCreator = LambdaCreatorFactory.create(AwsClientManager.getInstance(project), packager)

            val future = if (isUpdate) {
                lambdaCreator.updateLambda(module, psiFile, functionDetails, s3Bucket)
            } else {
                lambdaCreator.createLambda(module, psiFile, functionDetails, s3Bucket)
            }

            future.whenComplete { function, error ->
                when {
                        function != null -> {
                            notifyInfo(
                                message("lambda.function_created.notification", functionDetails.name),
                                project = project
                            )
                        }
                        error is Exception -> error.notifyError(title = "")
                    }
                }
            close(OK_EXIT_CODE)
        }
    }

    private fun updateLambda() {
        if (updateAction.isEnabled) {
            updateAction.isEnabled = false

            val functionDetails = viewToFunctionDetails()
            val lambdaClient: LambdaClient = project.awsClient()

            ApplicationManager.getApplication().executeOnPooledThread {
                LambdaFunctionCreator(lambdaClient).update(project, functionDetails)
                    .thenAccept { runInEdt(ModalityState.any()) { close(OK_EXIT_CODE) } }
                    .exceptionally { e ->
                        runInEdt(ModalityState.any()) {
                            setErrorText(e.message)
                            updateAction.isEnabled = true
                        }
                        null
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
        memorySize = view.memorySize.text.toInt()
    )

    private inner class DeployLambdaAction : OkAction() {
        init {
            putValue(Action.NAME, message("lambda.upload.deploy_button.title"))
        }

        override fun doAction(e: ActionEvent?) {
            // We normally don't validate the deploy settings in case they are editing settings only, but they requested
            // to deploy so start validating that too
            validateDeploySettings = true
            super.doAction(e)
            if (doValidateAll().isNotEmpty()) return
            deployLambda()
        }
    }

    // Using an OkAction to force the validation logic to trigger as well
    private inner class UpdateLambdaSettingsAction : OkAction() {
        init {
            putValue(Action.NAME, message("lambda.upload.update_settings_button.title"))
            putValue(DEFAULT_ACTION, null)
        }

        override fun doAction(e: ActionEvent?) {
            super.doAction(e)
            // Only validate the lambda settings part
            if (validator.validateSettings(view) == null) {
                updateLambda()
            }
        }
    }
}

class UploadToLambdaValidator {
    fun validateSettings(view: EditLambdaPanel): ValidationInfo? {
        val name = view.name.blankAsNull() ?: return ValidationInfo(
            message("lambda.upload_validation.function_name"),
            view.name
        )
        validateFunctionName(name)?.run { return@validateSettings ValidationInfo(this, view.name) }
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
        view.iamRole.selected() ?: return ValidationInfo(message("lambda.upload_validation.iam_role"), view.iamRole)
        return null
    }

    fun validateDeploymentSettings(project: Project, view: EditLambdaPanel): ValidationInfo? {
        val handler = view.handler.text
        val runtime = view.runtime.selected()
                ?: return ValidationInfo(message("lambda.upload_validation.runtime"), view.runtime)

        runtime.runtimeGroup?.let { LambdaPackager.getInstance(it) } ?: return ValidationInfo(
            message("lambda.upload_validation.unsupported_runtime", runtime),
            view.handler
        )

        findPsiElementsForHandler(project, runtime, handler).firstOrNull() ?: return ValidationInfo(
            message("lambda.upload_validation.handler_not_found"),
            view.handler
        )

        view.sourceBucket.selected() ?: return ValidationInfo(
            message("lambda.upload_validation.source_bucket"),
            view.sourceBucket
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