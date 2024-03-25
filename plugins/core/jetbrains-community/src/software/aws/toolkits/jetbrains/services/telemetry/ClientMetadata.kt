// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.telemetry

import com.intellij.ide.plugins.PluginManager
import com.intellij.openapi.application.ApplicationInfo
import com.intellij.openapi.application.ApplicationNamesInfo
import com.intellij.openapi.util.SystemInfo
import software.amazon.awssdk.services.toolkittelemetry.model.AWSProduct
import software.aws.toolkits.jetbrains.settings.AwsSettings

data class ClientMetadata(
    val productName: AWSProduct = AWSProduct.AWS_TOOLKIT_FOR_JET_BRAINS,
    val productVersion: String = PluginManager.getPluginByClass(this::class.java)?.version.toString(),
    val clientId: String = AwsSettings.getInstance().clientId.toString(),
    val parentProduct: String = ApplicationNamesInfo.getInstance().fullProductNameWithEdition,
    val parentProductVersion: String = ApplicationInfo.getInstance().build.baselineVersion.toString(),
    val os: String = SystemInfo.OS_NAME,
    val osVersion: String = SystemInfo.OS_VERSION,
) {
    companion object {
        val DEFAULT_METADATA = ClientMetadata()
    }
}
