// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.intellij.openapi.Disposable
import com.intellij.openapi.components.service

class DynamicResourcesSupportedTypes: Disposable {
    val supportedTypes = DynamicResources.javaClass.getResourceAsStream("/cloudapi/dynamic_resources.json")?.use { resourceStream ->
        jacksonObjectMapper().readValue<Map<String, ResourceDetails>>(resourceStream).filter { it.value.operations.contains(PermittedOperation.LIST) }.map { it.key }
    } ?: throw RuntimeException("dynamic resource manifest not found")

    companion object {
        fun getInstance() = service()
    }

    override fun dispose() {
        TODO("Not yet implemented")
    }
}
