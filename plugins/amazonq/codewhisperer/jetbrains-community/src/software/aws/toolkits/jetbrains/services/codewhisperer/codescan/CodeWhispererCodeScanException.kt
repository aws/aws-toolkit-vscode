// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.codescan

import software.aws.toolkits.resources.message

open class CodeScanException(override val message: String, open val code: String?) : RuntimeException(message)

open class CodeWhispererCodeScanException(override val message: String, override val code: String?) : CodeScanException(message, code)

open class CodeWhispererCodeScanServerException(override val message: String, override val code: String?) : CodeScanException(message, code)

internal fun noFileOpenError(): Nothing =
    throw CodeWhispererCodeScanException(message("codewhisperer.codescan.no_file_open"), "NoSourceFilesError")

internal fun codeScanFailed(errorMessage: String, code: String?): Nothing =
    throw CodeScanException(errorMessage, code)

internal fun cannotFindFile(errorMessage: String, filepath: String): Nothing =
    error(message("codewhisperer.codescan.file_not_found", filepath, errorMessage))

internal fun cannotFindBuildArtifacts(): Nothing =
    throw CodeWhispererCodeScanException(message("codewhisperer.codescan.build_artifacts_not_found"), "NoSourceFilesError")

internal fun fileFormatNotSupported(format: String): Nothing =
    throw CodeWhispererCodeScanException(message("codewhisperer.codescan.file_ext_not_supported", format), "FileFormatNotSupportedError")

internal fun fileTooLarge(): Nothing =
    throw CodeWhispererCodeScanException(message("codewhisperer.codescan.file_too_large"), "ProjectSizeExceeded")

internal fun codeScanServerException(errorMessage: String, code: String?): Nothing =
    throw CodeWhispererCodeScanServerException(errorMessage, code)

internal fun invalidSourceZipError(): Nothing =
    throw CodeWhispererCodeScanException(message("codewhisperer.codescan.invalid_source_zip_telemetry"), "InvalidSourceZip")

internal fun noSupportedFilesError(): Nothing =
    throw CodeWhispererCodeScanException(message("codewhisperer.codescan.unsupported_language_error"), "NoSourceFilesError")
