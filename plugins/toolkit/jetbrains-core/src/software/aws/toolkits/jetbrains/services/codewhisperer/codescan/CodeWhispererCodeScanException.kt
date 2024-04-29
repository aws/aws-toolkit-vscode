// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.codescan

import software.aws.toolkits.resources.message

open class CodeWhispererCodeScanException(override val message: String?) : RuntimeException()

internal fun noFileOpenError(): Nothing =
    throw CodeWhispererCodeScanException(message("codewhisperer.codescan.no_file_open"))

internal fun codeScanFailed(): Nothing =
    throw CodeWhispererCodeScanException(message("codewhisperer.codescan.service_error"))

internal fun cannotFindFile(file: String?): Nothing =
    error(message("codewhisperer.codescan.file_not_found", file ?: ""))

internal fun cannotFindBuildArtifacts(): Nothing =
    throw CodeWhispererCodeScanException(message("codewhisperer.codescan.build_artifacts_not_found"))

internal fun fileFormatNotSupported(format: String): Nothing =
    throw CodeWhispererCodeScanException(message("codewhisperer.codescan.file_ext_not_supported", format))

internal fun fileTooLarge(presentableSize: String): Nothing =
    throw CodeWhispererCodeScanException(message("codewhisperer.codescan.file_too_large", presentableSize))

internal fun uploadArtifactFailedError(): Nothing =
    throw CodeWhispererCodeScanException(message("codewhisperer.codescan.upload_to_s3_failed"))
