// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session

import kotlinx.coroutines.delay
import software.amazon.awssdk.services.codewhispererruntime.model.CodeGenerationWorkflowStatus
import software.aws.toolkits.jetbrains.services.amazonq.messages.MessagePublisher
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.codeGenerationFailedError
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.sendAnswerPart
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util.exportTaskAssistArchiveResult
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util.getTaskAssistCodeGeneration
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util.startTaskAssistCodeGeneration
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.AmazonqTelemetry

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

        val response = startTaskAssistCodeGeneration(
            proxyClient = config.proxyClient,
            conversationId = config.conversationId,
            uploadId = uploadId,
            message = action.msg
        )

        messenger.sendAnswerPart(
            tabId = tabID,
            message = message("amazonqFeatureDev.code_generation.generating_code")
        )

        val codeGenerationResult = generateCode(codeGenerationId = response.codeGenerationId())

        AmazonqTelemetry.codeGenerationInvoke(
            amazonqConversationId = config.conversationId,
            amazonqCodeGenerationResult = CodeGenerationWorkflowStatus.COMPLETE.toString(),
            amazonqGenerateCodeIteration = currentIteration.toDouble(),
            amazonqNumberOfReferences = codeGenerationResult.references.size.toDouble(),
            amazonqGenerateCodeResponseLatency = (System.currentTimeMillis() - startTime).toDouble(),
            amazonqNumberOfFilesGenerated = codeGenerationResult.newFiles.size.toDouble(),
            amazonqRepositorySize = repositorySize,
        )

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

        // It is not needed to interact right away with the code generation state.
        // returns a SessionStateInteraction object to be handled by the controller.
        return SessionStateInteraction(
            nextState = nextState,
            interaction = Interaction(content = "", interactionSucceeded = true)
        )
    }
}

private suspend fun CodeGenerationState.generateCode(codeGenerationId: String): CodeGenerationResult {
    val pollCount = 180
    val requestDelay = 10000L

    repeat(pollCount) {
        val codeGenerationResultState = getTaskAssistCodeGeneration(
            proxyClient = config.proxyClient,
            conversationId = config.conversationId,
            codeGenerationId = codeGenerationId,
        )

        when (codeGenerationResultState.codeGenerationStatus().status()) {
            CodeGenerationWorkflowStatus.COMPLETE -> {
                val codeGenerationStreamResult = exportTaskAssistArchiveResult(
                    proxyClient = config.proxyClient,
                    conversationId = config.conversationId
                )

                val newFileInfo = registerNewFiles(newFileContents = codeGenerationStreamResult.new_file_contents)

                return CodeGenerationResult(
                    newFiles = newFileInfo,
                    deletedFiles = codeGenerationStreamResult.deleted_files,
                    references = codeGenerationStreamResult.references
                )
            }
            CodeGenerationWorkflowStatus.IN_PROGRESS -> delay(requestDelay)
            CodeGenerationWorkflowStatus.FAILED -> codeGenerationFailedError()
            else -> error("Unknown status: ${codeGenerationResultState.codeGenerationStatus().status()}")
        }
    }

    return CodeGenerationResult(emptyList(), emptyArray(), emptyArray())
}

fun registerNewFiles(newFileContents: Map<String, String>): List<NewFileZipInfo> = newFileContents.map {
    NewFileZipInfo(zipFilePath = it.key, fileContent = it.value)
}
