// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.constants

import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import software.aws.toolkits.jetbrains.services.amazonq.CODE_TRANSFORM_TROUBLESHOOT_DOC
import software.aws.toolkits.jetbrains.services.codemodernizer.getModuleOrProjectNameForFile
import software.aws.toolkits.jetbrains.services.codemodernizer.messages.Button
import software.aws.toolkits.jetbrains.services.codemodernizer.messages.CodeTransformButtonId
import software.aws.toolkits.jetbrains.services.codemodernizer.messages.CodeTransformChatMessageContent
import software.aws.toolkits.jetbrains.services.codemodernizer.messages.CodeTransformChatMessageType
import software.aws.toolkits.jetbrains.services.codemodernizer.messages.CodeTransformFormItemId
import software.aws.toolkits.jetbrains.services.codemodernizer.messages.FormItem
import software.aws.toolkits.jetbrains.services.codemodernizer.messages.FormItemOption
import software.aws.toolkits.jetbrains.services.codemodernizer.model.CodeModernizerJobCompletedResult
import software.aws.toolkits.jetbrains.services.codemodernizer.model.ValidationResult
import software.aws.toolkits.jetbrains.services.cwc.clients.chat.model.FollowUpType
import software.aws.toolkits.jetbrains.services.cwc.messages.FollowUp
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CodeTransformPreValidationError

private val cancelUserSelectionButton = Button(
    keepCardAfterClick = false,
    waitMandatoryFormItems = false,
    text = message("codemodernizer.chat.message.button.cancel"),
    id = CodeTransformButtonId.CancelTransformation.id,
)

private val confirmUserSelectionButton = Button(
    keepCardAfterClick = false,
    waitMandatoryFormItems = true,
    text = message("codemodernizer.chat.message.button.confirm"),
    id = CodeTransformButtonId.StartTransformation.id,
)

private val openMvnBuildButton = Button(
    id = CodeTransformButtonId.OpenMvnBuild.id,
    text = message("codemodernizer.chat.message.button.view_build"),
    keepCardAfterClick = true,
)

private val stopTransformButton = Button(
    id = CodeTransformButtonId.StopTransformation.id,
    text = message("codemodernizer.chat.message.button.stop_transform"),
    keepCardAfterClick = true,
)

private val openTransformHubButton = Button(
    id = CodeTransformButtonId.OpenTransformationHub.id,
    text = message("codemodernizer.chat.message.button.open_transform_hub"),
    keepCardAfterClick = true,
)

private val viewDiffButton = Button(
    id = CodeTransformButtonId.ViewDiff.id,
    text = message("codemodernizer.chat.message.button.view_diff"),
    keepCardAfterClick = true,
)

private val viewSummaryButton = Button(
    id = CodeTransformButtonId.ViewSummary.id,
    text = message("codemodernizer.chat.message.button.view_summary"),
    keepCardAfterClick = true,
)

private val startNewTransformFollowUp = FollowUp(
    type = FollowUpType.NewCodeTransform,
    pillText = message("codemodernizer.chat.message.follow_up.new_transformation"),
    prompt = message("codemodernizer.chat.message.follow_up.new_transformation"),
)

private fun getSelectModuleFormItem(project: Project, moduleBuildFiles: List<VirtualFile>) = FormItem(
    id = CodeTransformFormItemId.SelectModule.id,
    title = message("codemodernizer.chat.form.user_selection.item.choose_module"),
    mandatory = true,
    options = moduleBuildFiles.map {
        FormItemOption(
            label = project.getModuleOrProjectNameForFile(it),
            value = it.path,
        )
    }
)

private val selectTargetVersionFormItem = FormItem(
    id = CodeTransformFormItemId.SelectTargetVersion.id,
    title = message("codemodernizer.chat.form.user_selection.item.choose_target_version"),
    mandatory = true,
    options = listOf(
        FormItemOption(
            label = "JDK17",
            value = "17",
        )
    )
)

private fun getUserSelectionFormattedMarkdown(moduleName: String): String = """
        ### ${message("codemodernizer.chat.prompt.title.details")}
        -------------

        | | |
        | :------------------- | -------: |
        | **${message("codemodernizer.chat.prompt.label.module")}**             |   $moduleName   |
        | **${message("codemodernizer.chat.prompt.label.target_version")}** |  JDK17   |
""".trimIndent()

fun buildCheckingValidProjectChatContent() = CodeTransformChatMessageContent(
    message = message("codemodernizer.chat.message.validation.check_eligible_projects"),
    type = CodeTransformChatMessageType.PendingAnswer,
)

fun buildProjectValidChatContent(validationResult: ValidationResult) = CodeTransformChatMessageContent(
    message = message("codemodernizer.chat.message.validation.check_passed", validationResult.validatedProjectJdkName),
    type = CodeTransformChatMessageType.FinalizedAnswer,
)
fun buildProjectInvalidChatContent(validationResult: ValidationResult): CodeTransformChatMessageContent {
    val errorMessage = when (validationResult.invalidTelemetryReason.category) {
        CodeTransformPreValidationError.NoPom -> message("codemodernizer.chat.message.validation.error.no_pom")
        CodeTransformPreValidationError.UnsupportedJavaVersion -> message("codemodernizer.chat.message.validation.error.unsupported_java_version")
        else -> message("codemodernizer.chat.message.validation.error.other")
    }

    return CodeTransformChatMessageContent(
        message = "$errorMessage\n\n${message("codemodernizer.chat.message.validation.error.more_info", CODE_TRANSFORM_TROUBLESHOOT_DOC)}",
        type = CodeTransformChatMessageType.FinalizedAnswer,
    )
}

