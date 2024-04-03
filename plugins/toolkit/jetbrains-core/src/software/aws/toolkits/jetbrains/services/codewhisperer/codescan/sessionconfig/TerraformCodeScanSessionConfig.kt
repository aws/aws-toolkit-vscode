// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.codescan.sessionconfig

import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants

internal class TerraformCodeScanSessionConfig(
    private val selectedFile: VirtualFile,
    private val project: Project,
    private val scanType: String
) : CodeScanSessionConfig(selectedFile, project, scanType) {

    override val sourceExt: List<String> = listOf(".tf", ".hcl")

    override fun overallJobTimeoutInSeconds(): Long = CodeWhispererConstants.TERRAFORM_CODE_SCAN_TIMEOUT_IN_SECONDS

    override fun getPayloadLimitInBytes(): Int = CodeWhispererConstants.TERRAFORM_PAYLOAD_LIMIT_IN_BYTES
}
