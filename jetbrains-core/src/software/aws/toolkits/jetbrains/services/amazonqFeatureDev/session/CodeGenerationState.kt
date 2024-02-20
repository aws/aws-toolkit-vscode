// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session

import kotlinx.coroutines.delay
import software.amazon.awssdk.services.codewhispererruntime.model.CodeGenerationWorkflowStatus
import software.aws.toolkits.jetbrains.services.amazonq.messages.MessagePublisher
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.codeGenerationFailedError
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.sendAnswerPart
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

    private val pollCount = 180
    private val requestDelay = 10000L

    private suspend fun generateCode(codeGenerationId: String): CodeGenerationResult {
        repeat(pollCount) {
            val codeGenerationResult = getTaskAssistCodeGeneration(
                proxyClient = config.proxyClient,
                conversationId = config.conversationId,
                codeGenerationId = codeGenerationId,
            )

            when (codeGenerationResult.codeGenerationStatus().status()) {
                CodeGenerationWorkflowStatus.COMPLETE -> {
                    // TODO: do exportResultArchive to download generated code
                    return CodeGenerationResult(emptyArray(), emptyArray(), emptyArray())
                }
                CodeGenerationWorkflowStatus.IN_PROGRESS -> delay(requestDelay)
                CodeGenerationWorkflowStatus.FAILED -> codeGenerationFailedError()
                else -> error("Unknown status: ${codeGenerationResult.codeGenerationStatus().status()}")
            }
        }

        return CodeGenerationResult(emptyArray(), emptyArray(), emptyArray())
    }

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
