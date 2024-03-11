// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util

import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererLicenseInfoManager
import software.aws.toolkits.jetbrains.services.cwc.messages.CodeReference

fun CodeReference.licenseText(): String {
    val licenseLink = CodeWhispererLicenseInfoManager.getInstance().getLicenseLink(this.licenseName.orEmpty())

    return "<a href=\"${licenseLink}\" target=\"_blank\">" +
        "${this.licenseName}" +
        "</a> license from repository <a href=\"${this.url}\" target=\"_blank\">${this.repository}</a>"
}
