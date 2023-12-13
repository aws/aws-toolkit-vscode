// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.telemetry

import com.intellij.openapi.application.ApplicationInfo
import com.intellij.openapi.application.ApplicationNamesInfo
import com.intellij.openapi.util.SystemInfo
import software.amazon.awssdk.services.codewhispererruntime.model.IdeCategory
import software.amazon.awssdk.services.codewhispererruntime.model.OperatingSystem
import software.amazon.awssdk.services.codewhispererruntime.model.UserContext
import software.amazon.awssdk.services.toolkittelemetry.model.AWSProduct
import software.aws.toolkits.jetbrains.AwsToolkit
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.FEATURE_EVALUATION_PRODUCT_NAME
import software.aws.toolkits.jetbrains.settings.AwsSettings

data class ClientMetadata(
    val productName: AWSProduct = AWSProduct.AWS_TOOLKIT_FOR_JET_BRAINS,
    val productVersion: String = AwsToolkit.PLUGIN_VERSION,
    val clientId: String = AwsSettings.getInstance().clientId.toString(),
    val parentProduct: String = ApplicationNamesInfo.getInstance().fullProductNameWithEdition,
    val parentProductVersion: String = ApplicationInfo.getInstance().build.baselineVersion.toString(),
    val os: String = SystemInfo.OS_NAME,
    val osVersion: String = SystemInfo.OS_VERSION,
) {
    companion object {
        val DEFAULT_METADATA = ClientMetadata()
    }

    private val osForCodeWhisperer: OperatingSystem =
        when {
            SystemInfo.isWindows -> OperatingSystem.WINDOWS
            SystemInfo.isMac -> OperatingSystem.MAC
            // For now, categorize everything else as "Linux" (Linux/FreeBSD/Solaris/etc)
            else -> OperatingSystem.LINUX
        }

    val codeWhispererUserContext = UserContext.builder()
        .ideCategory(IdeCategory.JETBRAINS)
        .operatingSystem(osForCodeWhisperer)
        .product(FEATURE_EVALUATION_PRODUCT_NAME)
        .clientId(clientId)
        .ideVersion(productVersion)
        .build()
}
