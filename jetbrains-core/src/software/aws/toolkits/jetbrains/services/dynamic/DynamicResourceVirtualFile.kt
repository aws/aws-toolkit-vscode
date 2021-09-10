// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic

import com.intellij.json.JsonFileType
import com.intellij.testFramework.LightVirtualFile

class DynamicResourceVirtualFile(val dynamicResourceIdentifier: DynamicResourceIdentifier, fileContent: String, val isResourceCreate: Boolean = false) :
    LightVirtualFile(
        DynamicResources.getResourceDisplayName(dynamicResourceIdentifier.resourceIdentifier, isResourceCreate),
        JsonFileType.INSTANCE,
        fileContent
    )
