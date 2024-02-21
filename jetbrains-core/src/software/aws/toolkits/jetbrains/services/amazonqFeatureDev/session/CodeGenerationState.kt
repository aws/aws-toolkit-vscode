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
                return CodeGenerationResult(emptyArray(), emptyArray(), codeGenerationStreamResult.references)
            }
            CodeGenerationWorkflowStatus.IN_PROGRESS -> delay(requestDelay)
            CodeGenerationWorkflowStatus.FAILED -> codeGenerationFailedError()
            else -> error("Unknown status: ${codeGenerationResultState.codeGenerationStatus().status()}")
        }
    }

    return CodeGenerationResult(emptyArray(), emptyArray(), emptyArray())
}
