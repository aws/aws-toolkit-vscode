// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session

import com.fasterxml.jackson.annotation.JsonValue
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.clients.FeatureDevClient
import software.aws.toolkits.jetbrains.services.cwc.messages.CodeReference

data class SessionStateAction(
    val task: String,
    val msg: String,
)

data class Interaction(
    val content: String?,
    val interactionSucceeded: Boolean
)

data class SessionStateInteraction(
    val nextState: SessionState? = null,
    val interaction: Interaction
)

enum class SessionStatePhase(
    @field:JsonValue val json: String,
) {
    INIT("Init"),
    APPROACH("Approach"),
    CODEGEN("Codegen"),
}

data class SessionStateConfig(
    val conversationId: String,
    val proxyClient: FeatureDevClient,
    val repoContext: FeatureDevSessionContext,
)

data class NewFileZipInfo(
    val zipFilePath: String,
    val fileContent: String,
    var rejected: Boolean
)

data class DeletedFileInfo(
    val zipFilePath: String, // The string is the path of the file to be deleted
    var rejected: Boolean
)

data class CodeGenerationResult(
    var newFiles: List<NewFileZipInfo>,
    var deletedFiles: List<DeletedFileInfo>,
    var references: List<CodeReference>,
)

@Suppress("ConstructorParameterNaming") // Unfortunately, this is exactly how the string json is received and is needed for parsing.
data class CodeGenerationStreamResult(
    var new_file_contents: Map<String, String>,
    var deleted_files: List<String>,
    var references: List<CodeReference>,
)

@Suppress("ConstructorParameterNaming") // Unfortunately, this is exactly how the string json is received and is needed for parsing.
data class ExportTaskAssistResultArchiveStreamResult(
    var code_generation_result: CodeGenerationStreamResult
)
