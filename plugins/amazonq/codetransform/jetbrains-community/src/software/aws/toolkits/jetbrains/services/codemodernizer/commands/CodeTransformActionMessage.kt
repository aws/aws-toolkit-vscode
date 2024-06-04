// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.commands

import software.aws.toolkits.jetbrains.services.amazonq.messages.AmazonQMessage
import software.aws.toolkits.jetbrains.services.codemodernizer.model.CodeModernizerJobCompletedResult
import software.aws.toolkits.jetbrains.services.codemodernizer.model.CodeTransformHilDownloadArtifact
import software.aws.toolkits.jetbrains.services.codemodernizer.model.DownloadFailureReason
import software.aws.toolkits.jetbrains.services.codemodernizer.model.MavenCopyCommandsResult

data class CodeTransformActionMessage(
    val command: CodeTransformCommand,
    val mavenBuildResult: MavenCopyCommandsResult? = null,
    val transformResult: CodeModernizerJobCompletedResult? = null,
    val hilDownloadArtifact: CodeTransformHilDownloadArtifact? = null,
    val downloadFailure: DownloadFailureReason? = null,
) : AmazonQMessage