fun buildStartNewTransformFollowup(): CodeTransformChatMessageContent = CodeTransformChatMessageContent(
    type = CodeTransformChatMessageType.FinalizedAnswer,
    followUps = listOf(
        startNewTransformFollowUp
    )
)

fun buildUserInputChatContent(project: Project, validationResult: ValidationResult): CodeTransformChatMessageContent {
    val moduleBuildFiles = validationResult.validatedBuildFiles

    return CodeTransformChatMessageContent(
        message = message("codemodernizer.chat.form.user_selection.title"),
        buttons = listOf(
            confirmUserSelectionButton,
            cancelUserSelectionButton,
        ),
        formItems = listOf(
            getSelectModuleFormItem(project, moduleBuildFiles),
            selectTargetVersionFormItem,
        ),
        type = CodeTransformChatMessageType.FinalizedAnswer,
    )
}

fun buildUserCancelledChatContent() = CodeTransformChatMessageContent(
    type = CodeTransformChatMessageType.FinalizedAnswer,
    message = message("codemodernizer.chat.message.transform_cancelled_by_user"),
)

fun buildUserStopTransformChatContent() = CodeTransformChatMessageContent(
    type = CodeTransformChatMessageType.Prompt,
    message = message("codemodernizer.chat.prompt.stop_transform"),
)

fun buildTransformStoppingChatContent() = CodeTransformChatMessageContent(
    type = CodeTransformChatMessageType.PendingAnswer,
    message = message("codemodernizer.chat.message.transform_stopping"),
)

fun buildTransformStoppedChatContent() = CodeTransformChatMessageContent(
    message = message("codemodernizer.chat.message.transform_stopped_by_user"),
    type = CodeTransformChatMessageType.FinalizedAnswer,
)

fun buildUserSelectionSummaryChatContent(moduleName: String) = CodeTransformChatMessageContent(
    type = CodeTransformChatMessageType.Prompt,
    message = getUserSelectionFormattedMarkdown(moduleName)
)

fun buildCompileLocalInProgressChatContent() = CodeTransformChatMessageContent(
    type = CodeTransformChatMessageType.PendingAnswer,
    message = message("codemodernizer.chat.message.local_build_begin"),
    buttons = listOf(
        openMvnBuildButton,
    ),
)

fun buildCompileLocalFailedChatContent() = CodeTransformChatMessageContent(
    type = CodeTransformChatMessageType.FinalizedAnswer,
    message = "${message(
        "codemodernizer.chat.message.local_build_failed"
    )}\n\n${message(
        "codemodernizer.chat.message.doc_link_prefix",
        CODE_TRANSFORM_TROUBLESHOOT_DOC
    )}",
)

fun buildCompileLocalSuccessChatContent() = CodeTransformChatMessageContent(
    type = CodeTransformChatMessageType.FinalizedAnswer,
    message = message("codemodernizer.chat.message.local_build_success"),
)

fun buildTransformInProgressChatContent() = CodeTransformChatMessageContent(
    type = CodeTransformChatMessageType.PendingAnswer,
    message = message("codemodernizer.chat.message.transform_begin"),
    buttons = listOf(
        openTransformHubButton,
        stopTransformButton,
    ),
)

fun buildTransformResumingChatContent() = CodeTransformChatMessageContent(
    message = message("codemodernizer.chat.message.resume_ongoing"),
    type = CodeTransformChatMessageType.PendingAnswer,
    buttons = listOf(
        openTransformHubButton,
        stopTransformButton,
    ),
)

fun buildTransformResultChatContent(result: CodeModernizerJobCompletedResult): CodeTransformChatMessageContent {
    val resultMessage = when (result) {
        is CodeModernizerJobCompletedResult.JobAbortedZipTooLarge -> {
            "${message(
                "codemodernizer.chat.message.result.zip_too_large"
            )}\n\n${message(
                "codemodernizer.chat.message.doc_link_prefix",
                CODE_TRANSFORM_TROUBLESHOOT_DOC
            )}"
        }
        is CodeModernizerJobCompletedResult.JobCompletedSuccessfully -> {
            message("codemodernizer.chat.message.result.success")
        }
        is CodeModernizerJobCompletedResult.JobPartiallySucceeded -> {
            message("codemodernizer.chat.message.result.partially_success")
        }
        else -> {
            message("codemodernizer.chat.message.result.fail")
        }
    }

    return CodeTransformChatMessageContent(
        type = CodeTransformChatMessageType.FinalizedAnswer,
        message = resultMessage,
        buttons = if (result is CodeModernizerJobCompletedResult.JobPartiallySucceeded || result is CodeModernizerJobCompletedResult.JobCompletedSuccessfully) {
            listOf(viewDiffButton, viewSummaryButton)
        } else {
            null
        },
    )
}
