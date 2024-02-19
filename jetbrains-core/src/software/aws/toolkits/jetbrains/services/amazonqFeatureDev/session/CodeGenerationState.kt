// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session

import software.aws.toolkits.jetbrains.services.amazonq.messages.MessagePublisher
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.sendAnswerPart
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util.startTaskAssistCodeGeneration
import software.aws.toolkits.jetbrains.services.cwc.messages.CodeReference
import software.aws.toolkits.resources.message

class CodeGenerationState(
    override val tabID: String,
    override var approach: String,
    val config: SessionStateConfig,
    val uploadId: String,
    var filePaths: Array<NewFileZipInfo>,
    var deletedFiles: Array<DeletedFileZipInfo>,
    var references: Array<CodeReference>,
    var currentIteration: Int,
    val messenger: MessagePublisher
) : SessionState {
    override val phase = SessionStatePhase.CODEGEN

    override suspend fun interact(action: SessionStateAction): SessionStateInteraction {
        startTaskAssistCodeGeneration(
            proxyClient = config.proxyClient,
            conversationId = config.conversationId,
            uploadId = uploadId,
            message = action.msg
        )

        messenger.sendAnswerPart(
            tabId = tabID,
            message = message("amazonqFeatureDev.code_generation.generating_code")
        )

        val codeGenerationResult = generateCode()

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

// TODO: this is a dummy generateCode, it will be implemented in a follow up.
fun generateCode(): CodeGenerationResult = CodeGenerationResult(emptyArray(), emptyArray(), emptyArray())
