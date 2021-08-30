// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic

import com.intellij.json.JsonFileType
import com.intellij.testFramework.LightVirtualFile

class DynamicResourceVirtualFile(private val resourceIdentifier: DynamicResourceIdentifier, fileContent: String) :
    LightVirtualFile(DynamicResources.getResourceDisplayName(resourceIdentifier.resourceIdentifier), JsonFileType.INSTANCE, fileContent) {
    fun getResourceIdentifier(): DynamicResourceIdentifier = resourceIdentifier
}
