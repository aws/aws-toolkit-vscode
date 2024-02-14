// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session

import com.fasterxml.jackson.annotation.JsonValue
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.clients.FeatureDevClient

data class SessionStateAction(
    val task: String,
    val msg: String,
)

data class Interaction(
    val content: String?
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

data class DeletedFileZipInfo(
    val zipFilePath: String,
    val relativePath: String,
)

data class NewFileZipInfo(
    val zipFilePath: String,
    val relativePath: String,
    val fileContent: String,
)
