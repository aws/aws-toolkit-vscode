// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session

import software.aws.toolkits.jetbrains.services.cwc.messages.CodeReference

class CodeGenerationState(
    override val tabID: String,
    override var approach: String,
    var config: SessionStateConfig,
    var uploadId: String,
    var filePaths: Array<NewFileZipInfo>,
    var deletedFiles: Array<DeletedFileZipInfo>,
    var references: Array<CodeReference>,
    var currentIteration: Number
) : SessionState {
    override val phase = SessionStatePhase.CODEGEN

    override suspend fun interact(action: SessionStateAction): SessionStateInteraction {
        TODO("Not yet implemented")
    }
}
