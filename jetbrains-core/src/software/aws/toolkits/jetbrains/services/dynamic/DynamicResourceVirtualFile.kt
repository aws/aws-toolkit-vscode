// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic

import com.intellij.json.JsonFileType
import com.intellij.testFramework.LightVirtualFile
import software.aws.toolkits.jetbrains.core.credentials.ConnectionSettings
import software.aws.toolkits.resources.message

open class DynamicResourceVirtualFile(fileName: String, val dynamicResourceType: String, fileContent: String) :
    LightVirtualFile(
        fileName,
        JsonFileType.INSTANCE,
        fileContent
    )

class CreateDynamicResourceVirtualFile(val connectionSettings: ConnectionSettings, dynamicResourceType: String) :
    DynamicResourceVirtualFile(
        message("dynamic_resources.create_resource_file_name", dynamicResourceType),
        dynamicResourceType,
        InitialCreateDynamicResourceContent.initialContent
    )

class ViewDynamicResourceVirtualFile(val dynamicResourceIdentifier: DynamicResourceIdentifier, fileContent: String) :
    DynamicResourceVirtualFile(
        DynamicResources.getResourceDisplayName(dynamicResourceIdentifier.resourceIdentifier),
        dynamicResourceIdentifier.resourceType,
        fileContent
    )

object InitialCreateDynamicResourceContent {
    const val initialContent = "{}"
}
