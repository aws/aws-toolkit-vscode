// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session

import kotlinx.coroutines.delay
import software.amazon.awssdk.services.codewhispererruntime.model.CodeGenerationWorkflowStatus
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.services.amazonq.messages.MessagePublisher
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.FEATURE_NAME
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.codeGenerationFailedError
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.sendAnswerPart
import software.aws.toolkits.jetbrains.services.cwc.controller.chat.telemetry.getStartUrl
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.AmazonqTelemetry
import software.aws.toolkits.telemetry.Result

private val logger = getLogger<CodeGenerationState>()

class CodeGenerationState(
    override val tabID: String,
    override var approach: String,
    val config: SessionStateConfig,
    val uploadId: String,
    val currentIteration: Int,
    val repositorySize: Double,
    val messenger: MessagePublisher
) : SessionState {
    override val phase = SessionStatePhase.CODEGEN

    override suspend fun interact(action: SessionStateAction): SessionStateInteraction {
        val startTime = System.currentTimeMillis()
        var result: Result = Result.Succeeded
        var failureReason: String? = null
        var codeGenerationWorkflowStatus: CodeGenerationWorkflowStatus = CodeGenerationWorkflowStatus.COMPLETE
        var numberOfReferencesGenerated: Int? = null
        var numberOfFilesGenerated: Int? = null
        try {
            val response = config.featureDevService.startTaskAssistCodeGeneration(
                conversationId = config.conversationId,
                uploadId = uploadId,
                message = action.msg
            )

            messenger.sendAnswerPart(
                tabId = tabID,
                message = message("amazonqFeatureDev.code_generation.generating_code")
            )

            val codeGenerationResult = generateCode(codeGenerationId = response.codeGenerationId())
            numberOfReferencesGenerated = codeGenerationResult.references.size
            numberOfFilesGenerated = codeGenerationResult.newFiles.size

            val nextState = PrepareCodeGenerationState(
                tabID = tabID,
                approach = approach,
                config = config,
                filePaths = codeGenerationResult.newFiles,
                deletedFiles = codeGenerationResult.deletedFiles,
                references = codeGenerationResult.references,
                currentIteration = currentIteration + 1,
                uploadId = uploadId,
                messenger = messenger,
            )

            // It is not needed to interact right away with the PrepareCodeGeneration.
            // returns therefore a SessionStateInteraction object to be handled by the controller.
            return SessionStateInteraction(
                nextState = nextState,
                interaction = Interaction(content = "", interactionSucceeded = true)
            )
        } catch (e: Exception) {
            logger.warn(e) { "$FEATURE_NAME: Code generation failed: ${e.message}" }
            result = Result.Failed
            failureReason = e.javaClass.simpleName
            codeGenerationWorkflowStatus = CodeGenerationWorkflowStatus.FAILED

            throw e
        } finally {
            AmazonqTelemetry.codeGenerationInvoke(
                amazonqConversationId = config.conversationId,
                amazonqCodeGenerationResult = codeGenerationWorkflowStatus.toString(),
                amazonqGenerateCodeIteration = currentIteration.toDouble(),
                amazonqNumberOfReferences = numberOfReferencesGenerated?.toDouble(),
                amazonqGenerateCodeResponseLatency = (System.currentTimeMillis() - startTime).toDouble(),
                amazonqNumberOfFilesGenerated = numberOfFilesGenerated?.toDouble(),
                amazonqRepositorySize = repositorySize,
                result = result,
                reason = failureReason,
                duration = (System.currentTimeMillis() - startTime).toDouble(),
                credentialStartUrl = getStartUrl(config.featureDevService.project)
            )
        }
    }
}

private suspend fun CodeGenerationState.generateCode(codeGenerationId: String): CodeGenerationResult {
    val pollCount = 180
    val requestDelay = 10000L

    repeat(pollCount) {
        val codeGenerationResultState = config.featureDevService.getTaskAssistCodeGeneration(
            conversationId = config.conversationId,
            codeGenerationId = codeGenerationId,
        )

        when (codeGenerationResultState.codeGenerationStatus().status()) {
            CodeGenerationWorkflowStatus.COMPLETE -> {
                val codeGenerationStreamResult = config.featureDevService.exportTaskAssistArchiveResult(
                    conversationId = config.conversationId
                )

                val newFileInfo = registerNewFiles(newFileContents = codeGenerationStreamResult.new_file_contents)
                val deletedFileInfo = registerDeletedFiles(deletedFiles = codeGenerationStreamResult.deleted_files)

                return CodeGenerationResult(
                    newFiles = newFileInfo,
                    deletedFiles = deletedFileInfo,
                    references = codeGenerationStreamResult.references
                )
            }
            CodeGenerationWorkflowStatus.IN_PROGRESS -> delay(requestDelay)
            CodeGenerationWorkflowStatus.FAILED -> codeGenerationFailedError()
            else -> error("Unknown status: ${codeGenerationResultState.codeGenerationStatus().status()}")
        }
    }

    return CodeGenerationResult(emptyList(), emptyList(), emptyList())
}

fun registerNewFiles(newFileContents: Map<String, String>): List<NewFileZipInfo> = newFileContents.map {
    NewFileZipInfo(
        zipFilePath = it.key,
        fileContent = it.value,
        rejected = false
    )
}

fun registerDeletedFiles(deletedFiles: List<String>): List<DeletedFileInfo> = deletedFiles.map {
    DeletedFileInfo(
        zipFilePath = it,
        rejected = false
    )
}
