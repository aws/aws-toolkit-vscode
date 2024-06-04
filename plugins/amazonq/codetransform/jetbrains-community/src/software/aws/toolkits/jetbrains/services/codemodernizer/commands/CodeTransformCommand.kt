// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.commands

enum class CodeTransformCommand {
    StopClicked,
    TransformStopped,
    MavenBuildComplete,
    UploadComplete,
    TransformComplete,
    TransformResuming,
    DownloadFailed,
    AuthRestored,
    StartHil,
}
