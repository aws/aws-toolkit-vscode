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
import kotlin.io.path.Path
import kotlin.io.path.createDirectories
import kotlin.io.path.createDirectory
import kotlin.io.path.writeBytes

class CodeGenerationState(
    override val tabID: String,
    override var approach: String,
    val config: SessionStateConfig,
    val uploadId: String,
    val currentIteration: Int,
    val messenger: MessagePublisher
) : SessionState {
    override val phase = SessionStatePhase.CODEGEN

    override suspend fun interact(action: SessionStateAction): SessionStateInteraction {
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

        val nextState = PrepareCodeGenerationState(
            tabID = tabID,
            approach = approach,
            config = config,
            filePaths = codeGenerationResult.newFiles,
            deletedFiles = codeGenerationResult.deletedFiles,
            references = codeGenerationResult.references,
            currentIteration = currentIteration + 1,
            messenger = messenger,
        )

        // It is not needed to interact right away with the code generation state.
        // returns a SessionStateInteraction object to be handled by the controller.
        return SessionStateInteraction(
            nextState = nextState,
            interaction = Interaction(content = "")
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

                val newFileInfo = registerNewFiles(newFileContents = codeGenerationStreamResult.new_file_contents, uploadId = this.uploadId)

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

fun registerNewFiles(newFileContents: Map<String, String>, uploadId: String): List<NewFileZipInfo> {
    val generatedCodeRoot = Path(uploadId)
    generatedCodeRoot.createDirectory()

    return newFileContents.map {
        val newFilePath = generatedCodeRoot.resolve(it.key)
        newFilePath.parent.createDirectories() // create parent directories if needed

        newFilePath.writeBytes(it.value.toByteArray(Charsets.UTF_8))
        newFilePath.toFile().deleteOnExit()

        NewFileZipInfo(zipFilePath = it.key, newFilePath = newFilePath)
    }
}
